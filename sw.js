// Service worker: precache the whole game so it installs and plays offline.
// Bump VERSION whenever any asset changes.
const VERSION = 'sliced-fruit-v11';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/game.js',
  './js/ui.js',
  './js/config.js',
  './js/rng.js',
  './js/fruits.js',
  './js/textures.js',
  './js/effects.js',
  './js/blender.js',
  './js/labels.js',
  './js/sfx.js',
  './lib/three.module.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(e.request, copy));
        return res;
      }),
    ),
  );
});
