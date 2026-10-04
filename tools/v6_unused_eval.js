/* 「使えていない部位」（直近7日で有効セット0）がメニューに入るかの検査（2026-10-04 本人の指摘:
   一週間使えていない部位がメニューに出てこなかった）。dist/local/training-log.html の中で動かす。
   頻度（毎日・週4回・週3回・1日おき・週2回）×こなし方（全部／上から3種目だけ）で42日ぶんメニューを組み:
   ・全部こなしているのに、使えていない部位を使う種目（主・補助）がメニューに1つも無い日（missedAllDone が空で合格）
   ・記録が無いことだけが理由で、メニューから外れている動き（noRecordOnly が空で合格）。
     その動きを60日前に1回やっていたことにして組み直し、それでメニューに入るなら「記録が無いから外れていた」。
     以前は、記録の無い動きのうち、選ぶ種目が標準の段でないもの（ワンハンドロウ・ダンベルカール・サイドレイズ・
     シュラッグ・ファーマーズウォーク・サイドベンド・プランクなど）が、記録が付くまで価値を半分以下に数えられて、
     使えていない部位があっても入らなかった
   ・上から3種目だけのときの、部位ごとの「入らなかった回数/0だった回数」（partial。目で見る）
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
  const record = (dateKey, it) => {
    const sug = suggestNext(it, entryFor(dateKey, it.ex, false));
    const e = entryFor(dateKey, it.ex, true), n = it.sets || 3;
    for(let k = 0; k < n; k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target};
      if(sug.opt) st.w = sug.w;
      e.sets.push(st);
    }
  };
  const schedules = {daily: d => true, "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7),
                     "1日おき": d => d % 2 === 0, "2/week": d => [0,3].includes(d % 7)};
  const modes = {"全部やる": p => p, "上から3種目だけ": p => p.slice(0, 3)};
  const DAYS = 42, FROM = 7, PROBE_DAYS = 14, OLD = shiftKey(TODAY, -60);
  const patterns = Array.from(new Set(EX.map(e => patternOf(e.id))));
  const has = (plan, pat) => plan.some(it => patternOf(it.ex) === pat);
  const out = {missedAllDone: [], noRecordOnly: [], partial: {}, probed: 0, skipped: 0};

  /* 記録の無い動きで、今日のメニューに入っていないものを1つずつ調べる */
  const probe = tag => {
    fresh();
    const A = buildPlan().slice();
    patterns.forEach(pat => {
      if(has(A, pat) || patternHistory(pat).length) return;
      /* この動きだけを候補にして組むと、記録が無いときに選ぶ種目が分かる。入らなければ今日はできない動き（回復の途中など） */
      planSkip = new Set(patterns.filter(x => x !== pat)); fresh();
      const only = buildPlan().filter(it => patternOf(it.ex) === pat)[0];
      planSkip = null; fresh();
      if(!only) return;
      record(OLD, only); fresh();
      const K = patternNext(pat);
      if(K && itemKey(K) === itemKey(only)){
        out.probed++;
        if(has(buildPlan(), pat)) out.noRecordOnly.push(tag + ": " + itemName(only));
      }else out.skipped++;                    /* 次の段に進んだなど、同じ組み方で比べられない */
      delete state.sessions[OLD]; fresh();
    });
  };

  for(const [mode, pick] of Object.entries(modes)){
    for(const [name, on] of Object.entries(schedules)){
      state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; fresh();
      const stat = {};
      Object.keys(MUSCLES).forEach(m => stat[m] = {zero: 0, missed: 0});
      for(let day = 0; day < DAYS; day++){
        if(on(day)){
          if(day < PROBE_DAYS) probe(mode + " " + name + " " + day + "日目");
          const zero = Object.keys(MUSCLES).filter(m => muscleLoadBetween(m, 1, 6) === 0);
          const plan = buildPlan(), s = session(TODAY);
          fixPlan(s);
          const cover = new Set();
          plan.forEach(it => Object.keys(exLoad(it.ex, 3)).forEach(m => cover.add(m)));
          if(day >= FROM){
            const miss = zero.filter(m => !cover.has(m));
            zero.forEach(m => { stat[m].zero++; if(!cover.has(m)) stat[m].missed++; });
            if(miss.length && mode === "全部やる")
              out.missedAllDone.push(name + " " + day + "日目: " + miss.map(m => MUSCLES[m]).join("・") + "（" + plan.map(it => itemName(it)).join(" / ") + "）");
          }
          pick(plan).forEach(it => record(TODAY, it));
        }
        nextDay();
      }
      if(mode !== "全部やる"){
        const rows = {};
        Object.keys(MUSCLES).forEach(m => { if(stat[m].missed) rows[MUSCLES[m]] = stat[m].missed + "/" + stat[m].zero; });
        out.partial[name] = rows;
      }
    }
  }
  out.noRecordCount = out.noRecordOnly.length;
  out.noRecordOnly = out.noRecordOnly.slice(0, 40);
  out.missedAllDone = out.missedAllDone.slice(0, 40);
  window.__result = out;
  window.__ready = true;
}, 300);
