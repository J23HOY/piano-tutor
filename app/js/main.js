import { store } from './store.js';
import { input } from './input.js';
import { dock } from './dock.js';
import { renderWelcome, renderToday, renderPath, renderLesson, renderGym, renderProgress, renderSettings } from './screens.js';

const root = document.getElementById('view');
const chip = document.getElementById('listen');
let cleanup = null;

// ---------------- theme
const applyTheme = () => {
  const t = store.get().settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
};
applyTheme();

// ---------------- routing
const ROUTES = [
  [/^\/welcome$/, renderWelcome],
  [/^\/today$/, renderToday],
  [/^\/path$/, renderPath],
  [/^\/lesson\/([\w-]+)$/, renderLesson],
  [/^\/gym$/, renderGym],
  [/^\/progress$/, renderProgress],
  [/^\/settings$/, renderSettings],
];
function route() {
  const raw = location.hash.slice(1) || '/today';
  const [path, qs] = raw.split('?');
  if (!store.get().onboarded && path !== '/welcome') { location.replace('#/welcome'); return; }
  const params = new URLSearchParams(qs || '');
  cleanup?.(); cleanup = null;
  const hit = ROUTES.find(([re]) => re.test(path));
  if (!hit) { location.replace('#/today'); return; }
  const [re, fn] = hit;
  const args = path.match(re).slice(1);
  root.innerHTML = '';
  // Set up the practice layout (compact header, keys dock) first, so screens can size
  // their music to the space that's actually left.
  const practising = /^\/(lesson|gym)/.test(path) || params.get('step') === 'placement';
  document.body.classList.toggle('practising', practising);
  dock.clear();
  dock.show(practising);
  window.scrollTo({ top: 0 });
  cleanup = fn(root, params, ...args) || null;
  document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('on', path.startsWith(a.dataset.r)));
  fitToScreen();
}

// On practice screens, zoom the page out a little if it still doesn't fit above the keys.
let fitRaf = 0;
function fitToScreen() {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    const page = root.querySelector('.page');
    if (!page) return;
    page.style.zoom = '';
    if (!document.body.classList.contains('practising')) return;
    const avail = window.innerHeight - page.getBoundingClientRect().top - dock.height - 12;
    const need = page.scrollHeight;
    const z = need > avail ? Math.max(0.7, avail / need).toFixed(3) : '';
    page.style.zoom = z;
  });
}
new ResizeObserver(fitToScreen).observe(root);
window.addEventListener('resize', fitToScreen);
window.addEventListener('hashchange', route);

// ---------------- listening chip
// Browsers only allow audio to start after a tap, so the first tap anywhere starts the mic.
input.onStatus(st => {
  const on = st.mic === 'on' || st.midi === 'on';
  chip.className = 'listen ' + (on ? 'on' : st.mic === 'error' ? 'err' : '');
  chip.innerHTML = on
    ? `<span class="pulse"></span>Listening${st.midi === 'on' ? ' (MIDI)' : ''}`
    : st.mic === 'starting' ? 'Starting mic…'
    : st.mic === 'error' ? 'Mic blocked. Tap to fix' : 'Tap to listen';
});
chip.addEventListener('click', () => {
  if (input.status.mic === 'error') location.hash = '#/settings';
  else input.startMic();
});
window.addEventListener('pointerdown', () => {
  if (store.get().settings.autoListen && input.status.mic === 'off' && store.get().onboarded) input.startMic();
}, { capture: true });

// ---------------- keep the screen on while practising
let wakeLock = null;
async function keepAwake() {
  try { if (!wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.onrelease = () => { wakeLock = null; }; } } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
window.addEventListener('pointerdown', keepAwake, { once: true });

// ---------------- offline support
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

route();

// Dev/test hook: ?sim=64,64,65 plays those notes into the app after load.
const sim = new URLSearchParams(location.search).get('sim');
if (sim) {
  // each comma-separated step is one note, a chord (60+64+67) or 'r' (nothing), `simgap` ms apart
  const steps = sim.split(',');
  const gap = Number(new URLSearchParams(location.search).get('simgap')) || 150;
  const simSrc = new URLSearchParams(location.search).get('simsrc') || 'keys';
  let i = 0;
  const tick = () => {
    if (i >= steps.length) return;
    const st = steps[i++];
    if (st !== 'r') st.split(/[+ ]/).map(Number).forEach((m, k) => setTimeout(() => input.emit(m, simSrc), k * 30));
    setTimeout(tick, gap);
  };
  setTimeout(tick, Number(new URLSearchParams(location.search).get('simdelay')) || 1000);
}
