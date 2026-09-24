
/* メニューの候補一覧。A〜Dに書いてある組み方（セット数・回数・メモ）を先に並べ、
   そこに無い種目は種目表の既定値で足し、最後に楽／大変のやり方を足す。
   種目を増やせば自動で候補に入る */
let catalogMemo = null;
function catalog(){
  if(catalogMemo) return catalogMemo;
  const out = [];
  ROUTINES.forEach(r => r.items.forEach(it => {
    if(!out.some(x => x.ex === it.ex && (x.label||"") === (it.label||""))) out.push(it);
  }));
  EX.forEach(e => {
    if(out.some(x => x.ex === e.id)) return;
    const it = {ex:e.id, sets:e.sets || 3, r:e.r};
    if(e.side) it.side = true;
    out.push(it);
  });
  VARIANT_ROWS.forEach(v => { if(!out.some(x => (x.label || "") === v.label)) out.push(Object.assign({}, v)); });
  catalogMemo = out;
  return out;
}
function catalogItem(exId){
  const c = catalog().find(x => x.ex === exId), ex = EXMAP[exId];
  return c ? Object.assign({}, c) : {ex:exId, sets:ex.sets || 3, r:ex.r};
}
/* 部位ごとの有効セット（fromDaysAgo〜toDaysAgo 日前。今日は含めない） */
function loadMap(fromDaysAgo, toDaysAgo){
  const out = {};
  Object.keys(MUSCLES).forEach(m => out[m] = muscleLoadBetween(m, fromDaysAgo, toDaysAgo));
  return out;
}
/* 種目を n セットやったときの部位ごとの有効セット（muscleLoadBetween と同じ数え方） */
function exLoad(exId, n){
  const ex = EXMAP[exId], out = {};
  ex.p.forEach(m => out[m] = n);
  (ex.s||[]).forEach(m => { if(!ex.p.includes(m)) out[m] = n * 0.5; });
  return out;
}
/* 1種目にかかる時間（分）の目安。1回4秒（秒数の種目はその秒数）、左右ありは2倍と持ち替え、
   セット間は休憩タイマーの秒数、種目の切り替えに1分 */
function itemMinutes(it){
  const ex = EXMAP[it.ex], sets = it.sets || 3, side = !!it.side;
  const reps = suggestNext(it, null, lastPerformance(it.ex, TODAY)).r;
  const work = ex.kind === "t" ? reps * (side ? 2 : 1) + 15 : reps * 4 * (side ? 2 : 1) + (side ? 15 : 0) + 15;
  return (sets * work + (sets - 1) * restFor(it) + 60) / 60;
}

