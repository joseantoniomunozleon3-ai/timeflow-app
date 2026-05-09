// ── TimeFlow PRO — Service Worker ──
// Estrategia: Cache-First para el shell, Network-First para recursos externos

const CACHE_NAME = 'timeflow-v2';

// Recursos del shell de la app (lo que tenemos en local)
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Recursos externos que queremos cachear tras la primera carga
const EXTERNAL_CACHEABLE = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
];

// ── INSTALL: precachear el shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar cachés antiguas ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: estrategias según el tipo de recurso ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no sean GET
  if (request.method !== 'GET') return;

  // Navegación → Cache-First con fallback a red
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html')
        .then(cached => cached || fetch(request))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos del origen local → Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            }
            return response;
          });
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos externos (fuentes, CDN) → Network-First con cache de respaldo
  const isExternal = EXTERNAL_CACHEABLE.some(origin => url.href.startsWith(origin));
  if (isExternal) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Resto: intentar red, sin cache
  event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
});
