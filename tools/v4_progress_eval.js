/* 伸ばし方（F1）とメニュー作りの検査。dist/local/training-log.html の中で動かす。
   python tools/cdp_shot.py "file:///C:/claude%20code/training-log/dist/local/training-log.html" out.png
     --eval tools/v4_progress_eval.js --ready window.__ready --dump window.__result --log out.json --port 9471 --profile <新しい絶対パス>
   日付を進めるときは todayKey() ごと差し替える（daysAgo() も同じ日付で数えるように。TODAY だけずらすと週や回復の計算が狂う） */
(async () => {
  const out = {fail: [], pass: 0};
  const ok = (c, msg) => { if(c) out.pass++; else out.fail.push(msg); };
  const realTodayKey = todayKey;
  const shift = (k, n) => addDays(k, n);
  const base = realTodayKey();
  let sim = base;
  const goTo = k => { sim = k; todayKey = () => sim; TODAY = sim; planMemo = null; resetProg(); openEx = null; };
  const fresh = () => { state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; catalogMemo = null; planMemo = null; resetProg(); };
  /* その日のメニューを、目標どおり・きつさ rpe で全部記録する */
  const doDay = (rpe, hitFn) => {
    const s = session(TODAY);
    fixPlan(s);
    const items = activeItems();
    items.forEach(it => {
      const n = it.sets || 3;
      for(let k = 0; k < n; k++){
        const e = entryFor(TODAY, it.ex, false);
        const sug = suggestNext(it, e);
        const r = hitFn ? hitFn(it, sug, k) : sug.target;
        const st = {id: newSetId(), at: k, r, rpe, label: it.label || "", target: sug.target};
        if(sug.opt) st.w = sug.w;
        entryFor(TODAY, it.ex, true).sets.push(st);
      }
    });
    resetProg();
    return items.map(it => itemName(it));
  };

  /* ---- 1. 記録が無い動きは、素の組み方から（B2） ---- */
  fresh(); goTo(base);
  const firstPicks = catalog().filter(c => c.lv && buildPlan().some(p => itemKey(p) === itemKey(c)));
  ok(firstPicks.length === 0, "B2: 記録が無いのに大変・楽な組み方が選ばれた: " + firstPicks.map(itemName).join("、"));
  /* 動きごとに1つずつ見ても、素の組み方が先 */
  const pats = Array.from(new Set(catalog().map(c => patternOf(c.ex))));
  const nextNull = pats.filter(p => patternNext(p) !== null);
  ok(nextNull.length === 0, "B2: 記録が無いのに今日の組み方が決まっている動きがある: " + nextNull.join(","));

  /* ---- 2. 目標どおり・きつさ8で続けると、目標が1回ずつ上がり、上限で段が上がる（A2/F1） ---- */
  fresh();
  const trace = {};
  let day = shift(base, -60);
  for(let i = 0; i < 24; i++){
    goTo(day);
    const names = doDay(8);
    names.forEach(nm => {});
    activeItems().forEach(it => {
      const key = patternOf(it.ex);
      const e = entryFor(TODAY, it.ex, false);
      (trace[key] = trace[key] || []).push(itemName(it) + " " + (e.sets[0].w !== undefined ? wShown(it, e.sets[0].w) + "kg×" : "") + e.sets[0].r);
    });
    day = shift(day, 2 + (i % 2));          /* 2日か3日おき（週に2〜3回） */
  }
  out.trace = {};
  Object.keys(trace).forEach(k => { const t = trace[k]; out.trace[k] = [t[0], t[Math.floor(t.length / 2)], t[t.length - 1]].join(" → ") + "（" + t.length + "回）"; });
  const moved = Object.keys(trace).filter(k => trace[k].length >= 4 && trace[k][0] !== trace[k][trace[k].length - 1]);
  ok(moved.length >= 3, "F1: 目標どおりに続けても数字が動かない動きばかり: " + JSON.stringify(out.trace));
  /* 同じ組み方のあいだは、目標が1回ずつしか上がらない（一気に跳ばない） */
  goTo(day);
  const squat = patternHistory("squat");
  if(squat.length >= 2){
    const a = evalSession(squat[1]), b = evalSession(squat[0]);
    ok(squat[0].label !== squat[1].label || squat[0].ex !== squat[1].ex || b.target - a.target <= 1 || b.target < a.target,
       "F1: 同じ組み方で目標が2回以上跳んだ");
  }

  /* ---- 3. 届かない回が2回続くと目標を下げる ---- */
  fresh();
  day = shift(base, -20);
  for(let i = 0; i < 3; i++){
    goTo(day);
    doDay(9, (it, sug, k) => k === 2 ? Math.max(1, sug.target - 3) : sug.target);   /* 3セット目が届かない */
    day = shift(day, 3);
  }
  goTo(day);
  const gob = activeItems().find(it => patternOf(it.ex) === "squat");
  if(gob){
    const p = progressFor(gob);
    ok(p.change === "down" || p.change === "lighter" || p.change === "easier" || p.change === "stepped-down",
       "F1: 2回続けて届かないのに下げない: " + p.change + " / " + p.why);
  }

  /* ---- 4. きつさを入れなかった回は据え置き ---- */
  fresh();
  goTo(shift(base, -3)); doDay(0);
  goTo(base);
  const it0 = activeItems()[0];
  if(it0){ const p = progressFor(it0); ok(p.change === "hold" || p.change === "switched" || p.change === "first", "F1: きつさ無しで目標が動いた: " + p.change); }

  /* ---- 5. 組み直しは何度押しても同じ（B18） ---- */
  fresh();
  goTo(shift(base, -4)); doDay(8);
  goTo(base);
  const m0 = todayItems().map(itemKey).join(",");
  replanToday();
  const m1 = todayItems().filter(x => !x.skip).map(itemKey).join(",");
  replanToday();
  const m2 = todayItems().filter(x => !x.skip).map(itemKey).join(",");
  ok(m1 === m2 && m0 === m1, "B18: 組み直すたびにメニューが変わる: " + [m0, m1, m2].join(" | "));

  /* ---- 6. 外す・戻す・後に回す（B4・U3）と、手で足した種目（B5） ---- */
  const s = session(TODAY);
  const first = activeItems()[0];
  ACTIONS.skip({dataset: {ex: first.ex}});
  ok(!activeItems().some(it => it.ex === first.ex), "B4: 外した種目が今日の種目に残っている");
  replanToday();
  ok(!activeItems().some(it => patternOf(it.ex) === patternOf(first.ex)), "B4: 外した動きが組み直しで戻ってきた");
  ok(todayItems().some(it => it.ex === first.ex && it.skip), "B4: 外した種目が「外した」一覧から消えた");
  ACTIONS.unskip({dataset: {ex: first.ex}});
  ok(activeItems().some(it => it.ex === first.ex), "B4: 戻した種目が今日の種目に無い");
  const second = activeItems()[0];
  ACTIONS.later({dataset: {ex: second.ex}});
  const act = activeItems();
  ok(act[act.length - 1].ex === second.ex, "U3: 後に回した種目が最後に無い");
  /* 手で足した種目は組み直しても残る */
  const extraEx = catalog().find(c => !c.lv && !todayItems().some(t => patternOf(t.ex) === patternOf(c.ex)) && (EXMAP[c.ex].kind !== "w" || gearOptions(c.ex).length));
  if(extraEx){
    addToProgramToday(extraEx.ex);
    ok(todayItems().some(it => it.ex === extraEx.ex && it.manual), "B5: 手で足した種目が今日のメニューに入っていない");
    replanToday();
    ok(todayItems().some(it => it.ex === extraEx.ex), "B5: 手で足した種目が組み直しで消えた");
  }

  /* ---- 7. 軽い週（F5）: セット数が半分・目標は据え置き ---- */
  fresh();
  goTo(shift(base, -3)); doDay(8);
  goTo(base);
  const before = activeItems().map(it => it.sets || 3);
  setDeload(true);
  replanToday();
  const after = activeItems().map(it => it.sets || 3);
  ok(after.every(n => n <= 2), "F5: 軽い週なのにセット数が半分になっていない: " + before.join(",") + " → " + after.join(","));
  const pd = progressFor(activeItems()[0]);
  ok(pd.change === "deload" || pd.change === "first" || pd.change === "switched", "F5: 軽い週なのに目標が動いた: " + pd.change);
  setDeload(false);

  /* ---- 8. 腕の種目は片手あたりで見せ、記録は合計（B13） ---- */
  fresh(); goTo(base);
  const ohp = catalogItem("ohp");
  ok(wShown(ohp, 10) === 5 && wStored(ohp, 5) === 10 && wUnit(ohp).indexOf("片手") >= 0, "B13: 片手あたりの表示と記録の変換がおかしい");
  const one = catalog().find(c => c.ex === "ohp" && /片手/.test(c.tag || ""));
  if(one){ const o = itemOptions(one); ok(o.length && o[0].n === 1, "B13: 片手ずつの組み方が2つ持ちになっている"); }

  /* ---- 9. 記録ボタン: 二重押し・おかしな値・日付の区切り（B12・A3） ---- */
  fresh(); goTo(base);
  tab = "today"; openEx = activeItems()[0].ex; render();
  const id = openEx;
  document.getElementById("r_" + id).value = "12";
  addSet(id); addSet(id);                                   /* 素早く2回 */
  ok(entryFor(TODAY, id, false).sets.length === 1, "B12: 二重押しで2セット入った");
  openEx = id; render();
  document.getElementById("r_" + id).value = "-3";
  lastAddAt[id] = 0; addSet(id);
  ok(entryFor(TODAY, id, false).sets.length === 1, "B12: 負の回数が記録された");
  const st1 = entryFor(TODAY, id, false).sets[0];
  ok(typeof st1.target === "number" && typeof st1.label === "string", "F1/B8: セットに目標と組み方が残っていない");
  /* 取り消し（U2） */
  delSet(id, 0);
  ok(!entryFor(TODAY, id, false) || entryFor(TODAY, id, false).sets.length === 0, "U2: 消せていない");
  ACTIONS.undodel();
  ok(entryFor(TODAY, id, false).sets.length === 1, "U2: 取り消しで戻らない");
  /* 日付の区切りをまたいでから押す */
  openEx = id; render();
  document.getElementById("r_" + id).value = "11";
  const nextDay = shift(TODAY, 1);
  todayKey = () => nextDay;                                  /* 区切りを過ぎた */
  lastAddAt[id] = 0; addSet(id);
  ok(TODAY === nextDay && (!state.sessions[nextDay] || !(state.sessions[nextDay].entries || []).some(e => e.sets.length)),
     "A3: 区切りをまたいだ記録が新しい日に入った");
  ok(/記録していません/.test(document.getElementById("view").innerText), "A3: 入力した数字を知らせていない");

  /* ---- 10. 1日の区切り（F2）: 既定は朝4時 ---- */
  todayKey = realTodayKey;
  ok(dayStartHour() === 4, "F2: 1日の区切りの既定が4時でない");

  todayKey = realTodayKey; goTo(realTodayKey());
  fresh(); render();
  window.__result = out; window.__ready = true;
})();
