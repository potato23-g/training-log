/* メニューの選び方の検査（部位の回復と偏り）。dist/local/training-log.html の中で動かす。
   毎日・週4回・週3回・1日おきの頻度で35日分メニューを組み、全部こなした場合に:
   ・主役（主働筋）として3セット以上やった部位が、部位ごとの回復の日数（rules.js の RECOVER_GAP。量が多い日は1日延ばす）
     のうちにまた主役になっていないか（recoverViolations が空で合格）。7日使えていない部位のために、回復の途中でも入れた種目
     （rules.js の restIncluded。画面に理由が出る）のセットは数えず、入れた回数を included に出す
   ・1回の量が上限（rules.js の SESSION_MAX: 30セット・10種目・90分）に収まっているか（capViolations が空で合格）
   ・週の目標（各部位10セット）にどこまで届くか。毎日やる場合に、2〜5週目の平均で目標の9割以上（underTarget が空で合格。
     2026-10-05 本人の要望: 種目が増えてもよいので目標に届くように）。
     脚（大腿四頭筋・ハムストリング）は回復の日数（中3日。1日6セット以上なら中4日）で回数が決まるので7セット以上。
     内転筋・脊柱起立筋も同じ9割で見る（2026-10-06: メインで鍛える種目のヒップアダクション・バックエクステンションを足した。
     それまでは、メインで鍛える種目が1つだけ・無い部位として見ていなかった）
   ・毎日やる場合に、ハンマーカールがメニューに入るか（noHammer が空で合格。2026-10-05 本人の判断: ダンベルカールとは別の種目として入れてよい）
   ・毎日やる場合に、ヒップアダクションとバックエクステンションがメニューに入るか（notPicked が空で合格）
   ・部位ごとの週あたり有効セット（主働筋1.0・補助0.5。2〜5週目の平均）と、1回あたりの種目数・時間（weekly・size は目で見る）
   を出す。日付は記録の日付を1日ずつずらして進める（v3_volume_eval.js と同じやり方） */
setTimeout(() => {
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; planMemo = null; if(typeof resetProg === "function") resetProg();
  };
  const schedules = {daily: d => true, "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7), "1日おき": d => d % 2 === 0};
  const DAYS = 35, FROM = 7;                  /* 1週目は記録が無い状態からの立ち上がりなので数えない */
  const KEY = ["quads","glutes","hams","chest","lats","sidedelt","reardelt","triceps","biceps","calves","gmed","abs","obliques"];
  const out = {recoverViolations: [], capViolations: [], underTarget: [], noHammer: [], notPicked: [], weekly: {}, low: {}, sessions: {}, size: {}, included: {}};
  /* 週の目標に届くはずの部位（毎日やる場合）と、その下限 */
  const LEGS = ["quads", "hams"];
  const floorOf = m => LEGS.includes(m) ? 7 : WEEK_TARGET * 0.9;

  for(const [name, on] of Object.entries(schedules)){
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; planMemo = null;
    if(typeof resetProg === "function") resetProg();
    const load = {}, prim = [], primLate = [], log = [], per = [], used = {};
    let included = 0;
    for(let day = 0; day < DAYS; day++){
      prim[day] = {}; primLate[day] = {};
      if(on(day)){
        const plan = buildPlan(), s = session(TODAY);
        /* 回復の途中でも入れた種目は、記録を足す前に見ておく */
        const late = {};
        plan.forEach(it => { if(restIncluded(it)){ late[it.ex] = true; if(day >= FROM) included++; } });
        fixPlan(s);
        let sets = 0, mins = 0;
        plan.forEach(it => {
          const sug = suggestNext(it, entryFor(TODAY, it.ex, false));
          const e = entryFor(TODAY, it.ex, true), ex = EXMAP[it.ex], n = it.sets || 3;
          for(let k = 0; k < n; k++){
            const st = {id: newSetId(), at: Date.now() + k, r: sug.target, rpe: 8, label: it.label || "", target: sug.target};
            if(sug.opt) st.w = sug.w;
            e.sets.push(st);
          }
          ex.p.forEach(m => { prim[day][m] = (prim[day][m] || 0) + n; if(late[it.ex]) primLate[day][m] = (primLate[day][m] || 0) + n; });
          if(day >= FROM){
            ex.p.forEach(m => load[m] = (load[m] || 0) + n);
            (ex.s || []).forEach(m => { if(!ex.p.includes(m)) load[m] = (load[m] || 0) + n * 0.5; });
            used[it.ex] = (used[it.ex] || 0) + 1;
          }
          sets += n; mins += itemMinutes(it);
        });
        if(day >= FROM) per.push({n: plan.length, mins});
        if(sets > SESSION_MAX.sets || plan.length > SESSION_MAX.exercises || mins > SESSION_MAX.minutes + 0.5)
          out.capViolations.push(name + " " + day + "日目: " + sets + "セット・" + plan.length + "種目・" + Math.round(mins) + "分");
        log.push(day + ": " + (plan.map(it => itemName(it) + "×" + (it.sets || 3)).join(" / ") || "（休み）"));
      }
      nextDay();
    }
    /* 主役で3セット以上やった部位が、部位ごとの回復の日数（量が多い日は1日延ばす）のうちに、また主役で3セット以上
       （回復の途中でも入れた種目のセットは、あとの日の側では数えない。その日から数え始める側では数える） */
    for(let d = FROM; d < DAYS; d++){
      Object.keys(prim[d]).forEach(m => {
        if(prim[d][m] < 3) return;
        const gap = recoverGap(m) + (prim[d][m] >= RECOVER_HEAVY ? 1 : 0);
        for(let g = 1; g <= gap; g++){
          if(d + g < DAYS && (prim[d + g][m] || 0) - (primLate[d + g][m] || 0) >= 3)
            out.recoverViolations.push(name + ": " + MUSCLES[m] + " " + d + "日目→" + (d + g) + "日目（中" + (g - 1) + "日。目安は中" + gap + "日）");
        }
      });
    }
    const weeks = (DAYS - FROM) / 7, weekly = {};
    Object.keys(MUSCLES).forEach(m => weekly[MUSCLES[m]] = Math.round((load[m] || 0) / weeks * 10) / 10);
    out.weekly[name] = weekly;
    out.low[name] = KEY.filter(m => (load[m] || 0) / weeks < 6).map(m => MUSCLES[m] + " " + Math.round((load[m] || 0) / weeks * 10) / 10);
    out.sessions[name] = log.slice(7, 21);
    out.included[name] = included;
    const avg = k => Math.round(per.reduce((a, x) => a + x[k], 0) / Math.max(1, per.length) * 10) / 10;
    out.size[name] = avg("n") + "種目（最大" + Math.max.apply(null, per.map(x => x.n)) + "）・" + avg("mins") + "分（最大" + Math.round(Math.max.apply(null, per.map(x => x.mins))) + "）";
    if(name === "daily"){
      Object.keys(MUSCLES).forEach(m => { const v = (load[m] || 0) / weeks;
        if(v < floorOf(m)) out.underTarget.push(MUSCLES[m] + " " + Math.round(v * 10) / 10 + "（下限 " + floorOf(m) + "）"); });
      if(!used.hammer) out.noHammer.push(name);
      ["adduct", "backext"].forEach(id => { if(!used[id]) out.notPicked.push(EXMAP[id] ? EXMAP[id].name : id); });
    }
  }
  out.violationCount = out.recoverViolations.length;
  out.recoverViolations = out.recoverViolations.slice(0, 40);
  window.__result = out;
  window.__ready = true;
}, 300);
