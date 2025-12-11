
const CACHE_NAME = 'trading-control-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './images/icon.png'
];

// Instalar Service Worker
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar peticiones
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Si está en caché, devolverlo
        if (response) {
          return response;
        }
        // Si no, hacer petición normal
        return fetch(event.request);
      })
  );
});
