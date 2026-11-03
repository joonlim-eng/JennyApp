/*
 * JENNY PWA service worker (web only — not used by the Android app).
 *
 * Purpose:
 *  - Makes the app installable from mobile Chrome / Brave (fetch handler).
 *  - Faster relaunch of the installed PWA (cached JS bundles / fonts / icons).
 *
 * Safety rules (so a new EAS Hosting deploy is always picked up):
 *  - HTML pages (navigations) are NETWORK-FIRST; the cache is only an
 *    offline fallback.
 *  - Only hashed build output (/_expo/static/, /assets/) is cache-first,
 *    because those file names change on every build.
 *  - Cross-origin requests (Google Apps Script, Google login, Drive images…)
 *    are NEVER intercepted, except the pinned barcode decoder script.
 *  - Non-GET requests are never touched.
 *
 * Bump CACHE_VERSION to force every installed PWA to drop its old cache.
 */
const CACHE_VERSION = 'jenny-pwa-v1';
const PAGE_CACHE = CACHE_VERSION + '-pages';
const STATIC_CACHE = CACHE_VERSION + '-static';

const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// Barcode decoder used by the web SCAN screen on browsers without
// BarcodeDetector (iOS Safari). Version-pinned, so cache-first is safe.
const CDN_ALLOW = [
  'https://cdn.jsdelivr.net/npm/@zxing/library@',
  'https://unpkg.com/@zxing/library@',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) =>
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('jenny-pwa-') && !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isHashedStatic(url) {
  return url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (await cache.match('/'));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    if (CDN_ALLOW.some((p) => request.url.startsWith(p))) {
      event.respondWith(cacheFirst(request));
    }
    return; // let the browser handle every other cross-origin request
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isHashedStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // manifest, icons, favicon … (small, rarely changing)
  if (url.pathname === '/manifest.json' || url.pathname.startsWith('/icons/') || url.pathname === '/favicon.ico') {
    event.respondWith(staleWhileRevalidate(request));
  }
  // anything else: default network behaviour
});
