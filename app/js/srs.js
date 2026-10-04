// Note-reading memory: a simple Leitner system.
// Each note sits in box 1 (shaky) .. 5 (instant). Weaker notes come up more often.
// Right and quick moves a note up a box; right but slow keeps it; wrong sends it back to box 1.

import { store } from './store.js';
import { FOUNDATION_ORDER, LESSONS, PLACEMENT_POOL } from './curriculum.js';
import { midiOf } from './music.js';

export const FAST_MS = 3000;

export function noteState(name) {
  return store.get().notes[name] || { box: 1, seen: 0, right: 0, avgMs: null };
}

export function record(name, right, ms) {
  store.update(s => {
    const n = s.notes[name] || (s.notes[name] = { box: 1, seen: 0, right: 0, avgMs: null });
    n.seen++;
    n.lastAt = Date.now();
    if (right) {
      n.right++;
      n.avgMs = n.avgMs == null ? ms : Math.round(n.avgMs * 0.7 + ms * 0.3);
      if (ms < FAST_MS) n.box = Math.min(5, n.box + 1);
    } else {
      n.box = 1;
    }
  });
}

export function pick(pool, avoid) {
  const weights = pool.map(name => (name === avoid && pool.length > 1 ? 0 : 2 ** (5 - noteState(name).box)));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

// All notes unlocked so far (from completed lessons and placement), low to high.
export function unlockedNotes() {
  const s = store.get();
  const set = new Set(s.placement?.passed ? PLACEMENT_POOL : []);
  FOUNDATION_ORDER.forEach(id => {
    if (s.lessons[id]?.done) (LESSONS[id].unlocks || []).forEach(n => set.add(n));
  });
  return [...set].sort((a, b) => midiOf(a) - midiOf(b));
}
