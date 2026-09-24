/* 見た目確認用のスクリーンショットを撮る前の下ごしらえ。
   URL の ?shot= で何を出すか、_dark で暗い表示にするかを切り替える。
   shot= body | hist | histsheet | histadd | histundo | addday | picker （末尾に _dark で暗い表示） */
setTimeout(async () => {
  const qp = new URLSearchParams(location.search);
  const mode = qp.get("shot") || "hist";
  const keyDaysAgo = n => {
    const d = asDate(TODAY); d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const mkSet = (dateKey, exId, repVal, extra) => {
    const st = Object.assign({ id: newSetId(), at: noonAt(dateKey), r: repVal }, extra || {});
    entryFor(dateKey, exId, true).sets.push(st);
    return st;
  };

  state.sessions = {};
  state.gear = { items: [{ kg: 5, n: 2 }, { kg: 10, n: 2 }, { kg: 12, n: 2 }], updatedAt: 1 };
  tab = "today"; openEx = null; editEx = null; selMuscle = null; bodyDays = 7; planMemo = null;

  mkSet(keyDaysAgo(21), "goblet", 10, { w: 10 });
  mkSet(keyDaysAgo(18), "goblet", 11, { w: 10 });
  mkSet(keyDaysAgo(14), "goblet", 12, { w: 12 });
  mkSet(keyDaysAgo(14), "row", 12, { w: 10 });
  mkSet(keyDaysAgo(10), "row", 13, { w: 10 });
  mkSet(keyDaysAgo(7), "goblet", 8, { w: 12, label: "ゴブレットスクワット（深くしゃがむ）" });
  mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });
  mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });
  mkSet(keyDaysAgo(7), "hipthrust", 15, { w: 10 });
  mkSet(keyDaysAgo(4), "row", 15, { w: 10 });
  mkSet(keyDaysAgo(3), "plank", 30);
  mkSet(keyDaysAgo(2), "goblet", 14, { w: 12 });
  mkSet(keyDaysAgo(2), "plank", 45);
  mkSet(keyDaysAgo(1), "row", 12, { w: 10 });
  mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });
  mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });
  mkSet(keyDaysAgo(1), "hipthrust", 15, { w: 10 });

  session(TODAY).plan = [{ ex: "goblet", sets: 3, r: 12 }];
  session(TODAY).planAt = Date.now();
  planMemo = null;

  if (mode.indexOf("dark") >= 0) document.documentElement.setAttribute("data-theme", "dark");

  if (mode.indexOf("picker") === 0) {
    switchTab("hist");
    openPicker();
  } else if (mode.indexOf("histsheet") === 0) {
    switchTab("hist");
    openDaySheet(keyDaysAgo(7));
  } else if (mode.indexOf("histadd") === 0) {
    switchTab("hist");
    openDaySheet(keyDaysAgo(7));
    const btn = document.getElementById("haddopen");
    if (btn) btn.click();
  } else if (mode.indexOf("histundo") === 0) {
    switchTab("hist");
    openDaySheet(keyDaysAgo(7));
    const del = sheetInner.querySelector(".del[data-hid]");
    if (del) del.click();
  } else if (mode.indexOf("addday") === 0) {
    switchTab("hist");
    openAddDaySheet();
  } else if (mode.indexOf("body") === 0) {
    bodyDays = 7; switchTab("body");
  } else {
    switchTab("hist");
  }
  await new Promise(res => setTimeout(res, 60));
  window.__ready = true;
}, 0);
undefined;
