(async () => {
  await new Promise(r => setTimeout(r, 800));   /* SW登録を待つ */
  let reg = null;
  try { reg = await navigator.serviceWorker.getRegistration(); } catch(e) {}
  const cacheNames = ('caches' in window) ? await caches.keys() : [];
  let cachedCount = 0;
  if (cacheNames.length) {
    const c = await caches.open(cacheNames[0]);
    cachedCount = (await c.keys()).length;
  }
  window.__result = {
    manifestLink: !!document.querySelector('link[rel=manifest]'),
    swSupported: 'serviceWorker' in navigator,
    swRegistered: !!(reg && reg.active),
    swScope: reg ? reg.scope : null,
    cacheNames: cacheNames,
    cachedFileCount: cachedCount,
    three: typeof THREE !== 'undefined' ? THREE.REVISION : 'なし',
    外部通信: performance.getEntriesByType('resource').map(r => r.name).filter(n => /^https?:/.test(n) && !n.includes('127.0.0.1'))
  };
  window.__ready = true;
})();
