// Note input. Mic, USB MIDI, on-screen keys and the computer keyboard all feed one stream:
//   { midi, source: 'mic' | 'midi' | 'touch' | 'keys', velocity, at }

import { store } from './store.js';

const listeners = new Set();
const statusSubs = new Set();
let muteUntil = 0;

export const input = {
  status: { mic: 'off', midi: 'off', micError: null, midiDevices: [] },
  level: 0, // live mic level (0..1), for the meter in Settings
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  onStatus(fn) { statusSubs.add(fn); fn(input.status); return () => statusSubs.delete(fn); },
  emit(midi, source, velocity = null) {
    if (source === 'mic' && performance.now() < muteUntil) return;
    const evt = { midi, source, velocity, at: performance.now() };
    store.activity();
    listeners.forEach(fn => fn(evt));
  },
  // Ignore the mic while the app itself is making sound (playback would be "heard").
  muteMic(ms) { muteUntil = Math.max(muteUntil, performance.now() + ms); },
  startMic, startMidi,
  get listening() { return input.status.mic === 'on' || input.status.midi === 'on'; },
};
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
    const src = micCtx.createMediaStreamSource(stream);
    const an = micCtx.createAnalyser();
    an.fftSize = 2048;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let lastMidi = null, stable = 0, emitted = null, prevRms = 0, armed = true;
    setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      input.level = Math.min(1, rms * 8);
      const thr = store.get().settings.micThreshold;
      if (rms > thr && rms > prevRms * 1.6) armed = true;
      prevRms = rms;
      const f = rms > thr ? autoCorrelate(buf, micCtx.sampleRate) : -1;
      if (f > 25 && f < 4200) {
        const m = Math.round(69 + 12 * Math.log2(f / 440));
        stable = m === lastMidi ? stable + 1 : 0;
        lastMidi = m;
        if (stable >= 1 && (emitted !== m || armed)) { emitted = m; armed = false; input.emit(m, 'mic'); }
      } else { stable = 0; lastMidi = null; if (rms < thr * 0.6) emitted = null; }
    }, 40);
    setStatus({ mic: 'on' });
  } catch (err) {
    setStatus({ mic: 'error', micError: err.message });
  }
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
  if (e.repeat || e.target.closest?.('input, textarea')) return;
  if (e.key === 'z') { octaveShift = Math.max(-2, octaveShift - 1); return; }
  if (e.key === 'x') { octaveShift = Math.min(2, octaveShift + 1); return; }
  const m = KEYMAP[e.key.toLowerCase()];
  if (m != null) input.emit(m + 12 * octaveShift, 'keys', 80);
});
