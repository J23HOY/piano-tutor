// Hands-on activities: find keys, reading cards (gym), and playing a piece
// (wait mode or play-along with a metronome). Chord and song activities live in chordplay.js.
// Each takes a container element and returns a cleanup function.

import { input } from './input.js';
import { store } from './store.js';
import { playEvents, startClock } from './audio.js';
import { renderNotes, renderScore } from './notation.js';
import { createKeyboard } from './keyboard.js';
import { dock } from './dock.js';
import { exerciseEvents, noteName, pcOf, letterOf, midiOf, LETTERS, octaveOf, sliceExercise, barCount } from './music.js';
import { pick, record } from './srs.js';

export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const LETTER_NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
const short = m => noteName(m).replace(/-?\d+$/, '');

// The mic sometimes hears a note an octave out. Forgive that for mic input only.
export const sameNote = (played, target, source) =>
  played === target || (source === 'mic' && Math.abs(played - target) === 12);

// Diatonic distance, for hints like "a step higher".
const dia = m => octaveOf(m) * 7 + LETTERS.indexOf(letterOf(m));
function directionHint(played, target) {
  const d = dia(target) - dia(played);
  if (d === 0) return played < target ? 'the black key just above' : 'the white key, not the black one';
  const dir = d > 0 ? 'higher' : 'lower';
  if (Math.abs(d) > 7) return `quite a bit ${dir}`;
  const size = Math.abs(d) === 1 ? 'a step' : Math.abs(d) === 2 ? 'a skip' : Math.abs(d) === 7 ? 'an octave' : `${Math.abs(d)} white notes`;
  return `${size} ${dir}`;
}

// When a note starts, the mic's first reading can wobble (an octave out, or a harmonic)
// before it settles on the real pitch. So a wrong note heard by the mic is held back
// briefly, and dropped if the right note turns up in the meantime.
export const MIC_GRACE_MS = 280;
export function graceWrong() {
  let t = null;
  return {
    wrong(source, fn) {
      if (source !== 'mic') return fn();
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn(); }, MIC_GRACE_MS);
    },
    cancel() { clearTimeout(t); t = null; },
  };
}

// Height left between an element's top and the on-screen keys, minus `reserve` for things below it.
export function spaceBelow(el, reserve) {
  return window.innerHeight - el.getBoundingClientRect().top - dock.height - reserve;
}

// The "what to play" banner: a big badge with the note, which pops in each time it changes.
export function askHTML(verb, what, sub = '') {
  return `<div class="ask"><span class="ask-verb">${verb}</span><span class="badge">${what}</span>${sub ? `<span class="ask-sub">${sub}</span>` : ''}</div>`;
}

