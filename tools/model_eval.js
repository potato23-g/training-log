/* モデルの動き（公開版だけ）の通し検査。tools/model_check.py が docs/ を配って流す。
   再生 → 描き直しても続く → 停止 → 線の図へ切り替え、を実際に押して確かめる */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const out = {pass: 0, fail: []};
  const ok = (name, v) => { if(v) out.pass++; else out.fail.push(name); };
  const tab = t => [...document.querySelectorAll('button, a')].find(b => b.textContent.trim() === t).click();
  const play = () => document.querySelector('[data-act="play"]');
  try{
    await W(1500);
    tab('種目'); await W(300);
    for(const id of ['ohp', 'crunch']){
      refEx = id; render(); await W(200);
      play().click();
      const t0 = performance.now();
      while(!(MMD && MMD.canvas.parentNode) && performance.now() - t0 < 100000) await W(200);
      ok(id + ': モデルが出る', !!(MMD && MMD.canvas.parentNode === playSlot));
      ok(id + ': ボタンは「停止」', play().textContent === '停止');
      if(!MMD) throw new Error('モデルを読めない');
      await W(600);
      const gl = MMD.canvas.width + 'x' + MMD.canvas.height;
      ok(id + ': 枠の向き ' + gl, gl === (id === 'crunch' ? '800x600' : '600x800'));
    }
    render(); await W(400);
    ok('描き直しても再生が続く', playingId === 'crunch' && !!document.querySelector('.figslot canvas'));
    play().click(); await W(100);
    ok('停止で静止画に戻る', !document.querySelector('.figslot canvas') && play().textContent === '動きを再生');
    ok('組み方ごとの動き・本数を減らす図は線の図', !mmdCan('goblet_hold', 0) && !mmdCan('goblet', 1) && mmdCan('goblet', 0));
    setFigKind('line'); await W(200);
    play().click(); await W(300);
    ok('線の図に切り替えられる', !!(FIG && FIG.canvas.parentNode === playSlot) && MMD.canvas.parentNode !== playSlot);
    stopAnim(); setFigKind('model');
    tab('設定'); await W(300);
    ok('設定に「動きの再生」がある', !!document.querySelector('#figSel'));
    out.caches = await caches.keys();
  }catch(e){ out.fail.push(String(e && e.message || e)); }
  out.errs = window.__errs || [];
  if(out.errs.length) out.fail.push('エラー: ' + out.errs.join(' / '));
  window.__result = out; window.__ready = true;
})();
