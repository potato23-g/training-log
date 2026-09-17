/* 実ビルドを2つのプロファイル（PC役・スマホ役）で開き、偽GitHub（tools/mock_github.py）経由で同期する。
   window.__phase: "form"（未接続のカードを表示）/ "pc1" / "phone1" / "pc2" */
(async () => {
  const r = {phase: window.__phase};
  const until = async (fn, ms) => { const t0 = Date.now(); while(Date.now() - t0 < (ms || 15000)){ if(fn()) return true; await T.wait(100); } return false; };
  const summary = () => {
    const out = {};
    Object.keys(state.sessions).sort().forEach(d => {
      const s = state.sessions[d];
      out[d] = {entries: (s.entries || []).map(e => e.ex + ":" + e.sets.map(x => (x.w !== undefined ? x.w + "x" : "") + x.r).join(",")), note: s.note || "", del: (s.del || []).length, plan: (s.plan || []).length};
    });
    return {sessions: out, gear: state.gear ? state.gear.items : null};
  };
  localStorage.setItem("trainlog.sync.api", "http://127.0.0.1:8799");
  const connect = async () => {
    switchTab("hist");
    T.q("#syncRepo").value = "tester/training-log-data";
    T.q("#syncToken").value = "e2e-token";
    T.click('[data-sync="connect"]');
    r.connected = await until(() => syncLoadConfig() && /同期しました/.test(syncStatusText), 20000);
    r.connectStatus = syncStatusText;
  };

  if(window.__phase === "form"){
    switchTab("hist");
    const d = T.q("details"); if(d) d.open = true;
    r.card = !!T.q('[data-sync="connect"]');
  }

  if(window.__phase === "pc1"){
    await connect();
    setGearItems([{kg:8, n:2}, {kg:5, n:2}]);
    switchTab("today");
    const first = todayItems()[0];
    r.first = first.ex;
    await T.recordAll(first.ex);
    await syncNow();
    r.status = syncStatusText;
    switchTab("hist");
  }

  if(window.__phase === "phone1"){
    r.before = summary();
    await connect();
    r.afterConnect = summary();
    switchTab("today");
    const first = todayItems()[0];
    r.first = first.ex;
    r.lockedFromPc = !!T.q(`.exrow.done .fix[data-ex="${first.ex}"]`);
    /* 修正 → 2セット目を消す → もう一度記録（重さを一段変えて、違いが分かるようにする） */
    T.click(`.fix[data-ex="${first.ex}"]`);
    T.qa(`[data-act="delset"][data-ex="${first.ex}"]`)[1].click();
    T.click(`[data-act="step"][data-t="r"][data-ex="${first.ex}"][data-d="1"]`);
    T.click(`[data-act="addset"][data-ex="${first.ex}"]`);
    stopRest();
    const s = session(TODAY); s.note = "スマホで修正した"; s.noteAt = Date.now(); persistSession(TODAY);
    await syncNow();
    r.status = syncStatusText;
    r.after = summary();
    render(); window.scrollTo(0, 0);
  }

  if(window.__phase === "pc2"){
    /* 起動時の自動同期を待つ */
    r.synced = await until(() => /同期しました/.test(syncStatusText), 20000);
    r.after = summary();
    switchTab("today");
    window.scrollTo(0, 0);
  }

  window.__result = r;
  window.__ready = true;
})();
