/* 1. 楽／大変のやり方が別の組み方として候補に入り、やさしく／難しくの段が増えているか
   2. セットの合間に、回数だけでなくダンベルの増減も提案するか */
(async () => {
  const out = {};
  T.reset([{kg: 5, n: 2}, {kg: 10, n: 2}]);
  await T.wait(60);

  /* ---- 1. 組み方 ---- */
  const cat = catalog();
  out.catalogCount = cat.length;
  out.variantCount = VARIANT_ROWS.length;
  out.sampleVariants = VARIANT_ROWS.slice(0, 8).map(v => v.label + " lv" + itemLevel(v));
  /* ほかの種目に移るだけの案・ダンベルを置く案が混ざっていないか */
  const names = EX.map(e => e.name);
  out.refersOther = VARIANT_ROWS.filter(v => names.some(n => n !== EXMAP[v.ex].name && (v.note || "").indexOf(n) >= 0)).map(v => v.label);
  out.bodyweightMixed = VARIANT_ROWS.filter(v => /持たずに|何も持たず/.test(v.note || "")).map(v => v.label);
  /* ラベルの重複がないか */
  const labs = cat.map(c => c.label || ("=" + c.ex));
  out.dupLabels = labs.filter((x, i) => labs.indexOf(x) !== i);

  /* 段の広がり: 主な種目で、やさしく／難しくの両方が出るか */
  out.steps = {};
  ["goblet", "pushup", "row", "calf", "plank", "curl"].forEach(id => {
    const it = catalogItem(id);
    const d = stepItem(it, -1), u = stepItem(it, 1);
    out.steps[EXMAP[id].name] = {lv: itemLevel(it), down: d ? itemName(d) : null, up: u ? itemName(u) : null};
  });

  /* 持ち替えたら、そのやり方がメニューに残るか */
  const first = todayItems()[0];
  const up = stepItem(first, 1);
  if(up){
    replaceInPlan(first.ex, up.ex, up.label || "");
    await T.wait(120);
    const now = todayItems();
    out.swapped = {to: itemName(up), inPlan: now.some(it => (it.label || "") === (up.label || "")),
                   count: now.length, note: (now.find(it => (it.label || "") === (up.label || "")) || {}).note || ""};
  }

  /* ---- 2. セット間のダンベル提案 ---- */
  T.reset([{kg: 5, n: 2}, {kg: 10, n: 2}]);
  await T.wait(60);
  const id = "rdl";                              /* 合計で重さを決める種目（刻みが細かい） */
  const s = session(TODAY);
  fixPlan(s);
  if(!s.plan.some(x => x.ex === id)) s.plan.push(catalogItem(id));
  persistSession(TODAY);
  const item = todayItems().find(x => x.ex === id);
  const rr = repRange(id, item);
  const opts = gearOptions(id);
  out.rep = rr;
  out.opts = opts.map(o => o.total);

  const trial = (prevR, rpe, w) => {
    const e = entryFor(TODAY, id, true);
    e.sets = [{id: "x", at: 1, r: prevR, rpe: rpe, w: w}];
    const sug = suggestNext(item, e, null);
    e.sets = [];
    return {w: sug.w, r: sug.r, change: sug.change || null, why: sug.why};
  };
  const mid = opts[Math.min(1, opts.length - 1)].total;
  out.easySet = trial(rr.hi + 1, 5, mid);      /* 余裕たっぷり・回数も伸びた → 重く */
  out.hardSet = trial(rr.lo - 2, 10, mid);     /* 限界で回数届かず → 軽く */
  out.normalSet = trial(rr.hi - 2, 8, mid);    /* 狙いどおり → 据え置き */
  out.topSet = trial(rr.hi + 1, 5, opts[opts.length - 1].total);   /* 一番重い使い方 → 上げようがない */

  /* 「今日の調整」の文がセット間向けになっているか */
  const e2 = entryFor(TODAY, id, true);
  e2.sets = [{id: "y", at: 1, r: rr.hi + 1, rpe: 5, w: mid}];
  const sug2 = suggestNext(item, e2, null);
  const adv = todayAdvice(item, sug2);
  out.advice = adv ? {short: adv.short, text: adv.text} : null;
  e2.sets = [];

  window.__result = out;
  window.__ready = true;
})();
