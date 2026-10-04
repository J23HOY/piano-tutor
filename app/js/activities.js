// The three hands-on activities: find keys, reading cards (gym), and wait-mode playing.
// Each takes a container element and returns a cleanup function.

import { input } from './input.js';
import { store } from './store.js';
import { playEvents } from './audio.js';
import { renderNotes, renderScore } from './notation.js';
import { createKeyboard } from './keyboard.js';
import { exerciseEvents, noteName, pcOf, letterOf, midiOf, LETTERS, octaveOf } from './music.js';
import { pick, record } from './srs.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const LETTER_NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

// The mic sometimes hears a note an octave out. Forgive that for mic input only.
const sameNote = (played, target, source) =>
  played === target || (source === 'mic' && Math.abs(played - target) === 12);

// Diatonic distance, for hints like "a step higher".
const dia = m => octaveOf(m) * 7 + LETTERS.indexOf(letterOf(m));
function directionHint(played, target) {
  const d = dia(target) - dia(played);
  if (d === 0) return played < target ? 'Try the black key just above.' : 'Try the white key, not the black one.';
  const dir = d > 0 ? 'higher' : 'lower';
  if (Math.abs(d) > 7) return `Quite a bit ${dir}. Find the nearest landmark note and count from there.`;
  const size = Math.abs(d) === 1 ? 'a step' : Math.abs(d) === 2 ? 'a skip' : Math.abs(d) === 7 ? 'an octave' : `${Math.abs(d)} white notes`;
  return `Try ${size} ${dir}.`;
}

// ---------------------------------------------------------------- find
export function runFind(el, step, onDone) {
  const want = step.count || 1;
  const found = [];
  el.innerHTML = '';
  const card = h(`<div class="activity find">
      <h2 class="prompt">${step.prompt}</h2>
      <div class="dots"></div>
      <div class="kbd-wrap"></div>
      <p class="feedback" aria-live="polite"></p>
    </div>`);
  el.appendChild(card);
  const kb = createKeyboard({ from: 36, to: 84, labels: 'none' });
  card.querySelector('.kbd-wrap').appendChild(kb.el);
  const fb = card.querySelector('.feedback');
  const dots = card.querySelector('.dots');
  const drawDots = () => { dots.innerHTML = Array.from({ length: want }, (_, i) => `<span class="dot ${i < found.length ? 'on' : ''}"></span>`).join(''); };
  drawDots();
  let misses = 0;
  const off = input.on(({ midi, source }) => {
    if (found.length >= want) return;
    const t = step.target;
    const ok = t.pc != null ? pcOf(midi) === t.pc : sameNote(midi, t.midi, source);
    if (ok) {
      if (step.distinct && found.includes(midi)) { fb.textContent = 'Yes, that one again. Now find another one somewhere else.'; fb.className = 'feedback'; return; }
      found.push(midi);
      kb.mark(midi, 'good');
      drawDots();
      fb.textContent = found.length >= want ? 'All found!' : `Yes, that's ${t.pc != null ? LETTER_NAMES[t.pc] : noteName(midi)}. ${want - found.length} to go.`;
      fb.className = 'feedback good';
      if (found.length >= want) { off(); setTimeout(() => onDone({ ok: true }), 900); }
    } else {
      misses++;
      kb.mark(midi, 'bad', 700);
      fb.textContent = `That's ${noteName(midi).replace(/-?\d+$/, '')}. ${step.hint || 'Try again.'}`;
      fb.className = 'feedback bad';
    }
  });
  return off;
}

