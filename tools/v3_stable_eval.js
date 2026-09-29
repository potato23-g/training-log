/* 種目の選び方が「気分で入れ替わらない」ことと、記録の出来で段が動くことを確かめる。
   1) 同じ状況が続けば同じ種目が出る（ルーマニアンデッドリフトの両脚/片脚が交互に出ない）。
      動きごとに、出た日の種目を並べ、4回以上出た動きはどれも後半の半分で1種類に落ち着いていること
   2) 全部のセットで目標に届き続けたときは、届かない回が続いたときより上の段にいる
   （きつさの入力は 2026-09-29 にやめた。出来は、回数が目標に届いたかだけで見る） */
(async () => {
  const out = {};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };

  /* 日付を進めるときは todayKey() ごと差し替える（TODAY だけだと daysAgo() が本物の今日で数え、
     回復の日数や直近7日の量がずれる） */
  const realTodayKey = todayKey, base = realTodayKey();
  /* days 日ぶん毎日メニューを組んで全部こなしたことにし、動きごとに、出た日の種目（組み方つき）を並べて返す。
     mode: steady = 目標を書かない古い形の記録で毎回10回（前回の回数がそのまま目標になるので段は動かない）
           hit    = 全部のセットで目標どおり
           miss   = 最後のセットだけ目標に3回届かない */
  function run(mode, days){
    state.sessions = {};
    state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    planMemo = null;
    const picked = {};
    for(let i = days; i >= 1; i--){
      const k = shiftKey(base, -i);
      todayKey = () => k; TODAY = k;
      planMemo = null; if(typeof resetProg === "function") resetProg();
      const plan = buildPlan();
      plan.forEach(it => {
        const pat = patternOf(it.ex);
        (picked[pat] = picked[pat] || []).push(it.ex + (it.label ? "(" + it.label + ")" : ""));
      });
      const s = session(TODAY);
      s.plan = plan.map(x => Object.assign({}, x));
      s.planAt = Date.now();
      s.entries = [];
      plan.forEach(it => {
        const e = {ex: it.ex, sets: []};
        s.entries.push(e);
        const n = it.sets || 3;
        for(let j = 0; j < n; j++){
          if(mode === "steady"){ e.sets.push({id: newSetId(), at: Date.now() + j, r: 10, w: 10}); continue; }
          const sug = suggestNext(it, e);
          const r = mode === "miss" && j === n - 1 ? Math.max(1, sug.target - 3) : sug.target;
          const st = {id: newSetId(), at: Date.now() + j, r, label: it.label || "", target: sug.target};
          if(sug.opt) st.w = sug.w;
          e.sets.push(st);
        }
      });
      persistSession(TODAY);
    }
    todayKey = realTodayKey; TODAY = todayKey();
    planMemo = null; if(typeof resetProg === "function") resetProg();
    return picked;
  }

  /* 主役にした部位は部位ごとの日数を空けるので、大きな部位の動きは4日に1回ほどしか出ない。24日ぶん見る */
  const steady = run("steady", 24);
  const hit = run("hit", 24);
  const miss = run("miss", 24);
  const uniq = a => Array.from(new Set(a));
  const settled = m => {
    const pats = Object.keys(m).filter(p => m[p].length >= 4);
    return pats.length > 0 && pats.every(p => uniq(m[p].slice(Math.floor(m[p].length / 2))).length === 1);
  };
  out.steady = steady; out.hit = hit; out.miss = miss;
  out.settledSteady = settled(steady);
  /* 動きごとの最後の組み方の段を、届き続けた回と届かない回が続いた回で比べる（両方で3回以上出た動き） */
  const lastLevel = (m, pat) => {
    const a = m[pat] || []; if(!a.length) return null;
    const last = a[a.length - 1], ex = last.split("(")[0], label = (last.match(/\((.*)\)$/) || [])[1] || "";
    return itemLevel(catalogRow(ex, label) || {ex});
  };
  const pats = Object.keys(hit).filter(p => (hit[p] || []).length >= 3 && (miss[p] || []).length >= 3);
  out.levels = {};
  let sumHit = 0, sumMiss = 0, lower = [];
  pats.forEach(p => {
    const h = lastLevel(hit, p), mm = lastLevel(miss, p);
    out.levels[p] = {hit: h, miss: mm, steady: lastLevel(steady, p)};
    sumHit += h; sumMiss += mm;
    if(h < mm) lower.push(p);
  });
  out.comparedPatterns = pats.length;
  out.hitAboveMiss = pats.length > 0 && sumHit > sumMiss;
  /* 届き続けたのに、届かない回が続いたときより下の段にいる動きが無い */
  out.hitNeverBelowMiss = lower.length === 0;
  out.hitBelowMiss = lower;

  /* 同じ日を2回組み直しても同じ結果になる（乱れがない） */
  state.sessions = {}; planMemo = null;
  const a = buildPlan().map(it => it.ex + "×" + (it.sets || 3));
  planMemo = null;
  const b = buildPlan().map(it => it.ex + "×" + (it.sets || 3));
  out.sameTwice = JSON.stringify(a) === JSON.stringify(b);
  out.plan = a;
  /* セット数は種目によらず3 */
  out.allThreeSets = buildPlan().every(it => it.sets === 3);

  window.__result = out;
  window.__ready = true;
})();