// ---------------------------------------------------------------- find
export function runFind(el, step, onDone) {
  const want = step.count || 1;
  const t = step.target;
  const found = [];
  el.innerHTML = '';
  const label = t.pc != null ? LETTER_NAMES[t.pc] : t.midi === 60 ? 'Middle C' : noteName(t.midi);
  const card = h(`<div class="activity find">
      ${askHTML(t.pc != null ? 'Play any' : 'Play', label)}
      <div class="dots"></div>
      <div class="kbd-wrap"></div>
      <p class="feedback" aria-live="polite">${dock.visible ? `The blue dots on the keys below show every ${label}.` : ''}</p>
    </div>`);
  el.appendChild(card);
  const kb = createKeyboard({ from: 36, to: 84, labels: 'none' });
  card.querySelector('.kbd-wrap').appendChild(kb.el);
  dock.hint(t.pc != null ? { pcs: [t.pc] } : [t.midi]);
  const fb = card.querySelector('.feedback');
  const dots = card.querySelector('.dots');
  const drawDots = () => { dots.innerHTML = Array.from({ length: want }, (_, i) => `<span class="dot ${i < found.length ? 'on' : ''}"></span>`).join(''); };
  drawDots();
  const grace = graceWrong();
  const off = input.on(({ midi, source }) => {
    if (found.length >= want) return;
    const ok = t.pc != null ? pcOf(midi) === t.pc : sameNote(midi, t.midi, source);
    if (ok) {
      grace.cancel();
      if (step.distinct && found.includes(midi)) { fb.textContent = `Yes, that's ${label} again. Now find a different one.`; fb.className = 'feedback'; return; }
      found.push(midi);
      kb.mark(midi, 'good');
      dock.right(midi);
      drawDots();
      fb.textContent = found.length >= want ? 'All found!' : `Yes, that's ${label}. ${want - found.length} to go.`;
      fb.className = 'feedback good';
      if (found.length >= want) { off(); setTimeout(() => onDone({ ok: true }), 900); }
    } else grace.wrong(source, () => {
      kb.mark(midi, 'bad', 700);
      dock.wrong(midi);
      fb.textContent = `That's ${short(midi)}. ${step.hint || `Look for the blue dots: those are the ${label}s.`}`;
      fb.className = 'feedback bad';
    });
  });
  return () => { off(); grace.cancel(); dock.hint(null); };
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
    dock.hint(null);
    counter.textContent = `${round} / ${count}`;
    staff.classList.remove('good', 'bad');
    const room = spaceBelow(staff, mode === 'name' ? 100 : 24);
    renderNotes(staff, [current], { scale: Math.max(0.8, Math.min(1.7, room / 236)), width: 520 });
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
      dock.hint(null);
      fb.textContent = `✓ ${current.replace(/\d/, '')} · ${(ms / 1000).toFixed(1)}s`;
      fb.className = 'feedback good';
      setTimeout(next, 750);
    } else {
      misses++;
      staff.classList.add('bad');
      setTimeout(() => staff.classList.remove('bad'), 400);
      // After two misses, show the answer on the keys so you can find it and carry on.
      if (misses >= 2) dock.hint([midiOf(current)]);
      fb.textContent = misses >= 2
        ? `It's ${current.replace(/\d/, '')}${dock.visible ? ', marked on the keys below' : ''}. Play or tap it to carry on.`
        : `That's ${playedLabel}. Try ${hint}.`;
      fb.className = 'feedback bad';
    }
  }
  letters.onclick = e => {
    const l = e.target.dataset?.l;
    if (!l || !current) return;
    answer(l === current[0], l, l === current[0] ? '' : directionHint(midiOf(l + current.slice(-1)), midiOf(current)));
  };
  const grace = graceWrong();
  const off = input.on(({ midi, source }) => {
    if (!current || busy) return;
    const target = midiOf(current);
    if (sameNote(midi, target, source)) { grace.cancel(); answer(true); }
    else if (source === 'mic' && performance.now() - startAt < 500) return; // previous note still ringing
    else {
      const card = current;
      grace.wrong(source, () => { if (current === card && !busy) { dock.wrong(midi); answer(false, short(midi), directionHint(midi, target)); } });
    }
  });
  function finish() {
    off();
    dock.hint(null);
    const right = results.filter(r => r.firstTry).length;
    const avg = results.reduce((a, r) => a + r.ms, 0) / Math.max(1, results.length);
    const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3).filter(r => r.ms > 2500 || !r.firstTry).map(r => r.name);
    const summary = { right, total: results.length, avgMs: Math.round(avg), slow: [...new Set(slow)] };
    store.log('gym', opts.id || 'gym', opts.title || 'Reading Gym', `${right}/${results.length}, avg ${(avg / 1000).toFixed(1)}s`);
    onDone(summary);
  }
  next();
  return () => { off(); grace.cancel(); dock.hint(null); };
}

