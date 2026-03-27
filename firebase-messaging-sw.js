importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyC5HPI4WY19Om_HmQgJJl6IvXr0XrMmflQ",
  authDomain: "ppam-beta.firebaseapp.com",
  projectId: "ppam-beta",
  storageBucket: "ppam-beta.firebasestorage.app",
  messagingSenderId: "879252975424",
  appId: "1:879252975424:web:6e62c58c4b4ba8689d94a5",
  measurementId: "G-BXVKGLHV9L"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ==========================================
// BACKGROUND PUSH NOTIFICATIONS
// ==========================================
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano', payload);

    // Extraer datos del payload enviado desde Cloud Functions
    const notificationTitle = payload.notification.title || "PPAM Encarnación";
    const notificationOptions = {
        body: payload.notification.body || "Tienes una nueva notificación de turno.",
        icon: './icon-512.png',
        badge: './icon.png',
        tag: 'ppam-turnos', // Evita que se acumulen mil notificaciones iguales
        data: {
            url: '/PPAM-ENC/beta.html' // Abre esta URL al tocar la notificación
        }
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
    console.log('[ServiceWorker] Notificación clickeada', event.notification);
    event.notification.close();

    // Redirige al publicador a la app beta cuando toca la notificación
    const urlToOpen = event.notification.data.url || '/PPAM-ENC/beta.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Si la app ya está abierta en alguna pestaña, simplemente ponla al frente
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('beta.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si la app está cerrada completamente, ábrela
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ==========================================
// PWA CACHING LOGIC
// ==========================================
const CACHE_NAME = 'ppam-schedule-v13'; // Bumped version
const ASSETS = [
  './',
  './beta.html', // Make sure this matches your actual HTML files
  './admin.html',
  './app-beta.js',
  './app-admin.js',
  './icon.png',
  './manifest-beta.json'
];

// Install: Cache core assets
self.addEventListener('install', (e) => {
  self.skipWaiting(); 
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
  self.clients.claim(); 
});

// Fetch: Network First for HTML, Cache First for others
self.addEventListener('fetch', (e) => {
  // Ignore external API calls and Firebase Auth requests
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // HTML pages: Try Network first, fall back to Cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets (CSS, JS, Images): Cache first, then Network
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request);
    })
  );
});
