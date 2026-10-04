// SVG piano keyboard: used for explanations, as an on-screen input, and to show hints.

import { isBlack, noteName, letterOf, pcOf } from './music.js';

const NS = 'http://www.w3.org/2000/svg';

// opts: { from, to, highlight:[midi], labels:'none'|'highlight'|'all', onPress(midi) }
export function createKeyboard(opts) {
  const { from = 48, to = 72, labels = 'none', onPress } = opts;
  let highlight = new Set(opts.highlight || []);
  let targets = new Set();       // keys to play next: blue dot + tint
  let targetLabels = false;
  const marks = new Map();       // midi -> 'good' | 'bad'
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('kbd');
  const whites = [];
  for (let m = from; m <= to; m++) if (!isBlack(m)) whites.push(m);
  const W = 40, H = 150, BW = 24, BH = 92;
  svg.setAttribute('viewBox', `0 0 ${whites.length * W} ${H + 2}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const keyEls = new Map();
  const el = (tag, attrs, cls) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (cls) e.classList.add(cls);
    return e;
  };
  const add = (m, x, black) => {
    const g = el('g', {}, 'key');
    g.classList.add(black ? 'black' : 'white');
    const w = black ? BW : W - 2;
    g.appendChild(el('rect', { x, y: 1, width: w, height: black ? BH : H, rx: black ? 3 : 5 }));
    const cx = x + w / 2;
    if (!black) g.appendChild(el('text', { x: cx, y: H - 14, 'text-anchor': 'middle' }, 'klabel'));
    if (m === 60) g.appendChild(el('circle', { cx, cy: H - 38, r: 3.5 }, 'middle-c'));
    g.appendChild(el('circle', { cx, cy: black ? BH - 16 : H - 40, r: black ? 7 : 9 }, 'tdot'));
    if (onPress) g.addEventListener('pointerdown', e => { e.preventDefault(); onPress(m); flash(m); });
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
      g.classList.toggle('target', targets.has(m));
      g.classList.remove('good', 'bad');
      if (marks.has(m)) g.classList.add(marks.get(m));
      const t = g.querySelector('text');
      if (t) {
        const show = labels === 'all' || (labels === 'highlight' && highlight.has(m)) || (targetLabels && targets.has(m));
        t.textContent = show ? letterOf(m) : '';
      }
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
    range: [from, to],
    setHighlight(list) { highlight = new Set(list); paint(); },
    // targets: list of midi numbers, or { pcs:[...] } for "every C" style hints
    setTargets(t, { labels = true } = {}) {
      if (Array.isArray(t)) targets = new Set(t);
      else if (t?.pcs) { targets = new Set(); for (let m = from; m <= to; m++) if (t.pcs.includes(pcOf(m))) targets.add(m); }
      else targets = new Set();
      targetLabels = labels;
      paint();
    },
    mark(m, kind, ms) {
      marks.set(m, kind); paint();
      if (ms) setTimeout(() => { if (marks.get(m) === kind) { marks.delete(m); paint(); } }, ms);
    },
    clearMarks() { marks.clear(); paint(); },
    flash,
    name: noteName,
  };
}
