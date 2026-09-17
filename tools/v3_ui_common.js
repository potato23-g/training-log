/* 画面操作の検証で共通に使う道具（各シナリオの先頭に連結して使う） */
window.T = {
  wait: ms => new Promise(r => setTimeout(r, ms)),
  q: sel => document.querySelector(sel),
  qa: sel => Array.from(document.querySelectorAll(sel)),
  click(sel){ const el = document.querySelector(sel); if(!el) throw new Error("見つからない: " + sel); el.click(); return el; },
  reset(inv){
    state.sessions = {};
    state.gear = inv ? {items: inv, updatedAt: 1} : undefined;
    planMemo = null; tab = "today"; openEx = null; editEx = null;
    saveLocal(); render();
  },
  /* 種目を開いて、規定のセット数まで「記録」を押す */
  async recordAll(id, maxClicks){
    openEx = id; render();
    for(let k = 0; k < (maxClicks || 10); k++){
      if(isDoneToday(id)) break;
      const btn = document.querySelector(`[data-act="addset"][data-ex="${id}"]`);
      if(!btn) break;
      btn.click();
      await T.wait(30);
    }
    stopRest();
  },
  sets(id){ const e = entryFor(TODAY, id, false); return e ? e.sets.length : 0; },
  scrollTo(sel){ const el = document.querySelector(sel); if(el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12); }
};
