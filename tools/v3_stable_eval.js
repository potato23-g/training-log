/* 種目の選び方が「気分で入れ替わらない」ことを確かめる。
   1) 同じ状況が続けば同じ種目が出る（ルーマニアンデッドリフトの両脚/片脚が交互に出ない）
   2) きつさの記録が「軽すぎる」なら一段難しい種目へ移り、そのまま続く
   3) 「限界続き」なら一段やさしい種目へ移る */
(async () => {
  const out = {};
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };

  /* rpe のきつさで days 日ぶん記録し、各トレーニング日に出た hinge 系の種目を返す */
  function run(rpe, days){
    state.sessions = {};
    state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    planMemo = null;
    const picked = [];
    for(let i = days; i >= 1; i--){
      TODAY = shiftKey(todayKey(), -i);
      planMemo = null;
      const plan = buildPlan();
      const hinge = plan.filter(it => patternOf(it.ex) === "hinge");
      picked.push(hinge.map(it => it.ex + (it.label ? "(" + it.label + ")" : "")).join(",") || "—");
      /* そのメニューを全部こなしたことにする */
      const s = session(TODAY);
      s.plan = plan.map(x => Object.assign({}, x));
      s.planAt = Date.now();
      s.entries = plan.map(it => ({ex: it.ex, sets: Array.from({length: it.sets || 3},
        () => ({id: newSetId(), at: Date.now(), r: it.r || 10, w: 10, rpe: rpe}))}));
      persistSession(TODAY);
    }
    TODAY = todayKey();
    planMemo = null;
    return picked.filter(x => x !== "—");
  }

  const mid = run(8, 12);            /* ちょうどよい */
  const easy = run(6, 12);           /* 軽すぎる */
  const hard = run(9.6, 12);         /* 限界続き */
  out.rpe8 = mid;
  out.rpe6 = easy;
  out.rpe96 = hard;
  const uniq = a => Array.from(new Set(a));
  out.rpe8Unique = uniq(mid);
  out.rpe6Unique = uniq(easy);
  out.rpe96Unique = uniq(hard);
  /* 交互に入れ替わっていないか（後半で1種類に落ち着いているか） */
  out.settled8 = uniq(mid.slice(3)).length === 1;
  out.settled6 = uniq(easy.slice(3)).length === 1;
  out.settled96 = uniq(hard.slice(3)).length === 1;
  /* 軽すぎるときは、ちょうどよいときより難しい種目を選ぶ */
  const lv = a => a.length ? itemLevel({ex: a[a.length-1].split("(")[0]}) : 0;
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
