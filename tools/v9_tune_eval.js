/* 設定の「メニューと目標の決め方」（rules.js の state.tune）の検査（2026-10-10）。
   dist/local/training-log.html の中で動かす。fails が空で合格。
   1. 初めの設定: 何も入っていないとき・中身が空のまとまりだけ入っているときで、21日ぶんのメニューと目標がまったく同じ
   2. 種目の出やすさ: 「よく出す」にした動きは回数が増える。入れられる（planWhy の理由が ""）のに入っていない日が無い。
      「あまり出さない」にした動きは回数が減る
   3. 反対の部位: そろえない設定では、組が1つもできず、今日タブの一行も提案タブの説明も出ない。戻すと組ができる
   4. 回復の日数: 変えた部位は、その日数だけ空けてからメインで鍛える。からだタブ・提案タブの説明（recoverGroups）も同じ値。
      範囲の外の値・数でない値は、初めの設定の日数として読む
   5. 増え方: 2回ずつ増やす設定では目標が2回増え、上限のひとつ手前からは上限で止まる（飛び越えて次の段階へ進まない）。
      上限に届いたときの進み方（重くする／難しいやり方）が設定どおりで、提案タブの「次の段階まで」と説明文も同じ
   6. 保存: 形の合わない値は sanitizeState で落ちる。まとまりごとに新しい方が残る（mergeState）
   7. 画面（提案タブ。設定のシートには残っていない）: 選択の値が、どれも読み出しの関数と同じ。選択を変えると保存され、今日のメニューが組み直る。
      「初めの設定に戻す」で全部戻る */
