// Offline support for the installed (home-screen) experience.
//
// Strategy: the HTML shell is network-first so a deploy is picked up on the
// next launch; static assets are stale-while-revalidate so play works offline
// without ever pinning an old engine for long.

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './assets/styles.css',
  './assets/icon.svg',
  './manifest.webmanifest',
  './src/main.js',
  './src/game.js',
  './src/audio.js',
  './src/background.js',
  './src/boss.js',
  './src/bullets.js',
  './src/config.js',
  './src/effects.js',
  './src/enemies.js',
  './src/input.js',
  './src/items.js',
  './src/lasers.js',
  './src/patterns.js',
  './src/player.js',
  './src/sprites.js',
  './src/stage.js',
  './src/stages.js',
  './src/storage.js',
  './src/ui.js',
  './src/util.js',
  './src/viewport.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== ASSETS && k !== SHELL).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isDocument = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isDocument) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
