/* 1. 種目カードの「やさしく／難しく」で、同じ動きのまま段を持ち替えられるか
   2. 「おまかせで1種目追加」と「種目を選んで追加」の両方で足せるか */
(async () => {
  const out = {};
  T.reset([{kg: 5, n: 2}]);
  await T.wait(60);

  /* ---- 1. 段の持ち替え ---- */
  out.plan = todayItems().map(it => itemName(it));
  const first = todayItems()[0];
  out.first = {name: itemName(first), level: itemLevel(first), pat: patternOf(first.ex)};
  out.down = (() => { const d = stepItem(first, -1); return d ? {name: itemName(d), level: itemLevel(d)} : null; })();
  out.up = (() => { const u = stepItem(first, 1); return u ? {name: itemName(u), level: itemLevel(u)} : null; })();

  /* カードを開いてボタンが出るか */
  openEx = first.ex; render();
  await T.wait(80);
  const btns = T.qa('[data-act="stepto"]').map(b => ({label: b.textContent, ex: b.dataset.ex}));
  out.buttons = btns;

  /* 「難しく」を押す（無ければ「やさしく」） */
  const btn = T.qa('[data-act="stepto"]').find(b => b.textContent.indexOf("難しく") === 0)
           || T.qa('[data-act="stepto"]')[0];
  if(btn){
    const wantLabel = btn.dataset.label, wantEx = btn.dataset.ex;
    btn.click();
    await T.wait(120);
    const now = todayItems();
    out.afterSwap = {
      to: wantLabel || EXMAP[wantEx].name,
      plan: now.map(it => itemName(it)),
      swappedIn: now.some(it => it.ex === wantEx && (it.label || "") === wantLabel),
      oldGone: !now.some(it => it.ex === first.ex && (it.label || "") === (first.label || "")),
      samePattern: now.filter(it => patternOf(it.ex) === out.first.pat).length === 1,
      count: now.length
    };
  }

  /* 記録済みの種目は持ち替えボタンを出さない */
  T.reset([{kg: 5, n: 2}]);
  await T.wait(60);
  const id2 = todayItems()[0].ex;
  await T.recordAll(id2, 1);
  openEx = id2; render();
  await T.wait(80);
  out.noSwapAfterRecord = T.qa('[data-act="stepto"]').length === 0;

  /* ---- 2. おまかせで追加 ---- */
  T.reset([{kg: 5, n: 2}]);
  await T.wait(60);
  const before = todayItems().map(it => it.ex);
  T.click('[data-act="addauto"]');
  await T.wait(150);
  const after = todayItems().map(it => it.ex);
  out.auto = {
    before, after,
    added: after.filter(x => !before.includes(x)),
    flash: (T.q(".flash") || {}).textContent || "",
    status: T.q("#status").textContent,
    dupPattern: (() => { const p = todayItems().map(it => patternOf(it.ex)); return new Set(p).size !== p.length; })(),
    saved: (session(TODAY).plan || []).length
  };

  /* 上限まで押し続けても壊れないか */
  for(let i = 0; i < 6; i++){ T.click('[data-act="addauto"]'); await T.wait(90); }
  const items = todayItems();
  const pats = items.map(it => patternOf(it.ex));
  out.repeated = {
    flash: (T.q(".flash") || {}).textContent || "",
    count: items.length,
    dupPattern: new Set(pats).size !== pats.length,
    status: T.q("#status").textContent,
    overCap: items.reduce((a, it) => a + (it.sets || 3), 0) > SESSION_MAX.sets + 2
  };

  /* ---- 3. 自分で選んで追加 ---- */
  T.reset([{kg: 5, n: 2}]);
  await T.wait(60);
  const b4 = todayItems().map(it => it.ex);
  T.click('[data-act="addex"]');
  await T.wait(120);
  const picks = T.qa("[data-pick]");
  out.pickerCount = picks.length;
  const wanted = picks.find(b => b.dataset.pick === "shrug");
  out.pickerHasShrug = !!wanted;
  if(wanted){
    wanted.click();
    await T.wait(150);
    out.manual = {added: todayItems().map(it => it.ex).filter(x => !b4.includes(x)), openEx};
  }

  window.__result = out;
  window.__ready = true;
})();
