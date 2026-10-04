// The on-screen keyboard docked at the bottom of practice screens.
// Activities use it to show which keys to play (`hint`) and to flag wrong notes (`wrong`).

import { store } from './store.js';
import { input } from './input.js';
import { playNote } from './audio.js';
import { createKeyboard } from './keyboard.js';

const dockEl = document.getElementById('dock');
let kb = null;

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
  // Show blue markers on the keys to play: [midi...] or { pcs:[...] } for every key with that letter.
  hint(t) { kb?.setTargets(t); },
  wrong(midi) { kb?.mark(midi, 'bad', 700); },
  right(midi) { kb?.mark(midi, 'good', 500); },
  clear() { kb?.setTargets(null); kb?.clearMarks(); },
};

dockEl.querySelector('[data-hide]').onclick = () => {
  store.update(s => { s.settings.touchKeyboard = false; });
  dock.show(false);
};
// Light up dock keys for any input, so you can see what the app heard.
input.on(e => { kb?.flash(e.midi); if (e.source === 'keys') playNote(e.midi, 0.6); });
