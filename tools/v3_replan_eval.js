/* 「メニューを組み直す」の確認。
   古い版で作られた今日のメニュー（昨日やった種目がそのまま並んでいる）を、今の決まりで組み直せるか。
   1. 今日まだ記録していない場合 → 全部入れ替わる
   2. 今日すでに記録がある場合 → その種目は残り、残りだけ入れ替わる（同じ動き・部位が重ならない） */
setTimeout(() => {
  const r = {};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const mk = (ex, n, w) => ({ex, sets: Array.from({length: n}, (_, i) => ({id: ex + "_" + i, at: i, r: 10, rpe: 8, w}))});
  const stalePlan = () => [{ex:"split",sets:3,r:10,side:true}, {ex:"goblet",sets:3,r:18}, {ex:"hipthrust",sets:3,r:18},
                           {ex:"calf",sets:3,r:18,side:true,label:"カーフレイズ（片脚）"}, {ex:"deadbug",sets:3,r:10,side:true}];
  const setup = todaySets => {
    const y = shiftKey(TODAY, -1);
    state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    state.sessions = {};
    state.sessions[y] = {date: y, note: "", routine: "A",
      entries: [mk("split", 3, 10), mk("hipthrust", 3, 10), mk("calf", 3, 10), mk("deadbug", 3)]};
    state.sessions[TODAY] = {date: TODAY, note: "", entries: todaySets ? [mk("split", todaySets, 10)] : [],
                             plan: stalePlan(), planAt: Date.now() - 3600000};
    planMemo = null; tab = "today"; openEx = null; editEx = null; render();
  };
  const menu = () => todayItems().map(it => it.ex + "×" + (it.sets || 3));
  const pats = () => { const p = todayItems().map(it => patternOf(it.ex)); return new Set(p).size === p.length; };
  const touched = () => Array.from(touchedYesterday());
  window.confirm = () => true;

  /* 1. 今日まだ記録していない */
  setup(0);
  r.before = menu();
  r.button = !!document.querySelector('[data-act="replan"]');
  document.querySelector('[data-act="replan"]').click();
  r.after = menu();
  r.repeatsAfter = todayItems().filter(it => touched().includes(it.ex)).map(it => it.ex);
  r.planSaved = (session(TODAY).plan || []).length;
  r.patternsOk = pats();

  /* 2. 今日すでに2セット記録している */
  setup(2);
  r.before2 = menu();
  document.querySelector('[data-act="replan"]').click();
  r.after2 = menu();
  r.keptSets = (entryFor(TODAY, "split", false) || {sets: []}).sets.length;
  r.keptInPlan = (session(TODAY).plan || []).some(it => it.ex === "split");
  r.repeatsAfter2 = todayItems().filter(it => it.ex !== "split" && touched().includes(it.ex)).map(it => it.ex);
  r.patternsOk2 = pats();
  const load = {};
  todayItems().forEach(it => { const add = exLoad(it.ex, it.sets || 3); Object.keys(add).forEach(m => load[m] = (load[m] || 0) + add[m]); });
  r.dayCapOk2 = Object.keys(load).every(m => load[m] <= dayMax(m));
  r.sets2 = todayItems().reduce((a, it) => a + (it.sets || 3), 0);

  /* 3. 今日まだ記録していないのに、前のメニューの枠（0セットのentry）が残っている */
  setup(0);
  const s3 = session(TODAY);
  s3.entries.push({ex: "split", sets: []});          /* 記録を消した後などに残る空の枠 */
  planMemo = null; render();
  r.before3 = menu();
  document.querySelector('[data-act="replan"]').click();
  r.after3 = menu();
  r.splitGone3 = !todayItems().some(it => it.ex === "split");
  r.emptyEntriesLeft3 = (session(TODAY).entries || []).filter(e => !e.sets.length).length;

  /* 4. 完了した種目・途中の種目・自分で追加した種目は、組み直しても中身が変わらない */
  setup(0);
  const s4 = session(TODAY);
  const plan4 = (s4.plan || []).map(it => it.ex);
  const doneEx = plan4[0], partEx = plan4[2];
  s4.entries.push(mk(doneEx, 3, 10));                       /* 完了（3/3） */
  s4.entries.push(mk(partEx, 1, 10));                       /* 途中（1/3） */
  s4.entries.push(mk("curl", 2, 10));                       /* 自分で追加して2セット */
  planMemo = null; render();
  const beforeItems = todayItems().filter(it => [doneEx, partEx, "curl"].includes(it.ex))
    .map(it => it.ex + ":" + (it.sets || 3) + "x" + it.r);
  document.querySelector('[data-act="replan"]').click();
  const afterItems = todayItems().filter(it => [doneEx, partEx, "curl"].includes(it.ex))
    .map(it => it.ex + ":" + (it.sets || 3) + "x" + it.r);
  r.keepSame4 = beforeItems.join(" / ") === afterItems.join(" / ") ? "同じ" : beforeItems.join(" / ") + " → " + afterItems.join(" / ");
  r.sets4 = [doneEx, partEx, "curl"].map(id => id + "=" + (entryFor(TODAY, id, false) || {sets: []}).sets.length);
  r.after4 = menu();
  r.patternsOk4 = pats();
  r.doneLocked4 = isDoneToday(doneEx);

  state.sessions = {}; state.gear = undefined; planMemo = null;
  window.__result = r; window.__ready = true;
}, 0);
undefined;
