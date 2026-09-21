/* 途中までしかやらなかった日（1〜2セットだけ等）も「手を付けた」として、翌日は別の種目になるか。
   毎日、各種目をランダムに 0〜規定セット数だけこなした履歴を21日分つくり、翌日のメニューを確かめる。
   （2026-09-21から、続けて出さないのは「種目」ではなく「動き」。同じ動きの中で種目が入れ替わらないようにするため） */
setTimeout(() => {
  const out = {days: [], repeatedNextDay: [], dupPatterns: [], recoverOnPlan: [], emptyDays: [], firstDayPartial: null};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null;
  };
  const doSets = (it, n) => {
    const sug = suggestNext(it, null, lastPerformance(it.ex, TODAY));
    const e = entryFor(TODAY, it.ex, true);
    for(let k = 0; k < n; k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.r, rpe: 8};
      if(EXMAP[it.ex].kind === "w") st.w = sug.w;
      e.sets.push(st);
    }
  };

  /* A. 最初の日に、最初の種目を1セットだけ */
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;
  const p0 = buildPlan();
  fixPlan(session(TODAY)); doSets(p0[0], 1);
  nextDay();
  const p1 = buildPlan();
  out.firstDayPartial = {day1: p0.map(i => i.ex).join(","), touched: p0[0].ex,
                         day2: p1.map(i => i.ex).join(","), touchedAgain: p1.some(i => i.ex === p0[0].ex)};

  /* B. 21日分、毎日ランダムに途中でやめる */
  state.sessions = {}; planMemo = null;
  let prevTouched = [];
  for(let day = 0; day < 21; day++){
    const s = session(TODAY);
    const plan = buildPlan();
    if(!plan.length) out.emptyDays.push(day);
    const pats = plan.map(it => patternOf(it.ex));
    if(new Set(pats).size !== pats.length) out.dupPatterns.push({day, pats});
    plan.forEach(it => {
      /* 昨日やった動きは今日は出さない（種目ではなく動きで見る。2026-09-21に本人の方針で変更） */
      if(prevTouched.includes(patternOf(it.ex))) out.repeatedNextDay.push({day, ex: it.ex, pat: patternOf(it.ex)});
      const adv = todayAdvice(it, suggestNext(it, null, lastPerformance(it.ex, TODAY)));
      if(adv && adv.level === "recover") out.recoverOnPlan.push({day, ex: it.ex});
    });
    /* 途中でやめる: 各種目 0〜規定セット（全部0の日も作る） */
    fixPlan(s);
    const touched = [];
    const skipDay = rand() < 0.15;
    plan.forEach(it => {
      const n = skipDay ? 0 : Math.floor(rand() * ((it.sets || 3) + 1));
      if(n > 0){ doSets(it, n); touched.push(patternOf(it.ex)); }
    });
    if(!touched.length){ delete s.plan; delete s.planAt; }
    out.days.push((skipDay ? "（休み）" : "") + plan.map(it => {
      const e = entryFor(TODAY, it.ex, false); return it.ex + "×" + (e ? e.sets.length : 0) + "/" + (it.sets || 3); }).join(" "));
    /* 見るのは「昨日」なので、休んだ日は空になる */
    prevTouched = touched;
    nextDay();
  }
  state.sessions = {}; state.gear = undefined; planMemo = null;
  window.__result = out;
  window.__ready = true;
}, 0);
undefined;
