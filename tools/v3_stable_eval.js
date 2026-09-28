/* 種目の選び方が「気分で入れ替わらない」ことを確かめる。
   1) 同じ状況が続けば同じ種目が出る（ルーマニアンデッドリフトの両脚/片脚が交互に出ない）。
      動きごとに、出た日の種目を並べ、4回以上出た動きはどれも後半の半分で1種類に落ち着いていること
   2) きつさの記録が「軽すぎる」なら一段難しい種目へ移り、そのまま続く
   3) 「限界続き」なら一段やさしい種目へ移る */
(async () => {
  const out = {};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };

  /* 日付を進めるときは todayKey() ごと差し替える（TODAY だけだと daysAgo() が本物の今日で数え、
     中1日の回復や直近7日の量がずれる） */
  const realTodayKey = todayKey, base = realTodayKey();
  /* rpe のきつさで days 日ぶん記録し、動きごとに、出た日の種目（組み方つき）を並べて返す */
  function run(rpe, days){
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
      /* そのメニューを全部こなしたことにする */
      const s = session(TODAY);
      s.plan = plan.map(x => Object.assign({}, x));
      s.planAt = Date.now();
      s.entries = plan.map(it => ({ex: it.ex, sets: Array.from({length: it.sets || 3},
        () => ({id: newSetId(), at: Date.now(), r: it.r || 10, w: 10, rpe: rpe}))}));
      persistSession(TODAY);
    }
    todayKey = realTodayKey; TODAY = todayKey();
    planMemo = null; if(typeof resetProg === "function") resetProg();
    return picked;
  }

  /* 主役にした部位は中1日をはさんで2日休ませるので、同じ動きは3〜4日に1回しか出ない。24日ぶん見る */
  const mid = run(8, 24);            /* ちょうどよい */
  const easy = run(6, 24);           /* 軽すぎる */
  const hard = run(9.6, 24);         /* 限界続き */
  const uniq = a => Array.from(new Set(a));
  const settled = m => {
    const pats = Object.keys(m).filter(p => m[p].length >= 4);
    return pats.length > 0 && pats.every(p => uniq(m[p].slice(Math.floor(m[p].length / 2))).length === 1);
  };
  out.rpe8 = mid; out.rpe6 = easy; out.rpe96 = hard;
  out.settled8 = settled(mid);
  out.settled6 = settled(easy);
  out.settled96 = settled(hard);
  /* 軽すぎるときは、ちょうどよいときより難しい組み方を選ぶ（いちばん多く出た動きの、最後の組み方で比べる） */
  const main = Object.keys(mid).sort((a, b) => mid[b].length - mid[a].length)[0];
  const lv = m => {
    const a = (m[main] || []); if(!a.length) return 0;
    const last = a[a.length - 1], ex = last.split("(")[0], label = (last.match(/\((.*)\)$/) || [])[1] || "";
    return itemLevel(catalogRow(ex, label) || {ex});
  };
  out.mainPattern = main;
  out.level8 = lv(mid); out.level6 = lv(easy); out.level96 = lv(hard);
  out.harderWhenEasy = out.level6 >= out.level8;
  out.easierWhenHard = out.level96 <= out.level8;

  /* 同じ日を2回組み直しても同じ結果になる（乱れがない） */
  state.sessions = {}; planMemo = null;
  const a = buildPlan().map(it => it.ex + "×" + (it.sets || 3));
  planMemo = null;
  const b = buildPlan().map(it => it.ex + "×" + (it.sets || 3));
  out.sameTwice = JSON.stringify(a) === JSON.stringify(b);
  out.plan = a;

  window.__result = out;
  window.__ready = true;
})();
