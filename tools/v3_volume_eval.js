/* メニュー量の妥当性チェック。
   毎日 / 週4回 / 週3回 の頻度で28日分メニューを組み、全部こなした場合の
   部位ごとの週あたり有効セット数（主働筋1.0・補助0.5）、1回の種目数・セット数・所要時間の目安を出す。
   比較用に、重複除外なしの元のA〜Dメニューをそのまま回した場合も計算する。 */
setTimeout(() => {
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null;
  };
  /* 1種目の所要時間（秒）: 1回4秒のテンポ、左右ありは2倍＋持ち替え、セット間は休憩タイマーの秒数、種目間の移動60秒 */
  const itemSeconds = (it, reps) => {
    const ex = EXMAP[it.ex], sets = it.sets || 3, side = !!it.side;
    const work = ex.kind === "t" ? reps * (side ? 2 : 1) + 15 : reps * 4 * (side ? 2 : 1) + (side ? 15 : 0) + 15;
    return sets * work + (sets - 1) * restFor(it) + 60;
  };
  const addLoad = (load, it) => {
    const ex = EXMAP[it.ex], n = it.sets || 3;
    ex.p.forEach(m => load[m] = (load[m] || 0) + n);
    (ex.s || []).forEach(m => load[m] = (load[m] || 0) + n * 0.5);
  };
  const schedules = {daily: [0,1,2,3,4,5,6], "4/week": [0,1,3,4], "3/week": [0,2,4]};
  const out = {};

  for(const [name, days] of Object.entries(schedules)){
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;
    const load = {}, sessions = [];
    for(let day = 0; day < 28; day++){
      if(days.includes(day % 7)){
        const plan = buildPlan(), s = session(TODAY);
        fixPlan(s);
        let secs = 0, sets = 0, uni = 0;
        plan.forEach(it => {
          const sug = suggestNext(it, null, lastPerformance(it.ex, TODAY));
          const e = entryFor(TODAY, it.ex, true);
          for(let k = 0; k < (it.sets || 3); k++){
            const st = {id: newSetId(), at: Date.now() + k, r: sug.r, rpe: 8};
            if(EXMAP[it.ex].kind === "w") st.w = sug.w;
            e.sets.push(st);
          }
          addLoad(load, it);
          secs += itemSeconds(it, sug.r); sets += it.sets || 3; if(it.side) uni++;
        });
        sessions.push({day, exercises: plan.length, sets, unilateral: uni, minutes: Math.round(secs / 60),
                       names: plan.map(it => itemName(it) + "×" + (it.sets || 3)).join(" / ") || "（休み）"});
      }
      nextDay();
    }
    const weekly = {};
    Object.keys(MUSCLES).forEach(m => weekly[MUSCLES[m]] = Math.round((load[m] || 0) / 4 * 10) / 10);
    const trained = sessions.filter(s => s.exercises > 0);
    const avg = k => Math.round(trained.reduce((a, s) => a + s[k], 0) / Math.max(1, trained.length) * 10) / 10;
    out[name] = {perWeek: days.length, restDays: sessions.length - trained.length, avgExercises: avg("exercises"), avgSets: avg("sets"), avgMinutes: avg("minutes"),
                 minMinutes: Math.min(...trained.map(s => s.minutes)), maxMinutes: Math.max(...trained.map(s => s.minutes)),
                 minSets: Math.min(...trained.map(s => s.sets)), maxSets: Math.max(...trained.map(s => s.sets)),
                 weekly, sessions};
  }

  /* 比較: 元のA〜Dをそのまま（重複除外なし）毎日回した場合 */
  const load0 = {}, s0 = [];
  RORDER.forEach(rid => {
    let secs = 0, sets = 0;
    RMAP[rid].items.forEach(it => { addLoad(load0, it); secs += itemSeconds(it, it.r); sets += it.sets || 3; });
    s0.push({routine: rid, exercises: RMAP[rid].items.length, sets, minutes: Math.round(secs / 60)});
  });
  const weekly0 = {};
  Object.keys(MUSCLES).forEach(m => weekly0[MUSCLES[m]] = Math.round((load0[m] || 0) * 7 / 4 * 10) / 10);   /* 4日で1周 → 週1.75周 */
  out.originalDaily = {sessions: s0, weekly: weekly0};

  state.sessions = {}; state.gear = undefined; planMemo = null;
  window.__result = out;
  window.__ready = true;
}, 0);
undefined;
