/* トレーニング記録 — オフラインキャッシュ
   ビルド時に __CACHE_VERSION__ を内容ハッシュへ置き換える（更新のたびにキャッシュが入れ替わる） */
const CACHE_NAME = 'trainlog-__CACHE_VERSION__';
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

/* 新しい版を保存するときは、ブラウザの控え（HTTPキャッシュ。GitHub Pages は10分持つ）を使わずに取り直す。
   1つでも取れなければ入れ替えない（古い版の保存を消さずに、古い版のまま動く） */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

/* ここに来るのは、新しい版の保存がそろったときだけ。古い版の保存を消す。
   同じアドレス（GitHub Pagesのユーザーサイト）で別のアプリも動いていることがあるので、
   消すのは自分の名前（trainlog-）で始まる保存だけにする。他アプリの保存には触れない */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME && n.indexOf('trainlog-') === 0).map((n) => caches.delete(n))))
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
   キャッシュが無ければネットワークを試し、取れたら以後のためにキャッシュする。
   「更新」ボタンの版の確認（?__check=）は保存を通さず、そのままネットへ */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.searchParams.has('__check')) return;

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
