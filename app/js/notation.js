// Sheet music rendering with VexFlow (loaded globally as window.Vex from vendor/vexflow.js).

import { parseTrack, parsePitch } from './music.js';

const VF = () => window.Vex.Flow;

function makeNote(tok, clef) {
  const F = VF();
  const duration = tok.dur + (tok.dotted ? 'd' : '') + (tok.rest ? 'r' : '');
  const keys = tok.rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : tok.pitches.map(p => p.key);
  const note = new F.StaveNote({ clef, keys, duration, auto_stem: true, align_center: tok.rest && tok.dur === 'w' });
  if (tok.dotted) F.Dot.buildAndAttach([note], { all: true });
  if (!tok.rest) {
    tok.pitches.forEach((p, i) => { if (p.acc) note.addModifier(new F.Accidental(p.acc === '#' ? '#' : 'b'), i); });
    if (tok.finger) {
      const a = new F.Annotation(tok.finger);
      a.setFont('Arial', 12, 'bold');
      a.setVerticalJustification(clef === 'bass' ? F.Annotation.VerticalJustify.BOTTOM : F.Annotation.VerticalJustify.TOP);
      note.addModifier(a, 0);
    }
  }
  return note;
}

// Draws an exercise. Returns { noteAt(ref) -> SVG element } so the player can colour notes.
// With `fitHeight`, picks the largest scale (up to 1.4) that fits the music into that many pixels.
export function renderScore(container, ex, { scale = 1.4, maxPerLine = 4, fitHeight = null } = {}) {
  const F = VF();
  container.innerHTML = '';
  const tracks = [];
  if (ex.rh) tracks.push({ hand: 'rh', clef: 'treble', bars: parseTrack(ex.rh) });
  if (ex.lh) tracks.push({ hand: 'lh', clef: 'bass', bars: parseTrack(ex.lh) });
  const time = ex.time || '4/4';
  const [num] = time.split('/').map(Number);
  const nBars = Math.max(...tracks.map(t => t.bars.length));

  const cssWidth = Math.max(320, container.clientWidth || 800);
  const staffGap = 100;
  const lineH = tracks.length === 2 ? 220 : 120;
  const layout = s => {
    const perLine = Math.max(1, Math.min(maxPerLine, Math.floor((cssWidth / s - 20) / 190), nBars));
    return { perLine, lines: Math.ceil(nBars / perLine) };
  };
  if (fitHeight) {
    for (scale = 1.4; scale > 0.75; scale -= 0.05) {
      const { lines } = layout(scale);
      if ((lines * lineH + 20) * scale <= fitHeight) break;
    }
  }
  const avail = cssWidth / scale - 20;
  const { perLine, lines } = layout(scale);
  const head = 75; // room for clef + time signature on the first bar of a line

  const renderer = new F.Renderer(container, F.Renderer.Backends.SVG);
  renderer.resize(cssWidth, (lines * lineH + 20) * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);

  const refs = new Map();
  const barW = (avail - head) / perLine;
  for (let bi = 0; bi < nBars; bi++) {
    const line = Math.floor(bi / perLine), col = bi % perLine;
    const first = col === 0;
    const x = 10 + (first ? 0 : head + col * barW);
    const w = barW + (first ? head : 0);
    const y = 10 + line * lineH + (tracks.length === 1 ? 10 : 0);
    const staves = tracks.map((t, ti) => {
      const s = new F.Stave(x, y + ti * staffGap, w);
      if (first) { s.addClef(t.clef); if (bi === 0) s.addTimeSignature(time); }
      if (bi === nBars - 1) s.setEndBarType(F.Barline.type.END);
      s.setContext(ctx).draw();
      return s;
    });
    if (tracks.length === 2) {
      if (first) {
        new F.StaveConnector(staves[0], staves[1]).setType('brace').setContext(ctx).draw();
        new F.StaveConnector(staves[0], staves[1]).setType('singleLeft').setContext(ctx).draw();
      }
      new F.StaveConnector(staves[0], staves[1]).setType(bi === nBars - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();
    }

    const voices = [], beams = [], made = [];
    tracks.forEach(t => {
      const toks = t.bars[bi] || [{ rest: true, dur: 'w', beats: num }];
      const notes = toks.map((tok, ti) => {
        const n = makeNote(tok, t.clef);
        if (!tok.rest) made.push([`${t.hand}:${bi}:${ti}`, n]);
        return n;
      });
      voices.push(new F.Voice({ num_beats: num, beat_value: 4 }).setMode(F.Voice.Mode.SOFT).addTickables(notes));
      beams.push(...F.Beam.generateBeams(notes));
    });
    const fmt = new F.Formatter();
    voices.forEach(v => fmt.joinVoices([v]));
    fmt.format(voices, staves[0].getNoteEndX() - staves[0].getNoteStartX() - 12);
    voices.forEach((v, i) => v.draw(ctx, staves[i]));
    beams.forEach(b => b.setContext(ctx).draw());
    made.forEach(([k, n]) => refs.set(k, n.getSVGElement?.() || document.getElementById('vf-' + n.getAttribute('id'))));
  }
  return { noteAt: ref => refs.get(`${ref.hand}:${ref.bar}:${ref.index}`) };
}

// A grand staff with one note (or a few) on it, for reading cards and explanations.
// Notes from Middle C up go on the treble staff, lower ones on the bass staff.
export function renderNotes(container, names, { scale = 1.3, width } = {}) {
  const F = VF();
  container.innerHTML = '';
  const cssWidth = width || Math.min(440, Math.max(260, container.clientWidth || 360));
  const w = cssWidth / scale - 20;
  const renderer = new F.Renderer(container, F.Renderer.Backends.SVG);
  renderer.resize(cssWidth, 232 * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  const treble = new F.Stave(10, 10, w).addClef('treble');
  const bass = new F.Stave(10, 110, w).addClef('bass');
  treble.setContext(ctx).draw();
  bass.setContext(ctx).draw();
  new F.StaveConnector(treble, bass).setType('brace').setContext(ctx).draw();
  new F.StaveConnector(treble, bass).setType('singleLeft').setContext(ctx).draw();
  new F.StaveConnector(treble, bass).setType('singleRight').setContext(ctx).draw();
  if (!names.length) return;
  const up = [], down = [];
  names.forEach(n => {
    const p = parsePitch(n);
    const target = p.midi >= 60 ? up : down;
    const clef = p.midi >= 60 ? 'treble' : 'bass';
    const note = new F.StaveNote({ clef, keys: [p.key], duration: 'w' });
    if (p.acc) note.addModifier(new F.Accidental(p.acc === '#' ? '#' : 'b'), 0);
    target.push(note);
    // keep both staves in step so notes line up left to right
    (target === up ? down : up).push(new F.GhostNote({ duration: 'w' }));
  });
  const vUp = new F.Voice({ num_beats: 4 * names.length, beat_value: 4 }).setMode(F.Voice.Mode.SOFT).addTickables(up);
  const vDown = new F.Voice({ num_beats: 4 * names.length, beat_value: 4 }).setMode(F.Voice.Mode.SOFT).addTickables(down);
  const fmt = new F.Formatter();
  fmt.joinVoices([vUp]); fmt.joinVoices([vDown]);
  fmt.format([vUp, vDown], treble.getNoteEndX() - treble.getNoteStartX() - 20);
  vUp.draw(ctx, treble);
  vDown.draw(ctx, bass);
}

// One chord (notes stacked) on a single staff. clef: 'treble' | 'bass'.
export function renderChord(container, names, { clef = 'treble', scale = 1.3, width = 220 } = {}) {
  const F = VF();
  container.innerHTML = '';
  const renderer = new F.Renderer(container, F.Renderer.Backends.SVG);
  renderer.resize(width, 150 * scale);
  const ctx = renderer.getContext();
  ctx.scale(scale, scale);
  const stave = new F.Stave(5, 15, width / scale - 10).addClef(clef);
  stave.setContext(ctx).draw();
  const ps = names.map(parsePitch).sort((a, b) => a.midi - b.midi);
  const note = new F.StaveNote({ clef, keys: ps.map(p => p.key), duration: 'w' });
  ps.forEach((p, i) => { if (p.acc) note.addModifier(new F.Accidental(p.acc === '#' ? '#' : 'b'), i); });
  const v = new F.Voice({ num_beats: 4, beat_value: 4 }).setMode(F.Voice.Mode.SOFT).addTickables([note]);
  new F.Formatter().joinVoices([v]).format([v], stave.getNoteEndX() - stave.getNoteStartX() - 10);
  v.draw(ctx, stave);
}
