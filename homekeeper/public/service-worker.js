const CACHE_NAME = 'homekeeper-shell-v2';
const APP_SHELL = [
  '/homekeeper/',
  '/homekeeper/index.html',
  '/homekeeper/manifest.webmanifest',
  '/homekeeper/icon.png',
  '/homekeeper/icon-192.png',
  '/homekeeper/icon-512.png',
  '/homekeeper/icon-maskable-192.png',
  '/homekeeper/icon-maskable-512.png',
  '/homekeeper/apple-touch-icon.png',
];

async function buildCacheList() {
  try {
    const response = await fetch('/homekeeper/index.html', { cache: 'reload' });
    if (!response.ok) {
      return APP_SHELL;
    }

    const html = await response.text();
    const buildAssets = [...html.matchAll(/(?:href|src)="(\/homekeeper\/assets\/[^"]+)"/g)].map(
      (match) => match[1],
    );
    return [...new Set([...APP_SHELL, ...buildAssets])];
  } catch {
    return APP_SHELL;
  }
}

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // A missed optional asset should not prevent the service worker from installing.
  }
}

async function cacheRequest(request) {
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urls = await buildCacheList();
      await Promise.all(urls.map((url) => cacheUrl(cache, url)));
      await self.skipWaiting();
    }),
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
      cacheRequest(event.request).catch(
        () => caches.match('/homekeeper/index.html') || caches.match('/homekeeper/'),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        event.waitUntil(cacheRequest(event.request).catch(() => undefined));
        return cached;
      }

      return cacheRequest(event.request);
    }),
  );
});
