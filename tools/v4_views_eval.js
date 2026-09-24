/* U4(種目シート)・U8(からだの棒)・U9+F3(履歴シート)・U10+F4(推移・自己ベスト) の確認。
   TODAY は書き換えない。過去日は asDate(TODAY) から日数を引いて作る。
   window.__ready / window.__result に結果を入れる。例外は全部 catch して r.fatal に入れ、
   __ready は必ず立てる（cdp_shot.py 側のタイムアウトを防ぐ）。 */
setTimeout(async () => {
  const r = {};
  const qs = (s, root) => (root || document).querySelector(s);
  const qsa = (s, root) => Array.from((root || document).querySelectorAll(s));
  const keyDaysAgo = n => {
    const d = asDate(TODAY); d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const mkSet = (dateKey, exId, repVal, extra) => {
    const st = Object.assign({ id: newSetId(), at: noonAt(dateKey), r: repVal }, extra || {});
    entryFor(dateKey, exId, true).sets.push(st);
    return st;
  };
  const wait = ms => new Promise(res => setTimeout(res, ms));

  try {
    /* ---- 下ごしらえ: 状態を空にして、数週間ぶんの記録を作る ---- */
    state.sessions = {};
    state.gear = { items: [{ kg: 5, n: 2 }, { kg: 10, n: 2 }, { kg: 12, n: 2 }], updatedAt: 1 };
    tab = "today"; openEx = null; editEx = null; selMuscle = null; bodyDays = 7; planMemo = null;

    mkSet(keyDaysAgo(21), "goblet", 10, { w: 10 });
    mkSet(keyDaysAgo(21), "goblet", 10, { w: 10 });
    mkSet(keyDaysAgo(14), "goblet", 12, { w: 10 });
    mkSet(keyDaysAgo(14), "row", 12, { w: 10 });
    mkSet(keyDaysAgo(7), "goblet", 13, { w: 12 });                 /* d7: goblet 1セット */
    mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });               /* d7: hipthrust 3セット */
    mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });
    mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });
    mkSet(keyDaysAgo(3), "goblet", 8, { w: 12, label: "ゴブレットスクワット（深くしゃがむ）" });
    mkSet(keyDaysAgo(3), "plank", 30);
    mkSet(keyDaysAgo(2), "plank", 45);
    mkSet(keyDaysAgo(1), "row", 12, { w: 10 });                     /* 昨日: row 1セットだけ（動きの印のみ） */
    mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });               /* 昨日: hipthrust 3セット（回復中の印も） */
    mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });
    mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });

    /* 今日のメニューを固定して「今日のメニューにある」の印を再現性ある形で試す */
    session(TODAY).plan = [{ ex: "goblet", sets: 3, r: 12 }];
    session(TODAY).planAt = Date.now();
    planMemo = null;

    /* ======== U4: 種目を選ぶシート ======== */
    tab = "hist"; render();
    openPicker();
    r.picker = { headingCount: qsa(".pickhead", sheetInner).length };
    r.picker.hasSquatHead = sheetInner.innerHTML.indexOf("スクワット系") >= 0;
    const gobletBtn = qs('.pickmain[data-pick="goblet"]', sheetInner);
    const rowBtn = qs('.pickmain[data-pick="row"]', sheetInner);
    const hipBtn = qs('.pickmain[data-pick="hipthrust"]', sheetInner);
    r.picker.gobletHasPlanTag = !!gobletBtn && gobletBtn.innerHTML.indexOf("pktag plan") >= 0;
    r.picker.rowHasYesterdayTag = !!rowBtn && rowBtn.innerHTML.indexOf("昨日やった動き") >= 0;
    r.picker.rowHasWarnTag = !!rowBtn && rowBtn.innerHTML.indexOf("pktag warn") >= 0;      /* 期待 false（1セットだけなので回復中ではない） */
    r.picker.hipHasWarnTag = !!hipBtn && hipBtn.innerHTML.indexOf("pktag warn") >= 0;      /* 期待 true（3セット） */

    const variantBtn = qs('.pickvariant[data-pick="goblet"]', sheetInner);
    r.picker.variantFound = !!variantBtn;
    r.picker.variantLabel = variantBtn ? variantBtn.dataset.label : "";
    if (variantBtn) variantBtn.click();
    r.picker.afterVariantClick = {
      sheetClosed: !sheet.classList.contains("on"),
      tabIsToday: tab === "today",
      openExIsGoblet: openEx === "goblet",
      entryExists: !!entryFor(TODAY, "goblet", false)
    };

    openPicker();
    qs('[data-close="1"]', sheetInner).click();
    r.picker.closeBtnWorks = !sheet.classList.contains("on");

    openPicker();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    r.picker.escWorks = !sheet.classList.contains("on");

    /* ======== U8: からだタブの横棒 ======== */
    tab = "body"; bodyDays = 7; selMuscle = null; render();
    const bars = qsa(".mbar");
    const load7 = muscleLoad(7);
    r.body = { count: bars.length, expectedCount: Object.keys(MUSCLES).length };
    r.body.valuesMatch = bars.every(b => {
      const m = b.dataset.m, shown = parseFloat(qs(".mbv", b).textContent);
      const expected = Math.round((load7[m] || 0) * 10) / 10;
      return Math.abs(shown - expected) < 0.05;
    });
    const glutesBar = qs('.mbar[data-m="glutes"]');
    if (glutesBar) glutesBar.click();
    r.body.tapSelects = selMuscle === "glutes";
    r.body.detailShown = qsa(".card h4").some(h => h.textContent === MUSCLES.glutes);

    bodyDays = 14; render();
    const expected14 = fmtSets(WEEK_TARGET / 7 * 14);
    r.body.target14Found = document.getElementById("view").innerHTML.indexOf(expected14) >= 0;
    bodyDays = 30; render();
    const expected30 = fmtSets(WEEK_TARGET / 7 * 30);
    r.body.target30Found = document.getElementById("view").innerHTML.indexOf(expected30) >= 0;
    bodyDays = 7; render();

    /* ======== U9+F3: 履歴の日付シート ======== */
    tab = "hist"; render();
    const d7 = keyDaysAgo(7);
    const row = qs('tr[data-d="' + d7 + '"]');
    r.hist = { rowFound: !!row };
    if (row) row.click();
    r.hist.sheetOpen = sheet.classList.contains("on");
    const marker0 = qs("[data-histday]", sheetInner);
    r.hist.markerDate = marker0 ? marker0.dataset.histday : null;

    const setsBefore = qsa(".setline", sheetInner).length;                  /* 期待 4（goblet1 + hipthrust3） */
    r.hist.setsBefore = setsBefore;
    const delBtn = qs(".del[data-hid]", sheetInner);
    r.hist.delBtnFound = !!delBtn;
    const delId = delBtn ? delBtn.dataset.hid : null;
    if (delBtn) delBtn.click();
    r.hist.setsAfterDelete = qsa(".setline", sheetInner).length;
    r.hist.delWentIntoDelArray = !!(state.sessions[d7].del && state.sessions[d7].del.indexOf(delId) >= 0);
    r.hist.undoBtnShown = !!qs("#hundo", sheetInner);
    const undoBtn = qs("#hundo", sheetInner);
    if (undoBtn) undoBtn.click();
    r.hist.setsAfterUndo = qsa(".setline", sheetInner).length;
    r.hist.delRemovedAfterUndo = !(state.sessions[d7].del && state.sessions[d7].del.indexOf(delId) >= 0);

    const openAddBtn = qs("#haddopen", sheetInner);
    r.hist.addOpenBtnFound = !!openAddBtn;
    if (openAddBtn) openAddBtn.click();
    let goBtn = qs("#haddgo", sheetInner);
    if (goBtn) goBtn.click();                                                /* 未入力のまま送信 */
    r.hist.emptyValidationMsg = (qs("#haddmsg", sheetInner) || {}).textContent || "";
    r.hist.emptyValidationBlocked = qsa(".setline", sheetInner).length === r.hist.setsAfterUndo;

    let exSel = qs("#haddex", sheetInner);
    if (exSel) { exSel.value = "row|"; exSel.dispatchEvent(new Event("change")); }
    const wIn = qs("#haddw", sheetInner), rIn = qs("#haddr", sheetInner), eIn = qs("#hadde", sheetInner);
    if (wIn) wIn.value = "14";
    if (rIn) rIn.value = "9";
    if (eIn) eIn.value = "8";
    goBtn = qs("#haddgo", sheetInner);
    if (goBtn) goBtn.click();
    const rowEntry = entryFor(d7, "row", false);
    r.hist.addedSet = !!(rowEntry && rowEntry.sets.some(s => s.w === 14 && s.r === 9 && s.rpe === 8));
    r.hist.setsAfterAdd = qsa(".setline", sheetInner).length;               /* 期待 setsAfterUndo+1（取り消し後+新規1） */

    const noteEl = qs("#hnote", sheetInner);
    if (noteEl) { noteEl.value = "テスト用メモ"; noteEl.dispatchEvent(new Event("input")); }
    await wait(700);
    r.hist.noteSaved = state.sessions[d7].note === "テスト用メモ";
    const closeBtn = qs("#hclose", sheetInner);
    if (closeBtn) closeBtn.click();
    r.hist.closedOk = !sheet.classList.contains("on");

    /* ---- 記録していない日を足す ---- */
    tab = "hist"; render();
    const addPastBtn = qs('[data-act="addpastday"]');
    r.pastDay = { btnFound: !!addPastBtn };
    if (addPastBtn) addPastBtn.click();
    r.pastDay.hasDateInput = !!qs("#adddate", sheetInner);
    const dateInput = qs("#adddate", sheetInner);
    r.pastDay.maxAttr = dateInput ? dateInput.getAttribute("max") : null;
    r.pastDay.maxIsToday = r.pastDay.maxAttr === TODAY;

    const future = (() => { const d = asDate(TODAY); d.setDate(d.getDate() + 3); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
    if (dateInput) dateInput.value = future;
    let goBtn2 = qs("#haddayGo", sheetInner);
    if (goBtn2) goBtn2.click();
    r.pastDay.futureBlocked = !qs("[data-histday]", sheetInner);

    const freshDate = keyDaysAgo(45);                                       /* 他のどの記録とも重ならない日 */
    if (dateInput) dateInput.value = freshDate;
    goBtn2 = qs("#haddayGo", sheetInner);
    if (goBtn2) goBtn2.click();
    const marker1 = qs("[data-histday]", sheetInner);
    r.pastDay.opened = !!marker1 && marker1.dataset.histday === freshDate;
    r.pastDay.emptyMsgShown = sheetInner.textContent.indexOf("まだありません") >= 0;

    const openAddBtn2 = qs("#haddopen", sheetInner);
    if (openAddBtn2) openAddBtn2.click();
    let exSel2 = qs("#haddex", sheetInner);
    if (exSel2) { exSel2.value = "curl|"; exSel2.dispatchEvent(new Event("change")); }
    const w2 = qs("#haddw", sheetInner), r2 = qs("#haddr", sheetInner);
    if (w2) w2.value = "8";
    if (r2) r2.value = "12";
    const go2 = qs("#haddgo", sheetInner);
    if (go2) go2.click();
    const curlOnFreshDate = entryFor(freshDate, "curl", false);
    r.pastDay.addedOnNewDay = !!(curlOnFreshDate && curlOnFreshDate.sets.some(s => s.w === 8 && s.r === 12));
    const closeBtn2 = qs("#hclose", sheetInner);
    if (closeBtn2) closeBtn2.click();

    /* ======== U10+F4: 自己ベストの判定（prMessage） ======== */
    const pd = [90, 87, 84, 81].map(keyDaysAgo);   /* 他のどの記録より前（freshDate=45日前）に来る、完全に独立した日付帯 */
    const curlA = mkSet(pd[0], "curl", 8, { w: 10 });
    const curlB = mkSet(pd[1], "curl", 10, { w: 10 });
    const curlC = mkSet(pd[2], "curl", 6, { w: 12 });
    const curlD = mkSet(pd[3], "curl", 5, { w: 12 });
    r.pr = {};
    r.pr.first = prMessage("curl", "", curlA, pd[0]);
    r.pr.moreRepsSameWeight = prMessage("curl", "", curlB, pd[1]);
    r.pr.heavier = prMessage("curl", "", curlC, pd[2]);
    r.pr.notPR = prMessage("curl", "", curlD, pd[3]);
    r.pr.firstOk = r.pr.first === "";
    r.pr.moreRepsOk = r.pr.moreRepsSameWeight !== "" && r.pr.moreRepsSameWeight.indexOf("最多回数") >= 0;
    r.pr.heavierOk = r.pr.heavier !== "" && r.pr.heavier.indexOf("最重量") >= 0;
    r.pr.notPROk = r.pr.notPR === "";

    const plA = mkSet(pd[0], "plank", 30);
    const plB = mkSet(pd[1], "plank", 45);
    const plC = mkSet(pd[2], "plank", 40);
    r.pr.timeFirst = prMessage("plank", "", plA, pd[0]);
    r.pr.timeMore = prMessage("plank", "", plB, pd[1]);
    r.pr.timeLess = prMessage("plank", "", plC, pd[2]);
    r.pr.timeFirstOk = r.pr.timeFirst === "";
    r.pr.timeMoreOk = r.pr.timeMore !== "" && r.pr.timeMore.indexOf("最多") >= 0;
    r.pr.timeLessOk = r.pr.timeLess === "";

    /* ======== U10+F4: 種目ごとの推移（折れ線・自己ベストの印） ======== */
    tab = "hist"; render();
    r.trend = { svgCount: qsa("svg.trendline").length, prDotCount: qsa(".prdot").length };
    const curlHead = qsa(".card h4").find(h => h.textContent.indexOf("ダンベルカール") >= 0);
    const curlCard = curlHead ? curlHead.parentElement.innerHTML : "";
    r.trend.curlHasBestSet = curlCard.indexOf("最高セット") >= 0;
    r.trend.curlHasSVG = curlCard.indexOf("trendline") >= 0;

    /* ---- まとめ ---- */
    const bad = [];
    const check = (name, cond) => { if (!cond) bad.push(name); };
    check("picker.headingCount>0", r.picker.headingCount > 0);
    check("picker.hasSquatHead", r.picker.hasSquatHead);
    check("picker.gobletHasPlanTag", r.picker.gobletHasPlanTag);
    check("picker.rowHasYesterdayTag", r.picker.rowHasYesterdayTag);
    check("picker.rowHasWarnTag===false", r.picker.rowHasWarnTag === false);
    check("picker.hipHasWarnTag", r.picker.hipHasWarnTag);
    check("picker.variantFound", r.picker.variantFound);
    check("picker.afterVariantClick.sheetClosed", r.picker.afterVariantClick.sheetClosed);
    check("picker.afterVariantClick.tabIsToday", r.picker.afterVariantClick.tabIsToday);
    check("picker.afterVariantClick.openExIsGoblet", r.picker.afterVariantClick.openExIsGoblet);
    check("picker.afterVariantClick.entryExists", r.picker.afterVariantClick.entryExists);
    check("picker.closeBtnWorks", r.picker.closeBtnWorks);
    check("picker.escWorks", r.picker.escWorks);
    check("body.count===expectedCount", r.body.count === r.body.expectedCount);
    check("body.valuesMatch", r.body.valuesMatch);
    check("body.tapSelects", r.body.tapSelects);
    check("body.detailShown", r.body.detailShown);
    check("body.target14Found", r.body.target14Found);
    check("body.target30Found", r.body.target30Found);
    check("hist.rowFound", r.hist.rowFound);
    check("hist.sheetOpen", r.hist.sheetOpen);
    check("hist.markerDate===d7", r.hist.markerDate === d7);
    check("hist.setsBefore===4", r.hist.setsBefore === 4);
    check("hist.delBtnFound", r.hist.delBtnFound);
    check("hist.setsAfterDelete===3", r.hist.setsAfterDelete === 3);
    check("hist.delWentIntoDelArray", r.hist.delWentIntoDelArray);
    check("hist.undoBtnShown", r.hist.undoBtnShown);
    check("hist.setsAfterUndo===4", r.hist.setsAfterUndo === 4);
    check("hist.delRemovedAfterUndo", r.hist.delRemovedAfterUndo);
    check("hist.addOpenBtnFound", r.hist.addOpenBtnFound);
    check("hist.emptyValidationMsg!=''", !!r.hist.emptyValidationMsg);
    check("hist.emptyValidationBlocked", r.hist.emptyValidationBlocked);
    check("hist.addedSet", r.hist.addedSet);
    check("hist.setsAfterAdd", r.hist.setsAfterAdd === r.hist.setsAfterUndo + 1);
    check("hist.noteSaved", r.hist.noteSaved);
    check("hist.closedOk", r.hist.closedOk);
    check("pastDay.btnFound", r.pastDay.btnFound);
    check("pastDay.hasDateInput", r.pastDay.hasDateInput);
    check("pastDay.maxIsToday", r.pastDay.maxIsToday);
    check("pastDay.futureBlocked", r.pastDay.futureBlocked);
    check("pastDay.opened", r.pastDay.opened);
    check("pastDay.emptyMsgShown", r.pastDay.emptyMsgShown);
    check("pastDay.addedOnNewDay", r.pastDay.addedOnNewDay);
    check("pr.firstOk", r.pr.firstOk);
    check("pr.moreRepsOk", r.pr.moreRepsOk);
    check("pr.heavierOk", r.pr.heavierOk);
    check("pr.notPROk", r.pr.notPROk);
    check("pr.timeFirstOk", r.pr.timeFirstOk);
    check("pr.timeMoreOk", r.pr.timeMoreOk);
    check("pr.timeLessOk", r.pr.timeLessOk);
    check("trend.svgCount>0", r.trend.svgCount > 0);
    check("trend.curlHasBestSet", r.trend.curlHasBestSet);
    r.failCount = bad.length;
    r.failed = bad;
  } catch (e) {
    r.fatal = String((e && e.stack) || e);
    r.failCount = (r.failCount || 0) + 1;
  }
  window.__result = r;
  window.__ready = true;
}, 0);
undefined;
