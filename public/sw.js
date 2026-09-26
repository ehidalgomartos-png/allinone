const CACHE_NAME = 'instant-admirers-v1.12.14';
const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css?v=1.12.14',
  '/app.js?v=1.12.14',
  '/i18n.js?v=1.12.14',
  '/vendor/hls/hls.min.js?v=1.12.14',
  '/manifest.webmanifest',
  '/assets/brand/instant-admirers-mark.svg',
  '/assets/brand/icon-192.png',
  '/assets/brand/icon-512.png',
  '/assets/brand/apple-touch-icon.png',
  '/assets/brand/maskable-192.png',
  '/assets/brand/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('instant-admirers-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/protected-media/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match('/index.html')) || (await caches.match('/offline.html')))
    );
    return;
  }

  if (/\.(?:js|css|svg|png|jpg|jpeg|webp|ico|woff2?)$/i.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
