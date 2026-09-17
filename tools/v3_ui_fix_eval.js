/* 規定セット後のロック → 修正 → 間違えたセットを消す → また記録できる、の流れ
   window.__stage で止める段階を指定（"done" / "edit" / "reopen"。未指定なら最後まで） */
(async () => {
  const r = {};
  T.reset([{kg:5, n:2}]);
  const first = todayItems()[0], id = first.ex, target = first.sets || 3;
  r.first = {id, target, name: itemName(first)};

  await T.recordAll(id);
  r.afterRecord = {
    sets: T.sets(id),
    rowDone: !!T.q(`.exrow.done .fix[data-ex="${id}"]`),
    recordButton: !!T.q(`[data-act="addset"][data-ex="${id}"]`),
    toggleButton: !!T.q(`.exhead[data-act="toggle"][data-ex="${id}"]`)
  };
  /* 記録済みの種目に、無理やり記録を足そうとしても増えない */
  openEx = id; render();
  addSet(id);
  r.forcedAdd = {sets: T.sets(id), recordButtonAfterOpen: !!T.q(`[data-act="addset"][data-ex="${id}"]`)};
  /* 種目タブの「今日のメニューに追加」から来ても開かない */
  addToProgramToday(id);
  r.fromExTab = {tab, openEx, status: document.getElementById("status").textContent};

  if(window.__stage === "done"){ window.scrollTo(0, 0); window.__result = r; window.__ready = true; return; }

  T.click(`.fix[data-ex="${id}"]`);
  r.edit = {
    editing: !!T.q(".exrow.editing"),
    delButtons: T.qa(`[data-act="delset"][data-ex="${id}"]`).length,
    recordButton: !!T.q(`[data-act="addset"][data-ex="${id}"]`)
  };
  if(window.__stage === "edit"){ T.scrollTo(".exrow.editing"); window.__result = r; window.__ready = true; return; }

  const goneId = entryFor(TODAY, id, false).sets[1].id;
  T.qa(`[data-act="delset"][data-ex="${id}"]`)[1].click();
  r.afterDelete = {
    sets: T.sets(id),
    tombstone: (session(TODAY).del || []).includes(goneId),
    rowDone: !!T.q(`.exrow.done .fix[data-ex="${id}"]`),
    recordButton: !!T.q(`[data-act="addset"][data-ex="${id}"]`),
    openEx
  };
  if(window.__stage === "reopen"){ T.scrollTo(`.exhead[data-ex="${id}"]`); window.__result = r; window.__ready = true; return; }

  T.click(`[data-act="addset"][data-ex="${id}"]`);
  stopRest();
  r.recordAgain = {sets: T.sets(id), rowDone: !!T.q(`.exrow.done .fix[data-ex="${id}"]`)};
  window.__result = r;
  window.__ready = true;
})();
