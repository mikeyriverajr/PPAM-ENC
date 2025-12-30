const CACHE_NAME = 'ppam-schedule-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
