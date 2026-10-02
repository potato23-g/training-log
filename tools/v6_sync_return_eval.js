/* 画面に戻ったときの同期と、古いメニューのまま記録したときの通し（2026-10-02 本人の指摘。偽GitHub: tools/mock_github.py）。
   v6_sync_return_e2e.py から、dist/local/training-log.html の中で動かす。
   「もう1台の端末」は、偽GitHub のファイルを直接書き換えて再現する（PC→スマホ・スマホ→PC のどちらも、
   この端末から見れば「ほかの端末が先にメニューを変えていた」という同じ形になる） */
(async () => {
  const out = {fail: [], pass: 0};
  const ok = (c, msg) => { if(c) out.pass++; else out.fail.push(msg); };
  const API = "http://127.0.0.1:8851", REPO = "tester/training-log-data", TOKEN = "e2e-token";
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 8000)){ if(fn()) return true; await wait(50); } return false; };
  const idle = () => until(() => !syncRunning && !syncRerunRequested, 10000);
  const menu = () => activeItems().map(i => i.ex).join(",");
  try{
    localStorage.setItem("trainlog.sync.api", API);
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    catalogMemo = null; planMemo = null; resetProg();
    tab = "today"; openEx = null; render();
    ok(await syncConnect(REPO, TOKEN) === true, "偽GitHub に接続できない: " + syncStatusText);

    /* この端末で今日のメニューを決めて同期する */
    const s0 = session(TODAY);
    s0.plan = [catalogItem("row"), catalogItem("curl"), catalogItem("calf")]; s0.planAt = stampNow();
    persistSession(TODAY); render();
    await syncNow();
    ok(menu() === "row,curl,calf", "前提: 今日のメニューが決まっていない: " + menu());

    /* もう1台の端末がメニューを変えて同期した、を偽GitHub の上で再現する */
    const path = "trainlog/" + TODAY.slice(0, 7) + ".json";
    const b64 = t => btoa(unescape(encodeURIComponent(t)));
    const otherDevice = async edit => {
      const auth = {Authorization: "Bearer " + TOKEN};
      const list = await (await fetch(API + "/repos/" + REPO + "/contents/trainlog", {headers: auth, cache: "no-store"})).json();
      const sha = (list.find(x => x.path === path) || {}).sha;
      const file = await (await fetch(API + "/_mock/file?path=" + encodeURIComponent(path), {cache: "no-store"})).json();
      edit(file.sessions[TODAY]);
      const res = await fetch(API + "/repos/" + REPO + "/contents/" + path, {method: "PUT",
        headers: Object.assign({"Content-Type": "application/json"}, auth),
        body: JSON.stringify({message: "other device", content: b64(JSON.stringify(file)), sha})});
      return res.ok;
    };
    const remotePlan = async () => {
      const file = await (await fetch(API + "/_mock/file?path=" + encodeURIComponent(path), {cache: "no-store"})).json();
      return (file.sessions[TODAY].plan || []).map(x => x.ex).join(",");
    };

    /* ---- 1. 画面に戻ると同期して、記録する前に新しいメニューになる ---- */
    ok(await otherDevice(s => { s.plan = [{ex: "pushup"}, {ex: "plank"}]; s.planAt = s.planEdit = Date.now() + 1000; s.updatedAt = Date.now(); }),
       "もう1台の端末の書き込みに失敗（検査の前提）");
    ok(menu() === "row,curl,calf", "前提: この端末はまだ古いメニューのはず: " + menu());
    /* 同期したばかりのときは、戻っても通信しない */
    let calls = 0;
    const realFetch = window.fetch.bind(window);
    window.fetch = (u, o) => { calls++; return realFetch(u, o); };
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(400);
    ok(calls === 0, "同期したばかりなのに、画面に戻ったときに通信した（" + calls + " 回）");
    syncLastEndAt = 0;                                   /* 前の同期から時間がたった体 */
    document.dispatchEvent(new Event("visibilitychange"));
    await until(() => menu() === "pushup,plank", 8000);
    window.fetch = realFetch;
    await idle(); await wait(150);
    ok(menu() === "pushup,plank", "画面に戻っても、ほかの端末で変えたメニューにならない: " + menu());
    ok(/ほかの端末の変更を取り込み/.test(document.getElementById("view").innerText), "メニューが変わったことを今日タブで知らせていない");

    /* ---- 2. 戻ったときの同期が間に合わず、古いメニューのまま記録した場合 ---- */
    ok(await otherDevice(s => { s.plan = [{ex: "ohp"}, {ex: "crunch"}]; s.planAt = s.planEdit = Date.now() + 5000; s.updatedAt = Date.now(); }),
       "もう1台の端末の書き込みに失敗（検査の前提）");
    tab = "today"; openEx = "pushup"; render();
    const btn = document.querySelector('[data-act="addset"][data-ex="pushup"]');
    ok(!!btn, "古いメニューの種目の「記録」ボタンが無い（検査の前提）");
    if(btn) btn.click();                                 /* 記録 → その場で同期 */
    stopRest();
    await until(() => (session(TODAY).plan || []).some(x => x.ex === "ohp"), 8000);
    await idle(); await wait(150);
    const names = (session(TODAY).plan || []).map(x => x.ex).join(",");
    ok(names === "ohp,crunch,pushup", "古いメニューのまま記録した種目が、取り込んだメニューの末尾に入っていない: " + names);
    ok(!todayItems().some(i => i.extra), "メニューに無い記録（メニュー外の行）が残っている");
    ok((entryFor(TODAY, "pushup", false) || {sets: []}).sets.length === 1, "記録したセットが消えた");
    ok(await remotePlan() === "ohp,crunch,pushup", "リモートのメニューに、記録した種目が入っていない: " + await remotePlan());
    ok(/pushup|腕立て伏せ/.test(document.getElementById("view").innerText), "記録した種目が今日タブに出ていない");

    /* ---- 3. もう一度同期しても、送り直しが起きない ---- */
    let puts = 0;
    window.fetch = (u, o) => { if(o && o.method === "PUT") puts++; return realFetch(u, o); };
    await syncNow(); await syncNow();
    window.fetch = realFetch;
    ok(puts === 0, "合流が済んだあとの同期で書き込みが起きた（" + puts + " 回）");
  }catch(e){
    out.fail.push("途中で止まった: " + (e && e.stack || e));
  }
  /* 後始末: この端末の接続情報を消す */
  try{ syncClearConfig(); localStorage.removeItem("trainlog.sync.api"); }catch(e){}
  window.__result = out;
  window.__ready = true;
})();
