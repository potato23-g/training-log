/* キャラクターの図（公開版だけ）の通し検査。tools/model_check.py が docs/ を配って流す。
   1) 線の図の動きすべてに、キャラクターの姿勢・時間割・止まった姿の画像がそろっている（1 つでも欠けたら落とす）
   2) キャラクターを選んでいるあいだは、止まった姿も再生もキャラクターだけ。線の図を選べば線の図だけ
   3) 再生 → 描き直しても続く → 停止、を実際に押して確かめる
   4) からだの図も同じ選び方（mmdOn）で、キャラクターの素体か線の図か */
(async () => {
  const W = ms => new Promise(r => setTimeout(r, ms));
  const out = {pass: 0, fail: []};
  const ok = (name, v) => { if(v) out.pass++; else out.fail.push(name); };
  const tab = t => [...document.querySelectorAll('button, a')].find(b => b.textContent.trim() === t).click();
  const play = () => document.querySelector('[data-act="play"]');
  const loaded = im => new Promise(r => { if(im.complete) r(im.naturalWidth > 0); else { im.onload = () => r(true); im.onerror = () => r(false); } });
  try{
    await W(1500);
    /* ---- そろっているか */
    const ids = Object.keys(MOTION.motions), miss = [];
    ids.forEach(id => {
      const m = MOTION.motions[id];
      if(!mmdDrv(id)) miss.push(id + '（時間割）');
      if(!MMD_STILLS[id]) miss.push(id + '（画像）');
      if((m.dumbbells || []).length >= 2 && !MMD_STILLS[id + '.1']) miss.push(id + '.1（画像）');
    });
    Object.keys(VARIANT_MOTION).forEach(k => { if(!MOTION.motions[VARIANT_MOTION[k]]) miss.push(k + ' → ' + VARIANT_MOTION[k] + '（動きが無い）'); });
    ok('すべての動きにキャラクターの図がある: ' + miss.slice(0, 8).join(' '), ids.length > 90 && !miss.length);

    /* ---- 時間割は線の図のもの */
    const at = (id, f) => { const m = MOTION.motions[id]; return modelAt(id, m, MOTION.cycleTime(m) * f); };
    const peak = id => { let hi = 0; for(let i = 0; i <= 100; i++) hi = Math.max(hi, at(id, i / 100).u); return hi; };
    const held = id => { const m = MOTION.motions[id], T = MOTION.cycleTime(m); let n = 0; for(let t = 0; t < T; t += 0.05) if(modelAt(id, m, t).u > 0.97) n++; return n * 0.05; };
    ok('始めは動きの始めの姿勢', at('goblet', 0).u < 0.02 && at('curl', 0).u < 0.02);
    ok('床に寝て押す種目は、下ろした所から始まる', at('floorpress', 0).u > 0.98 && at('fly', 0).u > 0.98 && at('skull', 0).u > 0.98);
    ok('動ききる', peak('goblet') > 0.98 && peak('ohp') > 0.98 && peak('abduct') > 0.98 && peak('calf') > 0.98);
    ok('止める組み方は、止める時間が長い', held('goblet_hold') > held('goblet') + 1.5 && held('lateral_hold') > held('lateral') + 1);
    ok('浅い組み方は、途中までしか動かない', peak('sumo_shallow') < 0.85 && peak('pullover_shallow') < 0.6 && peak('twist_shallow') < 0.6);
    ok('左右を交互に動かす', at('deadbug', 0.15).k !== at('deadbug', 0.65).k && at('twist', 0.25).k !== at('twist', 0.75).k);
    const ws = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => at('plank', i / 10).w);
    ok('悪い例は、線の図と同じ場面でだけ見せる', Math.min(...ws) === 0 && Math.max(...ws) > 0.98 && at('plank', 0.05).w === 0);

    /* ---- 止まった姿もキャラクター */
    tab('種目'); await W(300);
    refEx = 'ohp'; render(); await W(100);
    let im = document.querySelector('.figstill');
    ok('止まった姿はキャラクターの画像', !!im && im.hasAttribute('data-model') && /mmd\/stills\/ohp\.webp$/.test(im.src) && await loaded(im));
    ok('画像の大きさが先に決まっている（読み込みで画面が動かない）', im.getAttribute('width') === '720' && im.getAttribute('height') === '960');
    const r = im.getBoundingClientRect(), sr = im.parentNode.getBoundingClientRect();
    ok('図は枠の幅いっぱい ' + Math.round(r.width), r.width > 300 && Math.abs(r.width - sr.width) < 2);

    /* ---- 再生 */
    for(const id of ['ohp', 'crunch']){
      refEx = id; render(); await W(200);
      play().click();
      const t0 = performance.now();
      while(!(MMD && MMD.canvas.parentNode) && performance.now() - t0 < 100000) await W(200);
      ok(id + ': キャラクターが出る', !!(MMD && MMD.canvas.parentNode === playSlot));
      ok(id + ': ボタンは「停止」', play().textContent === '停止');
      if(!MMD) throw new Error('モデルを読めない');
      await W(700);
      const sz = MMD_SHAPES[MMD_STILLS[id]];
      ok(id + ': 枠の形は止まった姿と同じ', MMD.canvas.width === sz[0] && MMD.canvas.height === sz[1]);
      ok(id + ': 段階の名前と進み具合が出る', !!playSlot.querySelector('.figphase').textContent && parseFloat(playSlot.querySelector('.figbar span').style.width) > 0);
    }
    const clock = playClock.t0;
    render(); await W(400);
    ok('描き直しても再生が続く', playingId === 'crunch' && !!document.querySelector('.figslot canvas') && playClock.t0 === clock);
    play().click(); await W(100);
    ok('停止で止まった姿に戻る', !document.querySelector('.figslot canvas') && play().textContent === '動きを再生');
    const hasAll = ids.filter(id => !MMD.has(id));
    ok('組み方ごとの動きもキャラクターで出せる: ' + hasAll.slice(0, 6).join(' '), !hasAll.length);

    /* ---- 線の図に切り替えたら、線の図だけ */
    setFigKind('line'); await W(200);
    im = document.querySelector('.figstill');
    ok('線の図: 止まった姿も線の図', !!im && !im.hasAttribute('data-model') && /^data:image/.test(im.src));
    play().click(); await W(300);
    ok('線の図: 再生も線の図', !!(FIG && FIG.canvas.parentNode === playSlot) && MMD.canvas.parentNode !== playSlot);
    stopAnim(); setFigKind('model'); await W(100);
    /* ---- 読めなかったら、画面ごと線の図 */
    mmdFail(); await W(100);
    ok('読めなかったときは、すべて線の図', !mmdOn() && !document.querySelector('.figstill[data-model]') && !!document.querySelector('.figstill'));
    mmdOff = false; render();
    /* ---- からだの図も、種目の図と同じ選び方（mmdOn）でキャラクターか線の図か。部位はどちらも同じ組 */
    const parts = () => [...new Set([...document.querySelectorAll('svg.fig .rg')].map(e => e.getAttribute('data-m')))].sort().join(',');
    tab('からだ'); await W(300);
    const emaParts = parts(), emaOn = !!document.querySelector('svg.fig.ema') && mmdOn();
    const mask = document.querySelector('svg.fig.ema mask image');
    const maskOk = mask ? await fetch(mask.getAttribute('href')).then(r => r.ok).catch(() => false) : false;
    setFigKind('line'); await W(200);
    ok('からだの図: キャラクターを選べば素体', emaOn);
    ok('からだの図: 素体のシルエットの画像が読める', maskOk);
    ok('からだの図: 線の図を選べば線の図。部位の組は同じ: ' + parts() + ' / ' + emaParts,
       !document.querySelector('svg.fig.ema') && document.querySelectorAll('svg.fig').length === 2 && parts() === emaParts);
    setFigKind('model'); await W(200);
    tab('設定'); await W(300);
    ok('設定で図を選べる', !!document.querySelector('#figSel'));
    out.caches = await caches.keys();
  }catch(e){ out.fail.push(String(e && e.stack || e)); }
  out.errs = window.__errs || [];
  if(out.errs.length) out.fail.push('エラー: ' + out.errs.join(' / '));
  window.__result = out; window.__ready = true;
})();
