// All screens. Each render function fills `root` and returns an optional cleanup function.

import { store, dayKey } from './store.js';
import { input } from './input.js';
import { TRACKS, UNITS, LESSONS, FOUNDATION_ORDER, ALL_LESSONS, PLACEMENT_POOL, PLACEMENT_SKIPS, unitOf, trackLessons, trackOf } from './curriculum.js';
import { runFind, runGym, runPlay, gymSummaryHTML } from './activities.js';
import { runChord, runChords, runSong } from './chordplay.js';
import { input as inputBus, latencyFor, DEFAULT_LATENCY } from './input.js';
import { startClock } from './audio.js';
import { renderNotes, renderScore } from './notation.js';
import { createKeyboard } from './keyboard.js';
import { unlockedNotes, noteState } from './srs.js';
import { session } from './session.js';
import { dock } from './dock.js';
import { goalText, stepPassed, GYM_PASS } from './goals.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = hash => { location.hash = hash; };
const DAY = 86400000;

// ---------------------------------------------------------------- helpers
export function nextLessonId(trackId = 'foundation') {
  const s = store.get();
  return trackLessons(trackId).find(id => !s.lessons[id]?.done) || null;
}
export function trackOpen(t) {
  if (t.comingSoon) return false;
  return !t.requires || !!store.get().lessons[t.requires]?.done;
}
function lastSessionAt() {
  const s = store.get();
  if (!s.lastActiveAt) return null;
  return Date.now() - s.lastActiveAt < 30 * 60000 ? s.prevSessionAt : s.lastActiveAt;
}
function ago(t) {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(t)) / DAY);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago (${new Date(t).toLocaleDateString(undefined, { weekday: 'long' })})`;
  if (days < 14) return 'just over a week ago';
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const gapDays = t => (t ? (Date.now() - t) / DAY : null);
const minutes = secs => Math.round(secs / 60);
function lessonCount() {
  const s = store.get();
  return { done: FOUNDATION_ORDER.filter(id => s.lessons[id]?.done).length, total: FOUNDATION_ORDER.length };
}
function reviewPiece() {
  const s = store.get();
  const cands = [];
  ALL_LESSONS.forEach(id => {
    if (!s.lessons[id]?.done) return;
    LESSONS[id].steps.forEach((st, i) => {
      if (st.type !== 'play') return;
      const rec = s.lessons[id].steps?.[i];
      if (rec?.best == null) return; // only pieces actually played
      cands.push({ id, i, title: st.title, best: rec.best, at: rec.at ?? 0 });
    });
  });
  // weakest first, then least recently played
  cands.sort((a, b) => a.best - b.best || a.at - b.at);
  return cands[0] || null;
}

// ---------------------------------------------------------------- welcome / placement
export function renderWelcome(root, params) {
  if (params.get('step') === 'placement') return renderPlacement(root);
  if (params.get('new') === '1' || !store.current()) return renderNewPlayer(root);
  root.innerHTML = `<section class="page narrow welcome">
    <h1>Welcome, ${esc(store.current().name)}</h1>
    <p class="lead">Prop the tablet on the music stand. The app listens through the microphone while you play,
       then moves on when you get the notes right and points out where things went wrong.</p>
    <ul class="ticks">
      <li>Short daily sessions, worked out for you</li>
      <li>Reading music and playing, learned together</li>
      <li>Progress is saved on this tablet</li>
    </ul>
    <h2>Have you played before?</h2>
    <div class="choice-grid">
      <button class="choice" data-c="new"><b>I'm new to this</b><span>Start from the very beginning</span></button>
      <button class="choice" data-c="back"><b>I had lessons a while back</b><span>A 2-minute reading check to find where to start</span></button>
    </div>
  </section>`;
  root.querySelector('[data-c=new]').onclick = () => { store.update(s => { s.onboarded = true; }); go('#/today'); };
  root.querySelector('[data-c=back]').onclick = () => go('#/welcome?step=placement');
}

function renderNewPlayer(root) {
  const first = !store.players().length;
  root.innerHTML = `<section class="page narrow welcome">
    <h1>${first ? 'Welcome to your piano tutor' : 'Add a player'}</h1>
    <p class="lead">${first ? 'First, who\'s playing? Everyone who uses this tablet gets their own progress.' : 'Each player has their own lessons, progress and reading cards.'}</p>
    <form class="name-form">
      <label for="pname">Name</label>
      <input id="pname" name="pname" autocomplete="off" maxlength="24" placeholder="e.g. Jonny" required>
      <button type="submit">Continue</button>
    </form>
    ${first ? '' : '<p><a href="#/players">← Back</a></p>'}
  </section>`;
  const form = root.querySelector('form');
  form.querySelector('input').focus();
  form.onsubmit = e => {
    e.preventDefault();
    const name = form.pname.value.trim();
    if (!name) return;
    store.switchTo(store.addPlayer(name));
    markPicked();
    go('#/welcome');
  };
}

// ---------------------------------------------------------------- who's playing?
export const markPicked = () => { try { sessionStorage.setItem('pt.picked', '1'); } catch {} };
export function renderPlayers(root) {
  const list = store.players();
  const cur = store.current();
  root.innerHTML = `<section class="page narrow players">
    <h1>Who's playing?</h1>
    <div class="player-grid">
      ${list.map(p => {
        let info = '';
        try {
          const d = JSON.parse(localStorage.getItem('pianoTutor.v1.' + p.id) || '{}');
          const done = Object.values(d.lessons || {}).filter(l => l.done).length;
          info = d.lastActiveAt ? `Last played ${ago(d.lastActiveAt)} · ${done} lessons passed` : 'New player';
        } catch {}
        return `<button class="player-card ${cur?.id === p.id ? 'on' : ''}" data-id="${p.id}">
          <span class="avatar" style="background:${p.colour}">${esc(p.name[0].toUpperCase())}</span>
          <b>${esc(p.name)}</b><span class="muted small">${esc(info)}</span></button>`;
      }).join('')}
      <a class="player-card add" href="#/welcome?new=1"><span class="avatar plus">+</span><b>Add a player</b></a>
    </div>
  </section>`;
  root.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
    store.switchTo(b.dataset.id);
    markPicked();
    go(store.get().onboarded ? '#/today' : '#/welcome');
  });
}

function renderPlacement(root) {
  root.innerHTML = `<section class="page narrow">
    <h1>Quick reading check</h1>
    <p class="lead">Sixteen notes across both clefs. Play each one, or switch to <b>Name it</b> and tap the letter if you're away from the piano.
       Don't worry about speed. This just decides where you start.</p>
    <div class="slot"></div>
    <p><button class="link" data-skip>Skip the check and start from the beginning</button></p>
  </section>`;
  root.querySelector('[data-skip]').onclick = () => { store.update(s => { s.onboarded = true; }); go('#/today'); };
  const slot = root.querySelector('.slot');
  return runGym(slot, { pool: PLACEMENT_POOL, count: 16, id: 'placement', title: 'Placement check' }, r => {
    const passed = r.right >= 12;
    store.update(s => {
      s.onboarded = true;
      s.placement = { at: Date.now(), score: r.right, total: r.total, passed };
      if (passed) PLACEMENT_SKIPS.forEach(id => { const l = store.lesson(id); l.done = true; l.completedAt = Date.now(); l.viaPlacement = true; });
    });
    slot.innerHTML = gymSummaryHTML(r) + `<div class="callout">
      ${passed
        ? `<p><b>Plenty came back.</b> You can skip the keyboard, staff and rhythm basics and start at <b>Middle C position</b>. Those early lessons stay open on the Path if you want a refresher.</p>`
        : `<p><b>We'll start at the beginning</b>, but the early lessons are short and you'll move through them quickly.</p>`}
      <button data-go>Go to Today</button></div>`;
    slot.querySelector('[data-go]').onclick = () => go('#/today');
  });
}

// ---------------------------------------------------------------- today
export function renderToday(root, params) {
  const justDone = params?.get('done') === '1';
  const s = store.get();
  const last = lastSessionAt();
  const gap = gapDays(last);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayMins = minutes(s.practice[dayKey(Date.now())] || 0);
  const nextId = nextLessonId();
  const review = reviewPiece();
  const known = unlockedNotes();
  const longGap = gap != null && gap >= 14;

  const items = [];
  if (known.length >= 2) items.push({
    kind: 'gym', icon: '♩', title: longGap ? 'Review: reading cards' : 'Warm-up: reading cards',
    sub: `${longGap ? 15 : 10} notes from the ${known.length} you know`, mins: 2, hash: `#/gym?count=${longGap ? 15 : 10}&auto=1`,
  });
  if (longGap && review) items.push({ kind: 'review', icon: '↺', title: `Revisit: ${review.title}`, sub: 'Shake off the rust on something you already know', mins: 4, hash: `#/lesson/${review.id}?step=${review.i}&solo=1` });
  if (nextId) {
    const L = LESSONS[nextId];
    const started = Object.keys(s.lessons[nextId]?.steps || {}).length > 0;
    items.push({ kind: 'lesson', icon: '♪', title: `${started ? 'Continue' : 'Next lesson'}: ${L.title}`, sub: UNITS[unitOf(nextId)].title + (L.milestone ? ' · milestone' : ''), mins: L.minutes, hash: `#/lesson/${nextId}` });
  }
  const songsTrack = TRACKS.find(t => t.id === 'songs');
  const nextSong = trackOpen(songsTrack) ? nextLessonId('songs') : null;
  if (nextSong) {
    const L = LESSONS[nextSong];
    items.push({ kind: 'lesson', icon: '♫', title: `Songs & Chords: ${L.title}`, sub: UNITS[unitOf(nextSong)].title + (L.milestone ? ' · milestone' : ''), mins: L.minutes, hash: `#/lesson/${nextSong}` });
  }
  if (!longGap && review) items.push({ kind: 'review', icon: '↺', title: `Polish: ${review.title}`,
    sub: review.best != null ? `Play along · best so far ${Math.round(review.best * 100)}%` : 'Play along with the metronome', mins: 3,
    hash: `#/lesson/${review.id}?step=${review.i}&solo=1&mode=along` });

  let recap = '';
  if (gap != null && gap >= 3) {
    const lastDay = dayKey(last);
    const seen = new Set();
    const lastItems = s.history.filter(h => dayKey(h.at) === lastDay).reverse()
      .filter(h => !seen.has(h.title) && seen.add(h.title)).slice(0, 4);
    recap = `<div class="card recap">
      <h2>Where you left off</h2>
      ${lastItems.length ? `<ul>${lastItems.map(h => `<li><b>${esc(h.title)}</b> <span class="muted">${esc(h.detail || '')}</span></li>`).join('')}</ul>` : ''}
      ${longGap ? `<p>It's been a while, so today opens with a little review before anything new. That's normal, and it comes back quickly.</p>`
                : `<p>A quick warm-up first will bring it back.</p>`}
    </div>`;
  }

  const nextMilestone = FOUNDATION_ORDER.find(id => LESSONS[id].milestone && !s.lessons[id]?.done);
  const toMilestone = nextMilestone && nextId ? FOUNDATION_ORDER.indexOf(nextMilestone) - FOUNDATION_ORDER.indexOf(nextId) + 1 : 0;
  const totalMins = items.reduce((a, i) => a + i.mins, 0);

  root.innerHTML = `<section class="page today">
    <header class="hero">
      <div>
        <h1>${hello}${store.current() ? `, ${esc(store.current().name)}` : ''}</h1>
        <p class="lead">${last ? `Last practice: <b>${ago(last)}</b>.` : 'Your first session. Welcome.'}
          ${todayMins ? ` ${todayMins} min practised today.` : ''}</p>
      </div>
    </header>
    ${justDone ? `<div class="card done-banner"><h2>Session done ✓</h2><p>${todayMins ? `${todayMins} minutes at the piano today. ` : ''}Anything more is a bonus. A few minutes of free play with what you've learned is a lovely way to finish.</p></div>` : recap}
    <div class="card plan">
      <div class="plan-head"><h2>Today's session</h2><span class="muted">about ${totalMins} min</span></div>
      <ol class="plan-list">
        ${items.map((it, i) => `<li><a href="${it.hash}" data-i="${i}"><span class="ico">${it.icon}</span>
          <span class="txt"><b>${esc(it.title)}</b><span>${esc(it.sub)}</span></span><span class="mins">${it.mins} min</span></a></li>`).join('')}
      </ol>
      ${items.length ? `<button class="big" data-start>Start session</button>` : `<p>You've finished everything that's open. New lessons are on the way.</p>`}
    </div>
    ${nextMilestone ? `<div class="card milestone-next"><span class="flag">⚑</span><div><b>Next milestone:</b> ${esc(LESSONS[nextMilestone].title)}
      <span class="muted">· ${toMilestone <= 1 ? 'this lesson' : `${toMilestone} lessons away`}</span></div></div>` : ''}
  </section>`;
  root.querySelector('[data-start]')?.addEventListener('click', () => {
    session.start(items.map(i => i.hash));
    go(items[0].hash);
  });
  root.querySelectorAll('.plan-list a').forEach(a => a.addEventListener('click', () => session.clear()));
}

// ---------------------------------------------------------------- path
export function renderPath(root) {
  const s = store.get();
  root.innerHTML = `<section class="page path">
    <h1>Your path</h1>
    ${TRACKS.map(t => { const nextId = nextLessonId(t.id); const open = trackOpen(t); return `<div class="track ${t.comingSoon ? 'soon' : ''} ${open ? '' : 'locked'}">
      <div class="track-head"><h2>${t.title}</h2><p class="muted">${t.blurb}</p>${!open && t.requiresText ? `<p class="soon-note">🔒 ${t.requiresText}</p>` : ''}</div>
      ${t.comingSoon ? `<p class="soon-note">${t.comingSoon}</p>` : t.units.map((u, ui) => `
        <div class="unit"><h3><span class="unum">${ui + 1}</span>${UNITS[u].title}</h3>
          <ul class="lessons">${UNITS[u].lessons.map(id => {
            const L = LESSONS[id], rec = s.lessons[id];
            const locked = !!lockedBy(id);
            const state = rec?.done ? 'done' : locked ? 'locked' : id === nextId ? 'next' : '';
            return `<li class="${state}"><a href="#/lesson/${id}">
              <span class="state">${rec?.done ? '✓' : locked ? '🔒' : id === nextId ? '●' : ''}</span>
              <span class="lt">${L.title}${L.milestone ? ' <span class="flag" title="Milestone">⚑</span>' : ''}</span>
              <span class="muted small">${rec?.viaPlacement ? 'placed' : `${L.minutes} min`}</span></a></li>`;
          }).join('')}</ul></div>`).join('')}
    </div>`; }).join('')}
  </section>`;
}

// ---------------------------------------------------------------- lesson
// A lesson unlocks once the lesson before it in the same track is complete
// (the first lesson of a track may also need something from another track).
export function lockedBy(id) {
  const t = trackOf(id);
  if (!t) return null;
  const ids = trackLessons(t.id);
  const k = ids.indexOf(id);
  const s = store.get();
  if (s.lessons[id]?.done) return null;
  if (k === 0) return t.requires && !s.lessons[t.requires]?.done ? t.requires : null;
  return s.lessons[ids[k - 1]]?.done ? null : ids[k - 1];
}

export function renderLesson(root, params, id) {
  const L = LESSONS[id];
  if (!L) { root.innerHTML = `<section class="page"><p>Lesson not found.</p></section>`; return; }
  const solo = params.get('solo') === '1'; // play a single step (review) then leave
  const blocker = solo ? null : lockedBy(id);
  if (blocker) {
    dock.show(false);
    root.innerHTML = `<section class="page narrow locked-page">
      <a class="back" href="#/path">← Path</a>
      <h1>🔒 ${esc(L.title)}</h1>
      <p class="lead">This lesson unlocks when you've passed <b>${esc(LESSONS[blocker].title)}</b>.</p>
      <a class="btn" href="#/lesson/${blocker}">Go to ${esc(LESSONS[blocker].title)}</a>
    </section>`;
    return;
  }
  const passedAt = j => stepPassed(L.steps[j], store.get().lessons[id]?.steps?.[j]);
  let stepIdx = Number(params.get('step')) || 0;
  if (!params.has('step') && !solo) {
    // resume at the first step not yet passed
    if (!store.get().lessons[id]?.done) { const firstOpen = L.steps.findIndex((_, j) => !passedAt(j)); if (firstOpen > 0) stepIdx = firstOpen; }
  }
  let cleanup = null;

  root.innerHTML = `<section class="page lesson">
    <div class="lesson-head">
      <a class="back" href="#/path">← Path</a>
      <div class="lt"><div class="muted small">${UNITS[unitOf(id)].title}</div><h1>${L.title}</h1></div>
      <div class="step-nav"></div>
    </div>
    <div class="steps-bar">${L.steps.map((_, i) => `<span data-i="${i}"></span>`).join('')}</div>
    <div class="step-body"></div>
  </section>`;
  const body = root.querySelector('.step-body');
  const nav = root.querySelector('.step-nav');
  const bar = root.querySelectorAll('.steps-bar span');

  function markStep(i, extra = {}) {
    store.update(s => {
      const rec = store.lesson(id);
      const prev = rec.steps[i] || {};
      const best = extra.best == null ? prev.best : Math.max(prev.best ?? 0, extra.best);
      const mastered = !!prev.mastered || !!extra.mastered;
      rec.steps[i] = { ...prev, ...extra, done: true, mastered, at: Date.now(), best };
      rec.lastAt = Date.now();
    });
  }
  function completeLesson() {
    const first = !store.get().lessons[id]?.done;
    store.update(s => { const rec = store.lesson(id); rec.done = true; rec.completedAt = rec.completedAt || Date.now(); });
    if (first) store.log('lesson', id, L.title, 'Lesson passed');
    const nextId = nextLessonId(trackOf(id)?.id);
    const following = session.active;
    body.innerHTML = `<div class="complete">
      ${L.milestone && first ? `<div class="milestone-banner"><span class="flag">⚑</span><div><b>Milestone reached</b><p>${esc(L.milestone)}</p></div></div>` : ''}
      <div class="pass-badge big">✓ Lesson passed</div>
      ${L.unlocks?.length ? `<p>New notes in your reading cards: <b>${L.unlocks.join(', ')}</b></p>` : ''}
      ${nextId && first ? `<p class="muted">Unlocked: <b>${esc(LESSONS[nextId].title)}</b></p>` : ''}
      <div class="row">
        ${following ? `<button data-next-item>${session.peek() ? 'Next in today\'s session →' : 'Finish session'}</button>`
          : nextId ? `<button data-next>Next lesson: ${esc(LESSONS[nextId].title)}</button>` : ''}
        <a class="btn secondary" href="#/today">Back to Today</a>
      </div></div>`;
    nav.innerHTML = '';
    body.querySelector('[data-next]')?.addEventListener('click', () => go(`#/lesson/${nextId}`));
    body.querySelector('[data-next-item]')?.addEventListener('click', () => session.advance());
    paintBar(-1);
  }
  // Reached the end: complete the lesson only if every step has been passed.
  function tryComplete() {
    const open = L.steps.map((_, j) => j).filter(j => !passedAt(j));
    if (!open.length) return completeLesson();
    cleanup?.(); cleanup = null;
    nav.innerHTML = '';
    paintBar(-1);
    body.innerHTML = `<div class="complete">
      <h2>Nearly there</h2>
      <p>To pass this lesson, ${open.length === 1 ? 'this step still needs' : 'these steps still need'} passing:</p>
      <div class="todo">${open.map(j => `<button class="secondary" data-go="${j}">${esc(stepLabel(L.steps[j]))}<span class="muted small">${esc(goalText(L.steps[j]).replace('Goal: ', ''))}</span></button>`).join('')}</div>
      <p><a href="#/today">Back to Today</a></p></div>`;
    body.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(Number(b.dataset.go)));
  }
  function paintBar(cur) {
    bar.forEach((b, j) => { b.className = j === cur ? 'cur' : passedAt(j) ? 'done' : store.get().lessons[id]?.steps?.[j]?.done ? 'tried' : ''; });
  }

  function show(i) {
    cleanup?.(); cleanup = null;
    stepIdx = i;
    paintBar(i);
    const st = L.steps[i];
    // a step's own activity decides whether it was passed (r.mastered); simple steps pass by finishing
    const finish = (extra = {}) => {
      markStep(i, { ...extra, mastered: extra.mastered ?? ['text', 'find', 'chord'].includes(st.type) });
      if (solo) { session.active ? session.advance() : go('#/today'); return; }
      if (i + 1 < L.steps.length) show(i + 1); else tryComplete();
    };
    const navHTML = `${i > 0 ? '<button class="secondary" data-prev>← Back</button>' : ''}${solo ? '' : `<button class="link" data-skip title="Look ahead. This step won't count as passed.">Skip for now</button>`}`;
    nav.innerHTML = '';
    body.innerHTML = '';
    if (st.type === 'text') {
      body.innerHTML = `<div class="explain"><h2>${st.title}</h2><div class="prose">${st.body}</div><div class="visual"></div>
        <div class="row explain-next"><button data-nextstep>${i + 1 < L.steps.length ? 'Got it →' : 'Finish'}</button></div></div>`;
      const v = body.querySelector('.visual');
      if (st.visual?.kind === 'keyboard') v.appendChild(createKeyboard(st.visual).el);
      if (st.visual?.kind === 'staff') { v.classList.add('staff-card'); renderNotes(v, st.visual.notes); }
      if (st.visual?.kind === 'score') { v.classList.add('score-card'); renderScore(v, st.visual.ex, { scale: 1.3 }); }
      nav.innerHTML = i > 0 ? '<button class="secondary" data-prev>← Back</button>' : '';
      body.querySelector('[data-nextstep]').onclick = () => finish();
    } else if (st.type === 'find') {
      cleanup = runFind(body, st, () => finish());
      nav.innerHTML = navHTML;
    } else if (st.type === 'gym') {
      const wrap = document.createElement('div');
      body.innerHTML = `<p class="goal center">${goalText(st)}</p>`;
      body.appendChild(wrap);
      const runIt = () => {
        cleanup = runGym(wrap, { pool: st.notes, count: st.count, id, title: L.title }, r => {
          markStep(i, { best: r.right / r.total, mastered: r.mastered });
          wrap.innerHTML = gymSummaryHTML(r) + (r.mastered
            ? `<div class="pass-badge">✓ Passed</div><div class="row center"><button data-cont>Continue</button></div>`
            : `<p class="goal-msg center">You need ${Math.round(GYM_PASS * 100)}% right first time (${Math.ceil(GYM_PASS * r.total)} of ${r.total}). Have another go. The notes you missed will come up more.</p>
               <div class="row center"><button data-again>↺ Try again</button></div>`);
          wrap.querySelector('[data-cont]')?.addEventListener('click', () => finish({ best: r.right / r.total, mastered: true }));
          wrap.querySelector('[data-again]')?.addEventListener('click', runIt);
        });
      };
      runIt();
      nav.innerHTML = navHTML;
    } else if (st.type === 'chord' || st.type === 'chords' || st.type === 'song') {
      const wrap = document.createElement('div');
      body.appendChild(wrap);
      const run = { chord: runChord, chords: runChords, song: runSong }[st.type];
      cleanup = run(wrap, { ...st, id }, r => finish({ best: r.best ?? 1, mastered: r.mastered ?? true }));
      nav.innerHTML = navHTML;
    } else if (st.type === 'play') {
      const wrap = document.createElement('div');
      body.appendChild(wrap);
      cleanup = runPlay(wrap, st, r => finish({ best: r.accuracy, passed: r.passed, mastered: r.mastered }), { lessonId: id, stepIdx: i, mode: params.get('mode'), solo });
      nav.innerHTML = navHTML;
    }
    nav.querySelector('[data-prev]')?.addEventListener('click', () => show(i - 1));
    nav.querySelector('[data-skip]')?.addEventListener('click', () => (i + 1 < L.steps.length ? show(i + 1) : tryComplete()));
    window.scrollTo({ top: 0 });
  }
  show(Math.min(stepIdx, L.steps.length - 1));
  return () => cleanup?.();
}
const stepLabel = st => st.title || st.prompt || (st.type === 'chord' ? `Play ${st.chord}` : 'Step');

