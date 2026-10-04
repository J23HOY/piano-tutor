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