export function gymSummaryHTML(r) {
  return `<div class="result">
    <div class="stat"><b>${r.right}/${r.total}</b><span>right first time</span></div>
    <div class="stat"><b>${(r.avgMs / 1000).toFixed(1)}s</b><span>average per note</span></div>
    ${r.slow.length ? `<p class="muted">Worth another look: ${r.slow.map(n => `<b>${n}</b>`).join(', ')}</p>` : '<p class="muted">Nothing slowed you down. Nice.</p>'}
  </div>`;
}

// ---------------------------------------------------------------- play a piece
// Two ways to play:
//   Wait mode   – the music waits for the right note. For learning the notes.
//   Play along  – a metronome counts you in and keeps going; notes AND timing are scored.
//                 The tempo starts slow and steps up each time you pass (the tempo ladder).
// Both can loop a range of bars.
// step: { title, intro, ex:{rh,lh,bpm,time}, pass, mode }
// ctx:  { lessonId, stepIdx, mode }   onDone({ accuracy, passed, mode })
export function runPlay(el, step, onDone, ctx = {}) {
  const { lessonId, stepIdx } = ctx;
  const full = step.ex;
  const nBars = barCount(full);
  const targetBpm = full.bpm || 80;
  const beatsPerBar = Number((full.time || '4/4').split('/')[0]);
  const stepRec = () => store.get().lessons[lessonId]?.steps?.[stepIdx] || {};
  const saveRec = patch => lessonId && store.update(s => {
    const L = store.lesson(lessonId);
    L.steps[stepIdx] = { ...(L.steps[stepIdx] || {}), ...patch };
  });
  const ladderStep = Math.max(4, Math.round(targetBpm * 0.1 / 2) * 2);

  let mode = ctx.mode || step.mode || 'wait';
  let bpm = stepRec().tempo || Math.max(40, Math.round(targetBpm * 0.7 / 2) * 2);
  let loop = { from: 1, to: nBars, repeat: false };
  let keyHints = !!store.get().settings.keyHints;
  let ex, events, score, stopPlayback = null, run = null, runs = [];

  el.innerHTML = '';
  const card = h(`<div class="activity play">
      <div class="play-head">
        <div class="ph-text"><h2>${step.title}</h2><p class="intro">${step.intro || ''}</p></div>
        <div class="seg mode-seg"><button data-mode="wait">Wait mode</button><button data-mode="along">Play along</button></div>
      </div>
      <div class="tools">
        <button class="secondary" data-act="go"></button>
        <button class="secondary" data-act="hear">♫ Hear it</button>
        <span class="tempo along-only"><button class="mini" data-act="slower" aria-label="Slower">−</button><b data-bpm></b><button class="mini" data-act="faster" aria-label="Faster">+</button><span class="muted small" data-target></span></span>
        <span class="bars">Bars <select data-from></select>–<select data-to></select></span>
        <label class="tog"><input type="checkbox" data-repeat> Repeat</label>
        <label class="tog wait-only"><input type="checkbox" data-hints> Show keys</label>
        <span class="beats along-only" aria-hidden="true"></span>
      </div>
      <div class="score-card"><div class="count-in" hidden></div><div class="score"></div></div>
      <p class="feedback" aria-live="polite"></p>
      <div class="runs"></div>
      <div class="result-wrap"></div>
    </div>`);
  el.appendChild(card);
  const $ = s => card.querySelector(s);
  const scoreEl = $('.score'), fb = $('.feedback'), resultWrap = $('.result-wrap'), countIn = $('.count-in');
  const beatsEl = $('.beats');
  beatsEl.innerHTML = Array.from({ length: beatsPerBar }, () => '<i></i>').join('');
  const fromSel = $('[data-from]'), toSel = $('[data-to]');
  const opts = Array.from({ length: nBars }, (_, i) => `<option>${i + 1}</option>`).join('');
  fromSel.innerHTML = opts; toSel.innerHTML = opts; toSel.value = nBars;
  $('[data-hints]').checked = keyHints;

  const els = i => events[i].refs.map(r => score.noteAt(r)).filter(Boolean);
  const setClass = (i, cls, on = true) => els(i).forEach(e => e.classList.toggle(cls, on));
  const say = (text, cls = '') => { fb.textContent = text; fb.className = 'feedback ' + cls; };
  const barLabel = b => b + loop.from; // event bar (0-based within the loop) -> real bar number

  function render() {
    ex = loop.from === 1 && loop.to === nBars ? full : sliceExercise(full, loop.from, loop.to);
    events = exerciseEvents(ex);
    score = renderScore(scoreEl, ex, { fitHeight: spaceBelow(scoreEl, 70) });
  }
  function stopAll() {
    stopPlayback?.(); stopPlayback = null;
    run?.clock.stop(); run = null;
    countIn.hidden = true;
    beatsEl.querySelectorAll('i').forEach(i => i.className = '');
  }
  function paintMode() {
    card.querySelectorAll('.mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    card.classList.toggle('mode-along', mode === 'along');
    $('[data-bpm]').textContent = `${bpm} bpm`;
    $('[data-target]').textContent = bpm < targetBpm ? `goal ${targetBpm}` : 'full speed';
    $('[data-act=go]').textContent = mode === 'along' ? (run ? '■ Stop' : '▶ Start') : '↺ Start again';
  }

  // ---------- wait mode
  let idx, remaining, mistakes, firstAt, lastAdvanceAt, prevMidis;
  function resetWait() {
    stopAll();
    render();
    idx = 0; mistakes = events.map(() => 0); firstAt = null; lastAdvanceAt = 0; prevMidis = [];
    remaining = [...events[0].midis];
    resultWrap.innerHTML = '';
    say('Play the first note when you\'re ready.');
    setClass(0, 'cur');
    dock.hint(keyHints ? events[0].midis : null);
    paintMode();
  }
  function advanceWait() {
    setClass(idx, 'cur', false);
    setClass(idx, mistakes[idx] ? 'slip' : 'good');
    prevMidis = events[idx].midis; lastAdvanceAt = performance.now();
    idx++;
    if (idx >= events.length) { dock.hint(null); return finishWait(); }
    remaining = [...events[idx].midis];
    setClass(idx, 'cur');
    dock.hint(keyHints ? events[idx].midis : null);
    els(idx)[0]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  const grace = graceWrong();
  function onWaitNote({ midi, source }) {
    if (stopPlayback || idx >= events.length) return;
    const hit = remaining.findIndex(m => sameNote(midi, m, source));
    if (hit >= 0) {
      grace.cancel();
      if (firstAt == null) firstAt = performance.now();
      remaining.splice(hit, 1);
      if (!remaining.length) { advanceWait(); if (idx < events.length) say(''); }
      return;
    }
    // Mic: ignore the previous note still ringing.
    if (source === 'mic' && (performance.now() - lastAdvanceAt < 700) && prevMidis.some(m => sameNote(midi, m, 'mic'))) return;
    const at = idx;
    grace.wrong(source, () => {
      if (idx !== at || idx >= events.length) return;
      mistakes[idx]++;
      const want = remaining[0];
      say(`You played ${short(midi)}. Play ${short(want)} instead: ${directionHint(midi, want)}.`, 'bad change');
      dock.wrong(midi);
      dock.hint(remaining);
      els(idx).forEach(e => { e.classList.add('wrong'); setTimeout(() => e.classList.remove('wrong'), 450); });
    });
  }
  function finishWait() {
    const clean = mistakes.filter(m => m === 0).length;
    const accuracy = clean / events.length;
    const seconds = firstAt ? Math.round((performance.now() - firstAt) / 1000) : 0;
    const trouble = [...new Set(events.filter((e, i) => mistakes[i]).map(e => barLabel(e.bar)))];
    const passed = accuracy >= (step.pass || 0.8);
    store.log('play', lessonId, step.title, `${Math.round(accuracy * 100)}% clean, ${seconds}s (wait mode)`);
    saveRec({ best: Math.max(stepRec().best ?? 0, accuracy), at: Date.now() });
    say('');
    const summary = `${Math.round(accuracy * 100)}% clean`;
    if (loop.repeat) return repeatAfter(summary, resetWait);
    showResult({
      stats: [[`${Math.round(accuracy * 100)}%`, 'notes clean'], [`${seconds}s`, 'time taken']],
      text: passed
        ? (trouble.length ? `Good. Bar ${trouble.join(', ')} had a slip or two.` : 'Clean run. Lovely.')
        : `Not quite yet. The slips were in bar ${trouble.join(', ')}. Loop those bars slowly, then go again.`,
      passed, trouble, res: { accuracy, passed, mode: 'wait' },
      nextTip: passed ? 'Ready for the next challenge? Try <b>Play along</b> to add timing.' : '',
    });
  }

  // ---------- play along
  function startAlong() {
    stopAll();
    render();
    resultWrap.innerHTML = '';
    const total = barCount(ex) * beatsPerBar;
    const state = { hits: events.map(() => null), left: events.map(e => [...e.midis]), wrong: 0, endBeat: total };
    const spbMs = 60000 / bpm;
    const clock = startClock({
      bpm, beatsPerBar, countInBars: 1, click: store.get().settings.click !== false,
      onBeat: b => {
        const inBar = ((b % beatsPerBar) + beatsPerBar) % beatsPerBar;
        beatsEl.querySelectorAll('i').forEach((d, k) => d.className = k === inBar ? (b < 0 ? 'on count' : 'on') : '');
        if (b < 0) { countIn.hidden = false; countIn.textContent = -b; say('Get ready…'); return; }
        if (b === 0) { countIn.hidden = true; say(''); }
        // move the "now" marker onto notes starting in this beat (quavers get their own timer)
        events.forEach((e, i) => {
          if (e.beat >= b && e.beat < b + 1) setTimeout(() => {
            if (run?.clock !== clock) return;
            events.forEach((_, j) => setClass(j, 'now', j === i));
            if (keyHints) dock.hint(e.midis);
          }, (e.beat - b) * spbMs);
        });
        if (b >= state.endBeat) finishAlong();
      },
    });
    run = { clock, state, spbMs };
    paintMode();
  }
  function onAlongNote({ midi, source, at }) {
    if (!run) return;
    const { clock, state, spbMs } = run;
    const win = Math.max(220, spbMs * 0.5);
    let best = -1, bestErr = Infinity;
    events.forEach((e, i) => {
      if (!state.left[i].length) return;
      if (!state.left[i].some(m => sameNote(midi, m, source))) return;
      const err = at - clock.timeOf(e.beat);
      if (Math.abs(err) < win && Math.abs(err) < Math.abs(bestErr)) { best = i; bestErr = err; }
    });
    if (best < 0) {
      if (at < clock.timeOf(0) - spbMs * 0.5) return; // noodling during the count-in
      const r = run;
      grace.wrong(source, () => {
        if (run !== r) return;
        state.wrong++;
        dock.wrong(midi);
        say(`${short(midi)}: not in the music here`, 'bad');
      });
      return;
    }
    grace.cancel();
    const k = state.left[best].findIndex(m => sameNote(midi, m, source));
    state.left[best].splice(k, 1);
    if (state.hits[best] == null) state.hits[best] = bestErr;
    if (!state.left[best].length) {
      const good = Math.abs(state.hits[best]) <= Math.max(80, spbMs * 0.15);
      setClass(best, 'now', false);
      setClass(best, good ? 'good' : 'slip');
      if (!good) say(state.hits[best] < 0 ? 'A little early' : 'A little late', 'slipnote');
      else say('');
    }
  }
  function finishAlong() {
    const { state, spbMs } = run;
    const playedBpm = bpm;
    stopAll();
    dock.hint(null);
    const n = events.length;
    const hitIdx = events.map((_, i) => i).filter(i => !state.left[i].length);
    events.forEach((_, i) => { setClass(i, 'now', false); if (state.left[i].length) setClass(i, 'missed'); });
    const tol = Math.max(80, spbMs * 0.15);
    const onTime = hitIdx.filter(i => Math.abs(state.hits[i]) <= tol).length;
    const notesPct = hitIdx.length / n, timePct = onTime / n;
    const meanErr = hitIdx.length ? hitIdx.reduce((a, i) => a + state.hits[i], 0) / hitIdx.length : 0;
    const trouble = [...new Set(events.filter((e, i) => state.left[i].length || Math.abs(state.hits[i] ?? 999) > tol).map(e => barLabel(e.bar)))];
    const passed = notesPct >= 0.85 && timePct >= 0.7;
    const tendency = Math.abs(meanErr) < spbMs * 0.06 ? 'Nice steady timing.'
      : meanErr < 0 ? 'You tend to rush slightly. Feel the clicks and wait for them.' : 'You tend to drag slightly. Keep up with the clicks.';
    let tempoMsg = '';
    if (passed && bpm < targetBpm) {
      const nb = Math.min(targetBpm, bpm + ladderStep);
      tempoMsg = `Passed at ${bpm} bpm. Moving up to <b>${nb} bpm</b>.`;
      bpm = nb;
    } else if (passed) tempoMsg = `<b>Full speed (${bpm} bpm).</b> That's the piece as written.`;
    else if (stepRec().tempo && notesPct < 0.6 && bpm > 40) tempoMsg = 'Try it a little slower: tap −.';
    saveRec({
      tempo: bpm, at: Date.now(),
      best: Math.max(stepRec().best ?? 0, Math.min(notesPct, timePct)),
      bestAlong: Math.max(stepRec().bestAlong ?? 0, timePct),
    });
    store.log('play', lessonId, step.title, `${Math.round(notesPct * 100)}% notes, ${Math.round(timePct * 100)}% in time at ${playedBpm} bpm`);
    paintMode();
    const summary = `${Math.round(notesPct * 100)}% notes · ${Math.round(timePct * 100)}% in time`;
    if (loop.repeat) return repeatAfter(summary, startAlong);
    showResult({
      stats: [[`${Math.round(notesPct * 100)}%`, 'notes right'], [`${Math.round(timePct * 100)}%`, 'in time']],
      text: (passed ? 'Good run. ' : 'Not quite yet. ') + tendency + (trouble.length && !passed ? ` Trouble spots: bar ${trouble.join(', ')}.` : ''),
      passed, trouble, tempoMsg, res: { accuracy: Math.min(notesPct, timePct), passed, mode: 'along' },
    });
  }

  // ---------- shared
  function repeatAfter(summary, again) {
    runs.push(summary);
    $('.runs').innerHTML = runs.slice(-6).map((r, i, a) => `<span>Run ${runs.length - a.length + i + 1}: ${r}</span>`).join('');
    say('Going again…');
    setTimeout(() => { if (loop.repeat) again(); }, 1500);
  }
  function showResult({ stats, text, passed, trouble, res, tempoMsg = '', nextTip = '' }) {
    resultWrap.innerHTML = `<div class="result overlay">
        ${stats.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('')}
        <p class="${passed ? 'good' : 'muted'}">${text}</p>
        ${tempoMsg ? `<p>${tempoMsg}</p>` : ''}${nextTip ? `<p class="muted small">${nextTip}</p>` : ''}
        <div class="row">
          <button class="secondary" data-r="again">↺ Again</button>
          ${trouble.length ? `<button class="secondary" data-r="loop">Loop bar${trouble.length > 1 ? 's' : ''} ${Math.min(...trouble)}${trouble.length > 1 ? '–' + Math.max(...trouble) : ''}</button>` : ''}
          <button data-r="continue" class="${passed ? '' : 'secondary'}">${passed ? 'Continue' : 'Continue anyway'}</button>
        </div></div>`;
    resultWrap.querySelector('[data-r=again]').onclick = () => { resultWrap.innerHTML = ''; mode === 'along' ? startAlong() : resetWait(); };
    resultWrap.querySelector('[data-r=loop]')?.addEventListener('click', () => {
      setLoop(Math.min(...trouble), Math.max(...trouble), true);
    });
    resultWrap.querySelector('[data-r=continue]').onclick = () => { stopAll(); onDone(res); };
  }
  function setLoop(from, to, repeat = loop.repeat) {
    loop = { from, to: Math.max(from, to), repeat };
    fromSel.value = loop.from; toSel.value = loop.to; $('[data-repeat]').checked = repeat;
    runs = []; $('.runs').innerHTML = '';
    resultWrap.innerHTML = '';
    mode === 'along' ? (stopAll(), render(), paintMode(), say('Press Start when you\'re ready.')) : resetWait();
  }

  const offNotes = input.on(e => (mode === 'along' ? onAlongNote(e) : onWaitNote(e)));

  card.querySelectorAll('.mode-seg button').forEach(b => b.onclick = () => {
    mode = b.dataset.mode; stopAll(); resultWrap.innerHTML = '';
    if (mode === 'along') { render(); say('Press Start: you\'ll hear one bar of clicks, then play along.'); dock.hint(null); }
    else resetWait();
    paintMode();
  });
  $('[data-act=go]').onclick = () => {
    if (mode === 'wait') return resetWait();
    if (run) { stopAll(); paintMode(); say('Stopped.'); return; }
    startAlong();
  };
  $('[data-act=hear]').onclick = () => {
    stopAll(); render(); resultWrap.innerHTML = '';
    say('Listen and follow the notes…');
    stopPlayback = playEvents(events, mode === 'along' ? bpm : targetBpm, i => {
      events.forEach((_, j) => setClass(j, 'now', j === i));
      if (i === -1) { stopPlayback = null; mode === 'wait' ? resetWait() : (render(), say('')); }
    });
  };
  $('[data-act=slower]').onclick = () => { bpm = Math.max(30, bpm - 4); saveRec({ tempo: bpm }); paintMode(); };
  $('[data-act=faster]').onclick = () => { bpm = Math.min(200, bpm + 4); saveRec({ tempo: bpm }); paintMode(); };
  fromSel.onchange = () => setLoop(Number(fromSel.value), Math.max(Number(fromSel.value), Number(toSel.value)));
  toSel.onchange = () => setLoop(Math.min(Number(fromSel.value), Number(toSel.value)), Number(toSel.value));
  $('[data-repeat]').onchange = e => { loop.repeat = e.target.checked; runs = []; $('.runs').innerHTML = ''; };
  $('[data-hints]').onchange = e => {
    keyHints = e.target.checked;
    store.update(s => { s.settings.keyHints = keyHints; });
    if (mode === 'wait' && idx < events.length) dock.hint(keyHints ? remaining : null);
  };

  if (mode === 'along') {
    render(); paintMode(); say('Press Start: you\'ll hear one bar of clicks, then play along.');
    if (/[?&]autostart=1/.test(location.search)) startAlong(); // test hook
  }
  else resetWait();
  // Re-fit the music if the window changes size while nothing is in progress.
  // (Only on a real width change: on tablets the height jiggles as the address bar hides.)
  let lastWidth = scoreEl.clientWidth;
  const onResize = () => {
    if (Math.abs(scoreEl.clientWidth - lastWidth) < 40) return;
    lastWidth = scoreEl.clientWidth;
    if (!run && !stopPlayback && (mode === 'along' || (idx === 0 && firstAt == null && !mistakes.some(Boolean)))) mode === 'along' ? render() : resetWait();
  };
  window.addEventListener('resize', onResize);
  return () => { offNotes(); grace.cancel(); stopAll(); dock.hint(null); window.removeEventListener('resize', onResize); };
}