setTimeout(() => {
  const out = {fails: [], counts: {}};
  const need = (cond, msg) => { if(!cond) out.fails.push(msg); };
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; fresh();
  };
  const doAll = plan => plan.forEach(it => {
    const sug = suggestNext(it, entryFor(TODAY, it.ex, false)), e = entryFor(TODAY, it.ex, true);
    for(let k = 0; k < (it.sets || 3); k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target};
      if(sug.opt) st.w = sug.w;
      e.sets.push(st);
    }
  });
  const reset = (tune, gear) => {
    state.sessions = {}; state.gear = {items: gear || [{kg: 5, n: 2}], updatedAt: 1};
    delete state.exOff;
    if(tune) state.tune = JSON.parse(JSON.stringify(tune)); else delete state.tune;
    openEx = null; editEx = null; fresh();
  };
  const schedules = {"毎日": d => true, "週3": d => [0, 2, 4].includes(d % 7)};
  /* days 日ぶん全部こなして、日ごとの {plan, why, targets} を返す */
  const run = (tune, name, days, each) => {
    reset(tune);
    const log = [];
    for(let day = 0; day < days; day++){
      if(schedules[name](day)){
        planWhy = {}; planMemo = null;
        const plan = buildPlan(), W = planWhy;
        planWhy = null;
        const row = {day, plan: plan.map(itemKey), why: W, targets: plan.map(it => progressFor(it).target)};
        if(each) each(plan, row);
        log.push(row);
        fixPlan(session(TODAY));
        doAll(plan);
      }
      nextDay();
    }
    return log;
  };
  const count = (log, pat) => log.filter(r => r.plan.some(k => patternOf(k.split("|")[0]) === pat)).length;
  const key = log => JSON.stringify(log.map(r => [r.plan, r.targets]));

  /* ---- 1. 初めの設定 ---- */
  const empty = {pref: {map: {}, updatedAt: 5}, pair: {updatedAt: 5}, gap: {map: {}, updatedAt: 5}, prog: {updatedAt: 5}};
  const base = {};
  Object.keys(schedules).forEach(name => {
    base[name] = run(null, name, name === "毎日" ? 21 : 35);
    if(name === "毎日") need(key(base[name]) === key(run(empty, name, 21)), "中身が空の設定で、メニューか目標が変わった");
  });
  need(!tuneChanged() && ["pref", "pair", "gap", "prog"].every(tuneIsDefault), "中身が空の設定を、変えた設定として数えている");
  need(pairOn() && progGain("w") === 1 && progGain("t") === 5 && progFirst() === "heavier" && patPref("squat") === 0, "初めの設定の値が違う");
  Object.keys(MUSCLES).forEach(m => need(recoverGap(m) === recoverGapDefault(m), "初めの設定の回復の日数が違う: " + m));

  /* ---- 2. 種目の出やすさ ---- */
  const upLog = run({pref: {map: {deadlift: 1}, updatedAt: 1}}, "週3", 35, (plan, row) => {
    need(!(row.why.deadlift === ""), "「よく出す」の動きが、入れられるのに入っていない（" + row.day + "日目）");
  });
  out.counts.deadlift = count(base["週3"], "deadlift") + "→" + count(upLog, "deadlift");
  need(count(upLog, "deadlift") > count(base["週3"], "deadlift"), "「よく出す」にしても回数が増えない: " + out.counts.deadlift);
  const dnLog = run({pref: {map: {curl: -1, raise: -1}, updatedAt: 1}}, "毎日", 21);
  out.counts.curl = count(base["毎日"], "curl") + "→" + count(dnLog, "curl");
  out.counts.raise = count(base["毎日"], "raise") + "→" + count(dnLog, "raise");
  need(count(base["毎日"], "curl") >= 3 && count(dnLog, "curl") < count(base["毎日"], "curl") / 2, "「あまり出さない」にしても回数が減らない: " + out.counts.curl);
  need(count(dnLog, "raise") < count(base["毎日"], "raise") / 2, "「あまり出さない」にしても回数が減らない: " + out.counts.raise);
  reset({pref: {map: {curl: 3, hinge: "1", lunge: -1}, updatedAt: 1}});
  need(patPref("curl") === 0 && patPref("hinge") === 0 && patPref("lunge") === -1 && exPref("sidelunge") === -1, "出やすさの形の合わない値をそのまま使っている");

  /* ---- 3. 反対の部位 ---- */
  let offPairs = 0, offLines = 0;
  run({pair: {off: true, updatedAt: 1}}, "毎日", 14, plan => {
    offPairs += menuPairs(plan).length + (plan.length - unpaired(plan).length);
    fixPlan(session(TODAY)); tab = "today"; openEx = null;
    offLines += (viewToday().match(/反対の部位を使う種目です/g) || []).length;
  });
  need(offPairs === 0 && offLines === 0, "そろえない設定なのに、組ができた・今日タブに一行が出た: " + offPairs + "/" + offLines);
  need(!pairOn() && !opposite("pushup", "row") && !opposite("curl", "triext"), "そろえない設定で opposite が真のまま");
  doAll(buildPlan()); fresh(); tab = "plan";
  need(!/反対の部位（胸と背中、上腕二頭筋と上腕三頭筋など）を鍛える種目は/.test(viewPlan()), "そろえない設定なのに、提案タブに反対の部位の説明が出ている");
  state.tune = {pair: {updatedAt: 2}}; fresh();
  need(pairOn() && opposite("pushup", "row") && /反対の部位/.test(viewPlan()), "反対の部位を戻しても、組・説明が戻らない");
  let onPairs = 0;
  run({pair: {updatedAt: 2}}, "毎日", 14, plan => { onPairs += menuPairs(plan).length; });
  need(onPairs > 0, "反対の部位を戻しても、組ができない");
  out.counts.pairs = onPairs;

  /* ---- 4. 回復の日数 ---- */
  const lastMain = {};
  let quadDays = 0;
  run({gap: {map: {quads: 5, chest: 0}, updatedAt: 1}}, "毎日", 35, (plan, row) => {
    if(plan.some(it => EXMAP[it.ex].p.includes("quads"))){
      if(lastMain.quads !== undefined) need(row.day - lastMain.quads >= 6, "大腿四頭筋を中5日にしたのに、" + (row.day - lastMain.quads - 1) + "日しか空けていない（" + row.day + "日目）");
      lastMain.quads = row.day; quadDays++;
    }
  });
  need(quadDays >= 3, "検査の前提: 大腿四頭筋をメインで鍛える日が3日以上（" + quadDays + "）");
  need(recoverGap("quads") === 5 && recoverGap("chest") === 0 && recoverGap("glutes") === recoverGapDefault("glutes"), "回復の日数が設定どおりでない");
  const groups = recoverGroups();
  need(groups[0].gap === 5 && groups[0].muscles.join() === "quads" && groups.find(g => g.gap === 0).muscles.includes("chest"), "回復の目安のまとまり（recoverGroups）が設定と違う");
  need(recoverGapText().indexOf("中5日: " + MUSCLES.quads) === 0, "提案タブの説明が設定と違う: " + recoverGapText().slice(0, 30));
  let chestStreak = 0;
  const cLog = run({gap: {map: {chest: 0}, updatedAt: 1}}, "毎日", 14);
  cLog.forEach((r, i) => { if(i && [r, cLog[i - 1]].every(x => x.plan.some(k => EXMAP[k.split("|")[0]].p.includes("chest")))) chestStreak++; });
  need(chestStreak > 0, "胸を連日でもよいにしても、続けて入る日が無い");
  reset({gap: {map: {quads: 9, glutes: -1, hams: 1.5, chest: "0"}, updatedAt: 1}});
  ["quads", "glutes", "hams", "chest"].forEach(m => need(recoverGap(m) === recoverGapDefault(m), "回復の日数の範囲の外の値をそのまま使っている: " + m));

  /* ---- 5. 増え方 ---- */
  const adj = [{adj: true, n: 2, min: 2, max: 20, step: 2}];
  /* 前の日に、その組み方を目標どおり（全部のセットで target 回）やったことにして、今日の目標を見る */
  const after = (tune, exId, target) => {
    reset(tune, adj);
    const item = catalogItem(exId), opt = defaultOptionFor(item), d = shiftKey(TODAY, -3);
    const sets = [0, 1, 2].map(k => { const st = {id: "t" + k, at: k, r: target, label: "", target}; if(opt) st.w = opt.total; return st; });
    state.sessions[d] = {date: d, entries: [{ex: exId, sets}], plan: [{ex: exId, sets: 3}]};
    fresh();
    return progressFor(catalogItem(exId));
  };
  const rr = repRange("goblet", catalogItem("goblet")), two = {prog: {step: 2, updatedAt: 1}};
  need(rr.hi - rr.lo >= 3, "検査の前提: ゴブレットスクワットの回数の範囲が3回以上");
  let p = after(null, "goblet", rr.lo);
  need(p.target === rr.lo + 1 && p.change === "up" && /1回増やします/.test(p.why), "初めの設定で、目標が1回増えない: " + p.target + " " + p.why);
  p = after(two, "goblet", rr.lo);
  need(p.target === rr.lo + 2 && p.change === "up" && /2回増やします/.test(p.why) && p.step === 2, "2回ずつの設定で、目標が2回増えない: " + p.target + " " + p.why);
  p = after(two, "goblet", rr.hi - 1);
  need(p.target === rr.hi && p.change === "up" && /1回増やします/.test(p.why), "2回ずつの設定で、上限のひとつ手前から上限で止まらない: " + p.target + " " + p.change);
  const tr = repRange("plank", catalogItem("plank"));
  p = after(two, "plank", tr.lo);
  need(p.target === tr.lo + 10 && /10秒増やします/.test(p.why), "2回ずつの設定で、秒の種目が10秒増えない: " + p.target);
  need(progGain("w") === 2 && progGain("t") === 10 && progStep("w") === 1 && progStep("t") === 5, "増やす数の読み出しが違う（入力欄の刻みは変えない）");
  /* 上限に届いたとき */
  p = after(null, "goblet", rr.hi);
  need(p.change === "heavier" && p.opt && p.target === rr.lo, "初めの設定で、上限に届いたのにダンベルを重くしない: " + p.change);
  tab = "plan";
  const rowOf = () => ladderRows().find(r => r.pat === "squat");
  need(/一段重く/.test(rowOf().next) && /無理なく重くできれば重く/.test(viewPlan()), "提案タブ（初めの設定）が、重くする進み方と合わない");
  const hardFirst = {prog: {first: "harder", updatedAt: 1}};
  p = after(hardFirst, "goblet", rr.hi);
  need(p.change === "harder" && p.next && itemLevel(p.next) > itemLevel(catalogItem("goblet")), "難しいやり方を先にする設定で、難しいやり方へ進まない: " + p.change);
  /* 提案タブの行は、今日やるやり方（進んだ先）で出る */
  need(itemKey(rowOf().item) === itemKey(p.next) && /一段難しいやり方に進みます。難しいやり方が無いときは、/.test(viewPlan()), "提案タブが、難しいやり方を先にする進み方と合わない: " + itemName(rowOf().item));
  const gb = catalogItem("goblet"), gopts = itemOptions(gb);
  need(itemKey(nextUp(gb, defaultOptionFor(gb), gopts).item || {ex: ""}) === itemKey(p.next), "次に進む先（nextUp）が、目標の決め方と違う");
  need(patternNext("squat") && itemKey(patternNext("squat")) === itemKey(p.next), "難しいやり方を先にする設定が、メニューで選ぶやり方に効いていない");
  p = after({prog: {step: 2, first: "harder", updatedAt: 1}}, "goblet", rr.lo);
  need(p.target === rr.lo + 2, "増やす数と進み方を両方変えると、増やす数が効かない");
  need(/次は2回（秒の種目は10秒）増やします/.test(viewPlan()), "提案タブの説明の増やす数が設定と違う");
  /* 続けて何回届いたら上げるか・増やさない・上限のまま・二段重く（2026-10-11）。
     days: 新しい順に [目標, 重さの段（省けば初めの持ち方）]。どの日も全部のセットで目標どおり */
  const afterDays = (tune, exId, days) => {
    reset(tune, adj);
    const item = catalogItem(exId), opts = itemOptions(item), base = opts.length ? optionIndex(opts, defaultOptionFor(item)) : -1;
    days.forEach((dy, n) => {
      const d = shiftKey(TODAY, -3 * (n + 1)), target = dy[0], opt = base >= 0 ? opts[base + (dy[1] || 0)] : null;
      const sets = [0, 1, 2].map(k => { const st = {id: "t" + n + k, at: k, r: target, label: "", target}; if(opt) st.w = opt.total; return st; });
      state.sessions[d] = {date: d, entries: [{ex: exId, sets}], plan: [{ex: exId, sets: 3}]};
    });
    fresh();
    return progressFor(catalogItem(exId));
  };
  const need2 = {prog: {need: 2, updatedAt: 1}}, need3 = {prog: {need: 3, step: 2, updatedAt: 1}};
  p = afterDays(need2, "goblet", [[rr.lo]]);
  need(p.target === rr.lo && p.change === "hold" && p.run === 1 && /あと1回続けて届いたら/.test(p.why), "2回続けての設定で、1回届いただけで上げた: " + p.target + " " + p.change);
  const leftOf = () => +(/あと(\d+)回のトレーニング/.exec(rowOf().next) || [0, -1])[1];
  need(leftOf() === (rr.hi - rr.lo) * 2 + 1, "提案タブの「あと何回」が、2回続けての設定と合わない: " + rowOf().next);
  need(/同じやり方・同じ重さで、2回続けて全部のセットが目標に届いたら/.test(viewPlan()), "提案タブの説明が、2回続けての設定と違う");
  p = afterDays(need2, "goblet", [[rr.lo], [rr.lo]]);
  need(p.target === rr.lo + 1 && p.change === "up" && p.run === 0, "2回続けて届いたのに上げない: " + p.target + " " + p.change);
  need(leftOf() === (rr.hi - rr.lo - 1) * 2 + 2, "提案タブの「あと何回」が、上げた直後の回数と合わない: " + rowOf().next);
  p = afterDays(need2, "goblet", [[rr.lo + 1], [rr.lo]]);
  need(p.target === rr.lo + 1 && p.change === "hold", "目標を上げて1回目なのに、前の目標の回を数えた: " + p.target);
  p = afterDays(need2, "goblet", [[rr.lo, 1], [rr.lo, 0]]);
  need(p.target === rr.lo && p.change === "hold", "重さを変えて1回目なのに、前の重さの回を数えた: " + p.target + " " + p.change);
  p = afterDays(need3, "goblet", [[rr.lo], [rr.lo]]);
  need(p.target === rr.lo && p.run === 2 && /あと1回続けて/.test(p.why), "3回続けての設定で、2回で上げた");
  p = afterDays(need3, "goblet", [[rr.lo], [rr.lo], [rr.lo]]);
  need(p.target === rr.lo + 2 && p.change === "up", "3回続けて届いたのに、2回ぶん上げない: " + p.target);
  p = afterDays(need2, "goblet", [[rr.hi], [rr.hi]]);
  need(p.change === "heavier" && p.target === rr.lo, "2回続けて上限に届いたのに重くしない: " + p.change);
  p = afterDays(need2, "goblet", [[rr.hi]]);
  need(p.change === "hold" && p.target === rr.hi && leftOf() === 1, "上限に1回届いただけで重くした・「あと何回」が違う: " + p.change + " " + rowOf().next);
  /* 3回ずつ・増やさない */
  p = after({prog: {step: 3, updatedAt: 1}}, "goblet", rr.lo);
  need(p.target === Math.min(rr.hi, rr.lo + 3) && p.change === "up", "3回ずつの設定で、3回増えない: " + p.target);
  const zero = {prog: {step: 0, updatedAt: 1}};
  /* 回数・重さ・やり方は別々に選べる（2026-10-11）。回数だけ増やさない: 目標に届いたら、回数はそのままで重くする */
  p = after(zero, "goblet", rr.lo + 1);
  need(p.change === "heavier" && p.target === rr.lo + 1 && p.opt && /全部のセットで目標に届いたので、ダンベルを一段重くします。回数は\d+回のままです/.test(p.why) && progGain("w") === 0 && progGain("t") === 0,
    "回数を増やさない設定で、目標に届いても重くしない・回数が変わった: " + p.change + " " + p.target + " " + p.why);
  need(/あと1回のトレーニングで、ダンベルを一段重く/.test(rowOf().next) && /回数は増やさずに、持っているダンベルで無理なく重くできれば重く/.test(viewPlan()), "提案タブが、回数を増やさない設定と合わない: " + rowOf().next);
  p = afterDays({prog: {step: 0, need: 2, updatedAt: 1}}, "goblet", [[rr.lo]]);
  need(p.change === "hold" && p.run === 1 && /あと1回のトレーニングで、ダンベルを一段重く/.test(rowOf().next), "回数を増やさず2回続けての設定で、1回で重くした: " + p.change + " " + rowOf().next);
  /* 回数も重さも増やさず、やり方だけ進む */
  p = after({prog: {step: 0, jump: 0, updatedAt: 1}}, "goblet", rr.lo + 1);
  need(p.change === "harder" && p.next && p.target === rr.lo + 1 && p.opt && Math.abs(p.w - defaultOptionFor(gb).total) < 0.01, "回数も重さも増やさない設定で、難しいやり方へ進まない: " + p.change);
  /* 全部増やさない: 同じ目標のまま */
  const none = {prog: {step: 0, jump: 0, first: "keep", updatedAt: 1}};
  p = after(none, "goblet", rr.lo);
  need(p.target === rr.lo && p.change === "hold" && !p.next && /目標は変えずに続けます/.test(p.why), "全部増やさない設定で、目標が変わった: " + p.target + " " + p.change);
  need(rowOf().next === "目標は" + rr.lo + "回のまま続けます" && /回数は増やさず、同じ目標で続けます/.test(viewPlan()), "提案タブが、全部増やさない設定と合わない: " + rowOf().next);
  /* 重さだけ増やさない: 回数は増え、上限に届いたら難しいやり方へ */
  const noKg = {prog: {jump: 0, updatedAt: 1}};
  p = after(noKg, "goblet", rr.lo);
  need(p.target === rr.lo + 1 && p.change === "up" && progJump() === 0, "重くしない設定で、回数が増えない: " + p.target);
  p = after(noKg, "goblet", rr.hi);
  need(p.change === "harder" && p.next && !/重く/.test(p.why), "重くしない設定で、上限に届いたのに難しいやり方へ進まない・重くした: " + p.change + " " + p.why);
  need(/回数が範囲の上限に届いたら、同じ動きの一段難しいやり方に進みます。/.test(viewPlan()), "提案タブの説明が、重くしない設定と違う");
  /* やり方だけ変えない: 重くできるうちは重く、できなくなったら上限のまま */
  const noWay = {prog: {first: "keep", updatedAt: 1}};
  p = after(noWay, "goblet", rr.hi);
  need(p.change === "heavier" && /無理なく重くできれば重くします。/.test(viewPlan()), "やり方を変えない設定で、重くしない: " + p.change);
  reset(noWay, [{kg: 5, n: 1}]);
  const lone = itemOptions(gb);
  need(nextUp(gb, lone[lone.length - 1], lone).stay === true && !nextUp(gb, lone[lone.length - 1], lone).item, "やり方を変えない設定で、重くできないときに難しいやり方へ進む");
  /* 重さもやり方も上げない（10-11 00:12 の版が保存した first:"stay" も同じに読む） */
  const stay = {prog: {jump: 0, first: "keep", updatedAt: 1}};
  reset({prog: {first: "stay", updatedAt: 1}});
  need(progJump() === 0 && progFirst() === "keep" && !tuneIsDefault("prog"), "前の版の「上限のまま続ける」を、重くしない・やり方を変えないとして読んでいない");
  p = after(stay, "goblet", rr.hi);
  need(p.change === "top" && p.stay && p.target === rr.hi && !p.next && /上限のまま続けます/.test(p.why) && !/一番上の段階/.test(p.why), "上限のまま続ける設定で、先へ進んだ: " + p.change + " " + p.why);
  need(/のまま続けます/.test(rowOf().next) && !/一番上の段階/.test(rowOf().next) && /回数が範囲の上限に届いたら、上限のまま続けます/.test(viewPlan()), "提案タブが、上限のまま続ける設定と合わない: " + rowOf().next);
  p = after(stay, "goblet", rr.lo);
  need(p.target === rr.lo + 1 && !/次の段階/.test(p.why) && /届いたあとは、上限のまま続けます/.test(rowOf().next), "上限のまま続ける設定で、上限までの行が違う: " + rowOf().next);
  /* 二段重く: 上がり幅が目安に収まれば二段、収まらなければ一段 */
  const jump2 = {prog: {jump: 2, updatedAt: 1}};
  const one = after(null, "goblet", rr.hi), i0 = optionIndex(gopts, defaultOptionFor(gb));
  p = after(jump2, "goblet", rr.hi);
  const far = gopts[i0 + 2], fits = !!far && (far.key <= gopts[i0].key * PROG.jumpRatio * PROG.jumpRatio || far.key - gopts[i0].key <= PROG.jumpKg * 2);
  need(one.change === "heavier" && Math.abs(one.w - gopts[i0 + 1].total) < 0.01 && /一段重くします/.test(one.why), "初めの設定で、一段重くならない");
  need(fits, "検査の前提: 二段上の重さが目安に収まる");
  need(p.change === "heavier" && Math.abs(p.w - far.total) < 0.01 && /二段重くします/.test(p.why) && p.steps === 2 && one.steps === 1, "二段重くする設定で、二段重くならない: " + p.w + " " + p.why);
  p = after(jump2, "goblet", rr.lo);
  need(/ダンベルを二段重くします。次の重さは「/.test(rowOf().next) && rowOf().next.includes(far.text) && /無理なく重くできれば二段（重すぎるときは一段）重く/.test(viewPlan()), "提案タブが、二段重くする設定と合わない: " + rowOf().next);
  reset(jump2, [{kg: 5, n: 1}, {kg: 7, n: 1}, {kg: 20, n: 1}]);
  const fo = itemOptions(gb), fw = nextUp(gb, fo[0], fo);
  need(fo.length >= 3 && fw.opt && fw.steps === 1 && optionIndex(fo, fw.opt) === 1, "二段上が重すぎるのに、一段にしない: " + JSON.stringify(fo.map(o => o.key)) + " " + JSON.stringify(fw.steps));

  /* ---- 6. 保存 ---- */
  const dirty = sanitizeState({sessions: {}, tune: {
    pref: {map: {curl: -1, "<b>": 1, hinge: 2, lunge: "1"}, updatedAt: "7", junk: 1},
    gap: {map: {quads: 4, glutes: 6, hams: 1.5, "QUADS": 1, chest: "0"}, updatedAt: 8},
    pair: {off: "yes", updatedAt: 9}, prog: {step: 4, need: 1, jump: 3, first: "easier", updatedAt: 10}, other: {x: 1}}});
  const t = dirty.tune || {};
  need(JSON.stringify(t.pref) === JSON.stringify({map: {curl: -1, lunge: 1}, updatedAt: 7}), "sanitize: 出やすさ " + JSON.stringify(t.pref));
  need(JSON.stringify(t.gap) === JSON.stringify({map: {quads: 4, chest: 0}, updatedAt: 8}), "sanitize: 回復の日数 " + JSON.stringify(t.gap));
  need(JSON.stringify(t.pair) === JSON.stringify({updatedAt: 9}) && JSON.stringify(t.prog) === JSON.stringify({updatedAt: 10}) && !("other" in t), "sanitize: 反対の部位・増え方 " + JSON.stringify(t));
  need(sanitizeState({sessions: {}}).tune === undefined && sanitizeState({sessions: {}, tune: "x"}).tune === undefined, "sanitize: 設定が無いのに作った");
  const keep = sanitizeState({sessions: {}, tune: {pair: {off: true, updatedAt: 3}, prog: {step: 2, first: "harder", updatedAt: 4}}}).tune;
  need(keep.pair.off === true && keep.prog.step === 2 && keep.prog.first === "harder", "sanitize: 正しい値を落とした");
  const keep2 = sanitizeState({sessions: {}, tune: {prog: {step: 0, need: 3, jump: 2, first: "stay", updatedAt: 4}}}).tune.prog;
  need(keep2.step === 0 && keep2.need === 3 && keep2.jump === 2 && keep2.first === "stay", "sanitize: 増え方の正しい値を落とした " + JSON.stringify(keep2));
  const keep3 = sanitizeState({sessions: {}, tune: {prog: {jump: 0, first: "keep", updatedAt: 4}}}).tune.prog;
  need(keep3.jump === 0 && keep3.first === "keep", "sanitize: 重くしない・やり方を変えないを落とした " + JSON.stringify(keep3));
  if(typeof mergeState === "function"){
    const A = {sessions: {}, tune: {pref: {map: {curl: 1}, updatedAt: 10}, gap: {map: {quads: 2}, updatedAt: 5}}};
    const B = {sessions: {}, tune: {gap: {map: {}, updatedAt: 20}, pair: {off: true, updatedAt: 1}}};
    const m1 = mergeState(A, B).tune, m2 = mergeState(B, A).tune;
    need(m1 && m1.pref.map.curl === 1 && !Object.keys(m1.gap.map).length && m1.gap.updatedAt === 20 && m1.pair.off === true, "merge: まとまりごとに新しい方が残らない " + JSON.stringify(m1));
    need(JSON.stringify(m1) === JSON.stringify(m2) || stableKey(m1) === stableKey(m2), "merge: どちらの端末で合流するかで結果が違う");
    need(mergeState({sessions: {}}, {sessions: {}}).tune === undefined, "merge: どちらにも無い設定を作った");
    need(mergeState(A, {sessions: {}}).tune.pref.map.curl === 1, "merge: 片側にしか無い設定が消えた");
  }else need(false, "mergeState が無い（この検査は dist/local で回す）");

  /* ---- 7. 画面 ---- */
  reset({pref: {map: {deadlift: 1, curl: -1}, updatedAt: 1}, gap: {map: {quads: 2}, updatedAt: 1}, pair: {off: true, updatedAt: 1}, prog: {step: 2, updatedAt: 1}});
  /* 2026-10-11 本人の要望で、設定のシートから提案タブへ移した。設定のシートには残っていないこと */
  tab = "today";
  openSettings();
  need(!sheetInner.querySelector("select[data-tune]") && !sheetInner.querySelector("[data-act=exoff]") && !!sheetInner.querySelector("[data-settings]"), "設定のシートに、提案タブへ移した項目が残っている");
  closeSettings(); sheet.classList.remove("on");
  tab = "plan"; render();
  const planView = document.getElementById("view");      /* この節の中では、提案タブの中身を見る */
  const q = k => planView.querySelector('select[data-tune="' + k + '"]');
  const all = Array.from(planView.querySelectorAll("select[data-tune]"));
  need(planView.querySelectorAll("[data-act=exoff]").length === EX.length, "提案タブに「メニューに入れない種目」の押しボタンがそろっていない");
  const pats = PATTERN_ORDER.filter(pat => EX.some(e => !e.base && patternOf(e.id) === pat));
  need(all.length === 5 + Object.keys(MUSCLES).length + pats.length, "設定の選択の数が違う: " + all.length);
  need(EX.filter(e => !e.base).every(e => pats.includes(patternOf(e.id))), "出やすさの一覧に出ない種目がある");
  const shownOk = () => q("pair").value === (pairOn() ? "1" : "0") && q("step").value === String(progGain("w")) && q("first").value === progFirst() && q("need").value === String(progNeed()) && q("jump").value === String(progJump())
    && Object.keys(MUSCLES).every(m => q("gap:" + m).value === String(recoverGap(m))) && pats.every(pat => q("pref:" + pat).value === String(patPref(pat)));
  need(shownOk(), "設定の選択の値が、読み出しの関数と合わない");
  need(!!planView.querySelector("[data-act=tunereset]"), "変えた設定があるのに「初めの設定に戻す」が出ない");
  Object.keys(MUSCLES).forEach(m => {
    const was = planView.querySelector(`[data-gapwas="${m}"]`);
    need(!!was === (recoverGap(m) !== recoverGapDefault(m)) && (!was || was.textContent.includes(recoverGapLabel(recoverGapDefault(m)))), "回復の日数の「初めの設定は」の行が違う: " + m);
  });
  const pick = (k, v) => { const el = q(k); el.value = v; el.dispatchEvent(new Event("change")); };
  const s = session(TODAY);
  fixPlan(s);
  const before = s.plan.map(x => x.ex).join(",");
  pick("pair", "1");
  need(pairOn() && shownOk(), "選択を変えても反対の部位が戻らない・設定の表示が古い");
  pick("need", "3"); pick("jump", "2"); pick("step", "0"); pick("first", "keep");
  need(progNeed() === 3 && progJump() === 2 && progGain("w") === 0 && progFirst() === "keep" && shownOk(), "増え方の選択を変えた値が入らない・設定の表示が古い: " + JSON.stringify(state.tune.prog));
  need(/回数は変えません/.test((planView.querySelector("[data-jumpnote]") || {}).textContent || ""), "回数を増やさないときの、重さの添え書きが違う");
  pick("jump", "0");
  need(progJump() === 0 && state.tune.prog.jump === 0 && !planView.querySelector("[data-jumpnote]") && q("first").options.length === 2 && shownOk(), "重くしないを選んだ値が入らない・表示が古い: " + JSON.stringify(state.tune.prog));
  pick("need", "1"); pick("jump", "1");
  need(!("need" in state.tune.prog) && !("jump" in state.tune.prog) && state.tune.prog.step === 0 && state.tune.prog.first === "keep", "増え方: 初めの設定と同じ値を持ったまま・ほかの値が消えた " + JSON.stringify(state.tune.prog));
  need(planView.querySelectorAll("[data-act=tunereset]").length === 2, "「初めの設定に戻す」が、変えたカードの数だけ出ていない");
  pick("gap:glutes", "1"); pick("pref:hinge", "-1"); pick("step", "1"); pick("first", "harder");
  need(recoverGap("glutes") === 1 && patPref("hinge") === -1 && progGain("w") === 1 && progFirst() === "harder" && shownOk(), "選択を変えた値が入らない・設定の表示が古い");
  need(state.tune.prog.step === undefined && state.tune.prog.first === "harder", "増え方: 初めの設定と同じ値を持ったまま");
  let saved = null;
  try{ saved = sanitizeState(JSON.parse(localStorage.getItem("trainlog.v1"))); }catch(e){}
  need(!!saved && !!saved.tune && saved.tune.gap.map.glutes === 1 && saved.tune.pref.map.hinge === -1 && saved.tune.prog.first === "harder" && saved.tune.pair.off !== true && saved.tune.gap.updatedAt > 1,
    "端末の保存に入っていない: " + JSON.stringify(saved && saved.tune));
  need(!!session(TODAY).plan && session(TODAY).plan.length > 0, "設定を変えたあと、今日のメニューが無くなった");
  out.replanned = before !== session(TODAY).plan.map(x => x.ex).join(",");
  pick("gap:glutes", String(recoverGapDefault("glutes")));
  need(!("glutes" in state.tune.gap.map), "回復の日数: 初めの設定と同じ値を持ったまま");
  ACTIONS.tunereset(planView.querySelector('[data-act=tunereset][data-part="prog"]'));
  need(tuneIsDefault("prog") && patPref("hinge") === -1 && !planView.querySelector('[data-act=tunereset][data-part="prog"]') && !!planView.querySelector('[data-act=tunereset][data-part="menu"]'), "「目標の上げ方」だけを戻せない");
  ACTIONS.tunereset(planView.querySelector('[data-act=tunereset][data-part="menu"]'));
  need(!tuneChanged() && pairOn() && recoverGap("quads") === recoverGapDefault("quads") && patPref("deadlift") === 0 && progFirst() === "heavier" && shownOk(), "「初めの設定に戻す」で戻らない");
  need(!planView.querySelector("[data-act=tunereset]"), "初めの設定なのに「初めの設定に戻す」が出ている");
  need(document.documentElement.scrollWidth <= document.documentElement.clientWidth, "提案タブで横にはみ出す");
  /* 記録のある日は、メインの記録を残したまま組み直す */
  reset(null);
  fixPlan(session(TODAY));
  const first = session(TODAY).plan[0];
  doAll([first]);
  openSettings();
  pick("pref:" + patternOf(first.ex), "-1");
  need(todayItems().some(it => it.ex === first.ex), "設定を変えたら、記録した種目が今日のメニューから消えた");
  closeSettings();
  delete state.tune; fresh();

  out.failCount = out.fails.length;
  window.__result = out; window.__ready = true;
}, 300);
