// Note input. Mic, USB MIDI, on-screen keys and the computer keyboard all feed one stream:
//   { midi, source: 'mic' | 'midi' | 'touch' | 'keys', velocity, at, raw }
// `raw` is when the app noticed the note; `at` is corrected for that source's delay
// (mic detection takes a little while), so timing scores are fair. See Settings > Timing.
// The mic also produces "chroma" frames (how much of each of the 12 note letters is
// sounding) so chords can be recognised.

import { store } from './store.js';

const listeners = new Set();
const chromaListeners = new Set();
const statusSubs = new Set();
let muteUntil = 0;

export const DEFAULT_LATENCY = { mic: 150, midi: 30, touch: 30, keys: 30 };
export const latencyFor = source => store.get().settings.latency?.[source] ?? DEFAULT_LATENCY[source] ?? 0;

export const input = {
  status: { mic: 'off', midi: 'off', micError: null, midiDevices: [] },
  level: 0, // live mic level (0..1), for the meter in Settings
  lastSource: null,
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  onChroma(fn) { chromaListeners.add(fn); return () => chromaListeners.delete(fn); },
  onStatus(fn) { statusSubs.add(fn); fn(input.status); return () => statusSubs.delete(fn); },
  emit(midi, source, velocity = null) {
    if (source === 'mic' && micMuted()) return;
    const raw = performance.now();
    const evt = { midi, source, velocity, raw, at: raw - latencyFor(source) };
    input.lastSource = source;
    store.activity();
    listeners.forEach(fn => fn(evt));
  },
  // Ignore the mic while the app itself is making sound (playback or clicks would be "heard").
  muteMic(ms) { muteUntil = Math.max(muteUntil, performance.now() + ms); },
  startMic, startMidi,
  get listening() { return input.status.mic === 'on' || input.status.midi === 'on'; },
};
const micMuted = () => performance.now() < muteUntil;
const setStatus = patch => { Object.assign(input.status, patch); statusSubs.forEach(fn => fn(input.status)); };

// ---------------- Microphone ----------------
// YIN pitch detection on a 2048-sample window, ~25 times a second.
// A note is reported once its pitch holds for two readings. The same note is reported
// again only after a fresh attack (a jump in loudness), so ringing notes don't repeat.
let micCtx = null;
async function startMic() {
  if (input.status.mic === 'on' || input.status.mic === 'starting') return;
  setStatus({ mic: 'starting', micError: null });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    micCtx = new AudioContext();
    attachAnalysis(micCtx, micCtx.createMediaStreamSource(stream));
    setStatus({ mic: 'on' });
  } catch (err) {
    setStatus({ mic: 'error', micError: err.message });
  }
}