// ---------------------------------------------------------------- gym (reading cards)
// opts: { pool:[names], count, title }
export function runGym(el, opts, onDone) {
  const { pool, count = 12 } = opts;
  let mode = store.get().settings.gymMode || 'play';
  let round = 0, current = null, startAt = 0, misses = 0, busy = false;
  const results = [];
  el.innerHTML = '';
  const card = h(`<div class="activity gym">
      <div class="gym-top">
        <span class="counter"></span>
        <div class="seg" role="tablist">
          <button data-mode="play">Play it</button><button data-mode="name">Name it</button>
        </div>
      </div>
      <p class="feedback" aria-live="polite"></p>
      <div class="staff-card"></div>
      <div class="letters"></div>
    </div>`);
  el.appendChild(card);
  const staff = card.querySelector('.staff-card');
  const fb = card.querySelector('.feedback');
  const counter = card.querySelector('.counter');
  const letters = card.querySelector('.letters');
  letters.innerHTML = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(l => `<button data-l="${l}">${l}</button>`).join('');
  const setMode = m => {
    mode = m;
    store.update(s => { s.settings.gymMode = m; });
    card.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    letters.hidden = m !== 'name';
  };
  card.querySelectorAll('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  setMode(mode);

  function next() {
    if (round >= count) return finish();
    round++;
    current = pick(pool, current);
    misses = 0; busy = false;
    counter.textContent = `${round} / ${count}`;
    staff.classList.remove('good', 'bad');
    renderNotes(staff, [current], { scale: 1.4 });
    fb.textContent = mode === 'name' ? 'What note is this?' : 'Play this note';
    fb.className = 'feedback';
    startAt = performance.now();
  }
  function answer(right, playedLabel, hint) {
    if (busy) return;
    const ms = performance.now() - startAt;
    if (right) {
      busy = true;
      results.push({ name: current, firstTry: misses === 0, ms });
      record(current, misses === 0, ms);
      staff.classList.add('good');
      fb.textContent = `✓ ${current.replace(/\d/, '')} · ${(ms / 1000).toFixed(1)}s`;
      fb.className = 'feedback good';
      setTimeout(next, 750);
    } else {
      misses++;
      staff.classList.add('bad');
      setTimeout(() => staff.classList.remove('bad'), 400);
      fb.textContent = misses >= 3 ? `It's ${current.replace(/\d/, '')}. Play or tap it to carry on.` : `That's ${playedLabel}. ${hint || 'Look again.'}`;
      fb.className = 'feedback bad';
    }
  }
  letters.onclick = e => {
    const l = e.target.dataset?.l;
    if (!l || !current) return;
    answer(l === current[0], l, l === current[0] ? '' : directionHint(midiOf(l + current.slice(-1)), midiOf(current)));
  };
  const off = input.on(({ midi, source }) => {
    if (!current || busy) return;
    const target = midiOf(current);
    if (sameNote(midi, target, source)) answer(true);
    else if (source === 'mic' && performance.now() - startAt < 500) return; // previous note still ringing
    else answer(false, noteName(midi), directionHint(midi, target));
  });
  function finish() {
    off();
    const right = results.filter(r => r.firstTry).length;
    const avg = results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length);
    const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3).filter(r => r.ms > 2500 || !r.firstTry).map(r => r.name);
    const summary = { right, total: results.length, avgMs: Math.round(avg), slow: [...new Set(slow)] };
    store.log('gym', opts.id || 'gym', opts.title || 'Reading Gym', `${right}/${results.length}, avg ${(avg / 1000).toFixed(1)}s`);
    onDone(summary);
  }
  next();
  return off;
}

export function gymSummaryHTML(r) {
  return `<div class="result">
    <div class="stat"><b>${r.right}/${r.total}</b><span>right first time</span></div>
    <div class="stat"><b>${(r.avgMs / 1000).toFixed(1)}s</b><span>average per note</span></div>
    ${r.slow.length ? `<p class="muted">Worth another look: ${r.slow.map(n => `<b>${n}</b>`).join(', ')}</p>` : '<p class="muted">Nothing slowed you down. Nice.</p>'}
  </div>`;
}

