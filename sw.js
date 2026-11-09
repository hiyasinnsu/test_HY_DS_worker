// Offline support for the installed (home-screen) experience.
//
// Every same-origin GET is network-first with a cache fallback. Network-first
// is deliberate: a split cache (fresh HTML + stale JS) would break ES module
// loading after a deploy, and the latency cost on a first paint is negligible
// compared with the "game half-boots" failure mode.

const VERSION = 'v2';
const CACHE = `neon-barrage-${VERSION}`;

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
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('offline', { status: 503, statusText: 'offline' });
      }),
  );
});
