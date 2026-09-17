/* 今日タブの見た目（メニュー作りの3パターン）。window.__phase:
   "normal" = 記録なし（いつものメニュー）
   "short"  = 毎日こなして9日目（回復待ちで短い日）
   "rest"   = 昨日すべての種目を5セットずつやった（全部の部位が回復待ち → 休み） */
setTimeout(() => {
  const r = {phase: window.__phase};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const doAll = (it, n) => {
    const sug = suggestNext(it, null, lastPerformance(it.ex, TODAY));
    const e = entryFor(TODAY, it.ex, true);
    for(let k = 0; k < n; k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.r, rpe: 8};
      if(EXMAP[it.ex].kind === "w") st.w = sug.w;
      e.sets.push(st);
    }
  };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null;
  };
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;

  if(window.__phase === "short"){
    for(let day = 0; day < 9; day++){
      const plan = buildPlan(); fixPlan(session(TODAY));
      plan.forEach(it => doAll(it, it.sets || 3));
      nextDay();
    }
  }
  if(window.__phase === "rest"){
    const y = shiftKey(TODAY, -1);
    state.sessions[y] = {date: y, entries: [], note: ""};
    catalog().forEach((c, i) => {
      if(state.sessions[y].entries.some(e => e.ex === c.ex)) return;
      state.sessions[y].entries.push({ex: c.ex, sets: [0,1,2,3,4].map(k => ({id: "y" + i + "_" + k, at: k, r: 10, rpe: 8, w: EXMAP[c.ex].kind === "w" ? 5 : undefined}))});
    });
  }
  planMemo = null; tab = "today"; openEx = null; editEx = null; render();
  r.items = todayItems().map(i => itemName(i) + "×" + (i.sets || 3));
  r.hero = (document.querySelector(".hero h2") || {}).textContent;
  r.subs = Array.from(document.querySelectorAll(".hero .sub")).map(x => x.textContent);
  r.addButton = !!document.querySelector('[data-act="addex"]');
  window.scrollTo(0, 0);
  window.__result = r;
  window.__ready = true;
}, 0);
undefined;