// ---------------------------------------------------------------- reading gym
export function renderGym(root, params) {
  const known = unlockedNotes();
  const count = Number(params.get('count')) || 20;
  const fromSession = session.active || params.get('auto') === '1';
  let cleanup = null;
  root.innerHTML = `<section class="page gym-page">
    <h1>Reading Gym</h1>
    <p class="lead">Quick note-reading cards. Notes you're slow on, or get wrong, come up more often.</p>
    <div class="slot"></div>
  </section>`;
  const slot = root.querySelector('.slot');
  if (known.length < 2) {
    slot.innerHTML = `<div class="card"><p>Reading cards start once you've met a few notes on the staff (Unit 2).</p>
      <a class="btn" href="#/lesson/${nextLessonId() || 'l2-1'}">Go to the next lesson</a></div>`;
    return;
  }
  const weak = known.filter(n => noteState(n).box <= 2);
  const menu = () => {
    slot.innerHTML = `<div class="card">
      ${masteryHTML(known)}
      <div class="row">
        <button data-pool="all">All my notes (${known.length})</button>
        ${weak.length >= 2 && weak.length < known.length ? `<button class="secondary" data-pool="weak">Just the shaky ones (${weak.length})</button>` : ''}
      </div></div>`;
    slot.querySelectorAll('[data-pool]').forEach(b => b.onclick = () => start(b.dataset.pool === 'weak' ? weak : known));
  };
  const start = pool => {
    cleanup = runGym(slot, { pool, count, id: 'gym', title: 'Reading Gym' }, r => {
      slot.innerHTML = gymSummaryHTML(r) + `<div class="row">
        ${session.active ? `<button data-next-item>${session.peek() ? 'Next in today\'s session →' : 'Finish session'}</button>` : `<button data-again>Another round</button><a class="btn secondary" href="#/today">Done</a>`}</div>`;
      slot.querySelector('[data-again]')?.addEventListener('click', menu);
      slot.querySelector('[data-next-item]')?.addEventListener('click', () => session.advance());
    });
  };
  fromSession ? start(known) : menu();
  return () => cleanup?.();
}

