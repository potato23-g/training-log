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
   7. 画面: 設定の選択の値が、どれも読み出しの関数と同じ。選択を変えると保存され、今日のメニューが組み直る。
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
  need(!/反対の部位/.test(viewPlan()), "そろえない設定なのに、提案タブに反対の部位の説明が出ている");
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
  need(itemKey(rowOf().item) === itemKey(p.next) && /一段難しいやり方に進み、/.test(viewPlan()), "提案タブが、難しいやり方を先にする進み方と合わない: " + itemName(rowOf().item));
  const gb = catalogItem("goblet"), gopts = itemOptions(gb);
  need(itemKey(nextUp(gb, defaultOptionFor(gb), gopts).item || {ex: ""}) === itemKey(p.next), "次に進む先（nextUp）が、目標の決め方と違う");
  need(patternNext("squat") && itemKey(patternNext("squat")) === itemKey(p.next), "難しいやり方を先にする設定が、メニューで選ぶやり方に効いていない");
  p = after({prog: {step: 2, first: "harder", updatedAt: 1}}, "goblet", rr.lo);
  need(p.target === rr.lo + 2, "増やす数と進み方を両方変えると、増やす数が効かない");
  need(/次は2回（秒の種目は10秒）増やします/.test(viewPlan()), "提案タブの説明の増やす数が設定と違う");

  /* ---- 6. 保存 ---- */
  const dirty = sanitizeState({sessions: {}, tune: {
    pref: {map: {curl: -1, "<b>": 1, hinge: 2, lunge: "1"}, updatedAt: "7", junk: 1},
    gap: {map: {quads: 4, glutes: 6, hams: 1.5, "QUADS": 1, chest: "0"}, updatedAt: 8},
    pair: {off: "yes", updatedAt: 9}, prog: {step: 3, first: "easier", updatedAt: 10}, other: {x: 1}}});
  const t = dirty.tune || {};
  need(JSON.stringify(t.pref) === JSON.stringify({map: {curl: -1, lunge: 1}, updatedAt: 7}), "sanitize: 出やすさ " + JSON.stringify(t.pref));
  need(JSON.stringify(t.gap) === JSON.stringify({map: {quads: 4, chest: 0}, updatedAt: 8}), "sanitize: 回復の日数 " + JSON.stringify(t.gap));
  need(JSON.stringify(t.pair) === JSON.stringify({updatedAt: 9}) && JSON.stringify(t.prog) === JSON.stringify({updatedAt: 10}) && !("other" in t), "sanitize: 反対の部位・増え方 " + JSON.stringify(t));
  need(sanitizeState({sessions: {}}).tune === undefined && sanitizeState({sessions: {}, tune: "x"}).tune === undefined, "sanitize: 設定が無いのに作った");
  const keep = sanitizeState({sessions: {}, tune: {pair: {off: true, updatedAt: 3}, prog: {step: 2, first: "harder", updatedAt: 4}}}).tune;
  need(keep.pair.off === true && keep.prog.step === 2 && keep.prog.first === "harder", "sanitize: 正しい値を落とした");
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
  tab = "today";
  openSettings();
  const q = k => sheetInner.querySelector('select[data-tune="' + k + '"]');
  const all = Array.from(sheetInner.querySelectorAll("select[data-tune]"));
  const pats = PATTERN_ORDER.filter(pat => EX.some(e => !e.base && patternOf(e.id) === pat));
  need(all.length === 3 + Object.keys(MUSCLES).length + pats.length, "設定の選択の数が違う: " + all.length);
  need(EX.filter(e => !e.base).every(e => pats.includes(patternOf(e.id))), "出やすさの一覧に出ない種目がある");
  const shownOk = () => q("pair").value === (pairOn() ? "1" : "0") && q("step").value === String(progGain("w")) && q("first").value === progFirst()
    && Object.keys(MUSCLES).every(m => q("gap:" + m).value === String(recoverGap(m))) && pats.every(pat => q("pref:" + pat).value === String(patPref(pat)));
  need(shownOk(), "設定の選択の値が、読み出しの関数と合わない");
  need(!!sheetInner.querySelector("[data-act=tunereset]"), "変えた設定があるのに「初めの設定に戻す」が出ない");
  Object.keys(MUSCLES).forEach(m => {
    const was = sheetInner.querySelector(`[data-gapwas="${m}"]`);
    need(!!was === (recoverGap(m) !== recoverGapDefault(m)) && (!was || was.textContent.includes(recoverGapLabel(recoverGapDefault(m)))), "回復の日数の「初めの設定は」の行が違う: " + m);
  });
  const pick = (k, v) => { const el = q(k); el.value = v; el.dispatchEvent(new Event("change")); };
  const s = session(TODAY);
  fixPlan(s);
  const before = s.plan.map(x => x.ex).join(",");
  pick("pair", "1");
  need(pairOn() && shownOk(), "選択を変えても反対の部位が戻らない・設定の表示が古い");
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
  ACTIONS.tunereset();
  need(!tuneChanged() && pairOn() && recoverGap("quads") === recoverGapDefault("quads") && patPref("deadlift") === 0 && progFirst() === "heavier" && shownOk(), "「初めの設定に戻す」で戻らない");
  need(!sheetInner.querySelector("[data-act=tunereset]"), "初めの設定なのに「初めの設定に戻す」が出ている");
  need(document.documentElement.scrollWidth <= document.documentElement.clientWidth, "設定のシートで横にはみ出す");
  closeSettings();
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
