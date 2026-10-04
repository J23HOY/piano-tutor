// SVG piano keyboard: used for explanations and as an on-screen input.

import { isBlack, noteName, letterOf } from './music.js';

const NS = 'http://www.w3.org/2000/svg';

// opts: { from, to, highlight:[midi], labels:'none'|'highlight'|'all', onPress(midi) }
export function createKeyboard(opts) {
  const { from = 48, to = 72, labels = 'none', onPress } = opts;
  let highlight = new Set(opts.highlight || []);
  const marks = new Map(); // midi -> 'good' | 'bad' | 'cur'
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('kbd');
  const whites = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const W = 40, H = 150, BW = 24, BH = 92;
  svg.setAttribute('viewBox', `0 0 ${whites.length * W} ${H + 2}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const keyEls = new Map();
  const add = (m, x, black) => {
    const g = document.createElementNS(NS, 'g');
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', 1);
    r.setAttribute('width', black ? BW : W - 2); r.setAttribute('height', black ? BH : H);
    r.setAttribute('rx', black ? 3 : 5);
    g.classList.add('key', black ? 'black' : 'white');
    g.appendChild(r);
    if (!black) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x + (W - 2) / 2); t.setAttribute('y', H - 14);
      t.setAttribute('text-anchor', 'middle');
      t.classList.add('klabel');
      g.appendChild(t);
    }
    if (m === 60) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x + (W - 2) / 2); c.setAttribute('cy', H - 38); c.setAttribute('r', 3.5);
      c.classList.add('middle-c');
      g.appendChild(c);
    }
    if (onPress) {
      g.addEventListener('pointerdown', e => { e.preventDefault(); onPress(m); flash(m); });
    }
    keyEls.set(m, g);
    return g;
  };
  const blackLayer = [];
  whites.forEach((m, i) => {
    svg.appendChild(add(m, i * W + 1, false));
    if (m + 1 <= to && isBlack(m + 1)) blackLayer.push([m + 1, (i + 1) * W - BW / 2]);
  });
  if (isBlack(from)) blackLayer.unshift([from, -BW / 2]);
  blackLayer.forEach(([m, x]) => svg.appendChild(add(m, x, true)));

  function paint() {
    keyEls.forEach((g, m) => {
      g.classList.toggle('hl', highlight.has(m));
      g.classList.remove('good', 'bad', 'cur', 'press');
      if (marks.has(m)) g.classList.add(marks.get(m));
      const t = g.querySelector('text');
      if (t) t.textContent = labels === 'all' || (labels === 'highlight' && highlight.has(m)) ? letterOf(m) : '';
    });
  }
  function flash(m) {
    const g = keyEls.get(m);
    if (!g) return;
    g.classList.add('press');
    setTimeout(() => g.classList.remove('press'), 180);
  }
  paint();
  return {
    el: svg,
    setHighlight(list) { highlight = new Set(list); paint(); },
    mark(m, kind, ms) {
      marks.set(m, kind); paint();
      if (ms) setTimeout(() => { if (marks.get(m) === kind) { marks.delete(m); paint(); } }, ms);
    },
    clearMarks() { marks.clear(); paint(); },
    flash,
    name: noteName,
  };
}
