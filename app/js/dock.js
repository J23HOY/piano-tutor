// The on-screen keyboard docked at the bottom of practice screens.
// Activities use it to show which keys to play (`hint`) and to flag wrong notes (`wrong`).
// A small readout beside the keys shows "Play E4" and "Heard D4", so you can tell
// a misheard note (the app's mistake) from a wrong key (yours).

import { store } from './store.js';
import { input } from './input.js';
import { playNote } from './audio.js';
import { createKeyboard } from './keyboard.js';
import { noteName, pcOf } from './music.js';

const dockEl = document.getElementById('dock');
const playEl = dockEl.querySelector('[data-play]');
const heardEl = dockEl.querySelector('[data-heard]');
let kb = null;
let target = null; // [midi...] | { pcs:[...] } | null
const LETTERS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function targetText() {
  if (!target) return '';
  if (Array.isArray(target)) return target.length ? target.map(noteName).join(' ') : '';
  return 'any ' + target.pcs.map(p => LETTERS[p]).join(' / ');
}
const isTarget = m => !!target && (Array.isArray(target) ? target.includes(m) : target.pcs.includes(pcOf(m)));

export const dock = {
  get visible() { return !dockEl.hidden; },
  get height() { return dockEl.hidden ? 0 : dockEl.offsetHeight; },
  show(on) {
    const show = on && store.get().settings.touchKeyboard;
    dockEl.hidden = !show;
    document.body.classList.toggle('with-dock', show);
    if (show && !kb) {
      kb = createKeyboard({ from: 48, to: 76, labels: 'none', onPress: m => { playNote(m, 0.6); input.emit(m, 'touch', 80); } });
      dockEl.querySelector('.dock-keys').appendChild(kb.el);
    }
    if (!on) dock.clear();
  },
  // Mark the keys to play: [midi...] or { pcs:[...] } for every key with that letter.
  hint(t) {
    target = t && (Array.isArray(t) ? t : t.pcs) ? t : null;
    kb?.setTargets(target);
    const txt = targetText();
    playEl.innerHTML = txt ? `Play <b>${txt}</b>` : '';
  },
  wrong(midi) { kb?.mark(midi, 'bad', 700); },
  right(midi) { kb?.mark(midi, 'good', 500); },
  clear() { dock.hint(null); kb?.clearMarks(); heardEl.innerHTML = ''; },
};

dockEl.querySelector('[data-hide]').onclick = () => {
  store.update(s => { s.settings.touchKeyboard = false; });
  dock.show(false);
};
// Show what the app heard: flash the key and update the readout.
input.on(e => {
  kb?.flash(e.midi);
  if (e.source === 'keys') playNote(e.midi, 0.6);
  const match = isTarget(e.midi);
  heardEl.innerHTML = `Heard <b>${noteName(e.midi)}</b>${target ? (match ? ' ✓' : '') : ''}`;
  heardEl.className = 'dock-heard ' + (!target ? '' : match ? 'ok' : 'off');
});