// Runs pitch + chroma analysis on any audio source node. Exported so tests can feed
// synthesised audio through exactly the same code as the microphone.
//
// How a note is recognised:
//   1. Spot the moment a key is struck: a jump in loudness, or a burst of NEW energy in the
//      spectrum ("spectral flux"), which still works while earlier notes are ringing.
//   2. Over the next two readings, work out which note that new energy belongs to
//      (fluxPitch). This ignores notes that were already sounding, so C ringing under a
//      new G doesn't make the G look like a C.
//   3. If that's unclear, fall back to YIN on the raw sound.
// One note is reported per strike.
export function attachAnalysis(ctx, srcNode, { emitSource = 'mic' } = {}) {
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  const anS = ctx.createAnalyser();      // for onsets + flux pitch: ~85 ms window
  anS.fftSize = 4096;
  anS.smoothingTimeConstant = 0;
  const anF = ctx.createAnalyser();      // for chords: finer frequency detail
  anF.fftSize = 8192;
  anF.smoothingTimeConstant = 0;
  srcNode.connect(an); srcNode.connect(anS); srcNode.connect(anF);
  const buf = new Float32Array(an.fftSize);
  const specDb = new Float32Array(anS.frequencyBinCount);
  const spec = new Float32Array(anF.frequencyBinCount);
  const fineHz = ctx.sampleRate / anF.fftSize;
  const fLo = Math.ceil(50 / fineHz), fHi = Math.min(spec.length - 1, Math.floor(5000 / fineHz));
  let prevFine = null;
  const binHz = ctx.sampleRate / anS.fftSize;
  const lo = Math.ceil(60 / binHz), hi = Math.min(specDb.length - 1, Math.floor(5000 / binHz));
  let prev = null, prevRms = 0, attackWhileMuted = false, lastOnsetAt = -1e9;
  let pending = 0, snapshot = null, cands = [], ringRms = 0;
  return setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    input.level = Math.min(1, rms * 8);
    const thr = store.get().settings.micThreshold;
    anS.getFloatFrequencyData(specDb);
    const mag = new Float32Array(specDb.length);
    for (let i = lo; i <= hi; i++) mag[i] = Math.pow(10, specDb[i] / 20);
    let rise = 0, total = 0;
    if (prev) for (let i = lo; i <= hi; i++) { const d = mag[i] - prev[i]; if (d > 0) rise += d; total += mag[i]; }
    const now = performance.now();
    // A strike: loudness jumps, or a good chunk of the spectrum is new energy. The second
    // catches notes played while others ring, including the same note struck again.
    const struck = rms > thr && (rms > prevRms * 1.3 || (total > 0 && rise / total > 0.22)) && now - lastOnsetAt > 110;
    prevRms = rms;
    if (emitSource === 'mic' && micMuted()) {
      // Ignore our own sounds, but remember if you struck a key meanwhile.
      if (struck) attackWhileMuted = true;
      prev = mag; pending = 0;
      anF.getFloatFrequencyData(spec); prevFine = fineMags(spec, fLo, fHi);
      return;
    }
    const onset = struck || (attackWhileMuted && rms > thr);
    attackWhileMuted = false;

    anF.getFloatFrequencyData(spec);
    const fine = fineMags(spec, fLo, fHi);
    if (chromaListeners.size && rms > thr) {
      const chroma = computeChroma(spec, ctx.sampleRate, anF.fftSize);
      if (chroma) chromaListeners.forEach(fn => fn({ chroma, rms, onset }));
    } else if (chromaListeners.size) {
      chromaListeners.forEach(fn => fn({ chroma: null, rms, onset: false }));
    }

    if (onset) { lastOnsetAt = now; snapshot = prevFine || new Float32Array(fine.length); pending = 2; cands = []; }
    if (pending) {
      const r = fluxPitch(fine, snapshot, ctx.sampleRate, anF.fftSize);
      if (r) cands.push(r);
      if (--pending === 0) {
        const m = choosePitch(cands, buf, ctx.sampleRate, snapshot, fine);
        input.debug?.({ cands: cands.map(c => ({ ...c })), chosen: m, yin: detectPitch(buf, ctx.sampleRate) });
        if (m != null) input.emit(m, emitSource);
      }
    }
    prev = mag;
    prevFine = fine;
  }, 40);
}

function fineMags(specDb, lo, hi) {
  const m = new Float32Array(specDb.length);
  for (let i = lo; i <= hi; i++) m[i] = Math.pow(10, specDb[i] / 20);
  return m;
}

// Pick the note for a strike: the flux pitch if it's clear, else YIN. When the key was
// struck from near-silence, YIN is more reliable about the octave, so prefer it then.
function choosePitch(cands, buf, rate, before, now) {
  const yf = detectPitch(buf, rate);
  const y = yf > 25 && yf < 4200 ? Math.round(69 + 12 * Math.log2(yf / 440)) : null;
  const best = cands.sort((a, b) => b.score - a.score)[0];
  if (best && best.conf >= 1.3) {
    let eBefore = 0, eNow = 0;
    for (let i = 0; i < now.length; i++) { eBefore += before[i]; eNow += now[i]; }
    const fromQuiet = eBefore < eNow * 0.25;
    if (y != null && fromQuiet && (y === best.midi || Math.abs(y - best.midi) === 12)) return y;
    return best.midi;
  }
  return y;
}

