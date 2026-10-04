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
// Autocorrelation pitch detection on a 2048-sample window, ~25 times a second.
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
export function attachAnalysis(ctx, srcNode, { emitSource = 'mic' } = {}) {
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  const anF = ctx.createAnalyser();
  anF.fftSize = 8192;
  anF.smoothingTimeConstant = 0;
  srcNode.connect(an);
  srcNode.connect(anF);
  const buf = new Float32Array(an.fftSize);
  const spec = new Float32Array(anF.frequencyBinCount);
  let lastMidi = null, stable = 0, emitted = null, prevRms = 0, armed = true, attackWhileMuted = false;
  return setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    input.level = Math.min(1, rms * 8);
    const thr = store.get().settings.micThreshold;
    const onset = rms > thr && rms > prevRms * 1.6;
    prevRms = rms;
    if (emitSource === 'mic' && micMuted()) {
      // Don't track pitch while our own sound plays, but remember if you struck a key meanwhile.
      if (onset) attackWhileMuted = true;
      return;
    }
    if (onset || attackWhileMuted) armed = true;
    attackWhileMuted = false;

    if (chromaListeners.size && rms > thr) {
      anF.getFloatFrequencyData(spec);
      const chroma = computeChroma(spec, ctx.sampleRate, anF.fftSize);
      if (chroma) chromaListeners.forEach(fn => fn({ chroma, rms, onset }));
    } else if (chromaListeners.size) {
      chromaListeners.forEach(fn => fn({ chroma: null, rms, onset: false }));
    }

    const f = rms > thr ? autoCorrelate(buf, ctx.sampleRate) : -1;
    if (f > 25 && f < 4200) {
      const m = Math.round(69 + 12 * Math.log2(f / 440));
      stable = m === lastMidi ? stable + 1 : 0;
      lastMidi = m;
      if (stable >= 1 && (emitted !== m || armed)) { emitted = m; armed = false; input.emit(m, emitSource); }
    } else { stable = 0; lastMidi = null; if (rms < thr * 0.6) emitted = null; }
  }, 40);
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

function autoCorrelate(input, rate) {
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
