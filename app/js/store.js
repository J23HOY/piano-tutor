// Progress and settings, saved on the device (localStorage) with JSON backup/restore.

const KEY = 'pianoTutor.v1';
const ACTIVE_GAP = 120; // seconds: a pause longer than this isn't counted as practice

const fresh = () => ({
  version: 1,
  createdAt: Date.now(),
  settings: { touchKeyboard: true, micThreshold: 0.012, theme: 'system', autoListen: true },
  onboarded: false,
  placement: null,            // { at, score, skipped:[] }
  lessons: {},                // id -> { done, completedAt, steps:{}, best, attempts, lastAt }
  notes: {},                  // 'C4' -> { box 1-5, seen, right, avgMs, lastAt }
  practice: {},               // 'YYYY-MM-DD' -> seconds
  history: [],                // [{ at, kind, id, title, detail }]  newest last, capped
  lastActiveAt: null,
  prevSessionAt: null,        // last activity before the current session started
});

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('Could not load progress', e); }
  return fresh();
}
function migrate(s) {
  const base = fresh();
  return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Could not save', e); }
  subs.forEach(fn => fn(state));
}

export const store = {
  get: () => state,
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  update(fn) { fn(state); save(); },

  // Called on any practice activity (notes played, steps completed).
  activity() {
    const now = Date.now();
    const last = state.lastActiveAt;
    if (last && (now - last) / 1000 < ACTIVE_GAP) {
      const day = dayKey(now);
      state.practice[day] = (state.practice[day] || 0) + (now - last) / 1000;
    } else if (last) {
      state.prevSessionAt = last; // a new session is starting
    }
    state.lastActiveAt = now;
    save();
  },

  log(kind, id, title, detail) {
    state.history.push({ at: Date.now(), kind, id, title, detail });
    if (state.history.length > 500) state.history = state.history.slice(-500);
    save();
  },

  lesson(id) { return state.lessons[id] || (state.lessons[id] = { done: false, steps: {}, attempts: 0 }); },

  exportJSON() { return JSON.stringify(state, null, 2); },
  importJSON(text) {
    const s = JSON.parse(text);
    if (!s || s.version !== 1) throw new Error('This does not look like a Piano Tutor backup.');
    state = migrate(s); save();
  },
  reset() { state = fresh(); save(); },
};

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Ask the browser not to evict our storage.
try { navigator.storage?.persist?.(); } catch {}