// Which note does the NEW energy (now minus before) belong to? Harmonic sum over the
// rising part of the spectrum: each candidate note collects energy at its partials,
// weighted towards the lower ones. Returns { midi, score, conf } where conf compares the
// winner with the best candidate that isn't the same letter.
export function fluxPitch(now, before, rate, fftSize) {
  const binHz = rate / fftSize;
  const n = now.length;
  const flux = new Float32Array(n);
  let fsum = 0;
  for (let i = 1; i < n; i++) { const d = now[i] - (before ? before[i] : 0); if (d > 0) { flux[i] = d; fsum += d; } }
  if (!fsum) return null;
  const peak = f => {
    const c = f / binHz;
    const a = Math.max(1, Math.floor(c * 0.985)), b = Math.min(n - 1, Math.ceil(c * 1.015));
    let m = 0;
    for (let i = a; i <= b; i++) if (flux[i] > m) m = flux[i];
    return m;
  };
  const sal = new Map();
  for (let m = 33; m <= 100; m++) {
    const f0 = 440 * Math.pow(2, (m - 69) / 12);
    let s = 0;
    for (let k = 1; k <= 6; k++) {
      const fk = f0 * k * Math.sqrt(1 + 0.0004 * k * k);
      if (fk > rate / 2 - binHz) break;
      s += peak(fk) / k;
    }
    // a real note has energy at its fundamental or 2nd partial; this stops a "phantom"
    // note far below from collecting only the upper partials of the note actually played
    if (peak(f0) + peak(2 * f0) < 0.15 * s) s *= 0.3;
    sal.set(m, s);
  }
  let best = null, bs = 0;
  sal.forEach((v, m) => { if (v > bs) { bs = v; best = m; } });
  // Octave check. A note with a weak fundamental (common on small speakers) can look like
  // the note an octave up. If the octave below has its own odd partials (1st, 3rd) present,
  // those can't belong to the higher note, so the lower note is the real one.
  const lowF = 440 * Math.pow(2, (best - 12 - 69) / 12);
  const p1 = peak(lowF), p3 = peak(3 * lowF * Math.sqrt(1 + 0.0036));
  const even = peak(2 * lowF * Math.sqrt(1 + 0.0016)) + peak(4 * lowF * Math.sqrt(1 + 0.0064));
  if (best - 12 >= 33 && even > 0 && p1 > 0.12 * even && p3 > 0.2 * even) { best -= 12; bs = sal.get(best); }
  let second = 0;
  sal.forEach((v, m) => { if (Math.abs(m - best) > 1 && (m - best) % 12 !== 0 && v > second) second = v; });
  return { midi: best, score: bs / fsum, conf: second ? bs / second : 99 };
}

// Spectrum (dB per bin) -> 12 numbers summing to 1, one per note letter (C, C#, D ...).
// Uses spectral peaks between ~80 Hz and ~2.5 kHz, where piano chords live.
export function computeChroma(specDb, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  const lo = Math.ceil(80 / binHz), hi = Math.min(specDb.length - 2, Math.floor(2500 / binHz));
  let maxMag = 0;
  const mags = new Float32Array(hi + 2);
  for (let i = lo - 1; i <= hi + 1; i++) { mags[i] = Math.pow(10, specDb[i] / 20); if (mags[i] > maxMag) maxMag = mags[i]; }
  if (!maxMag) return null;
  const chroma = new Array(12).fill(0);
  for (let i = lo; i <= hi; i++) {
    const m = mags[i];
    if (m < maxMag * 0.08 || m < mags[i - 1] || m < mags[i + 1]) continue; // keep clear peaks only
    // refine the peak frequency (parabolic interpolation on log magnitude)
    const a = specDb[i - 1], b = specDb[i], c = specDb[i + 1];
    const p = 0.5 * (a - c) / (a - 2 * b + c || 1);
    const f = (i + p) * binHz;
    const midi = 69 + 12 * Math.log2(f / 440);
    if (Math.abs(midi - Math.round(midi)) > 0.35) continue; // between notes: noise
    const w = 1 / (1 + Math.max(0, midi - 72) / 24);       // high partials count a bit less
    chroma[((Math.round(midi) % 12) + 12) % 12] += m * w;
  }
  const total = chroma.reduce((x, y) => x + y, 0);
  return total ? chroma.map(v => v / total) : null;
}

