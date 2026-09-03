const CACHE_NAME = 'homekeeper-shell-relief-v1';
const APP_SHELL = [
  '/homekeeper/',
  '/homekeeper/index.html',
  '/homekeeper/manifest.webmanifest',
  '/homekeeper/homekeeper-relief-v1-192.png',
  '/homekeeper/homekeeper-relief-v1-512.png',
  '/homekeeper/homekeeper-relief-v1-maskable-192.png',
  '/homekeeper/homekeeper-relief-v1-maskable-512.png',
  '/homekeeper/homekeeper-relief-v1-apple-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  if (!url.pathname.startsWith('/homekeeper/') || url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/homekeeper/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }

        return response;
      });
    }),
  );
});
