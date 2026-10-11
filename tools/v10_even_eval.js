/* 日ごとの種目数の差と、「回復が終わっているのに出ない部位」の検査（2026-10-11 本人の指摘）。
   dist/local/training-log.html の中で動かす。fails が空で合格。
   42日ぶん全部こなして、8日目からを数える（可変式ダンベル 2〜20kg）。
   1. 毎日: 種目数のいちばん多い日と少ない日の差が 4 以内（直す前は 3〜10 で 7）。毎日は 7、週5回は 9 種目を超えない
      （週5回は、3日続けた3日目に回復の途中の部位が多く、2種目の日が残る。少ない日は変わらず、多い日が 10 → 9）。
      1回の上限は SESSION_MAX を超えない
   2. どの頻度でも、回復が終わっているのに、その部位をメインで鍛える種目がメニューに無い日が続くのは、
      毎日・週5回で 4日まで、1日おき・週4回・週3回で 6日まで（直す前は、同じ数え方で前腕・脊柱起立筋が 5〜14日）。
      その日のメニューにその部位の種目を1つ足すと、補助で使う分も含めて1週間の上限（WEEK_MAX）を超える日は数えない（
      腹直筋は補助だけで週20セット前後になり、メインで鍛える種目を足すと1週間の上限を超えるので、先に入れる部位にしていない）
   3. 1週間の量は減っていない（毎日: 全部位の合計が 215 セット以上。直す前は 227）
   4. 「少なめに入れる」にした動きは、このためには入らない。回復の途中の部位は入らない
   5. 記録が1週間ぶん無いうちは、1回の上限は SESSION_MAX のまま。sessionCap は頻度どおり */