// ---------------------------------------------------------------- play (wait mode)
// step: { title, intro, ex, pass }   onDone({ accuracy, passed, seconds, troubleBars })
export function runPlay(el, step, onDone, { lessonId } = {}) {
  const events = exerciseEvents(step.ex);
  const passMark = step.pass || 0.8;
  el.innerHTML = '';
  const card = h(`<div class="activity play">
      <p class="intro">${step.intro || ''}</p>
      <div class="toolbar">
        <button class="secondary" data-act="hear">▶ Hear it</button>
        <button class="secondary" data-act="restart">↺ Start again</button>
        <span class="muted small">Wait mode: the music waits for you</span>
      </div>
      <div class="score-card"><div class="score"></div></div>
      <p class="feedback" aria-live="polite"></p>
      <div class="result-wrap"></div>
    </div>`);
  el.appendChild(card);
  const scoreEl = card.querySelector('.score');
  const fb = card.querySelector('.feedback');
  const resultWrap = card.querySelector('.result-wrap');
  let score, idx, remaining, mistakes, firstAt, lastAdvanceAt, prevMidis, stopPlayback = null;

  function els(i) { return events[i].refs.map(r => score.noteAt(r)).filter(Boolean); }
  function setClass(i, cls, on = true) { els(i).forEach(e => e.classList.toggle(cls, on)); }

  function reset() {
    stopPlayback?.(); stopPlayback = null;
    score = renderScore(scoreEl, step.ex);
    idx = 0; mistakes = events.map(() => 0); firstAt = null; lastAdvanceAt = 0; prevMidis = [];
    remaining = [...events[0].midis];
    resultWrap.innerHTML = '';
    fb.textContent = 'Play the first note when you\'re ready.'; fb.className = 'feedback';
    setClass(0, 'cur');
  }
  function advance() {
    setClass(idx, 'cur', false);
    setClass(idx, mistakes[idx] ? 'slip' : 'good');
    prevMidis = events[idx].midis; lastAdvanceAt = performance.now();
    idx++;
    if (idx >= events.length) return finish();
    remaining = [...events[idx].midis];
    setClass(idx, 'cur');
    const cur = els(idx)[0];
    cur?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  const off = input.on(({ midi, source }) => {
    if (stopPlayback || idx >= events.length) return;
    const hit = remaining.findIndex(m => sameNote(midi, m, source));
    if (hit >= 0) {
      if (firstAt == null) firstAt = performance.now();
      remaining.splice(hit, 1);
      if (!remaining.length) { advance(); if (idx < events.length) { fb.textContent = ''; fb.className = 'feedback'; } }
      return;
    }
    // Mic: ignore the previous note still ringing, or a re-hearing of this chord.
    if (source === 'mic' && (performance.now() - lastAdvanceAt < 700) && prevMidis.some(m => sameNote(midi, m, 'mic'))) return;
    mistakes[idx]++;
    fb.textContent = `That was ${noteName(midi)}. ${directionHint(midi, remaining[0])}`;
    fb.className = 'feedback bad';
    els(idx).forEach(e => { e.classList.add('wrong'); setTimeout(() => e.classList.remove('wrong'), 450); });
  });

  function finish() {
    const clean = mistakes.filter(m => m === 0).length;
    const accuracy = clean / events.length;
    const seconds = firstAt ? Math.round((performance.now() - firstAt) / 1000) : 0;
    const troubleBars = [...new Set(events.filter((e, i) => mistakes[i]).map(e => e.bar + 1))];
    const passed = accuracy >= passMark;
    const res = { accuracy, passed, seconds, troubleBars };
    store.log('play', lessonId, step.title, `${Math.round(accuracy * 100)}% clean, ${seconds}s`);
    fb.textContent = ''; fb.className = 'feedback';
    resultWrap.innerHTML = `<div class="result">
        <div class="stat"><b>${Math.round(accuracy * 100)}%</b><span>notes clean</span></div>
        <div class="stat"><b>${seconds}s</b><span>time taken</span></div>
        <p class="${passed ? 'good' : 'muted'}">${passed
          ? (troubleBars.length ? `Good. Bar ${troubleBars.join(', ')} had a slip or two.` : 'Clean run. Lovely.')
          : `Not quite yet. The slips were in bar ${troubleBars.join(', ')}. Try those bars slowly on their own, then go again.`}</p>
        <div class="row"><button class="secondary" data-act="again">↺ Play again</button>
        <button data-act="continue" class="${passed ? '' : 'secondary'}">${passed ? 'Continue' : 'Continue anyway'}</button></div>
      </div>`;
    resultWrap.querySelector('[data-act=again]').onclick = reset;
    resultWrap.querySelector('[data-act=continue]').onclick = () => onDone(res);
    resultWrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  card.querySelector('[data-act=restart]').onclick = reset;
  card.querySelector('[data-act=hear]').onclick = () => {
    reset();
    setClass(0, 'cur', false);
    fb.textContent = 'Listen and follow the notes…';
    stopPlayback = playEvents(events, step.ex.bpm || 80, i => {
      events.forEach((_, j) => setClass(j, 'cur', j === i));
      if (i === -1) { stopPlayback = null; reset(); }
    });
  };
  reset();
  return () => { off(); stopPlayback?.(); };
}