let planMemo = null;                       /* 描画1回のあいだだけ使い回す */
let planAvoid = null;                      /* 組み直しのとき、さっきまで出ていた（まだ手を付けていない）種目を避ける */
let todayMsg = "";                         /* 今日タブの操作の結果を、押したボタンのすぐ下に1回だけ出す */
let planSeed = null;                       /* 「おまかせで追加」のとき、今のメニューを入れた状態から考える */
let planOne = false;                       /* 同上。足すのは1種目だけ */
let planRelax = false;                     /* 同上。1回の量の目安（16セット・6種目・50分）を外して探す */
function buildPlan(){
  if(planMemo) return planMemo;
  const week = loadMap(1, 6);              /* 直近7日 = 1〜6日前 + 今日の分 */
  const yesterday = loadMap(1, 1);
  const touched = patternsYesterday();
  const today = {}, plan = [];
  let sets = 0, minutes = 0;
  const minutesMemo = {};
  const mins = it => {
    const k = it.ex + "|" + (it.label || "") + "|" + (it.sets || 3);
    if(minutesMemo[k] === undefined) minutesMemo[k] = itemMinutes(it);
    return minutesMemo[k];
  };

  /* 今日すでに記録したぶんは先に数えておく（メニューを組み直したときに、同じ動きや同じ部位が重ならないように） */
  const doneToday = (session(TODAY).entries || []).filter(e => e.sets.length && EXMAP[e.ex]);
  const donePattern = new Set(doneToday.map(e => patternOf(e.ex)));
  doneToday.forEach(e => {
    const add = exLoad(e.ex, e.sets.length);
    Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
    sets += e.sets.length;
    minutes += itemMinutes({ex: e.ex, sets: e.sets.length, r: EXMAP[e.ex].r});
  });

  /* 部位 m に add セット足したときの価値。週の目標までは1、目標を超えて上限までは0.35 */
  const worth = (m, add) => {
    const have = (week[m] || 0) + (today[m] || 0);
    const under = Math.max(0, Math.min(add, WEEK_TARGET - have));
    const over = Math.max(0, Math.min(add - under, WEEK_MAX - Math.max(have, WEEK_TARGET)));
    return (PRIORITY[m] || 0) * (under + over * 0.35);
  };
  const gain = c => { const add = exLoad(c.ex, c.sets || 3); return Object.keys(add).reduce((a, m) => a + worth(m, add[m]), 0); };
  const allowed = c => {
    const ex = EXMAP[c.ex], n = c.sets || 3, add = exLoad(c.ex, n);
    if(plan.some(p => patternOf(p.ex) === patternOf(c.ex))) return false;          /* 同じ動きは1日1つ */
    if(donePattern.has(patternOf(c.ex))) return false;                              /* 今日もうやった動き */
    if(planAvoid && planAvoid.has(c.ex)) return false;                              /* 組み直しで避ける種目 */
    if(touched.has(patternOf(c.ex))) return false;                                  /* 昨日と同じ動きは続けない */
    if(ex.kind === "w" && !gearOptions(c.ex).length) return false;                  /* 持っているダンベルで作れない */
    if(ex.p.some(m => (yesterday[m] || 0) >= recoverLimit(m))) return false;       /* 回復待ちの部位が主役 */
    if(Object.keys(add).some(m => (today[m] || 0) + add[m] > dayMax(m))) return false;   /* 1日の上限（補助で使う部位も含む） */
    /* 週の上限。狙いの部位（主働筋の先頭）はWEEK_MAX、同じ種目でついでに使う部位は少し多めまで許す
       （スクワットの尻のように、ほかの種目の付け合わせで先に上限へ届いてしまうのを防ぐ） */
    if(Object.keys(add).some(m => (week[m] || 0) + (today[m] || 0) + add[m] > (m === ex.p[0] ? WEEK_MAX : WEEK_MAX + 4))) return false;
    if(!planRelax && (plan.length >= SESSION_MAX.exercises || sets + n > SESSION_MAX.sets)) return false;
    if(!planRelax && minutes + mins(c) > SESSION_MAX.minutes) return false;
    return true;
  };
  /* 同じ動きの中では、今の負荷に合う難しさの種目を選ぶ。
     変化をつけるための加点はしない（同じ状況なら毎回同じ種目が出る） */
  const wantMemo = {};
  const want = pat => (wantMemo[pat] === undefined ? (wantMemo[pat] = wantedLevel(pat)) : wantMemo[pat]);
  /* 段が同じなら、素の種目を先に選ぶ（楽／大変のやり方は、その段が要るときだけ出す） */
  const score = c => gain(c) / (1 + 1.2 * Math.abs(itemLevel(c) - want(patternOf(c.ex)))) * (c.lv ? 0.8 : 1);
  const take = c => {
    const it = Object.assign({}, c), add = exLoad(it.ex, it.sets || 3);
    Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
    sets += it.sets || 3; minutes += mins(it);
    plan.push(it);
  };
  const fill = (minGain, upTo, only) => {
    while(plan.length < upTo){
      const best = catalog().filter(c => (!only || only(c)) && allowed(c)).map(c => ({c, g: gain(c), s: score(c)}))
        .filter(x => x.g >= minGain).sort((a, b) => b.s - a.s)[0];
      if(!best) return;
      take(best.c);
    }
  };
  const need = it => { const m = EXMAP[it.ex].p[0]; return WEEK_TARGET - (week[m] || 0) - (today[m] || 0); };
  /* 大きい部位が週の目標に届いていなければ、その部位が主役の種目を1セットずつ増やす（足りない部位から、4セットまで） */
  const addSets = () => {
    for(;;){
      const it = plan.filter(x => {
        const ex = EXMAP[x.ex], n = x.sets || 3, add = exLoad(x.ex, 1);
        if(!BIG_MUSCLES.includes(ex.p[0]) || n >= 4 || need(x) < 1) return false;
        if(Object.keys(add).some(m => (today[m] || 0) + add[m] > dayMax(m)) || sets + 1 > SESSION_MAX.sets) return false;
        return minutes + mins(Object.assign({}, x, {sets: n + 1})) - mins(x) <= SESSION_MAX.minutes;
      }).sort((p, q) => need(q) - need(p))[0];
      if(!it) return;
      const n = it.sets || 3, add = exLoad(it.ex, 1);
      Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
      sets += 1; minutes += mins(Object.assign({}, it, {sets: n + 1})) - mins(it); it.sets = n + 1;
    }
  };
  const isBig = c => BIG_MUSCLES.includes(EXMAP[c.ex].p[0]);
  if(planSeed){
    /* 「おまかせで追加」: 今のメニューを入れた状態から、合う種目を1つだけ足す */
    planSeed.forEach(it => { if(!plan.some(p => p.ex === it.ex)) take(Object.assign({}, it)); });
    const seedLen = plan.length;
    fill(1, seedLen + 1, isBig);
    if(plan.length === seedLen) fill(0.5, seedLen + 1);
    if(plan.length === seedLen) fill(0.01, seedLen + 1);
  }else{
    fill(1, SESSION_MAX.exercises, isBig);   /* 1. 脚・尻・胸・背中の足りない分を埋める種目 */
    addSets();                               /* 2. まだ足りなければ、その種目のセットを増やす */
    fill(1, SESSION_MAX.exercises);          /* 3. 残りの時間で、肩・腕・ふくらはぎ・体幹などの種目 */
    fill(0.5, 3);                            /* 4. 3種目に満たない日は、回復と上限の範囲で軽めの種目も足す */
  }

  /* 組み終わってから、あとから入れた種目の補助ぶんで週の上限を超えた部位がないか確かめる。
     超えていたら、その部位が主役の種目のセットを1つずつ減らし、2セットを切るなら外す */
  for(let guard = 0; guard < 24; guard++){
    const over = Object.keys(today).find(m => (week[m] || 0) + today[m] > WEEK_MAX
                                          && plan.some(p => EXMAP[p.ex].p[0] === m));
    if(!over) break;
    const hit = plan.map((p, i) => ({p, i})).filter(x => EXMAP[x.p.ex].p[0] === over)
                    .sort((a, b) => (b.p.sets || 3) - (a.p.sets || 3))[0];
    if(!hit) break;
    const n = hit.p.sets || 3;
    if(n <= 2){
      const all = exLoad(hit.p.ex, n);
      Object.keys(all).forEach(m => today[m] -= all[m]);
      sets -= n; minutes -= mins(hit.p); plan.splice(hit.i, 1);
    }else{
      const cut = exLoad(hit.p.ex, 1);
      Object.keys(cut).forEach(m => today[m] -= cut[m]);
      sets -= 1; minutes -= mins(hit.p) - mins(Object.assign({}, hit.p, {sets: n - 1})); hit.p.sets = n - 1;
    }
  }

  plan.sort((a, b) => PATTERN_ORDER.indexOf(patternOf(a.ex)) - PATTERN_ORDER.indexOf(patternOf(b.ex)));
  planMemo = plan;
  return planMemo;
}
/* 今日のメニューが空の日（休み）に出す説明 */
function restText(){
  const big = ["quads","glutes","hams","chest","lats","shoulders"];
  const tired = big.filter(m => muscleLoadBetween(m, 1, 1) >= recoverLimit(m));
  const enough = big.filter(m => !tired.includes(m) && muscleLoadBetween(m, 1, 6) >= WEEK_TARGET);
  const names = ms => ms.map(m => MUSCLES[m]).join("・");
  return (tired.length ? names(tired) + "は、昨日しっかり使ったので回復の途中です。" : "")
       + (enough.length ? names(enough) + "は、直近7日で目標の" + WEEK_TARGET + "セットに届いています。" : "")
       + "今日は休むほうが伸びます。体を動かしたいときは、下の「おまかせで1種目追加」か「種目を選んで追加」から足せます。";
}
function todayItems(){
  const s = session(TODAY);
  const items = (s.plan && s.plan.length ? s.plan : buildPlan()).map(x=>Object.assign({}, x));
  (s.entries||[]).forEach(e=>{
    if(!items.some(i=>i.ex===e.ex) && EXMAP[e.ex]){
      /* 自分で追加した種目も、メニューに入るときと同じ組み方（セット数・回数・左右・メモ）で出す */
      items.push(Object.assign(catalogItem(e.ex), {extra:true}));
    }
  });
  return items;
}
function itemOf(id){ return todayItems().find(i=>i.ex===id) || {ex:id, sets:3, r:EXMAP[id]?EXMAP[id].r:10}; }
/* 記録を始めた時点のメニューを、その日の分として保存する */
function fixPlan(s){
  if(s.plan && s.plan.length) return;
  const plan = buildPlan();
  if(!plan.length) return;                 /* 休みの日（メニューが空）は保存しない。別の端末の今日のメニューを空で上書きしないため */
  s.plan = plan.map(x => Object.assign({}, x));
  s.planAt = Date.now();
}
/* 今日のメニューを、今の記録と決まりで組み直す。今日すでに記録した種目はそのまま残す */
function replanToday(){
  const s = session(TODAY);
  const done = (s.entries || []).filter(e => e.sets.length).map(e => e.ex);
  /* 今日1セットでも記録した種目は、終わったものも途中のものも、セット数・回数・並びをそのまま残す */
  const before = todayItems();
  const keep = done.map(id => {
    const it = Object.assign({}, before.find(x => x.ex === id) || catalogItem(id));
    delete it.extra;
    return it;
  });
  const untouched = before.filter(it => !done.includes(it.ex)).map(it => it.ex);
  s.entries = (s.entries || []).filter(e => e.sets.length);   /* まだ1セットも入れていない枠は捨てる（前のメニューの残り） */
  delete s.plan; delete s.planAt;
  planMemo = null;
  planAvoid = untouched.length ? new Set(untouched) : null;    /* さっきまで出ていた種目は避けて選び直す */
  let fresh = buildPlan().map(x => Object.assign({}, x));
  if(!fresh.length && planAvoid){                              /* 代わりが無ければ、元の候補も許してもう一度 */
    planAvoid = null; planMemo = null;
    fresh = buildPlan().map(x => Object.assign({}, x));
  }
  planAvoid = null; planMemo = null;
  if(keep.length || fresh.length){
    s.plan = keep.concat(fresh);
    s.planAt = Date.now();
  }
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: メニューを組み直したとき */
  openEx = null; editEx = null;
  todayMsg = fresh.length ? "今日のメニューを組み直しました（" + fresh.length + "種目を入れ替え）"
                          : "入れ替えられる種目がありません。部位の回復と1日の上限のためです。";
  render();
  setStatus(todayMsg);
}
function isDoneToday(id){
  const it = todayItems().find(i=>i.ex===id);
  const e = entryFor(TODAY, id, false);
  return !!(it && e && e.sets.length >= (it.sets || 3));
}

