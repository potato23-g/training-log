(async () => {
  document.querySelector('nav.tabs button[data-tab="ex"]').click();
  refEx = 'row'; render();
  await new Promise(r => setTimeout(r, 300));
  togglePlay('row');                       /* 再生してキャンバスに切り替える */
  await new Promise(r => setTimeout(r, 1500));
  window.__ready = true;
})();
