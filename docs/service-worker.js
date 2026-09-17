/* トレーニング記録 — オフラインキャッシュ
   ビルド時に 66c3ad578a を内容ハッシュへ置き換える（更新のたびにキャッシュが入れ替わる） */
const CACHE_NAME = 'trainlog-66c3ad578a';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function putCache(request, response) {
  return caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
}
function refreshInBackground(request) {
  return fetch(request).then((res) => { if (res && res.ok) return putCache(request, res); }).catch(() => {});
}

/* 同一オリジンのGETのみ扱う。キャッシュがあれば即返し、裏で更新（stale-while-revalidate）。
   キャッシュが無ければネットワークを試し、取れたら以後のためにキャッシュする。 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        event.waitUntil(refreshInBackground(event.request));
        return cached;
      }
      return fetch(event.request)
        .then((res) => { if (res && res.ok) event.waitUntil(putCache(event.request, res.clone())); return res; })
        .catch(() => cached);
    })
  );
});
