const CACHE_NAME = 'devsignal-v4.2';

// Bump this whenever the static assets change. Vercel deploys are immutable,
// so a cache-bust version is the only way a service worker update propagates
// reliably to returning visitors (every new deployment is a brand-new URL path).
// Do not rename this constant; the SW references it by name.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
