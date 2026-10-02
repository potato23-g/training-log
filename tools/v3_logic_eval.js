/* 今日のメニュー決定・手持ちダンベルの使い方・提案文の検証（ページ内で実行）
   window.__result に結果、window.__ready = true で完了 */
(async () => {
  const out = {days: [], dupPatterns: [], recoverOnPlan: [], recoverViolations: [], dayCapViolations: [], sessionCapViolations: [], weekCapViolations: [],
               unowned: [], optionErrors: [], sweep: []};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  /* 記録やダンベルを入れ替えたら、メニューと進め方の控え（planMemo・progMemo）を必ず空にする。
     アプリは描き直すたびに空にするが、この検査は描き直さずに続けて呼ぶため */
  const setInv = items => { state.gear = {items, updatedAt: 1}; planMemo = null; resetProg(); };
  const kgNums = t => (String(t).match(/\d+(?:\.\d+)?kg/g) || []).map(x => parseFloat(x));

  /* ---------- 1. 毎日トレーニングした場合のメニュー（14日分） ---------- */
  state.sessions = {};
  setInv([{kg:5, n:2}]);
  for(let day = 0; day < 14; day++){
    planMemo = null; resetProg();
    const s = session(TODAY);
    const plan = buildPlan();
    /* 同じ動きが重なっていないか */
    const pats = plan.map(it => patternOf(it.ex));
    if(new Set(pats).size !== pats.length) out.dupPatterns.push({day, pats});
    const dayLoad = {};
    let setsToday = 0;
    plan.forEach(it => {
      const adv = todayAdvice(it, suggestNext(it, null, lastPerformance(it.ex, TODAY)));
      if(adv && adv.level === "recover") out.recoverOnPlan.push({day, ex: it.ex, text: adv.text});
      /* 間隔: 主役の部位が回復の途中でない（主役で3セット以上やった日から、部位ごとの日数を空けている） */
      EXMAP[it.ex].p.forEach(m => { const left = recoverDaysLeft(m); if(left > 0) out.recoverViolations.push({day, ex: it.ex, m, left}); });
      const add = exLoad(it.ex, it.sets || 3);
      Object.keys(add).forEach(m => dayLoad[m] = (dayLoad[m] || 0) + add[m]);
      setsToday += it.sets || 3;
    });
    /* 1日の負荷: どの部位も上限（大きい部位8・ほか6）を超えない（補助で使った分も含む） */
    Object.keys(dayLoad).forEach(m => { if(dayLoad[m] > dayMax(m)) out.dayCapViolations.push({day, m, load: dayLoad[m]}); });
    if(setsToday > SESSION_MAX.sets || plan.length > SESSION_MAX.exercises) out.sessionCapViolations.push({day, sets: setsToday, exercises: plan.length});
    /* 週の上限: 保証しているのは各種目の主役（p[0]）の部位だけ。大殿筋・腹直筋・僧帽筋などは補助で使う分が上限を超えることがある */
    plan.forEach(it => { const m = EXMAP[it.ex].p[0], total = muscleLoadBetween(m, 1, 6) + (dayLoad[m] || 0);
      if(total > WEEK_MAX) out.weekCapViolations.push({day, ex: it.ex, m, total}); });
    out.days.push(plan.map(it => itemName(it) + "×" + (it.sets || 3)).join(" / ") || "（休み）");
    /* その日のメニューを全部こなしたことにする */
    fixPlan(s);
    plan.forEach(it => {
      const sug = suggestNext(it, null, lastPerformance(it.ex, TODAY));
      const e = entryFor(TODAY, it.ex, true);
      for(let k = 0; k < (it.sets || 3); k++){
        const st = {id: newSetId(), at: Date.now() + k, r: sug.r, rpe: 8};
        if(EXMAP[it.ex].kind === "w") st.w = sug.w;
        e.sets.push(st);
      }
    });
    /* 日付を1日ずらして「翌日」にする */
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next;
  }

  /* ---------- 2. 持っているダンベルごとに、作れない重さを出していないか（可変式を含む） ---------- */
  const invs = [[{kg:5,n:2}], [{kg:5,n:1}], [{kg:5,n:2},{kg:10,n:1}], [{kg:10,n:1}], [], [{kg:2,n:2},{kg:5,n:2},{kg:8,n:1}], [{kg:3,n:4},{kg:12,n:2}],
    [{adj:true,min:2,max:24,step:2,n:2}],
    [{kg:5,n:2},{adj:true,n:2,list:[2.5,3.5,4.5,5.5,6.5,8,9.5,11,12.5,14,16,18,20,22,24]}],
    [{adj:true,min:2.5,max:25,step:2.5,n:1}]];
  const weighted = EX.filter(e => holdOf(e.id));
  for(const inv of invs){
    state.sessions = {};
    setInv(inv);
    /* 「持っている重さ」は、固定の重さに加えて、可変式で設定できる重さも数える */
    const owned = new Set();
    inv.forEach(x => { if(x.adj) adjWeights(x).forEach(k => owned.add(k)); else owned.add(x.kg); });
    /* pieceOk: o.pieces の各重さに、別々の「物」（固定の1本、可変式の1本）を割り当てられるか。
       inventory() の重さごとの合計本数だけで見ると、可変式1本が同時に2つの重さになれる計算に
       なってしまう（mixed のバグの温床）ので、ここでは inv の行を物として総当たりで確かめる */
    const rowsList = inv.filter(x => x.n > 0);
    const rowCoversKg = (row, kg) => row.adj ? adjWeights(row).some(w => Math.abs(w - kg) < 1e-9) : Math.abs(row.kg - kg) < 1e-9;
    const pieceOk = o => {
      const used = new Array(rowsList.length).fill(0);
      const assign = idx => {
        if(idx >= o.pieces.length) return true;
        const kg = o.pieces[idx];
        for(let r = 0; r < rowsList.length; r++){
          if(used[r] >= rowsList[r].n || !rowCoversKg(rowsList[r], kg)) continue;
          used[r]++;
          if(assign(idx + 1)) return true;
          used[r]--;
        }
        return false;
      };
      return assign(0);
    };
    for(const ex of weighted){
      const id = ex.id, opts = gearOptions(id), totals = new Set(opts.map(o => o.total));
      opts.forEach(o => {
        const sum = Math.round(o.pieces.reduce((a,b)=>a+b,0) * 10) / 10;
        if(!pieceOk(o) || sum !== o.total) out.optionErrors.push({inv, id, o});
        kgNums(o.text).forEach(k => { if(!owned.has(k) && !totals.has(k)) out.unowned.push({inv, id, where:"option", text:o.text}); });
      });
      const item = Object.assign({}, catalogItem(id));
      const rr = repRange(id, item);
      const scen = [["初回", null]];
      opts.forEach(o => {
        scen.push(["余裕 " + o.total, {date: shiftKey(TODAY, -3), sets: [0,1,2].map(i => ({r: rr.hi + 4, rpe: 6, w: o.total}))}]);
        scen.push(["限界 " + o.total, {date: shiftKey(TODAY, -3), sets: [0,1,2].map(i => ({r: Math.max(1, rr.lo - 3), rpe: 10, w: o.total}))}]);
      });
      scen.push(["作れない重さ", {date: shiftKey(TODAY, -3), sets: [0,1,2].map(i => ({r: 10, rpe: 8, w: 7.3}))}]);
      for(const [name, last] of scen){
        state.sessions = {};
        if(last){
          state.sessions[last.date] = {date: last.date, entries: [{ex: id, sets: last.sets.map((x, i) => Object.assign({id: "t" + i, at: i}, x))}], note: ""};
          state.sessions[shiftKey(TODAY, -7)] = {date: shiftKey(TODAY, -7), entries: [{ex: id, sets: last.sets.map((x, i) => Object.assign({id: "u" + i, at: i}, x))}], note: ""};
        }
        planMemo = null; resetProg();
        const sug = suggestNext(item, null, last ? lastPerformance(id, TODAY) : null);
        if(ex.kind === "w" && opts.length && !totals.has(sug.w)) out.unowned.push({inv, id, name, where:"sug.w", w: sug.w});
        /* 「次の一手」の文言は todayAdvice().text（progressFor の why 経由）に含まれるので、
           単体の nextStepText() は無い（廃止済み）。ここでは重複して足さない */
        const texts = [gearLine(id, sug), (todayAdvice(item, sug) || {}).text || "", sug.why || ""];
        texts.forEach(t => kgNums(t).forEach(k => {
          if(name === "作れない重さ" && k === 7.3) return;          /* 「前回の7.3kgは作れない」という説明は可 */
          if(!owned.has(k) && !totals.has(k)) out.unowned.push({inv, id, name, text: t});
        }));
      }
    }
  }

  /* ---------- 3. 全タブの文言に、持っていない重さの勧めや A〜D の表示が残っていないか ---------- */
  state.sessions = {};
  setInv([{kg:4, n:2}, {kg:9, n:1}]);
  const bad = [/可変式/, /買い足/, /kgに上げる/, /上限\s*\d/, /[ABCD]：/, /rswitch/, /メニューの偏り/];
  const views = [["today", null]].concat(EX.map(e => ["ex", e.id])).concat([["body", null], ["hist", null], ["plan", null]]);
  for(const [t, id] of views){
    if(id) refEx = id;
    tab = t; render();
    const html = document.getElementById("view").innerHTML;
    bad.forEach(re => { if(re.test(html)) out.sweep.push({tab: t, id, re: String(re), near: html.slice(Math.max(0, html.search(re) - 60), html.search(re) + 40)}); });
    /* 大きい数字表示（重さ×回数）と記録済みセットは除き、文章の中の「◯kg」だけを見る */
    const clone = document.getElementById("view").cloneNode(true);
    clone.querySelectorAll(".bigset,.tv,.setline,.meta").forEach(n => n.remove());
    kgNums(clone.textContent).forEach(k => { if(![4, 8, 9, 13].includes(k)) out.sweep.push({tab: t, id, unownedKg: k}); });
  }
  tab = "today"; render();

  state.sessions = {}; state.gear = undefined; planMemo = null; resetProg();
  window.__result = out;
  window.__ready = true;
})();
