/* 「種目を追加」で入れた種目が、メニューに入るときと同じ組み方（セット数・回数・左右・メモ）になるか */
setTimeout(() => {
  const r = {};
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null; tab = "today"; render();
  const planIds = todayItems().map(i => i.ex);
  const pick = ["calf", "row", "lateral", "curl"].filter(id => !planIds.includes(id));
  r.added = pick.map(id => {
    addToProgramToday(id);
    const it = todayItems().find(i => i.ex === id), c = catalogItem(id);
    return {id, extra: it.extra, sets: it.sets, catSets: c.sets, r: it.r, catR: c.r, side: !!it.side, catSide: !!c.side, label: it.label || "", note: !!it.note};
  });
  r.mismatch = r.added.filter(a => a.sets !== a.catSets || a.r !== a.catR || a.side !== a.catSide);
  openEx = pick[0]; render();
  r.rowText = (Array.from(document.querySelectorAll(".exrow")).find(x => x.querySelector(`[data-ex="${pick[0]}"]`)) || {}).textContent.replace(/\s+/g, " ").slice(0, 200);
  window.scrollTo(0, 0);
  window.__result = r; window.__ready = true;
}, 0);
undefined;
