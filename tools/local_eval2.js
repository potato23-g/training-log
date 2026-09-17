(async () => {
  /* 2回目: 前回の記録が残っているか */
  await new Promise(r => setTimeout(r, 400));
  const s = state.sessions[TODAY];
  window.__result = {
    残っている日数: Object.keys(state.sessions).length,
    今日のセット: s ? (s.entries[0] ? s.entries[0].sets.length : 0) : 0,
    ルーチン: s ? s.routine : 'なし',
    状態表示: document.getElementById('status').textContent,
    図が出ているか: !!document.querySelector('.figstill')
  };
  window.__ready = true;
})();
