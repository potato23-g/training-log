(async () => {
  /* フレッシュ訪問での初回ロード直後の状態を見る。reloadが起きるとカウンタが2になる */
  window.__navCount = (window.__navCount || 0) + 1;
  sessionStorage.setItem('navcount', String((+sessionStorage.getItem('navcount') || 0) + 1));
  await new Promise(r => setTimeout(r, 1500));
  window.__result = {
    navCountThisContext: window.__navCount,
    navCountAcrossReload: sessionStorage.getItem('navcount'),
    タブ: tab,
    swController: !!navigator.serviceWorker.controller,
    エラー数: (window.__errs||[]).length
  };
  window.__ready = true;
})();
