
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
/* その種目の素の組み方（組み方の名前が無い行）。無ければ最初の行 */
function catalogItem(exId){
  const c = catalog().find(x => x.ex === exId && !x.label) || catalog().find(x => x.ex === exId), ex = EXMAP[exId];
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
  const reps = progressFor(it).target;
  const work = ex.kind === "t" ? reps * (side ? 2 : 1) + 15 : reps * 4 * (side ? 2 : 1) + (side ? 15 : 0) + 15;
  return (sets * work + (sets - 1) * restFor(it) + 60) / 60;
}

let planMemo = null;                       /* 描画1回のあいだだけ使い回す */
let todayMsg = "";                         /* 今日タブの操作の結果を、押したボタンのすぐ下に1回だけ出す */
let planSeed = null;                       /* 「おまかせで追加」のとき、今のメニューを入れた状態から考える */
let planRelax = false;                     /* 同上。1回の量の目安（16セット・6種目・50分）を外して探す */
let planSkip = null;                       /* 今日「外した」動き（組み直しても入れない） */
let planKeep = null;                       /* 組み直しで残す種目（記録済み・自分で足した種目）。これを入れた状態から組む */
let planShort = false;                     /* 「20分で組む」とき */
const SHORT_MAX = {sets:8, exercises:3, minutes:20};
function buildPlan(){
  if(planMemo) return planMemo;
  const LIM = planShort ? SHORT_MAX : SESSION_MAX;
  const week = loadMap(1, 6);              /* 直近7日 = 1〜6日前 + 今日の分 */
  /* 回復の途中の部位（部位ごとの日数。rules.js の RECOVER_GAP）と、今日「筋肉痛」と選んだ部位は主役にしない */
  const rest = {};
  Object.keys(MUSCLES).forEach(m => rest[m] = recovering(m));
  soreToday().forEach(m => rest[m] = true);
  const touched = patternsYesterday();
  /* 連日でもよい部位（空ける日数0: 腹直筋・腹斜筋・前腕）だけが主役の動きは、昨日やっていても続けてよい */
  const daily = ex => ex.p.every(m => recoverGap(m) === 0);
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

  /* 部位 m に add セット足したときの価値。週の目標までの不足を2乗で数えるので、目標から遠い部位ほど価値が大きい
     （大きい部位ばかりで埋まって、小さい部位が0セットのまま残らないように）。目標を超えて上限までは少しだけ */
  const short = x => Math.max(0, WEEK_TARGET - x);
  const worth = (m, add) => {
    const have = (week[m] || 0) + (today[m] || 0);
    const under = (short(have) ** 2 - short(have + add) ** 2) / WEEK_TARGET;
    const over = Math.max(0, Math.min(have + add, WEEK_MAX) - Math.max(have, WEEK_TARGET));
    return (PLAN_WEIGHT[m] || 0) * (under + over * 0.15);
  };
  const gain = c => { const add = exLoad(c.ex, c.sets || 3); return Object.keys(add).reduce((a, m) => a + worth(m, add[m]), 0); };
  const allowed = c => {
    const ex = EXMAP[c.ex], n = c.sets || 3, add = exLoad(c.ex, n);
    if(plan.some(p => patternOf(p.ex) === patternOf(c.ex))) return false;          /* 同じ動きは1日1つ */
    if(donePattern.has(patternOf(c.ex))) return false;                              /* 今日もうやった動き */
    if(planSkip && planSkip.has(patternOf(c.ex))) return false;                     /* 今日は外した動き */
    if(touched.has(patternOf(c.ex)) && !daily(ex)) return false;                    /* 昨日と同じ動きは続けない（連日でもよい部位は除く） */
    if(!gearReady(c.ex, c)) return false;                                           /* 持っているダンベルで作れない（秒の種目・重りを使う組み方も: C19） */
    if(ex.p.some(m => rest[m])) return false;                                       /* 回復の途中・筋肉痛の部位が主役 */
    if(Object.keys(add).some(m => (today[m] || 0) + add[m] > dayMax(m))) return false;   /* 1日の上限（補助で使う部位も含む） */
    /* 週の上限。狙いの部位（主働筋の先頭）はWEEK_MAX、同じ種目でついでに使う部位は少し多めまで許す
       （スクワットの尻のように、ほかの種目の付け合わせで先に上限へ届いてしまうのを防ぐ） */
    if(Object.keys(add).some(m => (week[m] || 0) + (today[m] || 0) + add[m] > (m === ex.p[0] ? WEEK_MAX : WEEK_MAX + 4))) return false;
    if(!planRelax && (plan.length >= LIM.exercises || sets + n > LIM.sets)) return false;
    if(!planRelax && minutes + mins(c) > LIM.minutes) return false;
    return true;
  };
  /* 動きごとに、今日やる組み方を決めておく（伸ばし方の結果: 前回の組み方か、その次の段）。
     その組み方が今日できるなら、その動きではそれだけを候補にする（気分で入れ替えない）。
     記録の無い動きは、素の組み方（楽／大変の付かない種目）から選ぶ */
  const nextMemo = {};
  const nextOf = pat => (pat in nextMemo ? nextMemo[pat] : (nextMemo[pat] = patternNext(pat)));
  const candidate = c => {
    const K = nextOf(patternOf(c.ex));
    if(!K) return !c.lv;
    if(itemKey(c) === itemKey(K)) return true;
    return !allowed(K);                    /* 決めた組み方が今日できないときだけ、ほかを候補にする */
  };
  const score = c => {
    const K = nextOf(patternOf(c.ex)), pref = PATTERN_PREF[patternOf(c.ex)] || 1;
    if(K && itemKey(c) === itemKey(K)) return gain(c) * pref;
    const want = K ? itemLevel(K) : 2;
    return gain(c) * pref / (1 + 1.2 * Math.abs(itemLevel(c) - want)) * (c.lv ? 0.8 : 1);
  };
  const take = c => {
    const it = Object.assign({}, c), add = exLoad(it.ex, it.sets || 3);
    Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
    sets += it.sets || 3; minutes += mins(it);
    plan.push(it);
  };
  const fill = (minGain, upTo, only) => {
    while(plan.length < upTo){
      const best = catalog().filter(c => (!only || only(c)) && allowed(c) && candidate(c)).map(c => ({c, g: gain(c), s: score(c)}))
        .filter(x => x.g >= minGain).sort((a, b) => b.s - a.s)[0];
      if(!best) return;
      take(best.c);
    }
  };
  /* 1セット増やしたときの価値（足りない部位ほど大きい） */
  const oneMore = x => { const add = exLoad(x.ex, 1); return Object.keys(add).reduce((a, m) => a + worth(m, add[m]), 0); };
  /* 入れた種目のセットを、価値の大きいものから1セットずつ増やす（4セットまで）。部位の大小は問わない */
  const addSets = minGain => {
    for(;;){
      const it = plan.filter(x => {
        const n = x.sets || 3, add = exLoad(x.ex, 1);
        if(x.seed || n >= 4 || oneMore(x) < minGain) return false;
        if(Object.keys(add).some(m => (today[m] || 0) + add[m] > dayMax(m)) || sets + 1 > LIM.sets) return false;
        return minutes + mins(Object.assign({}, x, {sets: n + 1})) - mins(x) <= LIM.minutes;
      }).sort((p, q) => oneMore(q) - oneMore(p))[0];
      if(!it) return;
      const n = it.sets || 3, add = exLoad(it.ex, 1);
      Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
      sets += 1; minutes += mins(Object.assign({}, it, {sets: n + 1})) - mins(it); it.sets = n + 1;
    }
  };
  /* 残す種目（おまかせ追加・組み直し）を入れる。記録済みのセットは上で数えたので、残りのセットの分だけ足す */
  const keepIn = it => {
    if(plan.some(p => p.ex === it.ex)) return;
    const done = doneToday.find(e => e.ex === it.ex);
    const rest = done ? Math.max(0, (it.sets || 3) - done.sets.length) : (it.sets || 3);
    const add = exLoad(it.ex, rest);
    Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
    sets += rest;
    if(rest) minutes += done ? mins(Object.assign({}, it, {sets: rest})) - 1 : mins(it);   /* 途中の種目は切り替えの1分を数えない */
    plan.push(Object.assign({}, it, {seed: true}));
  };
  if(planSeed){
    /* 「おまかせで追加」: 今のメニューを入れた状態から、合う種目を1つだけ足す。
       記録済みの種目は上で実際のセット数を数えたので、ここでは足さない（二重に数えない） */
    planSeed.forEach(it => { if(!it.skip) keepIn(it); });
    const seedLen = plan.length;
    fill(1, seedLen + 1);
    if(plan.length === seedLen) fill(0.2, seedLen + 1);
    if(plan.length === seedLen) fill(0.01, seedLen + 1);
  }else{
    /* 組み直し: 残す種目を先に入れる */
    (planKeep || []).forEach(keepIn);
    fill(1, LIM.exercises);                  /* 1. 週の目標から遠い部位を多く埋める種目から順に（部位の大小は重みで少しだけ） */
    if(!planShort) addSets(0.5);             /* 2. 時間が残れば、足りない部位の種目のセットを4まで増やす */
    fill(1, LIM.exercises);                  /* 3. まだ入るなら、もう1種目 */
    fill(0.2, Math.min(3, LIM.exercises));   /* 4. 3種目に満たない日は、回復と上限の範囲で軽めの種目も足す */
  }

  /* 組み終わってから、あとから入れた種目の補助ぶんで週の上限を超えた部位がないか確かめる。
     超えていたら、その部位が主役の種目のセットを1つずつ減らし、2セットを切るなら外す */
  for(let guard = 0; guard < 24; guard++){
    const over = Object.keys(today).find(m => (week[m] || 0) + today[m] > WEEK_MAX
                                          && plan.some(p => EXMAP[p.ex].p[0] === m));
    if(!over) break;
    const hit = plan.map((p, i) => ({p, i})).filter(x => EXMAP[x.p.ex].p[0] === over && !x.p.seed)
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

  /* 軽い週は、セット数を半分にする（2セットまで）。残す種目（記録済み・自分で足した・今のメニュー）はそのまま */
  if(deloadOn(TODAY)) plan.forEach(p => { if(!p.seed) p.sets = Math.max(2, Math.ceil((p.sets || 3) / 2)); });
  plan.forEach(p => delete p.seed);

  if(!planSeed) plan.sort((a, b) => PATTERN_ORDER.indexOf(patternOf(a.ex)) - PATTERN_ORDER.indexOf(patternOf(b.ex)));
  planMemo = plan;
  return planMemo;
}
/* 今日のメニューが空の日（休み）に出す説明 */
function restText(){
  const big = ["quads","glutes","hams","chest","lats","shoulders"];
  const tired = big.filter(recovering);
  const enough = big.filter(m => !tired.includes(m) && muscleLoadBetween(m, 1, 6) >= WEEK_TARGET);
  const names = ms => ms.map(m => MUSCLES[m]).join("・");
  return (tired.length ? names(tired) + "は、この2日でしっかり使ったので回復の途中です。" : "")
       + (enough.length ? names(enough) + "は、直近7日で目標の" + WEEK_TARGET + "セットに届いています。" : "")
       + "今日は休むほうが伸びます。体を動かしたいときは、下の「おまかせで1種目追加」か「種目を選んで追加」から足せます。";
}
/* 保存したメニューの行を、今の種目表の中身で出す。行は保存した時点の写しなので、版が変わって
   組み方の名前・回数・動きが変わっても（2026-09 の A4・B7）古いまま残っている。
   セット数と「自分で足した」「外した」「メニュー外」の印だけは保存した値を使う。
   今は無い組み方（名前が変わって無くなったもの）は、素の組み方として出す（記録の数え方と同じ） */
function currentRow(x){
  const row = catalogRow(x.ex, x.label || "") || catalogRow(x.ex, "");
  if(!row) return Object.assign({}, x);
  const out = Object.assign({}, row, {sets: x.sets || row.sets});
  ["manual", "skip", "extra"].forEach(k => { if(x[k]) out[k] = true; });
  return out;
}
/* 今日のメニュー（「外した」種目も skip:true のまま含む。数えるときは除く） */
function todayItems(){
  const s = session(TODAY);
  const items = s.plan && s.plan.length ? s.plan.map(currentRow) : buildPlan().map(x=>Object.assign({}, x));
  (s.entries||[]).forEach(e=>{
    if(!items.some(i=>i.ex===e.ex) && EXMAP[e.ex]){
      /* メニューに無い記録（以前の版で足した種目など）も、同じ組み方で出す */
      items.push(Object.assign(catalogItem(e.ex), {extra:true}));
    }
  });
  return items;
}
/* 今日やる種目（外したものを除く） */
function activeItems(){ return todayItems().filter(it => !it.skip); }
function itemOf(id){ return todayItems().find(i=>i.ex===id) || catalogItem(id); }
/* 記録を始めた時点のメニューを、その日の分として保存する */
function fixPlan(s){
  if(s.plan && s.plan.length) return;
  const plan = buildPlan();
  if(!plan.length) return;                 /* 休みの日（メニューが空）は保存しない。別の端末の今日のメニューを空で上書きしないため */
  s.plan = plan.map(x => Object.assign({}, x));
  s.planAt = stampNow();
}
/* 今日のメニューを、今の記録と決まりで組み直す。
   残すもの: 今日すでに記録した種目・自分で足した種目・今日は外した種目（外したまま）。
   同じ記録なら同じメニューになる（さっき出ていた種目を避けて入れ替える、ということはしない）。
   short: 20分で終わる短いメニューにする */
function replanToday(opt){
  if(rollDay()){ render(); setStatus("日付が変わったので、今日のメニューに切り替えました"); return; }
  const s = session(TODAY);
  const done = (s.entries || []).filter(e => e.sets.length).map(e => e.ex);
  const before = todayItems();
  const keep = before.filter(it => done.includes(it.ex) || it.manual || it.skip).map(it => {
    const x = Object.assign({}, it); delete x.extra; return x;
  });
  const keptEx = new Set(keep.map(it => it.ex));
  s.entries = (s.entries || []).filter(e => e.sets.length || keptEx.has(e.ex));
  const oldKey = before.filter(it => !it.skip).map(itemKey).join(",");
  delete s.plan; delete s.planAt;
  planMemo = null; resetProg();
  planSkip = new Set(keep.filter(it => it.skip).map(it => patternOf(it.ex)));
  planShort = !!(opt && opt.short);
  planKeep = keep.filter(it => !it.skip);                 /* 残す種目を入れた状態から組む */
  let fresh;
  try{
    fresh = buildPlan().map(x => Object.assign({}, x));
  }finally{
    planSkip = null; planShort = false; planKeep = null; planMemo = null;
  }
  /* 残した種目のあとに、新しく選んだ種目を足す（外した種目は最後に置いておく） */
  const added = fresh.filter(x => !keep.some(k => k.ex === x.ex));
  const plan = keep.filter(k => !k.skip).concat(added).concat(keep.filter(k => k.skip));
  /* 組み直しは意図した変更（同期で自動のメニューに負けない）。空でも保存する（保存しないと、同期で
     ほかの端末の今日のメニューが戻ってきてしまう） */
  s.plan = plan; s.planAt = s.planEdit = stampNow();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: メニューを組み直したとき */
  openEx = null; editEx = null;
  const newKey = plan.filter(it => !it.skip).map(itemKey).join(",");
  todayMsg = !plan.filter(it => !it.skip).length ? "今日入れられる種目がありません。部位の回復と1日・1週間の上限のためです。"
           : opt && opt.short ? "20分で終わるメニューにしました（" + plan.filter(it => !it.skip).length + "種目）"
           : newKey === oldKey ? "今の記録で組み直しました。変わりはありません"
           : "今の記録で組み直しました";
  render();
  setStatus(shownMsg);
}
function isDoneToday(id){
  const it = todayItems().find(i=>i.ex===id);
  const e = entryFor(TODAY, id, false);
  return !!(it && e && e.sets.length >= (it.sets || 3));
}
