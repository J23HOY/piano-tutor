// Chord activities: a single chord, a chord progression, and a song sheet (chords over
// lyrics) that waits for each chord change while you sing.

import { store } from './store.js';
import { dock } from './dock.js';
import { createKeyboard } from './keyboard.js';
import { renderChord } from './notation.js';
import { listenChord, chordLabel, NEAR_C, voicingMidis } from './chords.js';
import { h, askHTML } from './activities.js';
import { playNote } from './audio.js';
import { goalText, CHANGE_SECS, MAX_WRONG } from './goals.js';

const voicingOf = (step, sym) => (step.voicings || NEAR_C)[sym] || NEAR_C[sym];
const spell = names => names.map(n => n.replace(/-?\d/, '').replace('#', '♯')).join(' – ');
const strum = midis => midis.forEach((m, i) => playNote(m, 1.2, i * 0.03));

function miniKeyboard(names, { from = 47, to = 72 } = {}) {
  const kb = createKeyboard({ from, to, labels: 'none' });
  kb.setTargets(voicingMidis(names));
  return kb;
}

// The "Now / Next" chord boxes used by progressions and songs.
const nowNextHTML = cls => `<div class="now-next ${cls}">
    <div class="nn now"><div class="nn-label">Now</div><div class="nn-name"></div><div class="nn-notes muted"></div><div class="nn-kb"></div></div>
    <div class="nn next"><div class="nn-label">Next</div><div class="nn-name"></div><div class="nn-notes muted"></div><div class="nn-kb"></div></div>
  </div>`;
function showChordBox(box, step, sym) {
  box.style.visibility = sym ? '' : 'hidden';
  if (!sym) return;
  const v = voicingOf(step, sym);
  box.querySelector('.nn-name').textContent = sym;
  box.querySelector('.nn-notes').textContent = spell(v);
  const kbBox = box.querySelector('.nn-kb');
  kbBox.innerHTML = '';
  kbBox.appendChild(miniKeyboard(v, { from: 52, to: 72 }).el);
}

// ---------------------------------------------------------------- one chord, a few times
// step: { chord, voicing:[names], count, fingers, hand:'rh'|'lh' }
export function runChord(el, step, onDone) {
  const names = step.voicing || voicingOf(step, step.chord);
  const mids = voicingMidis(names);
  const want = step.count || 3;
  let got = 0;
  el.innerHTML = '';
  const card = h(`<div class="activity chord">
      ${askHTML('Play', chordLabel(step.chord), `${spell(names)}${step.fingers ? ` · fingers ${step.fingers}` : ''}`)}
      <div class="chord-row">
        <div class="staff-card chord-staff"></div>
        <div class="kbd-wrap"></div>
      </div>
      <div class="dots"></div>
      <p class="feedback" aria-live="polite">Press all three keys together.${dock.visible ? ' They\'re marked on the keys below.' : ''}</p>
      <div class="row center"><button class="secondary" data-hear>♫ Hear it</button></div>
    </div>`);
  el.appendChild(card);
  renderChord(card.querySelector('.chord-staff'), names, { clef: step.hand === 'lh' ? 'bass' : 'treble' });
  card.querySelector('.kbd-wrap').appendChild(miniKeyboard(names, { from: Math.min(...mids) - 5, to: Math.max(...mids) + 5 }).el);
  dock.hint(mids);
  const fb = card.querySelector('.feedback'), dots = card.querySelector('.dots');
  const drawDots = () => { dots.innerHTML = Array.from({ length: want }, (_, i) => `<span class="dot ${i < got ? 'on' : ''}"></span>`).join(''); };
  drawDots();
  card.querySelector('[data-hear]').onclick = () => strum(mids);
  const off = listenChord(() => step.chord, () => {
    got++; drawDots();
    fb.textContent = got >= want ? 'Lovely.' : `Yes! Lift your hand off, then play it again. ${want - got} to go.`;
    fb.className = 'feedback good';
    if (got >= want) { off(); setTimeout(() => onDone({ ok: true }), 900); }
  }, { onWrong: what => { fb.textContent = `That sounded like ${what}. Check the marked keys.`; fb.className = 'feedback bad'; } });
  return () => { off(); dock.hint(null); };
}

