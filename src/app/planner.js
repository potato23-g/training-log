
/* メニューの候補一覧。A〜Dに書いてある組み方（回数・メモ）を先に並べ、
   そこに無い種目は種目表の既定値で足し、最後に楽／大変のやり方を足す。
   種目を増やせば自動で候補に入る。セット数はどの行も3（本人の要望で固定。A〜Dの sets は使わない） */
let catalogMemo = null;
function catalog(){
  if(catalogMemo) return catalogMemo;
  const out = [];
  ROUTINES.forEach(r => r.items.forEach(it => {
    if(!out.some(x => x.ex === it.ex && (x.label||"") === (it.label||""))) out.push(Object.assign({}, it, {sets: SETS_PER_EXERCISE}));
  }));
  EX.forEach(e => {
    if(out.some(x => x.ex === e.id)) return;
    const it = {ex:e.id, sets:SETS_PER_EXERCISE, r:e.r};
    if(e.side) it.side = true;
    out.push(it);
  });
  VARIANT_ROWS.forEach(v => { if(!out.some(x => (x.label || "") === v.label)) out.push(Object.assign({}, v, {sets: SETS_PER_EXERCISE})); });
  catalogMemo = out;
  return out;
}
/* その種目の素の組み方（組み方の名前が無い行）。無ければ最初の行 */
function catalogItem(exId){
  const c = catalog().find(x => x.ex === exId && !x.label) || catalog().find(x => x.ex === exId), ex = EXMAP[exId];
  return c ? Object.assign({}, c) : {ex:exId, sets:SETS_PER_EXERCISE, r:ex.r};
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
let planRelax = false;                     /* 同上。1回の量の目安（rules.js の SESSION_MAX）を外して探す */
let planSkip = null;                       /* 今日「外した」動き（組み直しても入れない） */
let planKeep = null;                       /* 組み直しで残す種目（記録済み・自分で足した種目）。これを入れた状態から組む */
let planShort = false;                     /* 「20分で組む」とき */
let planWhy = null;                        /* {} を入れてから buildPlan() を呼ぶと、入らなかった動きごとの理由が入る */
const SHORT_MAX = {sets:9, exercises:3, minutes:20};
/* 軽い週は種目を少なめにする（セット数は3で固定なので、種目の数で量を減らす） */
const DELOAD_MAX = {sets:9, exercises:3, minutes:30};
function buildPlan(){
  if(planMemo) return planMemo;
  const LIM = planShort ? SHORT_MAX : (deloadOn(TODAY) ? DELOAD_MAX : SESSION_MAX);
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
  const lack = m => short((week[m] || 0) + (today[m] || 0));      /* 週の目標まであと何セットか（今日入れた分も数える） */
  const worth = (m, add) => {
    const have = (week[m] || 0) + (today[m] || 0);
    const under = (short(have) ** 2 - short(have + add) ** 2) / WEEK_TARGET;
    const over = Math.max(0, Math.min(have + add, WEEK_MAX) - Math.max(have, WEEK_TARGET));
    return (PLAN_WEIGHT[m] || 0) * (under + over * 0.15);
  };
  const gain = c => { const add = exLoad(c.ex, c.sets || 3); return Object.keys(add).reduce((a, m) => a + worth(m, add[m]), 0); };
  /* その組み方を今日のメニューに入れられない理由（入れられるなら ""）。"rest:glutes" のように、理由と部位を返す */
  const why = c => {
    const ex = EXMAP[c.ex], n = c.sets || 3, add = exLoad(c.ex, n), pat = patternOf(c.ex);
    if(!exOn(c.ex)) return "off";                                                   /* メニューに入れない種目（rules.js の exOn） */
    if(plan.some(p => patternOf(p.ex) === pat)) return "same";                      /* 同じ動きは1日1つ */
    if(donePattern.has(pat)) return "done";                                         /* 今日もうやった動き */
    if(planSkip && planSkip.has(pat)) return "skip";                                /* 今日は外した動き */
    if(touched.has(pat) && !daily(ex)) return "yesterday";                          /* 昨日と同じ動きは続けない（連日でもよい部位は除く） */
    const after = PATTERN_AFTER[pat];
    if(after && !after.some(pt => donePattern.has(pt) || plan.some(p => patternOf(p.ex) === pt))) return "after";   /* 仕上げの動きは、先に組む動きがある日だけ */
    if(!gearReady(c.ex, c)) return "gear";                                          /* 持っているダンベルで作れない（秒の種目・重りを使う組み方も: C19） */
    const tired = ex.p.find(m => rest[m]);
    if(tired && !overdue(c.ex)) return "rest:" + tired;                             /* 回復の途中・筋肉痛の部位が主役 */
    /* 1日・1週間の上限は、その種目がメインで鍛える部位について見る。補助で使うだけの部位の量では外さない
       （その部位の量そのものには、ほかの種目の補助で使った分も数える）。
       ・2026-10-04: スクワットとランジはどれも腹直筋を補助で使うので、腹筋の種目を多くやった日・週は、大腿四頭筋と内転筋を
         メインで鍛える種目が1つも入らなかった（本人の指摘。このときは連日でもよい部位を補助で使う分だけを外した）
       ・2026-10-05: 僧帽筋でも同じことが起きていた。ロウやファーマーズウォークをやった日はサイドレイズ・リアレイズが入らず、
         肩の横・後ろが週の目標に届かなかったので、どの部位でも補助で使う分では外さないことにした */
    const dayOver = ex.p.find(m => (today[m] || 0) + add[m] > dayMax(m));
    if(dayOver) return "day:" + dayOver;                                            /* 1日の上限 */
    /* 週の上限。狙いの部位（主働筋の先頭）はWEEK_MAX、同じ種目で一緒にメインで鍛える部位は少し多めまで許す
       （スクワットの尻のように、ほかの種目の付け合わせで先に上限へ届いてしまうのを防ぐ） */
    const weekOver = ex.p.find(m => (week[m] || 0) + (today[m] || 0) + add[m] > (m === ex.p[0] ? WEEK_MAX : WEEK_MAX + 4));
    if(weekOver) return "week:" + weekOver;
    if(!planRelax && (plan.length >= LIM.exercises || sets + n > LIM.sets)) return "full";
    if(!planRelax && minutes + mins(c) > LIM.minutes) return "time";
    return "";
  };
  /* 回復の途中の部位があっても入れる種目（2026-10-05 本人の判断）: 主働筋のうち7日使えていない部位（rules.js の exRest の unused）が
     あり、その部位をメインで鍛えられる種目が、回復の途中の部位を使うものしか今日は無いとき。
     例: ルーマニアンデッドリフトやヒップスラストだけをやった数日は大殿筋が回復の途中で、スクワットもランジも入らず、
     大腿四頭筋が1週間使えないままになる。ハムストリングのように、回復の途中の部位を使わない種目（スライディングレッグカール）が
     ある部位は、そちらを入れる（1回の量の上限で入らない・今日は外した、のときも、回復の途中の部位を使う種目には替えない。
     1回の量の上限で入らなかったときは、下の first でその種目を先に入れて組み直す）。
     使えていない部位1つにつき1種目まで（入れた時点で、その部位は「今日使う」になる）。
     筋肉痛と選んだ部位は入れない（unused が空になる）。回復の途中の部位を使う種目を今日外しているときも、代わりを入れない。
     入れた種目には、今日タブの行の印・種目カード・種目の下の1行に、入れたことと理由が出る（rules.js の restIncluded） */
  const starved = {};                      /* 部位 → 回復の途中の部位を使わない種目が、今日は無い（メニューが変わるたびに消す） */
  const restMemo = {};                     /* exRest は記録だけで決まるので、組んでいるあいだ使い回す */
  const THERE = ["", "full", "time", "skip"];
  const declined = m => !!planSkip && catalog().some(k => planSkip.has(patternOf(k.ex)) && EXMAP[k.ex].p.includes(m));
  const overdue = exId => {
    const r = exId in restMemo ? restMemo[exId] : (restMemo[exId] = exRest(exId));
    if(!r || !r.unused.length) return false;
    if(r.resting.some(x => declined(x.m))) return false;     /* その部位を使う種目を、今日は外している */
    return r.unused.some(u => {
      if((today[u] || 0) > 0) return false;                  /* 今日もう使った・使う種目を入れた */
      if(!(u in starved)) starved[u] = !catalog().some(k => { const e = EXMAP[k.ex]; return e.p.includes(u) && !e.p.some(m => rest[m]) && THERE.includes(why(k)); });
      return starved[u];
    });
  };
  const allowed = c => !why(c);
  /* 動きごとに、今日やる組み方を決めておく（伸ばし方の結果: 前回の組み方か、その次の段）。
     その組み方が今日できるなら、その動きではそれだけを候補にする（気分で入れ替えない）。
     記録の無い動きは、始める種目を決めてあればその種目（rules.js の PATTERN_FIRST）、無ければ素の組み方（楽／大変の付かない種目）から選ぶ */
  const nextMemo = {};
  const firstOf = pat => (PATTERN_FIRST[pat] ? catalogItem(PATTERN_FIRST[pat]) : null);
  const nextOf = pat => (pat in nextMemo ? nextMemo[pat] : (nextMemo[pat] = patternNext(pat) || firstOf(pat)));
  const candidate = c => {
    const K = nextOf(patternOf(c.ex));
    if(!K) return !c.lv;
    if(itemKey(c) === itemKey(K)) return true;
    return !allowed(K);                    /* 決めた組み方が今日できないときだけ、ほかを候補にする */
  };
  /* 同じ動きの中で、どの組み方にするかを比べる値。決めた組み方が無い（今日できない）ときは、段の近いもの
     （記録の無い動きは標準の段）・素の組み方を先にする。動きどうしを比べるのには使わない */
  const fit = c => {
    const K = nextOf(patternOf(c.ex));
    if(K && itemKey(c) === itemKey(K)) return gain(c);
    const want = K ? itemLevel(K) : 2;
    return gain(c) / (1 + 1.2 * Math.abs(itemLevel(c) - want)) * (c.lv ? 0.8 : 1);
  };
  const take = c => {
    const it = Object.assign({}, c), add = exLoad(it.ex, it.sets || 3);
    Object.keys(add).forEach(m => today[m] = (today[m] || 0) + add[m]);
    sets += it.sets || 3; minutes += mins(it);
    plan.push(it);
    Object.keys(starved).forEach(k => delete starved[k]);
  };
  /* 動きごとに一番合う組み方を1つ決めてから、動きどうしを価値（× 動きの係数）で比べる。
     段の近さで割り引いた値のまま動きどうしを比べると、記録の無い動きのうち、選ぶ種目が標準の段でないもの
     （ワンハンドロウ・ダンベルカール・サイドレイズ・シュラッグ・ファーマーズウォーク・サイドベンド・プランクなど）は、
     記録が付くまで価値が半分以下になり、使えていない部位があってもメニューに入らなかった（2026-10-04 本人の指摘） */
  /* 今日のメニュー（今日もう記録した種目も）に、反対の部位の種目があるか（rules.js の opposite）。
     あれば、動きどうしを比べる値を少し上げて先に選ぶ（2026-10-08 本人の要望: 反対の部位を入れられるときは、同じ日に鍛える）。
     入れるかどうかのしきい値（minGain）には掛けない: 掛けると、これまで入らなかった種目まで入って1回の量が増える */
  const paired = c => plan.some(p => opposite(p.ex, c.ex)) || doneToday.some(e => opposite(e.ex, c.ex));
  const fill = (minGain, upTo, only, force) => {
    while(plan.length < upTo){
      const byPattern = {};
      catalog().filter(c => (!only || only(c)) && allowed(c) && candidate(c)).forEach(c => {
        const g = gain(c), pat = patternOf(c.ex), f = fit(c), pr = patPref(pat);
        /* 「あまり出さない」にした動き（rules.js の patPref）は、週の目標から遠い部位を埋めるとき（価値が 1 以上）と、
           7日使えていない部位を先に入れるとき（force）だけ入れる */
        const need = pr < 0 && !force ? Math.max(minGain, 1) : minGain;
        if(g * (pr < 0 ? EX_PREF_FACTOR[pr] : 1) >= need && (!byPattern[pat] || f > byPattern[pat].f))
          byPattern[pat] = {c, f, v: g * (PATTERN_PREF[pat] || 1) * (paired(c) ? PAIR_PREF : 1) * EX_PREF_FACTOR[pr]};
      });
      const best = Object.keys(byPattern).map(p => byPattern[p]).sort((a, b) => b.v - a.v)[0];
      if(!best) return;
      take(best.c);
    }
  };
  /* 反対の部位の相手がいない種目に、入れられるかぎり相手を足す（下の compose の 4） */
  const pairFill = () => {
    for(;;){
      const lone = unpaired(plan), n = plan.length;
      if(!lone.length) return;
      fill(0, n + 1, c => lone.some(a => opposite(a.ex, c.ex)));
      if(plan.length === n) return;
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
    Object.keys(starved).forEach(k => delete starved[k]);
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
    /* first は、ほかの種目より先に種目を入れておく部位（下の説明）。組み直すたびに、今日の記録だけを数えた状態へ戻す */
    const start = {today: Object.assign({}, today), sets, minutes};
    const compose = first => {
      plan.length = 0; sets = start.sets; minutes = start.minutes;
      Object.keys(today).forEach(m => delete today[m]);
      Object.assign(today, start.today);
      Object.keys(starved).forEach(k => delete starved[k]);
      /* 組み直し: 残す種目を先に入れる */
      (planKeep || []).forEach(keepIn);
      /* 0. first の部位は、その部位をメインで鍛える種目を先に1つずつ入れる（前の部位の種目でもう使うなら入れない） */
      first.forEach(u => { if(!(today[u] > 0)) fill(0.01, Math.min(plan.length + 1, LIM.exercises), c => EXMAP[c.ex].p.includes(u), true); });
      /* 「よく出す」にした動きは、回復と上限の範囲で入れられる日は先に入れる（20分で組むとき・軽い週は、価値の順だけ） */
      if(LIM === SESSION_MAX) fill(0, LIM.exercises, c => exPref(c.ex) > 0);
      fill(1, LIM.exercises);                  /* 1. 週の目標から遠い部位を多く埋める種目から順に（部位の大小は重みで少しだけ） */
      /* 2. メインで鍛える部位が週の目標に届いていない種目は、価値が小さくても入れる（2026-10-05 本人の要望: 種目が増えてもよいので
            目標に届くように）。1 だけだと、目標まであと3セットほどの部位は価値が1に届かず、どの部位も週7〜9セットで止まっていた */
      fill(0.01, LIM.exercises, c => EXMAP[c.ex].p.some(m => lack(m) > 0));
      fill(0.2, Math.min(3, LIM.exercises));   /* 3. 3種目に満たない日は、回復と上限の範囲で軽めの種目も足す */
      /* 4. 反対の部位の相手がいない種目には、入れられるかぎり相手を足す（2026-10-09 本人の指摘: 上腕二頭筋と上腕三頭筋を
            同じ日に出せるのに出なかった。できる限り入れる）。それまでは並べ替えの値を少し上げるだけ（PAIR_PREF）で、
            相手の部位が週の目標に届いている日は、入れられるのに入らなかった。
            回復・1日と1週間の上限・1回の量の上限・外した動き・入れない種目の決まりは why のまま効く */
      pairFill();
    };
    /* 7日使えていない部位（rules.js の unusedSoFar）が、組んだメニューのどの種目にも入らなかったとき（主でも補助でも）は、
       その部位をメインで鍛える種目を先に入れてから組み直す（2026-10-06）。
       ヒップアダクション（内転筋だけを使う）を足すと、内転筋を7日使えていないのに、内転筋を使う種目が1つも入らない日ができた:
       ・ヒップアダクションは重み（PLAN_WEIGHT）が0.15で価値が小さく、1回の種目数（10）の取り合いに負ける
       ・サイドランジは、回復の途中の部位を使わない種目（ヒップアダクション）があるので、上の overdue では入らない
       入れる種目は fill が選ぶので、回復・上限・今日は外した動きの決まりはそのまま効く（回復の途中の部位を使う種目が入るのは、
       これまでどおり overdue のときだけ）。使えていない部位を無条件で先に入れると、全部こなしている日のメニューまで変わって
       週の量が減った（毎日やる場合に広背筋 12→9.8、ハムストリング 7.1→6.8）ので、入らなかったときだけにする。
       組み直して、あふれた種目の部位が新しく入らなくなったら、その部位も足してもう一度（first は増えるだけなので、部位の数で止まる）。
       先に入れる順は、重みの大きい部位から。筋肉痛と選んだ部位は入れない（rest）。
       20分で組むとき・軽い週（どちらも3種目）は、これまでどおり価値の順だけで組む */
    const unused = LIM !== SESSION_MAX ? [] : Object.keys(MUSCLES).filter(m => unusedSoFar(m) && !rest[m])
                                               .sort((a, b) => (PLAN_WEIGHT[b] || 0) - (PLAN_WEIGHT[a] || 0));
    let first = [];
    for(;;){
      compose(first);
      const left = unused.filter(u => !(today[u] > 0) && !first.includes(u));
      if(!left.length) break;
      first = unused.filter(u => first.includes(u) || left.includes(u));
    }
  }

  /* 組み終わってから、あとから入れた種目の補助ぶんで週の上限を超えた部位がないか確かめる。
     超えていたら、その部位が主役の種目を外す（セット数は3で固定なので、減らすのではなく外す） */
  const trim = () => {
    let cut = 0;
    for(let guard = 0; guard < 12; guard++){
      const over = Object.keys(today).find(m => (week[m] || 0) + today[m] > WEEK_MAX
                                            && plan.some(p => EXMAP[p.ex].p[0] === m && !p.seed));
      if(!over) break;
      const i = plan.findIndex(p => EXMAP[p.ex].p[0] === over && !p.seed);
      const all = exLoad(plan[i].ex, plan[i].sets || SETS_PER_EXERCISE);
      Object.keys(all).forEach(m => today[m] -= all[m]);
      sets -= plan[i].sets || SETS_PER_EXERCISE; minutes -= mins(plan[i]); plan.splice(i, 1);
      Object.keys(starved).forEach(k => delete starved[k]);
      cut++;
    }
    return cut;
  };
  /* 外して空いた枠に、相手のいない種目の反対の部位が入るなら入れる。入れた分でまた超えたら外して、空いた枠でもう一度見る
     （外すたびに時間と種目数が空くので、1回目には入らなかった相手が入ることがある）。外した種目は週の上限で戻らないので止まる */
  for(let round = 0; round < 4 && trim() && !planSeed; round++) pairFill();
  trim();
  plan.forEach(p => delete p.seed);
  /* 入らなかった動きの理由を残す（頼まれたときだけ）。その動きで今日やる組み方（決めてあればそれ、無ければ素の組み方）で見る */
  if(planWhy){
    Array.from(new Set(catalog().map(c => patternOf(c.ex)))).forEach(pat => {
      if(plan.some(p => patternOf(p.ex) === pat)) return;
      const K = nextOf(pat);
      const rows = K ? [K] : catalog().filter(c => patternOf(c.ex) === pat && !c.lv);
      const reasons = rows.map(why);
      planWhy[pat] = reasons.includes("") ? "" : reasons[0];
    });
  }

  if(!planSeed){
    plan.sort((a, b) => PATTERN_ORDER.indexOf(patternOf(a.ex)) - PATTERN_ORDER.indexOf(patternOf(b.ex)));
    /* 反対の部位どうしは隣に並べる（1セットずつ交互に行いやすいように） */
    const ordered = pairUp(plan);
    plan.length = 0; ordered.forEach(p => plan.push(p));
  }
  planMemo = plan;
  return planMemo;
}
/* 今日のメニューが空の日（休み）に出す説明 */
function restText(){
  const big = ["quads","glutes","hams","chest","lats","frontdelt","sidedelt","reardelt"];
  const tired = recoveringList(big);
  const enough = big.filter(m => !tired.some(x => x.m === m) && muscleLoadBetween(m, 1, 6) >= WEEK_TARGET);
  const names = ms => ms.map(m => MUSCLES[m]).join("・");
  return (tired.length ? recoverDaysText(tired) + "で回復します。" : "")
       + (enough.length ? names(enough) + "は、直近7日で目標の" + WEEK_TARGET + "セットに届いています。" : "")
       + "今日は休んだほうが伸びます。体を動かしたいときは、下の「おまかせで1種目追加」か「種目を選んで追加」から追加できます。";
}
/* 今日の種目が少ないときの一言（回復の途中の部位は、あと何日かも添える） */
function fewItemsText(){
  const rec = recoveringList();
  return (rec.length ? "回復の途中の部位（" + recoverDaysText(rec) + "）や、" : "")
       + "今週の量が足りている部位が多いため、今日は種目を少なめにしています。";
}
/* 保存したメニューの行を、今の種目表の中身で出す。行は保存した時点の写しなので、版が変わって
   組み方の名前・回数・動きが変わっても（2026-09 の A4・B7）古いまま残っている。
   「自分で足した」「外した」「メニュー外」の印だけは保存した値を使う。セット数は3で固定（保存した値は使わない）。
   今は無い組み方（名前が変わって無くなったもの）は、素の組み方として出す（記録の数え方と同じ） */
function currentRow(x){
  const row = catalogRow(x.ex, x.label || "") || catalogRow(x.ex, "");
  if(!row) return Object.assign({}, x, {sets: SETS_PER_EXERCISE});
  const out = Object.assign({}, row, {sets: SETS_PER_EXERCISE});
  ["manual", "skip", "extra"].forEach(k => { if(x[k]) out[k] = true; });
  return out;
}
/* 今日のメニュー（「外した」種目も skip:true のまま含む。数えるときは除く）。
   この版に無い種目（後の版で足した種目を、別の端末が同期で持ってきたとき）は出さない。記録のメニューには残す */
function todayItems(){
  const s = session(TODAY);
  const items = s.plan && s.plan.length ? s.plan.filter(x => x && EXMAP[x.ex]).map(currentRow) : buildPlan().map(x=>Object.assign({}, x));
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
/* 今日のメニューでのその種目の扱い。"in"=今日やる / "skipped"=今日は外した / ""=入っていない。
   「今日のメニューにある」などを画面に出すところは、どこもこれで判定する
   （種目を選ぶシートだけが外した種目も「ある」と出していた: 2026-10-02 本人の指摘） */
function menuState(exId){
  const it = todayItems().find(i => i.ex === exId);
  return !it ? "" : (it.skip ? "skipped" : "in");
}
/* 今日やる種目の並び（同期の前後で比べて、ほかの端末の変更で今日のメニューが変わったかを見る） */
function todayMenuKey(){
  planMemo = null;
  if(typeof resetProg === "function") resetProg();
  return activeItems().map(itemKey).join(",");
}
/* 同期でほかの端末の変更を取り込んだあとに呼ばれる（sync-github.js の syncAttempt）。
   今日のメニューが変わっていたら、今日タブの上でしばらく知らせる（気づかずに古いつもりで進めないように） */
let menuSyncedUntil = 0;
function todayMenuSynced(before){
  if(todayMenuKey() === before) return;
  menuSyncedUntil = Date.now() + 20000;
  setTimeout(() => { if(tab === "today") render(); }, 20200);
}
/* 種目を選んで追加するときに入るやり方。今日のメニューにあれば（外したものも）そのやり方、
   前にやった種目ならそのやり方の続き（伸ばし方が同じ種目の次の段階へ進めるなら、その先）、初めてなら基本のやり方。
   種目を選ぶシートの名前と難しさも、この行から作る（出ている内容と入る内容が食い違わないように） */
function pickRowFor(exId){
  const cur = todayItems().find(i => i.ex === exId);
  if(cur) return cur;
  const h = patternHistory(patternOf(exId)).find(x => x.ex === exId);
  if(!h) return catalogItem(exId);
  const p = progressFor(h.item);
  const row = (p.change === "harder" || p.change === "easier") && p.next && p.next.ex === exId ? p.next : h.item;
  return gearReady(row.ex, row) ? row : catalogItem(exId);
}
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
  s.entries = (s.entries || []).filter(e => e.sets.length);          /* セットの無い箱は残さない */
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
  /* 残した種目のあとに、新しく選んだ種目を足す（外した種目は最後に置いておく）。反対の部位どうしは隣に並べる */
  const added = fresh.filter(x => !keep.some(k => k.ex === x.ex));
  const plan = pairUp(keep.filter(k => !k.skip).concat(added)).concat(keep.filter(k => k.skip));
  /* 組み直しは意図した変更（同期で自動のメニューに負けない）。空でも保存する（保存しないと、同期で
     ほかの端末の今日のメニューが戻ってきてしまう） */
  s.plan = plan; s.planAt = s.planEdit = stampNow();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: メニューを組み直したとき */
  openEx = null; editEx = null;
  const newKey = plan.filter(it => !it.skip).map(itemKey).join(",");
  const soreNames = soreToday().map(m => MUSCLES[m]).join("・");
  todayMsg = !plan.filter(it => !it.skip).length ? "今日入れられる種目がありません。部位の回復と1日・1週間の上限のためです。"
           : opt && opt.short ? "20分で終わるメニューにしました（" + plan.filter(it => !it.skip).length + "種目）"
           : opt && opt.sore ? (soreNames ? soreNames + "を避けて組み直しました" : "筋肉痛の部位を外して組み直しました")
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
