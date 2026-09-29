/* メニューの選び方の検査（部位の回復と偏り）。dist/local/training-log.html の中で動かす。
   毎日・週4回・週3回・1日おきの頻度で35日分メニューを組み、全部こなした場合に:
   ・主役（主働筋）として3セット以上やった部位が、部位ごとの回復の日数（rules.js の RECOVER_GAP。量が多い日は1日延ばす）
     のうちにまた主役になっていないか（recoverViolations が空で合格）
   ・1回の量が上限（16セット・6種目・50分）に収まっているか（capViolations が空で合格）
   ・部位ごとの週あたり有効セット（主働筋1.0・補助0.5。2〜5週目の平均）と、週の目標に遠い部位（weekly・low は目で見る）
   を出す。日付は記録の日付を1日ずつずらして進める（v3_volume_eval.js と同じやり方） */
setTimeout(() => {
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null; if(typeof resetProg === "function") resetProg();
  };
  const schedules = {daily: d => true, "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7), "1日おき": d => d % 2 === 0};
  const DAYS = 35, FROM = 7;                  /* 1週目は記録が無い状態からの立ち上がりなので数えない */
  const KEY = ["quads","glutes","hams","chest","lats","shoulders","triceps","biceps","calves","abs","obliques"];
  const out = {recoverViolations: [], capViolations: [], weekly: {}, low: {}, sessions: {}};

  for(const [name, on] of Object.entries(schedules)){
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;
    if(typeof resetProg === "function") resetProg();
    const load = {}, prim = [], log = [];
    for(let day = 0; day < DAYS; day++){
      prim[day] = {};
      if(on(day)){
        const plan = buildPlan(), s = session(TODAY);
        fixPlan(s);
        let sets = 0, mins = 0;
        plan.forEach(it => {
          const sug = suggestNext(it, entryFor(TODAY, it.ex, false));
          const e = entryFor(TODAY, it.ex, true), ex = EXMAP[it.ex], n = it.sets || 3;
          for(let k = 0; k < n; k++){
            const st = {id: newSetId(), at: Date.now() + k, r: sug.target, rpe: 8, label: it.label || "", target: sug.target};
            if(sug.opt) st.w = sug.w;
            e.sets.push(st);
          }
          ex.p.forEach(m => { prim[day][m] = (prim[day][m] || 0) + n; });
          if(day >= FROM){
            ex.p.forEach(m => load[m] = (load[m] || 0) + n);
            (ex.s || []).forEach(m => { if(!ex.p.includes(m)) load[m] = (load[m] || 0) + n * 0.5; });
          }
          sets += n; mins += itemMinutes(it);
        });
        if(sets > SESSION_MAX.sets || plan.length > SESSION_MAX.exercises || mins > SESSION_MAX.minutes + 0.5)
          out.capViolations.push(name + " " + day + "日目: " + sets + "セット・" + plan.length + "種目・" + Math.round(mins) + "分");
        log.push(day + ": " + (plan.map(it => itemName(it) + "×" + (it.sets || 3)).join(" / ") || "（休み）"));
      }
      nextDay();
    }
    /* 主役で3セット以上やった部位が、部位ごとの回復の日数（量が多い日は1日延ばす）のうちに、また主役で3セット以上 */
    for(let d = FROM; d < DAYS; d++){
      Object.keys(prim[d]).forEach(m => {
        if(prim[d][m] < 3) return;
        const gap = recoverGap(m) + (prim[d][m] >= RECOVER_HEAVY ? 1 : 0);
        for(let g = 1; g <= gap; g++){
          if(d + g < DAYS && (prim[d + g][m] || 0) >= 3)
            out.recoverViolations.push(name + ": " + MUSCLES[m] + " " + d + "日目→" + (d + g) + "日目（中" + (g - 1) + "日。目安は中" + gap + "日）");
        }
      });
    }
    const weeks = (DAYS - FROM) / 7, weekly = {};
    Object.keys(MUSCLES).forEach(m => weekly[MUSCLES[m]] = Math.round((load[m] || 0) / weeks * 10) / 10);
    out.weekly[name] = weekly;
    out.low[name] = KEY.filter(m => (load[m] || 0) / weeks < 6).map(m => MUSCLES[m] + " " + Math.round((load[m] || 0) / weeks * 10) / 10);
    out.sessions[name] = log.slice(7, 21);
  }
  out.violationCount = out.recoverViolations.length;
  out.recoverViolations = out.recoverViolations.slice(0, 40);
  window.__result = out;
  window.__ready = true;
}, 300);
