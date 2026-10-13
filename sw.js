/* =========================================================
   V2RAY PORTAL — Service Worker
   Strategy:
   - Navigate/HTML  : Network-first, cache fallback
   - Static assets  : Cache-first, network fallback
   - APIs/Firebase  : Bypass (network only)
   ========================================================= */

const CACHE_VERSION = 'v2ray-portal-v1.0.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://raw.githubusercontent.com/VPS-SCRIPT/V2RAY-PANEL/main/v2ray.png'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
    })
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Skip: Firebase, Worker API, Telegram, Google APIs, CDNs (dynamic)
  const bypassHosts = [
    'firebase',
    'googleapis.com',
    'gstatic.com',
    'firebaseio.com',
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'workers.dev',
    'api.telegram.org',
    'qrserver.com',
    'cloudflare.com',
    'cdnjs.cloudflare.com',
    'cdn.tailwindcss.com'
  ];
  if (bypassHosts.some((h) => url.hostname.includes(h))) {
    return; // Let the browser handle it normally (network only)
  }

  // HTML navigation requests → Network-first
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Other same-origin assets → Cache-first
  const isSameOrigin = url.origin === self.location.origin;
  const isStaticImage =
    req.destination === 'image' ||
    /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|css|js)$/i.test(url.pathname);

  if (isSameOrigin || isStaticImage) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
      })
    );
  }
});

/* ---------- MESSAGE (skipWaiting trigger) ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