setTimeout(() => {
  const out = {fails: [], rows: {}};
  const need = (cond, msg) => { if(!cond) out.fails.push(msg); };
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; fresh();
  };
  const schedules = {"毎日": d => true, "週5": d => [0,1,2,4,5].includes(d % 7), "1日おき": d => d % 2 === 0,
                     "週4": d => [0,1,3,4].includes(d % 7), "週3": d => [0,2,4].includes(d % 7)};
  const LIMIT = {"毎日": 4, "週5": 4, "1日おき": 6, "週4": 6, "週3": 6};
  const DAYS = 42, FROM = 7;
  const run = (name, tune) => {
    state.sessions = {}; state.gear = {items: [{adj: true, n: 2, min: 2, max: 20, step: 2}], updatedAt: 1};
    delete state.exOff; if(tune) state.tune = JSON.parse(JSON.stringify(tune)); else delete state.tune;
    fresh();
    const counts = [], idle = {}, maxIdle = {}, load = {}, pats = {};
    let lastTrain = -1, early = true;
    for(let day = 0; day < DAYS; day++){
      if(schedules[name](day)){
        const ready = {}, room = {}; Object.keys(MUSCLES).forEach(m => ready[m] = !recovering(m));
        if(day < FROM && sessionCap() !== SESSION_MAX.exercises) early = false;
        planMemo = null;
        const plan = buildPlan();
        const step = lastTrain < 0 ? 1 : day - lastTrain;
        need(plan.length <= SESSION_MAX.exercises, name + ": 1回の種目数が上限を超えた（" + day + "日目 " + plan.length + "）");
        plan.forEach(it => {
          need(EXMAP[it.ex].p.every(m => ready[m]), name + ": 回復の途中の部位をメインで鍛える種目が入った（" + day + "日目 " + it.ex + "）");
          pats[patternOf(it.ex)] = (pats[patternOf(it.ex)] || 0) + 1;
        });
        /* メニューを全部行ったあとでも、その部位の種目を1つ足せるか（補助で使う分も含めた1週間の上限） */
        const dayLoad = {};
        plan.forEach(it => { const add = exLoad(it.ex, it.sets || 3); Object.keys(add).forEach(m => dayLoad[m] = (dayLoad[m] || 0) + add[m]); });
        Object.keys(MUSCLES).forEach(m => room[m] = muscleLoadBetween(m, 1, 6) + (dayLoad[m] || 0) + SETS_PER_EXERCISE <= WEEK_MAX);
        if(day >= FROM){
          counts.push(plan.length);
          Object.keys(MUSCLES).forEach(m => {
            if(ready[m] && room[m] && !plan.some(it => EXMAP[it.ex].p.includes(m))){ idle[m] = (idle[m] || 0) + step; maxIdle[m] = Math.max(maxIdle[m] || 0, idle[m]); }
            else idle[m] = 0;
          });
        }
        fixPlan(session(TODAY));
        plan.forEach(it => {
          const sug = suggestNext(it, entryFor(TODAY, it.ex, false)), e = entryFor(TODAY, it.ex, true), n = it.sets || 3, ex = EXMAP[it.ex];
          for(let k = 0; k < n; k++){ const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target}; if(sug.opt) st.w = sug.w; e.sets.push(st); }
          if(day >= FROM){ ex.p.forEach(m => load[m] = (load[m] || 0) + n); (ex.s || []).forEach(m => { if(!ex.p.includes(m)) load[m] = (load[m] || 0) + n * 0.5; }); }
        });
        lastTrain = day;
      }
      nextDay();
    }
    const weeks = (DAYS - FROM) / 7;
    return {counts, maxIdle, early, pats, total: Object.keys(MUSCLES).reduce((a, m) => a + (load[m] || 0), 0) / weeks, cap: sessionCap()};
  };

  Object.keys(schedules).forEach(name => {
    const r = run(name);
    const lo = Math.min(...r.counts), hi = Math.max(...r.counts);
    const worst = Object.keys(r.maxIdle).sort((a, b) => r.maxIdle[b] - r.maxIdle[a])[0];
    out.rows[name] = {counts: r.counts.join(" "), idle: worst ? MUSCLES[worst] + r.maxIdle[worst] : "", total: Math.round(r.total), cap: r.cap};
    if(name === "毎日") need(hi - lo <= 4, name + ": 種目数の差が大きい（" + lo + "〜" + hi + "）");
    if(name === "毎日" || name === "週5") need(hi <= (name === "毎日" ? 7 : 9), name + ": 種目数の多い日が減っていない（" + lo + "〜" + hi + "）");
    Object.keys(r.maxIdle).forEach(m => need(r.maxIdle[m] <= LIMIT[name], name + ": " + MUSCLES[m] + "が、回復が終わっているのに " + r.maxIdle[m] + "日出ない"));
    need(r.early, name + ": 記録が1週間ぶん無いうちに、1回の上限を下げた");
    if(name === "毎日"){
      need(r.total >= 215, "毎日: 1週間の量が減った（" + Math.round(r.total) + "）");   /* 直す前は 227。週の目標に届くかは v5_balance_eval.js で見る */
      need(r.cap === 7, "毎日のときの1回の上限が違う: " + r.cap);
    }
    if(name === "週3") need(r.cap === SESSION_MAX.exercises, "週3回のときに、1回の上限を下げた: " + r.cap);
  });

  /* 4. 「少なめに入れる」にした動きは、長く空いていても先には入れない（初めの設定のときより減る） */
  const base = run("毎日"), less = run("毎日", {pref: {map: {raise: -1}, updatedAt: 1}});
  ["raise"].forEach(p => { if(base.pats[p]) need((less.pats[p] || 0) < base.pats[p] / 2, "「少なめに入れる」にした動きが減らない: " + p + " " + base.pats[p] + "→" + (less.pats[p] || 0)); });
  out.less = {raise: base.pats.raise + "→" + (less.pats.raise || 0)};

  /* 5. readyIdleDays: 回復の途中は 0。記録が無ければ 0 */
  state.sessions = {}; delete state.tune; fresh();
  need(Object.keys(MUSCLES).every(m => readyIdleDays(m) === 0) && sessionCap() === SESSION_MAX.exercises, "記録が無いのに、空いた日数・上限が初めの値でない");

  out.failCount = out.fails.length;
  window.__result = out; window.__ready = true;
}, 300);
