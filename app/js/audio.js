// A small built-in piano-ish synth for "Hear it" and the on-screen keys.

import { input } from './input.js';

let ctx = null, master = null;
function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playNote(midi, seconds = 0.8, when = 0) {
  if (!Number.isFinite(midi)) return;
  const c = ac();
  const t = c.currentTime + when;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(8000, f * 6), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + seconds + 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.25);
  g.gain.setTargetAtTime(0.0001, t + seconds, 0.12);
  [[1, 'triangle', 0.6], [2, 'sine', 0.25], [3, 'sine', 0.08]].forEach(([mult, type, amp]) => {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    og.gain.value = amp;
    o.connect(og).connect(lp);
    o.start(t);
    o.stop(t + seconds + 1);
  });
  lp.connect(g).connect(master);
  input.muteMic((when + seconds + 0.6) * 1000);
}

// Play exercise events at a tempo. onStep(i) fires as each event sounds. Returns stop().
export function playEvents(events, bpm, onStep) {
  const spb = 60 / bpm;
  const timers = [];
  events.forEach((e, i) => {
    const when = e.beat * spb;
    timers.push(setTimeout(() => {
      e.midis.forEach(m => playNote(m, Math.max(0.25, (e.beats || 1) * spb * 0.95)));
      onStep?.(i);
    }, when * 1000));
  });
  const last = events.at(-1);
  const end = last ? (last.beat + (last.beats || 1)) * spb : 0;
  timers.push(setTimeout(() => onStep?.(-1), end * 1000));
  return () => timers.forEach(clearTimeout);
}

// ---------------- Metronome clock ----------------
// Schedules clicks on the audio clock and reports beats. Beat 0 is the first beat AFTER the
// count-in; count-in beats are negative. timeOf(beat) gives that beat's performance.now() time.
// opts: { bpm, beatsPerBar, countInBars, click: bool, onBeat(beat) }
export function startClock({ bpm, beatsPerBar = 4, countInBars = 1, click = true, onBeat }) {
  const c = ac();
  const spb = 60 / bpm;
  const firstBeat = -countInBars * beatsPerBar;
  const perf0 = performance.now() + 150;     // time of the first count-in beat
  const timeOf = beat => perf0 + (beat - firstBeat) * spb * 1000;
  let next = firstBeat, stopped = false;
  const timers = [];
  // Look ~120 ms ahead: schedule each click on the audio clock and a callback for the beat.
  const schedule = () => {
    if (stopped) return;
    const now = performance.now();
    while (timeOf(next) < now + 120) {
      const b = next, wait = Math.max(0, timeOf(b) - now);
      const accent = ((b % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
      if (click || b < 0) tick(c.currentTime + wait / 1000, accent, b < 0, wait);
      timers.push(setTimeout(() => { if (!stopped) onBeat?.(b); }, wait));
      next++;
    }
  };
  const loop = setInterval(schedule, 25);
  schedule();
  return { spb, timeOf, stop() { stopped = true; clearInterval(loop); timers.forEach(clearTimeout); } };
}

function tick(at, accent, countIn, waitMs) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(countIn ? 0.5 : 0.35, at + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  o.connect(g).connect(master);
  o.start(at); o.stop(at + 0.06);
  // keep the mic from hearing the click as a note
  setTimeout(() => input.muteMic(70), Math.max(0, waitMs - 5));
}
