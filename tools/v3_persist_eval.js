/* 持っているダンベルの設定と今日のメニューが、再読み込み後も残るか。
   1回目（window.__phase="write"）で保存、2回目（同じプロファイル）で読み出す */
(async () => {
  const r = {};
  if(window.__phase === "write"){
    state.sessions = {};
    setGearItems([{kg:8, n:2}, {kg:4, n:1}]);
    const s = session(TODAY);
    fixPlan(s);
    persistSession(TODAY);
    /* 旧形式の器具設定だけが入ったデータも読み替えられるか */
    const legacy = JSON.parse(localStorage.getItem("trainlog.v1"));
    r.saved = {gear: legacy.gear, plan: (legacy.sessions[TODAY].plan || []).map(x => x.ex)};
    localStorage.setItem("trainlog.legacytest", JSON.stringify({sessions: {}, gear: {unit: 7.5, count: 1, adjustable: true, max: 20}}));
  }else{
    r.loaded = {gear: state.gear, inventory: inventory(), plan: (session(TODAY).plan || []).map(x => x.ex)};
    r.legacy = readGear(JSON.parse(localStorage.getItem("trainlog.legacytest")).gear);
    r.legacyZero = readGear({unit: 5, count: 0});
  }
  window.__result = r;
  window.__ready = true;
})();