const BOX_LABEL = ['', 'new', 'learning', 'learning', 'solid', 'instant'];
function masteryHTML(names) {
  return `<div class="mastery">${names.map(n => {
    const st = noteState(n);
    const lvl = st.seen ? st.box : 0;
    return `<span class="mchip b${lvl}" title="${n}: ${st.seen ? BOX_LABEL[st.box] : 'not seen yet'}">${n}</span>`;
  }).join('')}</div>
  <p class="legend small muted"><span class="mchip b0">·</span> not seen <span class="mchip b1">·</span> shaky <span class="mchip b3">·</span> learning <span class="mchip b5">·</span> instant</p>`;
}

// ---------------------------------------------------------------- progress
export function renderProgress(root) {
  const s = store.get();
  const { done, total } = lessonCount();
  const songIds = trackLessons('songs');
  const songsDone = songIds.filter(id => s.lessons[id]?.done).length;
  const known = unlockedNotes();
  // practice chart: last 28 days
  const days = Array.from({ length: 28 }, (_, i) => { const t = Date.now() - (27 - i) * DAY; return { key: dayKey(t), d: new Date(t) }; });
  const maxS = Math.max(600, ...days.map(d => s.practice[d.key] || 0));
  const weekS = days.slice(-7).reduce((a, d) => a + (s.practice[d.key] || 0), 0);
  const allS = Object.values(s.practice).reduce((a, b) => a + b, 0);
  const milestones = ALL_LESSONS.filter(id => LESSONS[id].milestone);
  const pieces = [];
  ALL_LESSONS.forEach(id => LESSONS[id].steps.forEach((st, i) => {
    const rec = s.lessons[id]?.steps?.[i];
    if (st.type === 'play' && rec?.best != null) pieces.push({ id, i, title: st.title, best: rec.best });
  }));

  root.innerHTML = `<section class="page progress">
    <h1>${store.players().length > 1 ? `${esc(store.current()?.name || '')}'s progress` : 'Progress'}</h1>
    <div class="grid2">
      <div class="card">
        <h2>Level</h2>
        <p class="levelname">Foundation <span class="muted">· the road to Grade 1</span></p>
        <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>
        <p class="muted">${done} of ${total} lessons</p>
        <p class="levelname">Songs &amp; Chords</p>
        <div class="bar"><span style="width:${(songsDone / songIds.length) * 100}%"></span></div>
        <p class="muted">${songsDone} of ${songIds.length} lessons</p>
        <h3>Milestones</h3>
        <ul class="milestones">${milestones.map(id => {
          const rec = s.lessons[id];
          return `<li class="${rec?.done ? 'done' : ''}"><span class="flag">⚑</span> ${esc(LESSONS[id].milestone)}
            ${rec?.done ? `<span class="muted small">· ${new Date(rec.completedAt).toLocaleDateString()}</span>` : ''}</li>`;
        }).join('')}
          <li class="future"><span class="flag">⚑</span> Grade 1 standard</li></ul>
      </div>
      <div class="card">
        <h2>Practice time</h2>
        <div class="stats"><div class="stat"><b>${minutes(weekS)}</b><span>min this week</span></div>
          <div class="stat"><b>${(allS / 3600).toFixed(1)}</b><span>hours in total</span></div></div>
        <div class="chart" role="img" aria-label="Minutes practised per day, last 4 weeks">
          ${days.map(d => { const v = s.practice[d.key] || 0; return `<span title="${d.d.toLocaleDateString()}: ${minutes(v)} min" style="height:${Math.max(v ? 4 : 1, (v / maxS) * 100)}%" class="${v ? '' : 'zero'}"></span>`; }).join('')}
        </div>
        <div class="chart-axis muted small"><span>4 weeks ago</span><span>today</span></div>
      </div>
      <div class="card">
        <h2>Note reading</h2>
        ${known.length ? masteryHTML(known) : '<p class="muted">Starts in Unit 2.</p>'}
      </div>
      <div class="card">
        <h2>Pieces</h2>
        ${pieces.length ? `<ul class="pieces">${pieces.map(p => `<li><a href="#/lesson/${p.id}?step=${p.i}&solo=1">${esc(p.title)}</a>
          <span class="bar small-bar"><span style="width:${p.best * 100}%"></span></span><span class="muted small">${Math.round(p.best * 100)}%</span></li>`).join('')}</ul>`
          : '<p class="muted">Pieces you play will show up here with your best run.</p>'}
      </div>
    </div>
    <div class="card">
      <h2>Recent</h2>
      ${s.history.length ? `<ul class="history">${s.history.slice(-12).reverse().map(h => `<li><span class="muted small">${new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span> <b>${esc(h.title)}</b> <span class="muted">${esc(h.detail || '')}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing yet.</p>'}
    </div>
  </section>`;
}

// ---------------------------------------------------------------- settings
export function renderSettings(root) {
  const s = store.get();
  root.innerHTML = `<section class="page narrow settings">
    <h1>Settings</h1>
    <div class="card">
      <h2>Listening</h2>
      <p class="muted">The microphone listens while you play. Tap <b>Start listening</b> once each time you open the app.</p>
      <div class="row"><button data-mic>Start listening</button><span class="pill" data-micstate></span></div>
      <div class="meter"><span data-level></span><i data-thr></i></div>
      <p class="small muted">Last note heard: <b data-heard>–</b></p>
      <label class="slider">Sensitivity
        <input type="range" min="0.003" max="0.04" step="0.001" value="${s.settings.micThreshold}" data-thr-in>
        <span class="small muted">Move it left if quiet notes are missed, and right if it picks up noise.</span></label>
      <hr>
      <div class="row"><button class="secondary" data-midi>Connect a USB MIDI keyboard</button><span class="pill" data-midistate></span></div>
    </div>
    <div class="card">
      <h2>Timing</h2>
      <p class="muted">Play along scores your timing. The mic needs a moment to recognise a note, so the app allows for that delay.
        If it keeps saying you're late (or early) when you're not, calibrate: play any key on each click.</p>
      <div class="row"><button data-cal>Calibrate timing</button><span class="pill" data-calres></span></div>
      <div class="beats cal-beats" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <label class="check"><input type="checkbox" data-click ${s.settings.click !== false ? 'checked' : ''}> Metronome clicks during Play along</label>
    </div>
    <div class="card">
      <h2>Display</h2>
      <label class="check"><input type="checkbox" data-touch ${s.settings.touchKeyboard ? 'checked' : ''}> Show on-screen keys during lessons (handy away from the piano)</label>
      <label class="slider">Theme
        <select data-theme>${['system', 'light', 'dark'].map(t => `<option ${s.settings.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="card">
      <h2>Backup</h2>
      <p class="muted">Progress lives on this tablet. Save a backup now and then, or send it to Claude so the next lessons can be tailored to you.</p>
      <div class="row"><button data-export>Save backup file</button>
        <label class="btn secondary">Restore from file<input type="file" accept=".json,application/json" data-import hidden></label></div>
      <p class="small" data-backupmsg></p>
    </div>
    <div class="card">
      <h2>Players</h2>
      <p class="muted">Everyone gets their own progress. Mic, timing and display settings are shared by the whole tablet.</p>
      <ul class="player-list">${store.players().map(p => `<li data-pid="${p.id}">
        <span class="avatar sm" style="background:${p.colour}">${esc(p.name[0].toUpperCase())}</span>
        <input value="${esc(p.name)}" maxlength="24" aria-label="Name">
        ${p.id === store.current()?.id ? '<span class="pill ok">playing</span>' : `<button class="link" data-switch>Switch</button>`}
        ${store.players().length > 1 ? '<button class="link danger-link" data-remove>Remove</button>' : ''}
      </li>`).join('')}</ul>
      <div class="row"><a class="btn secondary" href="#/welcome?new=1">+ Add a player</a></div>
    </div>
    <div class="card">
      <h2>Start over</h2>
      <div class="row"><a class="btn secondary" href="#/welcome?step=placement">Retake the reading check</a>
        <button class="danger" data-reset>Erase ${esc(store.current()?.name || 'this player')}'s progress</button></div>
    </div>
    <p class="small muted">Piano Tutor · version <span data-ver></span></p>
  </section>`;
  const $ = sel => root.querySelector(sel);
  $('[data-ver]').textContent = window.APP_VERSION || 'dev';
  const offStatus = input.onStatus(st => {
    $('[data-micstate]').textContent = { off: 'off', starting: 'starting…', on: 'listening', error: 'blocked: ' + (st.micError || '') }[st.mic] || st.mic;
    $('[data-micstate]').className = 'pill ' + (st.mic === 'on' ? 'ok' : st.mic === 'error' ? 'no' : '');
    $('[data-midistate]').textContent = { off: '', on: 'connected: ' + st.midiDevices.join(', '), none: 'no keyboard found', unsupported: 'not supported', error: 'error' }[st.midi] || '';
  });
  $('[data-mic]').onclick = () => input.startMic();
  $('[data-midi]').onclick = () => input.startMidi();
  const offNote = input.on(e => { $('[data-heard]').textContent = `${e.midi ? midiName(e.midi) : '–'} (${e.source})`; });
  const level = $('[data-level]'), thrMark = $('[data-thr]');
  const placeThr = () => { thrMark.style.left = Math.min(100, store.get().settings.micThreshold * 8 * 100) + '%'; };
  placeThr();
  const timer = setInterval(() => { level.style.width = (input.level * 100).toFixed(0) + '%'; }, 60);
  $('[data-thr-in]').oninput = e => { store.update(s => { s.settings.micThreshold = Number(e.target.value); }); placeThr(); };
  $('[data-click]').onchange = e => store.update(s => { s.settings.click = e.target.checked; });
  const showCal = () => {
    const src = inputBus.lastSource || (inputBus.status.mic === 'on' ? 'mic' : 'keys');
    $('[data-calres]').textContent = `${src}: allowing ${Math.round(latencyFor(src))} ms`;
  };
  showCal();
  let calClock = null;
  $('[data-cal]').onclick = () => {
    calClock?.stop();
    const taps = [];
    const btn = $('[data-cal]');
    btn.textContent = 'Listen… then play on each click';
    const offTap = inputBus.on(e => taps.push(e));
    const dots = root.querySelectorAll('.cal-beats i');
    calClock = startClock({ bpm: 80, beatsPerBar: 4, countInBars: 1, onBeat: b => {
      dots.forEach((d, k) => d.className = k === ((b % 4) + 4) % 4 ? (b < 0 ? 'on count' : 'on') : '');
      if (b < 8) return;
      calClock.stop(); offTap(); btn.textContent = 'Calibrate timing';
      dots.forEach(d => d.className = '');
      // offset of each tap from its nearest click, using the raw (uncorrected) time
      const offs = taps.map(t => { const beat = Math.round((t.raw - calClock.timeOf(0)) / calClock.spb / 1000); return beat >= 0 && beat < 8 ? t.raw - calClock.timeOf(beat) : null; })
        .filter(v => v != null && Math.abs(v) < 400).sort((a, b) => a - b);
      if (offs.length < 4) { $('[data-calres]').textContent = 'Not enough notes heard. Try again.'; return; }
      const median = offs[Math.floor(offs.length / 2)];
      const src = taps.at(-1).source;
      store.update(st => { st.settings.latency = { ...(st.settings.latency || {}), [src]: Math.max(0, Math.round(median)) }; });
      $('[data-calres]').textContent = `${src}: ${Math.round(median)} ms delay saved`;
    } });
  };
  const stopCal = () => calClock?.stop();
  $('[data-touch]').onchange = e => store.update(s => { s.settings.touchKeyboard = e.target.checked; });
  $('[data-theme]').onchange = e => { store.update(s => { s.settings.theme = e.target.value; }); document.documentElement.dataset.theme = e.target.value; };
  $('[data-export]').onclick = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `piano-tutor-backup-${dayKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('[data-backupmsg]').textContent = 'Backup saved to your downloads.';
  };
  $('[data-import]').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { store.importJSON(await f.text()); $('[data-backupmsg]').textContent = 'Progress restored.'; }
    catch (err) { $('[data-backupmsg]').textContent = err.message; }
  };
  let armed = false;
  $('[data-reset]').onclick = e => {
    if (!armed) { armed = true; e.target.textContent = 'Tap again to erase everything'; setTimeout(() => { armed = false; e.target.textContent = 'Erase all progress'; }, 4000); return; }
    store.reset(); go('#/welcome');
  };
  root.querySelectorAll('[data-pid]').forEach(li => {
    const id = li.dataset.pid;
    li.querySelector('input').onchange = e => { store.renamePlayer(id, e.target.value); };
    li.querySelector('[data-switch]')?.addEventListener('click', () => { store.switchTo(id); markPicked(); go(store.get().onboarded ? '#/today' : '#/welcome'); });
    let sure = false;
    li.querySelector('[data-remove]')?.addEventListener('click', e => {
      if (!sure) { sure = true; e.target.textContent = 'Tap again to remove (deletes their progress)'; setTimeout(() => { sure = false; e.target.textContent = 'Remove'; }, 4000); return; }
      store.removePlayer(id);
      if (!store.get().onboarded) go('#/welcome');
      else window.dispatchEvent(new HashChangeEvent('hashchange')); // redraw Settings
    });
  });
  return () => { offStatus(); offNote(); clearInterval(timer); stopCal(); };
}
const midiName = m => { const n = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']; return n[m % 12] + (Math.floor(m / 12) - 1); };
