(async () => {
  await new Promise(r => setTimeout(r, 500));
  window.__result = {
    タイトル: document.title,
    今日タブ表示: !!document.querySelector('nav.tabs'),
    three: typeof THREE !== 'undefined' ? THREE.REVISION : 'なし',
    エラー数: (window.__errs || []).length
  };
  window.__ready = true;
})();
