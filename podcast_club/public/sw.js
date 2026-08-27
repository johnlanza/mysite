const CACHE_PREFIX = 'rps-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.replace(/\/$/, '');
const scopeRootUrl = new URL(`${scopePath}/`, scopeUrl.origin);
const scopedUrl = (path) => new URL(path.replace(/^\//, ''), scopeRootUrl).toString();
const OFFLINE_URL = scopedUrl('offline.html');
const PRECACHE_URLS = [
  OFFLINE_URL,
  scopedUrl('icons/rps-192.png'),
  scopedUrl('icons/rps-512.png'),
  scopedUrl('audio/rps-mouret-rondeau-opening.mp3')
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin) return;
  const relativePath = scopePath && url.pathname.startsWith(scopePath)
    ? url.pathname.slice(scopePath.length)
    : url.pathname;

  // Every API response and every member page remains network-only. The worker
  // never stores personalized HTML, ballots, meeting details, or account data.
  if (relativePath === '/api' || relativePath.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  const safeStaticAsset =
    relativePath.startsWith('/_next/static/') ||
    relativePath.startsWith('/icons/') ||
    relativePath.startsWith('/audio/') ||
    relativePath === '/royal-podcast-society-logo.png' ||
    relativePath === '/royal-podcast-society-logo-transparent.png';
  if (!safeStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
