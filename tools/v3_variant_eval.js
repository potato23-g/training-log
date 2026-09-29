/* 1. 楽／大変のやり方が別の組み方として候補に入り、やさしく／難しくの段が増えているか
   2. 2セット目からは、前のセットの重さ・回数をそのまま入力欄に出すか（きつさの入力は 2026-09-29 にやめた） */
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

  /* ---- 2. 2セット目の入力欄 ---- */
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

  const first1 = suggestNext(item, null);
  out.firstSet = {w: first1.w, r: first1.r, target: first1.target, src: first1.src};
  const trial = (prevR, w) => {
    const e = entryFor(TODAY, id, true);
    e.sets = [{id: "x", at: 1, r: prevR, w: w, target: first1.target}];
    const sug = suggestNext(item, e);
    e.sets = [];
    return {w: sug.w, r: sug.r, target: sug.target, src: sug.src, same: sug.w === w && sug.r === prevR};
  };
  const mid = opts[Math.min(1, opts.length - 1)].total;
  out.afterMoreReps = trial(rr.hi + 1, mid);                         /* 目標より多くできた */
  out.afterFewerReps = trial(rr.lo - 2, mid);                        /* 目標に届かなかった */
  out.afterHeaviest = trial(rr.hi + 1, opts[opts.length - 1].total); /* 一番重い使い方に替えた */

  /* セットの合間は「今日の調整」の一言を出さない（1セット目の前だけ） */
  const e2 = entryFor(TODAY, id, true);
  e2.sets = [{id: "y", at: 1, r: rr.hi + 1, w: mid, target: first1.target}];
  const sug2 = suggestNext(item, e2);
  const adv = todayAdvice(item, sug2);
  out.advice = adv ? {short: adv.short, text: adv.text} : null;
  e2.sets = [];

  window.__result = out;
  window.__ready = true;
})();