// Pitch detection with YIN (de Cheveigné & Kawahara, 2002). Plain autocorrelation can lock
// onto a multiple of the true period, e.g. hearing G as the C below it (G's waves line up
// with C's every 3 cycles). YIN normalises the difference function and takes the FIRST dip
// below a threshold, which picks the true period. Returns Hz, or -1 if there's no clear pitch.
export function detectPitch(buf, rate, threshold = 0.12) {
  const W = Math.floor(buf.length / 2);
  const minTau = Math.max(2, Math.floor(rate / 4200));
  const d = new Float32Array(W);
  for (let tau = 1; tau < W; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) { const diff = buf[j] - buf[j + tau]; sum += diff * diff; }
    d[tau] = sum;
  }
  // cumulative mean normalised difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau < W; tau++) { running += d[tau]; d[tau] = running ? d[tau] * tau / running : 1; }
  let tau = -1;
  for (let t = minTau; t < W - 1; t++) {
    if (d[t] < threshold) { while (t + 1 < W - 1 && d[t + 1] < d[t]) t++; tau = t; break; }
  }
  if (tau < 0) {
    // nothing under the threshold: accept the best dip only if it's still fairly clear
    let best = minTau;
    for (let t = minTau; t < W - 1; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.3) return -1;
    tau = best;
  }
  const x0 = d[tau - 1], x1 = d[tau], x2 = d[tau + 1];
  const denom = x0 + x2 - 2 * x1;
  const shift = denom ? (x0 - x2) / (2 * denom) : 0;
  return rate / (tau + shift);
}

// The old detector, kept so tests can compare.
export function autoCorrelate(input, rate) {
  let size = input.length;
  let r1 = 0, r2 = size - 1;
  const thr = 0.2;
  for (let i = 0; i < size / 2; i++) if (Math.abs(input[i]) < thr) { r1 = i; break; }
  for (let i = 1; i < size / 2; i++) if (Math.abs(input[size - i]) < thr) { r2 = size - i; break; }
  const buf = input.slice(r1, r2);
  size = buf.length;
  const c = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let s = 0;
    for (let j = 0; j < size - i; j++) s += buf[j] * buf[j + i];
    c[i] = s;
  }
  let d = 0;
  while (d < size - 1 && c[d] > c[d + 1]) d++;
  let maxv = -1, maxp = -1;
  for (let i = d; i < size; i++) if (c[i] > maxv) { maxv = c[i]; maxp = i; }
  if (maxp <= 0 || maxp >= size - 1) return -1;
  const x1 = c[maxp - 1], x2 = c[maxp], x3 = c[maxp + 1];
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2;
  return rate / (a ? maxp - b / (2 * a) : maxp);
}

// ---------------- USB MIDI ----------------
async function startMidi() {
  if (!navigator.requestMIDIAccess) { setStatus({ midi: 'unsupported' }); return; }
  try {
    const access = await navigator.requestMIDIAccess();
    const refresh = () => {
      const inputs = [...access.inputs.values()];
      inputs.forEach(inp => {
        inp.onmidimessage = e => {
          const [st, d1, d2] = e.data;
          if ((st & 0xf0) === 0x90 && d2 > 0) input.emit(d1, 'midi', d2);
        };
      });
      setStatus({ midi: inputs.length ? 'on' : 'none', midiDevices: inputs.map(i => i.name) });
    };
    access.onstatechange = refresh;
    refresh();
  } catch { setStatus({ midi: 'error' }); }
}

// ---------------- Computer keyboard (for testing at a desk) ----------------
// A W S E D F T G Y H U J K  ->  C4 .. C5
const KEYMAP = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
let octaveShift = 0;
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'z') { octaveShift = Math.max(-2, octaveShift - 1); return; }
  if (e.key === 'x') { octaveShift = Math.min(2, octaveShift + 1); return; }
  const m = KEYMAP[e.key.toLowerCase()];
  if (m != null) input.emit(m + 12 * octaveShift, 'keys', 80);
});
