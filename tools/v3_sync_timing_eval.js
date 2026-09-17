/* 同期のタイミング確認（偽GitHub: tools/mock_github.py 8799 e2e-token）
   同期するのは「起動・メモ変更・ダンベル設定変更・記録・修正」だけで、それ以外では通信しないこと。
   window.__phase = "setup"（接続情報だけ入れる）/ "run"（同じプロファイルで起動して確かめる） */
(async () => {
  const r = {};
  const API = "http://127.0.0.1:8799";
  const wait = ms => new Promise(res => setTimeout(res, ms));
  localStorage.setItem("trainlog.sync.api", API);

  if(window.__phase === "setup"){
    localStorage.setItem("trainlog.sync.v1", JSON.stringify({repo: "tester/training-log-data", token: "e2e-token"}));
    window.__result = {ok: true}; window.__ready = true; return;
  }

  /* 起動時の同期（このスクリプトが動く前に始まっている）を待つ */
  const t0 = Date.now();
  while(Date.now() - t0 < 15000 && !/同期しました/.test(syncStatusText)) await wait(100);
  r.startup = {synced: /同期しました/.test(syncStatusText),
               requests: performance.getEntriesByType("resource").filter(e => e.name.startsWith(API)).length};

  /* ここからは fetch を数える */
  let calls = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opt) => { calls.push((opt && opt.method) || "GET"); return realFetch(url, opt); };
  /* リモートは trainlog/YYYY-MM.json + trainlog/settings.json に分かれている（単一の trainlog.json ではない） */
  const remoteFile = async (p) => { const res = await realFetch(API + "/_mock/file?path=" + encodeURIComponent(p), {cache: "no-store"}); return res.ok ? res.json() : null; };
  const remoteMonth = async () => remoteFile("trainlog/" + TODAY.slice(0, 7) + ".json");
  const remoteSettings = async () => remoteFile("trainlog/settings.json");
  const idle = async ms => { calls = []; await wait(ms); return calls.slice(); };

  /* 同期しないはずの操作 */
  document.dispatchEvent(new Event("visibilitychange"));            /* 画面に戻る */
  window.dispatchEvent(new Event("online"));                        /* 通信が戻る */
  tab = "today"; render();
  const items = todayItems();
  addToProgramToday("farmer");                                       /* 種目を追加 */
  r.noSync = await idle(5500);

  /* メモの変更 → 入力が落ち着いてから同期 */
  calls = [];
  const note = document.getElementById("note");
  note.value = "起動後にメモを書いた";
  note.dispatchEvent(new Event("input"));
  await wait(2000);
  r.noteBeforeDebounce = calls.slice();
  await wait(4500);
  r.noteAfter = calls.slice();
  const noteMonthFile = await remoteMonth();
  r.noteRemote = ((noteMonthFile && noteMonthFile.sessions[TODAY]) || {}).note;

  /* ダンベル設定の変更 → 入力が落ち着いてから同期（settings.json 側） */
  calls = [];
  setGearItems([{kg: 6, n: 2}]); render();
  await wait(6000);
  r.gearAfter = calls.slice();
  const settingsFile = await remoteSettings();
  r.gearRemote = (settingsFile && settingsFile.gear) ? settingsFile.gear.items : null;

  /* 記録 → すぐ同期 */
  const first = items[0];
  openEx = first.ex; render();
  calls = [];
  document.querySelector(`[data-act="addset"][data-ex="${first.ex}"]`).click();
  stopRest();
  await wait(1500);
  r.recordAfter = calls.slice();
  const recordMonthFile = await remoteMonth();
  const e1 = ((recordMonthFile && recordMonthFile.sessions[TODAY] && recordMonthFile.sessions[TODAY].entries) || []).find(x => x.ex === first.ex);
  r.recordRemoteSets = e1 ? e1.sets.length : 0;

  /* 修正で消す → すぐ同期 */
  calls = [];
  delSet(first.ex, 0);
  await wait(1500);
  r.deleteAfter = calls.slice();
  const deleteMonthFile = await remoteMonth();
  const e2 = ((deleteMonthFile && deleteMonthFile.sessions[TODAY] && deleteMonthFile.sessions[TODAY].entries) || []).find(x => x.ex === first.ex);
  r.deleteRemoteSets = e2 ? e2.sets.length : 0;

  window.fetch = realFetch;
  window.__result = r;
  window.__ready = true;
})();
