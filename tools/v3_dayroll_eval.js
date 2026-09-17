/* 日付をまたいだときに今日のメニューが切り替わるか（アプリを開いたまま翌日になった場合）
   時計を1日進めた Date に差し替えて確かめる。window.__phase: 未指定=操作で確認 / "interval"=放置で確認
   ※ Date を差し替えたまま CDP に Promise を待たせると応答が返らなくなるため、setTimeout で切り離して実行する */
setTimeout(async () => {
  const r = {};
  const wait = ms => new Promise(res => setTimeout(res, ms));
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
  planMemo = null; tab = "today"; openEx = null; editEx = null; render();

  /* 1日目: 最初の種目を1セット記録（その日のメニューが保存される） */
  const first = todayItems()[0];
  openEx = first.ex; render();
  document.querySelector(`[data-act="addset"][data-ex="${first.ex}"]`).click();
  stopRest();
  const day1 = TODAY;
  r.day1 = {today: day1, label: document.getElementById("todayLabel").textContent,
            items: todayItems().map(i => i.ex), routine: session(day1).routine, sets: entryFor(day1, first.ex, false).sets.length};

  /* 時計を1日進める（アプリは開いたまま。画面は前日のまま） */
  const RealDate = Date, shift = 24 * 3600 * 1000;
  class ShiftedDate extends RealDate {
    constructor(...a){ if(a.length === 0) super(RealDate.now() + shift); else super(...a); }
    static now(){ return RealDate.now() + shift; }
  }
  window.Date = ShiftedDate;
  const snap = () => ({today: TODAY, label: document.getElementById("todayLabel").textContent,
    hero: (document.querySelector(".hero h2") || {}).textContent, items: todayItems().map(i => i.ex), routine: routineToday(),
    day1Sets: entryFor(day1, first.ex, false).sets.length, day2Entries: (state.sessions[TODAY] || {entries: []}).entries.length});

  if(window.__phase === "interval"){
    await wait(62000);                                   /* 何も触らずに1分ちょっと置く */
    r.afterIdle = snap();
  }else{
    /* 前日の画面のまま「記録」を押す → 前日にも翌日にも記録されず、今日のメニューに切り替わる */
    const staleBtn = document.querySelector(`[data-act="addset"][data-ex="${first.ex}"]`);
    r.staleButtonExists = !!staleBtn;
    if(staleBtn) staleBtn.click();
    stopRest();
    r.afterStaleClick = Object.assign(snap(), {status: document.getElementById("status").textContent});
    /* 翌日のメニューで普通に記録できる */
    const d2first = todayItems()[0];
    openEx = d2first.ex; render();
    document.querySelector(`[data-act="addset"][data-ex="${d2first.ex}"]`).click();
    stopRest();
    r.day2Record = {ex: d2first.ex, sets: entryFor(TODAY, d2first.ex, false).sets.length, planFixed: (session(TODAY).plan || []).length, routine: session(TODAY).routine};
    window.scrollTo(0, 0);
  }
  window.Date = RealDate;
  window.__result = r;
  window.__ready = true;
}, 0);
undefined;
