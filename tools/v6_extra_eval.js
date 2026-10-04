/* 自分で種目を足しているときに、使えていない部位の種目が「補助で使う部位の量」を理由に外れないかの検査
   （2026-10-04 本人の指摘: 大腿四頭筋と内転筋が一週間使えていないのに、メニューに出てこなかった）。
   dist/local/training-log.html の中で動かす。
   スクワットとランジはどれも腹直筋を補助で使う。以前は、腹筋の種目を足して腹直筋の1週間の量が上限を超えると、
   スクワットもランジも入らなくなり、大腿四頭筋と内転筋を使う種目が1つも無い日が何週間も続いた。
   頻度4通りで42日ぶんメニューを組み、毎回メニューを全部こなしたうえで、クランチとプランクを足す。
   ・直近7日で有効セット0の部位を、メニューのどの種目も使わない日に、その部位をメインで鍛える動きが入らなかった理由
     （planner.js の planWhy）を見る。理由が「メインで鍛える部位が回復の途中」（rest:…）でも「その日の種目数・時間が
     いっぱい」（full・time）でもない動きがあれば不合格（blocked が空で合格）。1日・1週間の上限（day:…・week:…）で
     外れた日がここに出る。仕上げにだけ入れる動き（rules.js の PATTERN_AFTER）は見ない
   ・回復の途中が理由の日数（waiting）、種目数・時間がいっぱいで入らなかった日数（full）、大腿四頭筋をメインで
     鍛えなかった一番長い日数（quadGap）、腹直筋の直近7日の量の最大（absMax）は目で見る
   ・最後に、腹筋の種目を先にやってからメニューを組んだ日も見る（absFirst が空で合格）
   日付は記録の日付を1日ずつずらして進める（v5_balance_eval.js と同じやり方） */
setTimeout(() => {
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; fresh();
  };
  const record = it => {
    const sug = suggestNext(it, entryFor(TODAY, it.ex, false));
    const e = entryFor(TODAY, it.ex, true), n = it.sets || 3;
    for(let k = 0; k < n; k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target};
      if(sug.opt) st.w = sug.w;
      e.sets.push(st);
    }
  };
  const schedules = {daily: d => true, "1日おき": d => d % 2 === 0, "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7)};
  const EXTRA = ["crunch", "plank"];
  const DAYS = 42, FROM = 7;
  /* 部位ごとの、その部位をメインで鍛える動き（仕上げにだけ入れる動きは除く） */
  const mainPatterns = {};
  Object.keys(MUSCLES).forEach(m => mainPatterns[m] = Array.from(new Set(EX.filter(e => e.p.includes(m)).map(e => patternOf(e.id))))
    .filter(pat => !PATTERN_AFTER[pat]));
  const out = {blocked: [], blockedCount: 0, waiting: {}, full: {}, quadGap: {}, absMax: {}};

  for(const [name, on] of Object.entries(schedules)){
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; fresh();
    let wait = 0, full = 0, gap = 0, maxGap = 0, absMax = 0;
    for(let day = 0; day < DAYS; day++){
      if(on(day)){
        fresh(); planWhy = {};
        const plan = buildPlan().slice(), why = planWhy;
        planWhy = null;
        fixPlan(session(TODAY));
        absMax = Math.max(absMax, muscleLoadBetween("abs", 1, 6));
        if(day >= FROM){
          const cover = new Set();
          plan.forEach(it => Object.keys(exLoad(it.ex, 3)).forEach(m => cover.add(m)));
          let waited = false, crowded = false;
          Object.keys(MUSCLES).filter(m => muscleLoadBetween(m, 1, 6) === 0 && !cover.has(m)).forEach(m => {
            const off = mainPatterns[m].filter(pat => !plan.some(it => patternOf(it.ex) === pat));
            const bad = off.filter(pat => !/^(rest:|full$|time$)/.test(why[pat] || ""));
            if(bad.length){
              out.blockedCount++;
              if(out.blocked.length < 40) out.blocked.push(name + " " + day + "日目 " + MUSCLES[m] + ": "
                + bad.map(pat => pat + "=" + (why[pat] || "入れられるのに選ばれていない")).join(" ")
                + "（" + plan.map(it => itemName(it)).join(" / ") + "）");
            }
            else if(off.some(pat => /^rest:/.test(why[pat]))) waited = true;
            else if(off.length) crowded = true;
          });
          if(waited) wait++;
          if(crowded) full++;
        }
        plan.forEach(record);
        EXTRA.forEach(id => { if(!entryFor(TODAY, id, false)) record(catalogItem(id)); });
        fresh();
      }
      const didQuads = (session(TODAY).entries || []).some(e => e.sets.length && EXMAP[e.ex] && EXMAP[e.ex].p.includes("quads"));
      gap = didQuads ? 0 : gap + 1; maxGap = Math.max(maxGap, gap);
      nextDay();
    }
    out.waiting[name] = wait; out.full[name] = full; out.quadGap[name] = maxGap; out.absMax[name] = absMax;
  }

  /* 腹筋の種目を先にやってから、メニューを組んだ日（クランチとプランクを3セットずつで、腹直筋が1日の上限ちょうど）。
     スクワットとランジが、連日でもよい部位の1日の上限（day:…）を理由に外れていたら不合格（absFirst が空で合格） */
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; fresh();
  EXTRA.forEach(id => record(catalogItem(id)));
  fresh(); planWhy = {};
  const first = buildPlan().slice(), firstWhy = planWhy;
  planWhy = null;
  const dailyOk = Object.keys(MUSCLES).filter(m => recoverGap(m) === 0);
  out.absFirst = ["squat", "lunge"].filter(pat => dailyOk.some(m => firstWhy[pat] === "day:" + m))
    .map(pat => pat + "=" + firstWhy[pat] + "（" + first.map(it => itemName(it)).join(" / ") + "）");
  window.__result = out;
  window.__ready = true;
}, 300);
