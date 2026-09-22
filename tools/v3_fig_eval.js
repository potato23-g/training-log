/* 図に描くダンベルの本数が、その日に使う本数と合っているかを見る。
   ・使う本数のほうが少ない → 図もその本数になる（data-db に入る）
   ・使う本数のほうが多い（図は1つで持つ形） → 持ち方を一言添える */
(async () => {
  const out = {rows: [], mismatch: []};
  T.reset([{kg: 5, n: 2}]);
  await T.wait(60);
  const ids = ["goblet", "ohp", "curl", "rdl", "triext", "lateral", "farmer", "fly", "row"];
  const s = session(TODAY);
  fixPlan(s);
  for(const id of ids){
    const item = catalogItem(id);
    if(!s.plan.some(x => x.ex === id)) s.plan.push(Object.assign({}, item));
  }
  persistSession(TODAY);
  for(const id of ids){
    const it = todayItems().find(x => x.ex === id) || catalogItem(id);
    const sug = suggestNext(it, entryFor(TODAY, id, false), lastPerformance(id, TODAY));
    const m = motionOf(id);
    const figDb = m ? (m.dumbbells || []).length : 0;
    const useDb = sug.opt ? sug.opt.n : null;
    openEx = id; render();
    await T.wait(80);
    const dia = document.querySelector('.dia');
    const shown = dia ? (+(dia.dataset.db || 0) || figDb) : figDb;
    const note = Array.from(document.querySelectorAll('.dianote')).map(n => n.textContent).join(" ");
    const row = {id: id, 図: figDb, 使う: useDb, 表示: shown,
                 断り: /図は1つで持つ形です/.test(note), 持ち方: sug.opt ? sug.opt.how : ""};
    out.rows.push(row);
    /* 本数が違うのに何も断りが無いものを拾う */
    if(useDb && figDb && useDb !== shown && !row.断り) out.mismatch.push(row);
  }
  window.__result = out;
  window.__ready = true;
})();
