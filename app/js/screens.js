// All screens. Each render function fills `root` and returns an optional cleanup function.

import { store, dayKey } from './store.js';
import { input } from './input.js';
import { TRACKS, UNITS, LESSONS, FOUNDATION_ORDER, PLACEMENT_POOL, PLACEMENT_SKIPS, unitOf } from './curriculum.js';
import { runFind, runGym, runPlay, gymSummaryHTML } from './activities.js';
import { renderNotes, renderScore } from './notation.js';
import { createKeyboard } from './keyboard.js';
import { unlockedNotes, noteState } from './srs.js';
import { session } from './session.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const go = hash => { location.hash = hash; };
const DAY = 86400000;

// ---------------------------------------------------------------- helpers
export function nextLessonId() {
  const s = store.get();
  return FOUNDATION_ORDER.find(id => !s.lessons[id]?.done) || null;
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
  FOUNDATION_ORDER.forEach(id => {
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
  root.innerHTML = `<section class="page narrow welcome">
    <h1>Welcome to your piano tutor</h1>
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
  if (!longGap && review) items.push({ kind: 'review', icon: '↺', title: `Polish: ${review.title}`, sub: review.best ? `Best so far ${Math.round(review.best * 100)}% clean` : 'Play it through once more', mins: 3, hash: `#/lesson/${review.id}?step=${review.i}&solo=1` });

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
  const toMilestone = nextMilestone ? FOUNDATION_ORDER.indexOf(nextMilestone) - FOUNDATION_ORDER.indexOf(nextId) + 1 : 0;
  const totalMins = items.reduce((a, i) => a + i.mins, 0);

  root.innerHTML = `<section class="page today">
    <header class="hero">
      <div>
        <h1>${hello}</h1>
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
      ${items.length ? `<button class="big" data-start>Start session</button>` : `<p>You've finished everything in Foundation. New tracks are on the way.</p>`}
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
  const nextId = nextLessonId();
  root.innerHTML = `<section class="page path">
    <h1>Your path</h1>
    ${TRACKS.map(t => `<div class="track ${t.comingSoon ? 'soon' : ''}">
      <div class="track-head"><h2>${t.title}</h2><p class="muted">${t.blurb}</p></div>
      ${t.comingSoon ? `<p class="soon-note">${t.comingSoon}</p>` : t.units.map((u, ui) => `
        <div class="unit"><h3><span class="unum">${ui + 1}</span>${UNITS[u].title}</h3>
          <ul class="lessons">${UNITS[u].lessons.map(id => {
            const L = LESSONS[id], rec = s.lessons[id];
            const state = rec?.done ? 'done' : id === nextId ? 'next' : '';
            return `<li class="${state}"><a href="#/lesson/${id}">
              <span class="state">${rec?.done ? '✓' : id === nextId ? '●' : ''}</span>
              <span class="lt">${L.title}${L.milestone ? ' <span class="flag" title="Milestone">⚑</span>' : ''}</span>
              <span class="muted small">${rec?.viaPlacement ? 'placed' : `${L.minutes} min`}</span></a></li>`;
          }).join('')}</ul></div>`).join('')}
    </div>`).join('')}
  </section>`;
}

// ---------------------------------------------------------------- lesson
export function renderLesson(root, params, id) {
  const L = LESSONS[id];
  if (!L) { root.innerHTML = `<section class="page"><p>Lesson not found.</p></section>`; return; }
  const solo = params.get('solo') === '1'; // play a single step (review) then leave
  let stepIdx = Number(params.get('step')) || 0;
  if (!params.has('step') && !solo) {
    // resume at the first unfinished step
    const rec = store.get().lessons[id];
    if (rec && !rec.done) { const firstOpen = L.steps.findIndex((_, i) => !rec.steps?.[i]?.done); if (firstOpen > 0) stepIdx = firstOpen; }
  }
  let cleanup = null;

  root.innerHTML = `<section class="page lesson">
    <div class="lesson-head">
      <a class="back" href="#/path">← Path</a>
      <div><div class="muted small">${UNITS[unitOf(id)].title}</div><h1>${L.title}</h1></div>
    </div>
    <div class="steps-bar">${L.steps.map((_, i) => `<span data-i="${i}"></span>`).join('')}</div>
    <div class="step-body"></div>
    <div class="step-nav"></div>
  </section>`;
  const body = root.querySelector('.step-body');
  const nav = root.querySelector('.step-nav');
  const bar = root.querySelectorAll('.steps-bar span');

  function markStep(i, extra = {}) {
    store.update(s => {
      const rec = store.lesson(id);
      const prev = rec.steps[i] || {};
      const best = extra.best == null ? prev.best : Math.max(prev.best ?? 0, extra.best);
      rec.steps[i] = { ...prev, ...extra, done: true, at: Date.now(), best };
      rec.lastAt = Date.now();
    });
  }
  function completeLesson() {
    const first = !store.get().lessons[id]?.done;
    store.update(s => { const rec = store.lesson(id); rec.done = true; rec.completedAt = rec.completedAt || Date.now(); });
    if (first) store.log('lesson', id, L.title, 'Lesson complete');
    const nextId = nextLessonId();
    const following = session.active;
    body.innerHTML = `<div class="complete">
      ${L.milestone && first ? `<div class="milestone-banner"><span class="flag">⚑</span><div><b>Milestone reached</b><p>${esc(L.milestone)}</p></div></div>` : ''}
      <h2>Lesson complete</h2>
      ${L.unlocks?.length ? `<p>New notes in your reading cards: <b>${L.unlocks.join(', ')}</b></p>` : ''}
      <div class="row">
        ${following ? `<button data-next-item>${session.peek() ? 'Next in today\'s session →' : 'Finish session'}</button>`
          : nextId ? `<button data-next>Next lesson: ${esc(LESSONS[nextId].title)}</button>` : ''}
        <a class="btn secondary" href="#/today">Back to Today</a>
      </div></div>`;
    nav.innerHTML = '';
    body.querySelector('[data-next]')?.addEventListener('click', () => go(`#/lesson/${nextId}`));
    body.querySelector('[data-next-item]')?.addEventListener('click', () => session.advance());
    bar.forEach(b => b.className = 'done');
  }

  function show(i) {
    cleanup?.(); cleanup = null;
    stepIdx = i;
    const rec = store.get().lessons[id];
    bar.forEach((b, j) => { b.className = j === i ? 'cur' : rec?.steps?.[j]?.done ? 'done' : ''; });
    const st = L.steps[i];
    const finish = (extra) => {
      markStep(i, extra);
      if (solo) { session.active ? session.advance() : go('#/today'); return; }
      if (i + 1 < L.steps.length) show(i + 1); else completeLesson();
    };
    nav.innerHTML = '';
    body.innerHTML = '';
    if (st.type === 'text') {
      body.innerHTML = `<div class="explain"><h2>${st.title}</h2><div class="prose">${st.body}</div><div class="visual"></div></div>`;
      const v = body.querySelector('.visual');
      if (st.visual?.kind === 'keyboard') v.appendChild(createKeyboard(st.visual).el);
      if (st.visual?.kind === 'staff') { v.classList.add('staff-card'); renderNotes(v, st.visual.notes); }
      if (st.visual?.kind === 'score') { v.classList.add('score-card'); renderScore(v, st.visual.ex, { scale: 1.3 }); }
      nav.innerHTML = `${i > 0 ? '<button class="secondary" data-prev>← Back</button>' : '<span></span>'}<button data-nextstep>${i + 1 < L.steps.length ? 'Got it →' : 'Finish'}</button>`;
      nav.querySelector('[data-nextstep]').onclick = () => finish();
    } else if (st.type === 'find') {
      cleanup = runFind(body, st, () => finish());
      nav.innerHTML = `${i > 0 ? '<button class="secondary" data-prev>← Back</button>' : '<span></span>'}<button class="link" data-skip>Skip</button>`;
    } else if (st.type === 'gym') {
      const wrap = document.createElement('div');
      body.innerHTML = `<h2 class="step-title">${st.prompt}</h2>`;
      body.appendChild(wrap);
      cleanup = runGym(wrap, { pool: st.notes, count: st.count, id, title: L.title }, r => {
        wrap.innerHTML = gymSummaryHTML(r) + `<div class="row"><button data-cont>Continue</button></div>`;
        wrap.querySelector('[data-cont]').onclick = () => finish({ best: r.right / r.total });
      });
      nav.innerHTML = `${i > 0 ? '<button class="secondary" data-prev>← Back</button>' : '<span></span>'}<button class="link" data-skip>Skip</button>`;
    } else if (st.type === 'play') {
      body.innerHTML = `<h2 class="step-title">${st.title}</h2>`;
      const wrap = document.createElement('div');
      body.appendChild(wrap);
      cleanup = runPlay(wrap, st, r => finish({ best: r.accuracy, passed: r.passed }), { lessonId: id });
      nav.innerHTML = `${i > 0 ? '<button class="secondary" data-prev>← Back</button>' : '<span></span>'}<button class="link" data-skip>Skip</button>`;
    }
    nav.querySelector('[data-prev]')?.addEventListener('click', () => show(i - 1));
    nav.querySelector('[data-skip]')?.addEventListener('click', () => (i + 1 < L.steps.length ? show(i + 1) : completeLesson()));
    window.scrollTo({ top: 0 });
  }
  show(Math.min(stepIdx, L.steps.length - 1));
  return () => cleanup?.();
}

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
  const known = unlockedNotes();
  // practice chart: last 28 days
  const days = Array.from({ length: 28 }, (_, i) => { const t = Date.now() - (27 - i) * DAY; return { key: dayKey(t), d: new Date(t) }; });
  const maxS = Math.max(600, ...days.map(d => s.practice[d.key] || 0));
  const weekS = days.slice(-7).reduce((a, d) => a + (s.practice[d.key] || 0), 0);
  const allS = Object.values(s.practice).reduce((a, b) => a + b, 0);
  const milestones = FOUNDATION_ORDER.filter(id => LESSONS[id].milestone);
  const pieces = [];
  FOUNDATION_ORDER.forEach(id => LESSONS[id].steps.forEach((st, i) => {
    const rec = s.lessons[id]?.steps?.[i];
    if (st.type === 'play' && rec?.best != null) pieces.push({ id, i, title: st.title, best: rec.best });
  }));

  root.innerHTML = `<section class="page progress">
    <h1>Progress</h1>
    <div class="grid2">
      <div class="card">
        <h2>Level</h2>
        <p class="levelname">Foundation <span class="muted">· the road to Grade 1</span></p>
        <div class="bar"><span style="width:${(done / total) * 100}%"></span></div>
        <p class="muted">${done} of ${total} lessons</p>
        <h3>Milestones</h3>
        <ul class="milestones">${milestones.map(id => {
          const rec = s.lessons[id];
          return `<li class="${rec?.done ? 'done' : ''}"><span class="flag">⚑</span> ${esc(LESSONS[id].milestone)}
            ${rec?.done ? `<span class="muted small">· ${new Date(rec.completedAt).toLocaleDateString()}</span>` : ''}</li>`;
        }).join('')}
          <li class="future"><span class="flag">⚑</span> Songs &amp; Chords: first song with chords</li>
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
      <h2>Start over</h2>
      <div class="row"><a class="btn secondary" href="#/welcome?step=placement">Retake the reading check</a>
        <button class="danger" data-reset>Erase all progress</button></div>
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
  return () => { offStatus(); offNote(); clearInterval(timer); };
}
const midiName = m => { const n = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']; return n[m % 12] + (Math.floor(m / 12) - 1); };
