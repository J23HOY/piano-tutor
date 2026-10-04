// Chords: names -> notes, recognising a chord from the mic's chroma, and a listener that
// works with every input (mic chroma, or separate notes from MIDI / on-screen keys).

import { input } from './input.js';
import { pcOf, midiOf } from './music.js';

const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] };

export function chordPcs(sym) {
  const m = /^([A-G][#b]?)(maj7|m7|m|7)?$/.exec(sym);
  if (!m) throw new Error('Unknown chord ' + sym);
  return QUALITY[m[2] || ''].map(i => (ROOTS[m[1]] + i) % 12);
}
export const chordLabel = sym => sym.replace(/^([A-G][#b]?)m$/, '$1 minor').replace(/^([A-G][#b]?)$/, '$1 major');

// Right-hand shapes near Middle C that move very little between chords.
export const NEAR_C = {
  C: ['C4', 'E4', 'G4'], F: ['C4', 'F4', 'A4'], G: ['B3', 'D4', 'G4'], Am: ['C4', 'E4', 'A4'],
  Dm: ['D4', 'F4', 'A4'], Em: ['B3', 'E4', 'G4'], G7: ['B3', 'F4', 'G4'],
};
export const ROOT_POSITION = {
  C: ['C4', 'E4', 'G4'], F: ['F4', 'A4', 'C5'], G: ['G4', 'B4', 'D5'], Am: ['A3', 'C4', 'E4'],
  Dm: ['D4', 'F4', 'A4'], Em: ['E4', 'G4', 'B4'],
};
export const LH_C = { C: ['C3', 'E3', 'G3'] };

// All major and minor triads, to check the target is the best explanation of the sound.
const CANDIDATES = Object.keys(ROOTS).filter(r => !r.includes('b')).flatMap(r => [r, r + 'm']);

// chroma: 12 numbers summing to 1. ok = every chord note clearly present AND no other
// triad fits the sound better (so A minor isn't mistaken for C major, and so on).
export function chordScore(chroma, sym) {
  const pcs = chordPcs(sym);
  const fit = ps => ps.reduce((a, p) => a + chroma[p], 0);
  const mine = fit(pcs.slice(0, 3));
  const minTone = Math.min(...pcs.slice(0, 3).map(p => chroma[p]));
  let best = null, bestFit = -1;
  for (const c of CANDIDATES) { const f = fit(chordPcs(c)); if (f > bestFit) { bestFit = f; best = c; } }
  const ok = minTone >= 0.06 && mine >= 0.55 && mine >= bestFit - 0.02;
  return { ok, fit: mine, minTone, best };
}

// Listen for a chord. getTarget() returns the chord symbol wanted right now.
// Calls onHit() when it's played, onWrong(description) for a clearly different chord.
// Repeated chords (C then C again) need a fresh strike.
export function listenChord(getTarget, onHit, { onWrong } = {}) {
  let recent = [];          // notes from MIDI / keys: { pc, at }
  let wrongTimer = null;
  let streak = 0, wrongStreak = 0, armed = true, wrongArmed = true, onsetAt = 0;
  const offNotes = input.on(e => {
    if (e.source === 'mic') return; // the mic uses chroma below
    const target = getTarget();
    if (!target) return;
    const now = performance.now();
    recent = recent.filter(r => now - r.at < 1500);
    recent.push({ pc: pcOf(e.midi), at: now });
    const pcs = chordPcs(target);
    const have = new Set(recent.map(r => r.pc));
    clearTimeout(wrongTimer);
    if (pcs.slice(0, 3).every(p => have.has(p))) { recent = []; onHit(); }
    else if (recent.length >= 3 && !pcs.includes(pcOf(e.midi))) wrongTimer = setTimeout(() => onWrong?.('a different chord'), 400);
  });
  const offChroma = input.onChroma(({ chroma, rms, onset }) => {
    const target = getTarget();
    if (!chroma) { armed = true; wrongArmed = true; streak = wrongStreak = 0; return; } // silence re-arms
    if (onset) { armed = true; wrongArmed = true; onsetAt = performance.now(); wrongStreak = 0; }
    if (!target || !armed) return;
    const s = chordScore(chroma, target);
    if (s.ok) {
      wrongStreak = 0;
      if (++streak >= 2) { streak = 0; armed = false; onHit(); }
    } else {
      streak = 0;
      // only call it wrong once the sound has settled (~0.4 s of a clearly different chord)
      if (s.best !== target && ++wrongStreak >= 8 && wrongArmed && performance.now() - onsetAt > 400) {
        wrongArmed = false; onWrong?.(chordLabel(s.best));
      }
    }
  });
  return () => { offNotes(); offChroma(); clearTimeout(wrongTimer); };
}

export const voicingMidis = names => names.map(midiOf);
