/* 連日でもよい部位（回復の日数が0: 腹直筋・腹斜筋・前腕・ふくらはぎ）が、何日続けてメインで出るかの検査。
   dist/local/training-log.html の中で動かす。2026-10-22 本人の指摘「連日やっても良い種目が何個もあるが、
   一つの部位が三日連続で出た。連日可能な部位もできるだけ提案がばらけるように」。
   毎日・週6・週5・週4・週3の頻度で56日分メニューを組み、全部こなした場合に:
   ・回復の日数が0の部位を、メインで3セット以上（RECOVER_PRIMARY）鍛えた日が、3日以上続いていないか（runs が空で合格）
   ・3種目以下の日の数（few。前の版と比べるため。目で見る）
   ・連日でもよい部位の週あたりのセット（メイン1.0・補助0.5。2〜8週目の平均。weekly。目で見る）
   日付は記録の日付を1日ずつずらして進める（v5_balance_eval.js と同じやり方） */
setTimeout(() => {
  const t0 = Date.now();
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null; if(typeof resetProg === "function") resetProg();
  };
  const schedules = {daily: d => true, "6/week": d => d % 7 !== 6, "5/week": d => [0,1,2,3,4].includes(d % 7),
                     "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7)};
  const DAYS = 56, FROM = 7;
  const DAILY = Object.keys(MUSCLES).filter(m => recoverGap(m) === 0);
  const out = {runs: [], longest: {}, few: {}, weekly: {}, daily: DAILY.map(m => MUSCLES[m])};
  for(const [name, on] of Object.entries(schedules)){
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;
    if(typeof resetProg === "function") resetProg();
    const prim = [], load = {};
    let few = 0;
    for(let day = 0; day < DAYS; day++){
      prim[day] = {};
      if(on(day)){
        const plan = buildPlan(), s = session(TODAY);
        fixPlan(s);
        plan.forEach(it => {
          const sug = suggestNext(it, entryFor(TODAY, it.ex, false));
          const e = entryFor(TODAY, it.ex, true), ex = EXMAP[it.ex], n = setsOf(it);
          for(let k = 0; k < n; k++){
            const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target, pn: n};
            if(sug.opt) st.w = sug.w;
            e.sets.push(st);
          }
          ex.p.forEach(m => { prim[day][m] = (prim[day][m] || 0) + n; });
          if(day >= FROM){
            ex.p.forEach(m => load[m] = (load[m] || 0) + n);
            (ex.s || []).forEach(m => { if(!ex.p.includes(m)) load[m] = (load[m] || 0) + n * 0.5; });
          }
        });
        if(day >= FROM && plan.length <= 3) few++;
      }
      nextDay();
    }
    const longest = {};
    DAILY.forEach(m => {
      let run = 0, best = 0;
      for(let d = 0; d < DAYS; d++){
        run = (prim[d][m] || 0) >= RECOVER_PRIMARY ? run + 1 : 0;
        if(run > best) best = run;
        if(run === 3 && d >= FROM) out.runs.push(name + ": " + MUSCLES[m] + " " + (d - 2) + "〜" + d + "日目");
      }
      longest[MUSCLES[m]] = best;
    });
    const weeks = (DAYS - FROM) / 7;
    out.longest[name] = longest;
    out.few[name] = few;
    out.weekly[name] = DAILY.map(m => MUSCLES[m] + " " + Math.round((load[m] || 0) / weeks * 10) / 10).join("・");
  }
  out.runCount = out.runs.length;
  out.runs = out.runs.slice(0, 30);
  out.sec = Math.round((Date.now() - t0) / 1000);
  window.__result = out;
  window.__ready = true;
}, 300);
