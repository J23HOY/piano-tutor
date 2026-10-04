// Offline support: serve from cache straight away, refresh the cache in the background.
// So an update shows up the time after it's published.
const CACHE = 'piano-tutor-v4';
const CORE = ['./', './index.html', './css/app.css', './vendor/vexflow.js', './js/main.js', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()).catch(() => {}); return res; }).catch(() => cached);
    return cached || fresh;
  }).catch(() => fetch(e.request))); // if the cache is unavailable, just use the network
});
