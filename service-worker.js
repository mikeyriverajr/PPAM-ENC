const CACHE_NAME = 'ppam-schedule-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.png',
  './manifest.json'
];

// Install: Cache core assets
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force this SW to become active immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all clients immediately
});

// Fetch: Network First for HTML, Cache First for others
self.addEventListener('fetch', (e) => {
  // HTML pages: Try Network first, fall back to Cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => {
          return caches.match(e.request);
        })
    );
    return;
  }

  // Assets (CSS, JS, Images): Cache first, then Network (to update cache)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Return cached response if found
      if (cachedResponse) {
        return cachedResponse;
      }
      // Otherwise fetch from network
      return fetch(e.request);
    })
  );
});
