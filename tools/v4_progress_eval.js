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
  /* その日のメニューを全部記録する（hitFn が無ければ、全部のセットを目標どおり） */
  const doDay = hitFn => {
    const s = session(TODAY);
    fixPlan(s);
    const items = activeItems();
    items.forEach(it => {
      const n = it.sets || 3;
      for(let k = 0; k < n; k++){
        const e = entryFor(TODAY, it.ex, false);
        const sug = suggestNext(it, e);
        const r = hitFn ? hitFn(it, sug, k) : sug.target;
        const st = {id: newSetId(), at: k, r, label: it.label || "", target: sug.target};
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

  /* ---- 2. 目標どおりに続けると、目標が1回ずつ上がり、上限で段が上がる（A2/F1） ---- */
  fresh();
  const trace = {};
  let day = shift(base, -60);
  for(let i = 0; i < 24; i++){
    goTo(day);
    const names = doDay();
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

  /* ---- 3. 目標より少なかった回は、届かなかったとは限らない（2026-10-01 本人の指摘）。実際の回数に合わせる ----
     a) 同じ重さで最後のセットだけ少ない → 同じ目標
     b) 同じ重さで全部のセットを少なく抑えた → 前回の最高の回数を目標に
     c) 重いダンベルに替えて回数が減った → その重さで始め直す（「届かなかった」扱いにしない）
     d) 同じ重さで2回続けて回数の幅の下限より少ない → 一段軽く（やさしく） */
  const ADJ = {items: [{adj: true, min: 2, max: 24, step: 2, n: 2}], updatedAt: 1};
  const rowIt = catalogRow("row", "") || catalogItem("row");
  /* ワンハンドロウを、その日の目標で記録する。repsOf(sug) がセットごとの回数、wOf(sug) が重さ（無ければ提案どおり） */
  const putRow = (d, repsOf, wOf) => {
    goTo(d);
    const e = entryFor(TODAY, "row", true), sug = suggestNext(rowIt, e);
    const w = wOf ? wOf(sug) : sug.w;
    repsOf(sug).forEach((r, k) => e.sets.push({id: newSetId(), at: k, r, w, label: "", target: sug.target}));
    resetProg();
    return sug;
  };
  const rowAt = d => { goTo(d); return progressFor(rowIt); };
  const same3 = f => sug => [f(sug), f(sug), f(sug)];
  const s3 = [shift(base, -12), shift(base, -9), shift(base, -6), shift(base, -3)];
  fresh(); state.gear = ADJ; planMemo = null; resetProg();
  putRow(s3[0], same3(x => x.target));                                   /* 目標どおり → 次は+1 */
  putRow(s3[1], x => [x.target, x.target, x.target - 2]);                 /* 最後のセットだけ少ない */
  const pa = rowAt(s3[2]);
  ok(pa.change === "hold", "3a: 同じ重さで最後のセットだけ少なかったのに、同じ目標にしない: " + pa.change + " / " + pa.why);
  fresh(); state.gear = ADJ; planMemo = null; resetProg();
  putRow(s3[0], same3(x => x.target));
  const sb1 = putRow(s3[1], same3(x => x.target - 2));                   /* 全部のセットを2回少なく抑えた */
  const pb = rowAt(s3[2]);
  ok(pb.change === "match" && pb.target === Math.max(pb.lo, sb1.target - 2),
     "3b: 少なく抑えた回数に目標を合わせない: " + pb.change + " " + pb.target + " / " + pb.why);
  fresh(); state.gear = ADJ; planMemo = null; resetProg();
  putRow(s3[0], same3(x => x.target));
  const sc1 = putRow(s3[1], same3(x => x.target - 3), x => x.w + 2);     /* 2kg重くして回数が減った */
  const pc = rowAt(s3[2]);
  ok(pc.change === "rebase" && Math.abs((pc.w || 0) - (sc1.w + 2)) < 0.01,
     "3c: 重くして回数が減った回を、その重さで始め直さない: " + pc.change + " " + pc.w + " / " + pc.why);
  ok(!/届/.test(pc.why), "3c: 重くした回を「届かなかった」と書いている: " + pc.why);
  fresh(); state.gear = ADJ; planMemo = null; resetProg();
  const lo3 = repRange("row", rowIt).lo;
  putRow(s3[0], same3(x => x.target));
  putRow(s3[1], same3(() => lo3 - 2));
  putRow(s3[2], same3(() => lo3 - 2));
  const pd3 = rowAt(s3[3]);
  ok(pd3.change === "lighter" || pd3.change === "easier",
     "3d: 同じ重さで2回続けて回数の幅の下限より少ないのに、一段下げない: " + pd3.change + " / " + pd3.why);

  /* ---- 4. きつさの入力は無い（2026-09-29 にやめた）。出来は回数だけで見る:
     全部のセットが目標に届けば次は上げ、1回だけ届かなかったなら据え置き ---- */
  const doneItems = d => (state.sessions[d].entries || []).filter(e => e.sets.length)
    .map(e => catalogRow(e.ex, setLabel(d, e.ex, e.sets[e.sets.length - 1])) || catalogItem(e.ex));
  const UPS = ["up", "heavier", "harder", "top"];
  fresh();
  goTo(shift(base, -3)); doDay();
  goTo(base);
  const done4 = doneItems(shift(base, -3)), notUp = done4.map(progressFor).filter(p => !UPS.includes(p.change));
  ok(done4.length > 0 && notUp.length === 0, "F1: 全部のセットが目標に届いたのに次の目標が上がらない: " + notUp.map(p => p.change + " / " + p.why).join("、"));
  fresh();
  goTo(shift(base, -3)); doDay((it, sug, k) => k === 2 ? Math.max(1, sug.target - 2) : sug.target);
  goTo(base);
  const done4b = doneItems(shift(base, -3)), notHold = done4b.map(progressFor).filter(p => p.change !== "hold");
  ok(done4b.length > 0 && notHold.length === 0, "F1: 1回届かなかっただけで目標が変わった: " + notHold.map(p => p.change).join("、"));

  /* ---- 5. 組み直しは何度押しても同じ（B18） ---- */
  fresh();
  goTo(shift(base, -4)); doDay();
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

  /* ---- 7. 軽い週（F5）: 種目は3つまで・セット数は3のまま・目標は据え置き ---- */
  fresh();
  goTo(shift(base, -3)); doDay();
  goTo(base);
  const before = activeItems().length;
  setDeload(true);
  replanToday();
  const act7 = activeItems();
  ok(act7.length > 0 && act7.length <= 3, "F5: 軽い週なのに種目が3つまでになっていない: " + before + " → " + act7.length);
  ok(act7.every(it => it.sets === 3), "F5: 軽い週でセット数が3から変わった: " + act7.map(it => it.sets).join(","));
  const pd = act7.length ? progressFor(act7[0]) : {change: "deload"};
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

  /* ---- 11. 更新前の形の記録（A4・B7 の前に保存されたもの） ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  fresh();
  /* 目標を書いていない古い記録（1セット目を目標とみなす）が解説の幅の外でも、目標は幅に収める */
  const oldDay = shift(TODAY, -3), gobRow = catalogRow("goblet", "");
  entryFor(oldDay, "goblet", true).sets.push(...[0, 1, 2].map(k => ({id: newSetId(), at: k, r: 18, w: 10})));
  resetProg();
  const pOld = progressFor(gobRow);
  ok(pOld.target >= pOld.lo && pOld.target <= pOld.hi,
     "B7: 目標なしの古い記録（18回）から、解説の幅の外の目標 " + pOld.target + " が出た（幅 " + pOld.lo + "〜" + pOld.hi + "）");
  /* 幅の下に外れた古い記録（5回）は、目標を幅の下限に収めて、そう理由に書く
     （18回のほうは全部届いた扱いで一段難しい組み方へ進むので、幅に収める場面にならない） */
  fresh();
  entryFor(oldDay, "goblet", true).sets.push(...[0, 1, 2].map(k => ({id: newSetId(), at: k, r: 5, w: 10})));
  resetProg();
  const pLow = progressFor(gobRow);
  ok(pLow.target === pLow.lo && /範囲（/.test(pLow.why), "B7: 幅の外の古い記録（5回）から、幅に収めたことを理由に書いていない: " + pLow.target + " / " + pLow.why);
  /* 更新前に保存した今日のメニューの行（今は無い組み方の名前・動きのID）は、今の素の組み方で出す。印は残し、セット数は3（2026-09-29 から固定） */
  session(TODAY).plan = [{ex: "goblet", label: "ゴブレットスクワット（深くしゃがむ）", lv: 1, sets: 2, r: 14, mo: "goblet_deep",
                          tag: "深くしゃがむ", note: "古い説明", manual: true}];
  planMemo = null; resetProg();
  const stale = todayItems().find(i => i.ex === "goblet") || {};
  ok((stale.label || "") === "" && !stale.mo && stale.sets === 3 && stale.manual === true && stale.note === gobRow.note,
     "A4: 保存済みの古い組み方の行が今の素の組み方で出ていない: " + JSON.stringify(stale));
  ok(/data-dia="goblet"/.test(diaHTML("goblet", false, stale, null)), "A4: 保存済みの古い組み方の行で図が出ない");

  /* ---- 12. 可変式ダンベル: 伸ばし方・文言・goblet が同じ合計なら両肩を選ぶ（C12）(G1) ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  fresh();
  state.gear = {items: [{adj:true, min:2, max:24, step:2, n:2}], updatedAt: 1};   /* 可変式2〜24kg・2kg刻み×2本のみ */
  planMemo = null; resetProg();
  const gobletRow = catalogItem("goblet");
  const adjOldDay = shift(TODAY, -3);
  entryFor(adjOldDay, "goblet", true).sets.push(
    ...[0, 1, 2].map(k => ({id: newSetId(), at: k, r: 15, target: 15, w: 10, label: ""})));
  resetProg();
  const pAdj = progressFor(gobletRow);
  ok(pAdj.change === "heavier", "G1: 可変式のみで前回全部のセットが目標に届いたのに一段重くしない: " + pAdj.change + " / " + pAdj.why);
  ok(!!pAdj.opt && Math.abs(pAdj.opt.total - 12) < 0.01, "G1: 一段重くした先が合計12kgでない: " + (pAdj.opt && pAdj.opt.total));
  ok(pAdj.target === pAdj.lo, "G1: 一段重くした直後の回数が幅の下限でない: " + pAdj.target + " / lo=" + pAdj.lo);
  ok(!!pAdj.opt && pAdj.opt.n === 2 && !pAdj.opt.mixed, "G1/C12: goblet が同じ合計でも両肩(2つ)を選ばない: " + JSON.stringify(pAdj.opt));
  ok(!!pAdj.opt && /可変式ダンベル/.test(pAdj.opt.text) && /6kgにして/.test(pAdj.opt.text),
     "G1: 使い方の文に「可変式ダンベル」と合わせる重さ(6kg)が出ない: " + (pAdj.opt && pAdj.opt.text));

  /* readGear を通しても可変式の行が失われないこと（保存→読み込み。同期・バックアップも同じ経路） */
  const rgRound = readGear({items: [{kg:5, n:2}, {adj:true, min:2, max:24, step:2, n:2}, {adj:true, n:1, list:[2.5, 3.5, 4.5]}], updatedAt:5});
  ok(!!rgRound && rgRound.items.length === 3, "readGear: 可変式を含む行数が保存→読み込みで変わった: " + JSON.stringify(rgRound));
  const rg1 = rgRound && rgRound.items[1];
  ok(!!rg1 && rg1.adj && rg1.min === 2 && rg1.max === 24 && rg1.step === 2 && rg1.n === 2,
     "readGear: 可変式(範囲)の行が保存→読み込みで変わった: " + JSON.stringify(rg1));
  const rg2 = rgRound && rgRound.items[2];
  ok(!!rg2 && rg2.adj && Array.isArray(rg2.list) && rg2.list.length === 3,
     "readGear: 可変式(list)の行が保存→読み込みで変わった: " + JSON.stringify(rg2));

  /* ---- 13. C1: 手で打った重さが使い方に無いとき、＋は次に重い方、−は次に軽い方へ ---- */
  fresh();
  state.gear = {items: [{kg:5, n:1}, {kg:9, n:1}], updatedAt: 1};   /* 5kg・9kgだけ持っている（7kgは作れない） */
  planMemo = null; resetProg();
  addToProgramToday("goblet");
  const wIn = document.getElementById("w_goblet");
  ok(!!wIn, "C1: 重量欄が見つからない");
  if(wIn){
    wIn.value = "7";
    step("w", "goblet", 1);
    ok(wIn.value === "9", "C1: 7kgから＋で次に重い9kgにならない: " + wIn.value);
    wIn.value = "7";
    step("w", "goblet", -1);
    ok(wIn.value === "5", "C1: 7kgから−で次に軽い5kgにならない: " + wIn.value);
  }

  /* ---- 14. C5: 秒の種目の±は5秒刻み（回数は1刻みのまま） ---- */
  fresh(); goTo(base);
  addToProgramToday("plank");
  const rIn = document.getElementById("r_plank");
  ok(!!rIn, "C5: 秒数欄が見つからない");
  if(rIn){
    const beforeSec = parseFloat(rIn.value);
    step("r", "plank", 1);
    ok(Math.abs(parseFloat(rIn.value) - (beforeSec + 5)) < 1e-9, "C5: 秒の種目の＋が5秒刻みでない: " + beforeSec + " → " + rIn.value);
  }
  addToProgramToday("curl");
  const rIn2 = document.getElementById("r_curl");
  if(rIn2){
    const beforeRep = parseFloat(rIn2.value);
    step("r", "curl", 1);
    ok(Math.abs(parseFloat(rIn2.value) - (beforeRep + 1)) < 1e-9, "C5: 回数の種目の＋が1刻みでなくなった: " + beforeRep + " → " + rIn2.value);
  }

  /* ---- 15. C19: ダンベルが1本も無ければ、ダンベルを使う種目・組み方は今日のメニューに出ない ---- */
  fresh();
  state.gear = {items: [], updatedAt: 1};
  planMemo = null; resetProg();
  const noDbPlan = buildPlan();
  ok(!noDbPlan.some(it => it.ex === "farmer"), "C19: ダンベル無しでファーマーズウォークが今日のメニューに出る: " + noDbPlan.map(itemName).join("、"));
  ok(!noDbPlan.some(it => it.needsDb), "C19: ダンベル無しでダンベルを使う組み方が今日のメニューに出る: " + noDbPlan.filter(it => it.needsDb).map(itemName).join("、"));
  /* 新しく空の状態から選ばれるかだけでなく、過去に「胸に重りを抱える」組み方をしていて
     伸ばし方がその組み方を today の候補にしてくる場合も、ダンベルが無ければ外れること */
  fresh(); goTo(base);
  const crunchOldDay = shift(base, -3);
  const crunchHardLabel = (VARIANT_ROWS.find(v => v.ex === "crunch" && v.needsDb) || {}).label || "";
  ok(!!crunchHardLabel, "C19: crunch の needsDb 組み方(hard)が VARIANT_ROWS に見つからない");
  entryFor(crunchOldDay, "crunch", true).sets.push(
    ...[0, 1, 2].map(k => ({id: newSetId(), at: k, r: 20, target: 20, label: crunchHardLabel || ""})));
  state.gear = {items: [], updatedAt: 1};
  planMemo = null; resetProg();
  const noDbPlan2 = buildPlan();
  ok(!noDbPlan2.some(it => it.needsDb),
     "C19: 過去に胸に重りを抱える組み方をしていても、ダンベル無しでは今日のメニューに出さない: " + noDbPlan2.filter(it => it.needsDb).map(itemName).join("、"));

  /* ---- 16. C7: 日付が変わったら、入力欄の下書きは残らない ---- */
  fresh(); goTo(shift(base, -2)); doDay();
  goTo(base);
  tab = "today"; selMuscle = null; editEx = null;
  session(TODAY).plan = [{ex: "curl", sets: 3, r: 12}];
  session(TODAY).planAt = Date.now(); planMemo = null; resetProg();
  openEx = "curl"; render();
  const curlR = document.getElementById("r_curl");
  if(curlR) curlR.value = "321";
  const nextDay3 = shift(base, 1);
  todayKey = () => nextDay3;                 /* 実際の時計は進んだが、画面はまだ前日のまま */
  render();                                  /* 日付の確認が走ったのと同じ状態 */
  ok(TODAY === nextDay3, "C7: 日付をまたいでも TODAY が更新されない");
  ok(inputDrafts.curl === undefined, "C7: 日付が変わっても前日の下書きが残っている: " + JSON.stringify(inputDrafts.curl));
  todayKey = realTodayKey; goTo(base);

  /* ---- 17. C20: 日付が変わってから確認が走るまでの間、今日のメニューを書き換えるボタンは
     前日を書き換えない（先に rollDay() を呼び、変わっていたらそこでやめる） ---- */
  const c20Check = (label, fn) => {
    fresh();
    const oldDay = shift(base, -1);
    goTo(oldDay); doDay();
    const exId = activeItems()[0].ex;
    const before = JSON.stringify(session(oldDay).plan);
    todayKey = () => base;                   /* 実際の時計は進んだが、画面はまだ前日のまま */
    fn(exId);
    ok(TODAY === base, "C20: " + label + " が rollDay を呼んでいない（前日の画面のまま処理された）");
    ok(JSON.stringify(session(oldDay).plan) === before, "C20: " + label + " が前日のメニューを書き換えた");
    todayKey = realTodayKey;
  };
  c20Check("replanToday", () => replanToday());
  c20Check("addAutoToday", () => addAutoToday());
  c20Check("ACTIONS.skip", id => ACTIONS.skip({dataset: {ex: id}}));
  c20Check("addToProgramToday", () => {
    const other = catalog().find(c => EXMAP[c.ex].kind !== "w" || gearOptions(c.ex).length);
    if(other) addToProgramToday(other.ex, other.label || "");
  });

  /* ---- 18. 部位ごとの回復の日数（RECOVER_GAP）と、量が多い日の延長 ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  const putSets = (agoDays, ex, n) => {
    const d = shift(TODAY, -agoDays), e = entryFor(d, ex, true);
    for(let k = 0; k < n; k++) e.sets.push({id: newSetId(), at: k, r: 10, label: ""});
  };
  const primHas = (plan, m) => plan.some(p => EXMAP[p.ex].p.includes(m));
  const gq = recoverGap("quads");
  fresh(); putSets(gq, "goblet", 4); planMemo = null; resetProg();
  ok(recovering("quads") && !primHas(buildPlan(), "quads"), "回復: 大腿四頭筋を" + gq + "日前にやったのに今日また主役になる（中" + gq + "日のはず）");
  fresh(); putSets(gq + 1, "goblet", 4); planMemo = null; resetProg();
  ok(!recovering("quads") && recoverDaysLeft("quads") === 0, "回復: 大腿四頭筋を" + (gq + 1) + "日前にやったのに、まだ回復の途中になっている");
  fresh(); putSets(gq + 1, "goblet", 6); planMemo = null; resetProg();
  ok(recovering("quads") && recoverDaysLeft("quads") === 1, "回復: 主役で6セット以上やった日は1日延ばすはず");
  fresh(); putSets(1, "plank", 3); planMemo = null; resetProg();
  ok(recoverGap("abs") === 0 && !recovering("abs"), "回復: 腹直筋は連日でもよいはずなのに、昨日の3セットで回復の途中になっている");
  ok(catalog().some(c => EXMAP[c.ex].p.includes("abs") && patternOf(c.ex) === "abs"),
     "回復: 腹筋の動きが候補に無い");

  /* ---- 19. 筋肉痛の部位は、今日のメニューで主役にしない。組み直すとその部位を外したメニューになり、同期で戻らないよう印が付く ---- */
  fresh(); planMemo = null; resetProg();
  const before19 = buildPlan().map(p => p.ex);
  const soreM = EXMAP[before19[0]].p[0];
  session(TODAY).sore = [soreM]; session(TODAY).soreAt = stampNow();
  planMemo = null; resetProg();
  ok(!primHas(buildPlan(), soreM), "筋肉痛: 筋肉痛と選んだ部位（" + MUSCLES[soreM] + "）が主役の種目が今日のメニューに出る");
  ok(!!exRest(before19[0]) && exRest(before19[0]).sore.includes(soreM), "筋肉痛: 種目を選ぶシートで、筋肉痛の部位の種目に印が付かない");
  replanToday();
  const s19 = session(TODAY);
  ok(Array.isArray(s19.plan) && !primHas(s19.plan.filter(p => !p.skip), soreM) && s19.planEdit > 0,
     "筋肉痛: 組み直したメニューに筋肉痛の部位が残る、または意図した変更の印（planEdit）が無い");
  /* 全部の部位を筋肉痛にして組み直すと、空のメニューも保存する（保存しないと同期でほかの端末のメニューが戻る） */
  s19.sore = Object.keys(MUSCLES); s19.soreAt = stampNow();
  replanToday();
  ok(Array.isArray(session(TODAY).plan) && session(TODAY).plan.filter(p => !p.skip).length === 0 && session(TODAY).planEdit > 0,
     "組み直し: 空になったメニューが保存されていない");

  /* ---- 20. セット数は3で固定。2セット目からは前のセットの重さ・回数をそのまま入れる（2026-09-29） ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  fresh(); planMemo = null; resetProg();
  const p20 = buildPlan();
  ok(p20.length > 0 && p20.every(it => it.sets === 3), "3セット: セット数が3でない種目がある: " + p20.map(it => itemName(it) + "×" + it.sets).join("、"));
  const it20 = p20.find(it => EXMAP[it.ex].kind === "w" && itemOptions(it).length > 1) || p20[0];
  if(it20){
    const e20 = {ex: it20.ex, sets: []}, kind20 = EXMAP[it20.ex].kind;
    const s20a = suggestNext(it20, e20);
    const other = s20a.opt ? (itemOptions(it20).find(o => Math.abs(o.total - s20a.w) > 0.01) || s20a.opt) : null;
    const prevR = s20a.target - (kind20 === "t" ? 10 : 2);
    e20.sets.push({id: newSetId(), at: 1, r: prevR, w: other ? other.total : undefined, target: s20a.target, label: it20.label || ""});
    const s20b = suggestNext(it20, e20);
    ok(s20b.r === clampR(kind20, prevR) && s20b.target === s20a.target && (!other || Math.abs(s20b.w - other.total) < 0.01),
       "2セット目: 前のセットの数字がそのまま入らない: " + itemName(it20) + " " + JSON.stringify({prevR, prevW: other && other.total, r: s20b.r, w: s20b.w, target: s20b.target}));
    ok(s20b.src === "目標は" + s20a.target + unitOf(kind20), "2セット目: 今日の目標が出ない: " + s20b.src);
  }

  /* ---- 21. 前の版で保存したメニューの行が5セット（grow の名残・古い版の端末から同期）でも、3セット全部届けば上げる ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  fresh();
  const d21 = shift(TODAY, -3), row21 = catalogRow("pushup", "") || catalogItem("pushup"), t21 = midTarget(row21);
  session(d21).plan = [{ex: "pushup", sets: 5, r: t21}];
  entryFor(d21, "pushup", true).sets.push(...[0, 1, 2].map(k => ({id: newSetId(), at: k, r: t21, target: t21, label: ""})));
  resetProg();
  const p21 = progressFor(row21);
  ok(UPS.includes(p21.change), "3セット: 保存済みの行が5セットでも、3セット全部届いたのに上げない: " + p21.change + " / " + p21.why);

  /* ---- 22. 軽い週を勧めるのは、同じ重さで1セットあたりの回数が2回続けて減った動きが2つ以上あるときだけ（2026-10-01） ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  const put22 = (ago, ex, reps, w) => {
    const e = entryFor(shift(TODAY, -ago), ex, true);
    reps.forEach((r, k) => e.sets.push({id: newSetId(), at: k, r, w, label: "", target: 12}));
  };
  const deloadFor = fill => { fresh(); state.gear = ADJ; fill(); planMemo = null; resetProg(); return deloadAdvice(); };
  const da = deloadFor(() => {
    put22(9, "row", [12, 12, 12], 10); put22(6, "row", [11, 11, 11], 10); put22(3, "row", [10, 10, 10], 10);
    put22(9, "ohp", [12, 12, 12], 8);  put22(6, "ohp", [11, 11, 10], 8);  put22(3, "ohp", [10, 9, 9], 8);
  });
  ok(!!da && da.suggest && da.patterns.length >= 2, "軽い週: 同じ重さで回数が2回続けて減った動きが2つあるのに勧めない: " + JSON.stringify(da));
  if(da && da.suggest){
    tab = "today"; openEx = null; render();
    const v22 = document.getElementById("view").innerText;
    ok(/今週を軽めの週/.test(v22) && !/半分|しるし/.test(v22), "軽い週: 今日タブの勧める文が古い: " + (v22.match(/[^\n]*軽めの週[^\n]*/) || [""])[0]);
  }
  const dHeavy = deloadFor(() => {
    put22(9, "row", [12, 12, 12], 10); put22(6, "row", [9, 9, 8], 12);   put22(3, "row", [8, 8, 8], 12);
    put22(9, "ohp", [12, 12, 12], 8);  put22(6, "ohp", [9, 8, 8], 10);   put22(3, "ohp", [8, 8, 7], 10);
  });
  ok(!dHeavy, "軽い週: 重いダンベルに替えて回数が減っただけなのに勧める: " + JSON.stringify(dHeavy));
  const dCap = deloadFor(() => {
    put22(9, "row", [12, 12, 12], 10); put22(6, "row", [10, 10, 10], 10); put22(3, "row", [10, 10, 10], 10);
    put22(9, "ohp", [12, 12, 12], 8);  put22(6, "ohp", [10, 10, 10], 8);  put22(3, "ohp", [10, 10, 10], 8);
  });
  ok(!dCap, "軽い週: 回数を抑えて同じ数で続けただけなのに勧める: " + JSON.stringify(dCap));
  const dShort = deloadFor(() => {
    /* 目標（12）より少ないが、回数は減っていない */
    put22(9, "row", [10, 10, 9], 10);  put22(6, "row", [10, 10, 9], 10);  put22(3, "row", [10, 10, 10], 10);
    put22(9, "ohp", [9, 9, 8], 8);     put22(6, "ohp", [9, 9, 8], 8);     put22(3, "ohp", [9, 9, 9], 8);
  });
  ok(!dShort, "軽い週: 目標より少ないだけで回数は減っていないのに勧める: " + JSON.stringify(dShort));

  /* ---- 23. 推移: 今は無いやり方の名前（09-27 に変えた名前）で記録したセットは、基本のやり方のカードに入る（2026-10-01） ---- */
  todayKey = realTodayKey; goTo(realTodayKey());
  fresh();
  const oldLabel = "ゴブレットスクワット（深くしゃがむ）";
  ok(!catalogRow("goblet", oldLabel), "推移: 古いやり方の名前が今も種目表にある（この検査の前提が崩れた）");
  const put23 = (ago, label, r) => {
    const e = entryFor(shift(TODAY, -ago), "goblet", true);
    [0, 1, 2].forEach(k => e.sets.push({id: newSetId(), at: k, r, w: 10, label}));
  };
  put23(9, oldLabel, 12); put23(6, oldLabel, 13); put23(3, "", 13);
  resetProg();
  const cards23 = trendCards(sortedDates()).match(/<h4>[^<]*<\/h4>/g) || [];
  ok(cards23.length === 1 && !/深くしゃがむ/.test(cards23.join("")), "推移: 古いやり方の名前の記録が別のカードに分かれる: " + cards23.join(" "));
  ok(historySetsFor("goblet", "").length === 9, "推移: 基本のやり方の記録に、古い名前で記録したセットが入らない: " + historySetsFor("goblet", "").length);

  todayKey = realTodayKey; goTo(realTodayKey());
  fresh(); render();
  window.__result = out; window.__ready = true;
})();
