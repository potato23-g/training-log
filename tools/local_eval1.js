(async () => {
  /* 1回目: 記録を入れて保存されるか */
  const e = entryFor(TODAY, 'goblet', true);
  e.sets.push({w:5, r:12, rpe:8});
  session(TODAY).routine = 'A';
  persistSession(TODAY);
  tab = 'hist'; render();
  await new Promise(r => setTimeout(r, 300));
  window.__result = {
    保存済み: !!localStorage.getItem('trainlog.v1'),
    保存の中身: (localStorage.getItem('trainlog.v1') || '').slice(0, 80),
    バックアップボタン: !!document.querySelector('[data-act="backup"]'),
    読み込んだ外部資源: performance.getEntriesByType('resource').map(r => r.name).filter(n => /^https?:/.test(n)),
    three: typeof THREE !== 'undefined' ? THREE.REVISION : 'なし',
    状態表示: document.getElementById('status').textContent
  };
  window.__ready = true;
})();
