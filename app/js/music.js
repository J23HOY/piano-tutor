// Pitch helpers and the exercise notation parser.

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const BEATS = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };

export const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const pcOf = m => ((m % 12) + 12) % 12;
export const octaveOf = m => Math.floor(m / 12) - 1;
export const noteName = m => SHARP_NAMES[pcOf(m)] + octaveOf(m);
export const letterOf = m => SHARP_NAMES[pcOf(m)][0];

// "C4", "F#3", "Bb3" -> { midi, letter, acc, octave, key }
export function parsePitch(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('Bad pitch: ' + s);
  const [, letter, acc, oct] = m;
  const octave = Number(oct);
  const midi = 12 * (octave + 1) + SEMI[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
  return { midi, letter, acc: acc || null, octave, key: `${letter.toLowerCase()}${acc}/${octave}` };
}
export const midiOf = s => parsePitch(s).midi;

// "E4/q.:3"  or  "r/w"  or  "C4+E4+G4/h"
export function parseToken(tok) {
  const [main, finger] = tok.split(':');
  let [p, d] = main.split('/');
  const dotted = d.endsWith('.');
  if (dotted) d = d.slice(0, -1);
  if (!(d in BEATS)) throw new Error('Bad duration in ' + tok);
  const beats = BEATS[d] * (dotted ? 1.5 : 1);
  if (p === 'r') return { rest: true, dur: d, dotted, beats };
  return { rest: false, pitches: p.split('+').map(parsePitch), dur: d, dotted, beats, finger: finger || null };
}

// "a b | c d" -> [[tok, tok], [tok, tok]]
export function parseTrack(str) {
  return str.split('|').map(bar => bar.trim().split(/\s+/).filter(Boolean).map(parseToken));
}

// Flatten an exercise into timed events: [{ beat, bar, midis:[...], hand }]
// Notes in the two hands that start on the same beat are merged into one event.
export function exerciseEvents(ex) {
  const [num] = (ex.time || '4/4').split('/').map(Number);
  const byBeat = new Map();
  for (const [hand, str] of [['rh', ex.rh], ['lh', ex.lh]]) {
    if (!str) continue;
    parseTrack(str).forEach((bar, bi) => {
      let b = bi * num;
      bar.forEach((tok, ti) => {
        if (!tok.rest) {
          const k = b.toFixed(4);
          if (!byBeat.has(k)) byBeat.set(k, { beat: b, bar: bi, midis: [], refs: [] });
          const e = byBeat.get(k);
          tok.pitches.forEach(p => e.midis.push(p.midi));
          e.refs.push({ hand, bar: bi, index: ti });
          e.beats = Math.max(e.beats || 0, tok.beats);
        }
        b += tok.beats;
      });
    });
  }
  return [...byBeat.values()].sort((a, b) => a.beat - b.beat);
}
