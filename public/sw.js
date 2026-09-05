// Punch service worker — precaches every asset so the app loads with no network.
// CI replaces __BUILD__ with the commit SHA so each deploy gets a fresh cache.
const VERSION = 'punch-__BUILD__';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/time.js',
  './js/calc.js',
  './js/holidays.js',
  './js/model.js',
  './js/markdown.js',
  './js/storage.js',
  './js/store.js',
  './js/sync.js',
  './js/dom.js',
  './js/theme.js',
  './js/hotkeys.js',
  './js/ui/dialogs.js',
  './js/ui/actions.js',
  './js/ui/today.js',
  './js/ui/recent.js',
  './js/ui/history.js',
  './js/ui/settings.js',
  './js/ui/help.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the app never requests other origins
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