// ---------------------------------------------------------------- chord progression
// step: { title, intro, seq:['C','F',...], rounds, voicings, tip }
export function runChords(el, step, onDone) {
  const seq = Array.from({ length: step.rounds || 1 }, () => step.seq).flat();
  let i, wrong, t0, off = null;
  el.innerHTML = '';
  const card = h(`<div class="activity chords">
      <div class="play-head"><div class="ph-text"><h2>${step.title}</h2><p class="intro">${step.intro || ''}</p><p class="goal">${goalText({ type: 'chords' })}</p></div>
        <button class="secondary" data-hear>♫ Hear it</button></div>
      <div class="chord-cards">${seq.map((c, k) => `<span class="cc" data-k="${k}">${c}</span>`).join('')}</div>
      ${nowNextHTML('')}
      <p class="feedback" aria-live="polite"></p>
      <div class="result-wrap"></div>
    </div>`);
  el.appendChild(card);
  const fb = card.querySelector('.feedback');
  const resultWrap = card.querySelector('.result-wrap');
  function paint() {
    card.querySelectorAll('.cc').forEach((c, k) => { c.className = 'cc' + (k < i ? ' done' : k === i ? ' cur' : ''); });
    card.querySelector(`.cc[data-k="${i}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    showChordBox(card.querySelector('.now'), step, seq[i]);
    showChordBox(card.querySelector('.next'), step, seq[i + 1]);
    dock.hint(seq[i] ? voicingMidis(voicingOf(step, seq[i])) : null);
  }
  function finish() {
    off(); off = null; dock.hint(null); paint();
    const secs = (performance.now() - t0) / 1000;
    const perChange = seq.length > 1 ? secs / (seq.length - 1) : secs;
    store.log('chords', step.id, step.title, `${seq.length} chords, ${perChange.toFixed(1)}s per change`);
    const mastered = perChange <= CHANGE_SECS && wrong <= MAX_WRONG;
    const why = perChange > CHANGE_SECS ? `Changes took ${perChange.toFixed(1)} s. Aim for under ${CHANGE_SECS} s: look at "Next" early and move before you need to.`
      : `${wrong} wrong chords. Aim for ${MAX_WRONG} or fewer: slow down and check the marked keys.`;
    resultWrap.innerHTML = `<div class="result overlay ${mastered ? 'celebrate' : ''}">
      ${mastered ? '<div class="pass-badge">✓ Passed</div>' : ''}
      <div class="stat"><b>${perChange.toFixed(1)}s</b><span>per chord change</span></div>
      <div class="stat"><b>${wrong}</b><span>wrong chords</span></div>
      <p>${mastered ? (perChange <= 1.5 ? 'Smooth, quick changes. Ready for songs.' : 'Good changes. They\'ll get quicker still with practice.') : why}</p>
      <div class="row"><button class="${mastered ? 'secondary' : ''}" data-r="again">↺ Again</button>${mastered ? '<button data-r="continue">Continue</button>' : ''}</div></div>`;
    resultWrap.querySelector('[data-r=again]').onclick = start;
    resultWrap.querySelector('[data-r=continue]')?.addEventListener('click', () => onDone({ ok: true, mastered, best: Math.min(1, CHANGE_SECS / Math.max(perChange, 0.1)) }));
  }
  function start() {
    off?.();
    i = 0; wrong = 0; t0 = null;
    resultWrap.innerHTML = '';
    fb.textContent = step.tip || ''; fb.className = 'feedback';
    paint();
    off = listenChord(() => seq[i], () => {
      if (t0 == null) t0 = performance.now();
      i++;
      fb.textContent = ''; fb.className = 'feedback';
      if (i >= seq.length) return finish();
      paint();
    }, { onWrong: what => { wrong++; fb.textContent = `That sounded like ${what}. You want ${chordLabel(seq[i])}.`; fb.className = 'feedback bad'; } });
  }
  card.querySelector('[data-hear]').onclick = () =>
    step.seq.forEach((c, k) => setTimeout(() => strum(voicingMidis(voicingOf(step, c))), k * 1100));
  start();
  return () => { off?.(); dock.hint(null); };
}

// ---------------------------------------------------------------- song sheet
// lines use ChordPro-style markers: '[C]Twinkle twinkle [F]little [C]star'
export function parseSheet(lines) {
  const chords = [];
  const html = lines.map(line => {
    const parts = line.split(/\[([^\]]+)\]/);
    let out = parts[0] ? `<span class="lseg"><b class="ch">&nbsp;</b><span class="ly">${parts[0]}</span></span>` : '';
    for (let p = 1; p < parts.length; p += 2) {
      const k = chords.push(parts[p]) - 1;
      out += `<span class="lseg"><b class="ch" data-k="${k}">${parts[p]}</b><span class="ly">${parts[p + 1] || '&nbsp;'}</span></span>`;
    }
    return `<div class="sline">${out}</div>`;
  }).join('');
  return { chords, html };
}

// step: { title, intro, lines:[...], voicings, credit }
export function runSong(el, step, onDone) {
  const { chords, html } = parseSheet(step.lines);
  let i = 0, wrong = 0;
  el.innerHTML = '';
  const card = h(`<div class="activity song">
      <div class="play-head"><div class="ph-text"><h2>${step.title}</h2><p class="intro">${step.intro || ''}</p><p class="goal">${goalText({ type: 'song' })}</p></div>
        <button class="secondary" data-restart>↺ From the top</button></div>
      <div class="song-body">
        <div class="sheet">${html}${step.credit ? `<p class="credit muted small">${step.credit}</p>` : ''}</div>
        ${nowNextHTML('side')}
      </div>
      <p class="feedback" aria-live="polite">Play the first chord, then sing. The sheet moves on each time you change chord.</p>
      <div class="result-wrap"></div>
    </div>`);
  el.appendChild(card);
  const fb = card.querySelector('.feedback');
  const resultWrap = card.querySelector('.result-wrap');
  function paint() {
    card.querySelectorAll('.ch[data-k]').forEach(c => {
      const k = Number(c.dataset.k);
      c.className = 'ch' + (k < i ? ' done' : k === i ? ' cur' : '');
    });
    card.querySelector(`.ch[data-k="${i}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    showChordBox(card.querySelector('.now'), step, chords[i]);
    showChordBox(card.querySelector('.next'), step, chords[i + 1]);
    dock.hint(chords[i] ? voicingMidis(voicingOf(step, chords[i])) : null);
  }
  const restart = () => { i = 0; wrong = 0; resultWrap.innerHTML = ''; paint(); };
  paint();
  const off = listenChord(() => chords[i], () => {
    i++;
    fb.textContent = ''; fb.className = 'feedback';
    paint();
    if (i < chords.length) return;
    dock.hint(null);
    store.log('song', step.id, step.title, `Played through, ${wrong} wrong chord${wrong === 1 ? '' : 's'}`);
    const mastered = wrong <= MAX_WRONG;
    resultWrap.innerHTML = `<div class="result overlay ${mastered ? 'celebrate' : ''}">
      ${mastered ? '<div class="pass-badge">✓ Passed</div>' : ''}
      <h2>${step.title}</h2>
      <p>${!wrong ? 'Every chord right first time. Lovely.' : mastered ? `${wrong} wrong chord${wrong === 1 ? '' : 's'}, which is within the goal.` : `${wrong} wrong chords. Aim for ${MAX_WRONG} or fewer. Glance at "Next" before each change.`}</p>
      <p class="muted small">Next step: keep a steady beat, with one chord per bar and your voice leading.</p>
      <div class="row"><button class="${mastered ? 'secondary' : ''}" data-r="again">↺ Sing it again</button>${mastered ? '<button data-r="continue">Continue</button>' : ''}</div></div>`;
    resultWrap.querySelector('[data-r=again]').onclick = restart;
    resultWrap.querySelector('[data-r=continue]')?.addEventListener('click', () => onDone({ ok: true, mastered, best: mastered ? 1 : 0.7 }));
  }, { onWrong: what => { wrong++; fb.textContent = `That sounded like ${what}. The chord here is ${chordLabel(chords[i])}.`; fb.className = 'feedback bad'; } });
  card.querySelector('[data-restart]').onclick = restart;
  return () => { off(); dock.hint(null); };
}
