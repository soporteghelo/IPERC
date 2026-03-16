const CACHE_NAME = 'iperc-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  // config.local.json intentionally excluded — always fetched from network
];

// Files that must NEVER be served from cache
const BYPASS_CACHE = ['config.local.json'];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: remove old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let Google Apps Script / external API calls go straight to network
  if (url.hostname !== self.location.hostname) {
    return;
  }

  // Always fetch config file from network (never serve from cache)
  if (BYPASS_CACHE.some((p) => url.pathname.endsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for local assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => cached); // fallback to cache if offline
    })
  );
});
