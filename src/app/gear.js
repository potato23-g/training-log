/* ============================================================
   持っているダンベル
   設定で入れるのは「何kgを何本持っているか」（固定）と、必要なら可変式（設定できる範囲・刻み・本数）。
   種目ごとにどれを何本・どう持つかはアプリが決める。
   持っていない重さ・設定できない重さは提案しない。足りない分は日用品（タオル・リュック・ペットボトルなど）の工夫で補う。
   既定は 5kg×2本（引き継ぎ時の前提）
   ============================================================ */
const GEAR_DEFAULT_ITEMS = [{kg:5, n:2}];
const ADJ_MAX_STEPS = 80;                    /* 可変式1本の「設定できる重さ」の上限 */
/* 可変式1行ぶんの検証。おかしければ null（行ごと捨てる）。
   min〜max〜step が有効ならそれを使い、list（2個以上、0<x≤100、80個まで）があれば併せて持つ。
   min〜max が無効でも list が有効なら list だけで行を成立させる（list の範囲を仮の min〜max にする） */
function readGearItem(x){
  if(!x || typeof x !== "object") return null;
  if(x.adj){
    const n = Math.round(+x.n);
    if(!(n >= 1 && n <= 20)) return null;
    let list;
    if(Array.isArray(x.list)){
      const cleaned = x.list.map(Number).filter(v => isFinite(v) && v > 0 && v <= 100)
        .sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 1e-9)
        .map(v => Math.round(v * 100) / 100);
      if(cleaned.length >= 2 && cleaned.length <= ADJ_MAX_STEPS) list = cleaned;
    }
    const min = Math.round(+x.min * 100) / 100, max = Math.round(+x.max * 100) / 100, step = Math.round(+x.step * 100) / 100;
    const baseCount = Math.round((max - min) / step) + 1;
    const rangeOk = min > 0 && min <= 100 && max >= min && max <= 100 && step >= 0.25 && baseCount >= 1 && baseCount <= ADJ_MAX_STEPS;
    if(rangeOk){
      const out = {adj:true, n, min, max, step};
      if(list) out.list = list;
      return out;
    }
    return list ? {adj:true, n, min:list[0], max:list[list.length - 1], step:0.25, list} : null;
  }
  return (+x.kg > 0 && +x.n > 0) ? {kg:+x.kg, n:Math.round(+x.n)} : null;
}
/* 保存データの器具設定を読む。旧形式 {unit,count,adjustable,max} は「unit kg を count 本」に読み替える */
function readGear(g){
  if(!g || typeof g !== "object") return undefined;
  if(Array.isArray(g.items)){
    return {items: g.items.map(readGearItem).filter(Boolean), updatedAt: +g.updatedAt || 0};
  }
  if(g.unit !== undefined || g.count !== undefined){
    const n = Math.round(+g.count || 0), kg = +g.unit || 5;
    return {items: n > 0 ? [{kg, n}] : [], updatedAt: 0};
  }
  return undefined;
}
/* 入力欄に並べる行（入れたとおり）。固定は {kg,n}、可変式は {adj:true,n,min,max,step,list?} */
function gearItems(){
  const g = state.gear;
  const items = g && Array.isArray(g.items) ? g.items : GEAR_DEFAULT_ITEMS;
  return items.map(x => (x && x.adj)
    ? {adj:true, n:Math.max(0, Math.round(+x.n || 0)), min:+x.min || 0, max:+x.max || 0, step:+x.step || 0,
       list: Array.isArray(x.list) ? x.list.slice() : undefined}
    : {kg:+(x && x.kg) || 0, n:Math.max(0, Math.round((x && x.n) || 0))});
}
function setGearItems(items){
  state.gear = {items, updatedAt: typeof stampNow === "function" ? stampNow() : Date.now()};   /* 端末をまたいで新しい方を決める時刻（C9） */
  persistProgram();
  if(typeof syncSchedule === "function") syncSchedule();        /* 同期: ダンベル設定を変えたとき */
}
/* 可変式1本の「設定できる重さ」（軽い順）。list があればそれを優先、なければ min〜max を step 刻みで */
function adjWeights(row){
  if(Array.isArray(row.list) && row.list.length >= 2) return row.list;
  const out = [], n = Math.max(0, Math.round((row.max - row.min) / row.step));
  for(let i = 0; i <= n; i++) out.push(Math.round((row.min + i * row.step) * 100) / 100);
  return out;
}
/* 計算用: 重さごとに「その重さにできる本数」をまとめ、軽い順に並べる。
   固定はその重さの本数をそのまま数え、可変式は本数ぶんを「設定できる重さ」のどれにでも数える
   （同じ可変式ダンベルを同時に2つの重さにはできないが、行が違えば別本として独立に数える）。
   adjN は n のうち可変式で作る分（text・優先度の判定に使う。固定を先に使う想定で数える） */
function inventory(){
  const m = {};
  const add = (kg, n, adjN) => { const e = m[kg] || (m[kg] = {n:0, adjN:0}); e.n += n; e.adjN += adjN; };
  gearItems().forEach(x => {
    if(x.adj){
      if(!(x.n > 0)) return;
      adjWeights(x).forEach(kg => { if(kg > 0) add(kg, x.n, x.n); });
    }else if(x.kg > 0 && x.n > 0){
      add(x.kg, x.n, 0);
    }
  });
  return Object.keys(m).map(Number).sort((a, b) => a - b).map(kg => ({kg, n:m[kg].n, adjN:m[kg].adjN}));
}
/* 引き継ぎ時の 5kg×2本 のままか（元の解説文・メモがそのまま当てはまる）。
   固定の行の扱いは今のまま（inventory() で同じ重さの行をまとめて判定）。可変式が1本でもあれば対象外 */
function isDefaultGear(){
  const inv = inventory();
  return inv.length === 1 && inv[0].kg === 5 && inv[0].n === 2 && inv[0].adjN === 0;
}
function kgText(v){ return (Math.round(v * 10) / 10) + "kg"; }

/* 種目ごとの持ち方
   pair   = 同じ重さを2つ使うときの持ち方 / one = 1つだけ使うときの持ち方
   mixed  = 重さの違う2つを組み合わせてよい（体の上に置く種目だけ）
   per    = "arm" なら片腕あたりの重さで重い・軽いを決める（腕の種目）。"total" なら合計で決める
   prefer = 同じ重さになる使い方が複数あるとき、1つで持つほうを選ぶ（"one"） */
const HOLD = {
  goblet:    {pair:"両肩に1つずつ担ぐ",    one:"縦にして胸の前で抱える", per:"total"},
  rdl:       {pair:"両手に1つずつ持つ",    one:"両手でまとめて持つ",     per:"total"},
  split:     {pair:"両手に1つずつ持つ",    one:"縦にして胸の前で抱える", per:"total"},
  hipthrust: {pair:"骨盤の上に並べて置く", one:"骨盤の上に置く",         per:"total", prefer:"one", mixed:true},
  row:       {one:"片手に持ち、左右を入れ替える",                          per:"total"},
  ohp:       {pair:"両手に1つずつ持つ",    one:"片手ずつ押し上げ、左右を入れ替える", per:"arm"},
  lateral:   {pair:"両手に1つずつ持つ",    one:"片手ずつ上げ、左右を入れ替える",     per:"arm"},
  floorpress:{pair:"両手に1つずつ持つ",    one:"片手ずつ押し、反対の手は床に置く",   per:"arm"},
  curl:      {pair:"両手に1つずつ持つ",    one:"片手ずつ巻き上げ、左右を入れ替える", per:"arm"},
  triext:    {one:"両手でまとめて持つ",                                    per:"total"},
  calf:      {pair:"両手に1つずつ持つ",    one:"片手に持ち、反対の手で壁を支える",   per:"total"},
  farmer:    {pair:"両手に1つずつ持つ",    one:"片手に持ち、途中で左右を持ち替える", per:"total"},
  sumo:      {pair:"両肩に1つずつ担ぐ",    one:"縦にして胸の前で抱える", per:"total", prefer:"one"},
  splitfloor:{pair:"両手に1つずつ持つ",    one:"縦にして胸の前で抱える", per:"total"},
  fly:       {pair:"両手に1つずつ持つ",    one:"片手ずつ行い、反対の手は床に置く",   per:"arm"},
  skull:     {pair:"両手に1つずつ持つ",    one:"片手ずつ行い、反対の手で肘を支える", per:"arm"},
  front:     {pair:"両手に1つずつ持つ",    one:"片手ずつ上げ、左右を入れ替える",     per:"arm"},
  shrug:     {pair:"両手に1つずつ持つ",    one:"片手に持ち、途中で持ち替える",       per:"total"},
  row2:      {pair:"両手に1つずつ持つ",    one:"片手に持ち、左右を入れ替える",       per:"total"},
  calfseat:  {pair:"左右の膝に1つずつ置く", one:"片方の膝に置き、両手で押さえる",     per:"total"},
  sidebend:  {one:"片手に持ち、左右を入れ替える",                                    per:"total"},
  sidelunge: {pair:"両肩に1つずつ担ぐ",     one:"縦にして胸の前で抱える", per:"total", prefer:"one"},
  pullover:  {one:"両手でまとめて持つ",                                    per:"total"},
  rear:      {pair:"両手に1つずつ持つ",    one:"片手ずつ開き、反対の手は膝に置く",   per:"arm"},
  hammer:    {pair:"両手に1つずつ持つ",    one:"片手ずつ巻き上げ、左右を入れ替える", per:"arm"},
  deadlift:  {pair:"両手に1つずつ持つ",    one:"両手でまとめて持つ",     per:"total"}
};
function holdOf(id){ return HOLD[id] || HOLD[baseOf(id)] || null; }
/* この種目（catalog の行）は、今持っているダンベルで行えるか。C19: HOLD の無い種目は常に true。
   HOLD があれば使い方が1つ以上作れること、needsDb の印（ダンベルを持って行う楽/大変の組み方）は
   ダンベルを1本も持っていなければ不可とする */
function gearReady(id, row){
  if(row && row.needsDb && !inventory().length) return false;
  const h = holdOf(id);
  return !h || gearOptions(id).length > 0;
}

/* その重さ kg を作れる行（固定はその重さの行、可変式は kg を設定できる行） */
function rowsCovering(rows, kg){ return rows.filter(r => r.adj ? adjWeights(r).some(w => Math.abs(w - kg) < 1e-9) : Math.abs(r.kg - kg) < 1e-9); }
/* mixed（違う重さ2つを同時に使う）が物として成立するか。同じ可変式1本を同時に2つの重さにはできない
   ので、行ごとの本数を「重さaに1本」「重さbに1本」に割り振れるかを総当たりで確かめる（a≠b前提） */
function twoUnitFeasible(rows, a, b){
  const rowsA = rowsCovering(rows, a);
  for(const ra of rowsA){
    const remain = rows.map(r => r === ra ? r.n - 1 : r.n);
    const okB = rows.some((r, idx) => remain[idx] >= 1 && (r.adj ? adjWeights(r).some(w => Math.abs(w - b) < 1e-9) : Math.abs(r.kg - b) < 1e-9));
    if(okB) return true;
  }
  return false;
}

/* 使い方1つぶんの文。pieces は実際に使う重さ、adjPieces は各 piece が可変式かどうか */
function optionText(o){
  const [kg0, kg1] = o.pieces, [adj0, adj1] = o.adjPieces || [false, false];
  const solo = (kg, adj) => adj ? "可変式ダンベルを" + kgText(kg) + "にしたもの" : kgText(kg);
  if(o.n === 1){
    return (adj0 ? "可変式ダンベルを" + kgText(kg0) + "にして1つ、" : kgText(kg0) + "を1つ、") + o.how;
  }
  if(o.mixed){
    const body = (adj0 || adj1) ? solo(kg0, adj0) + "と" + solo(kg1, adj1) + "を1つずつ、"
                                 : kgText(kg0) + "と" + kgText(kg1) + "を1つずつ、";
    return body + o.how + "（合計" + kgText(o.total) + "）";
  }
  const body = (adj0 && adj1) ? "可変式ダンベル2つを" + kgText(kg0) + "にして、"
             : (adj0 || adj1) ? kgText(kg0) + "を2つ（うち可変式1つ）、"
             : kgText(kg0) + "を2つ、";
  return body + o.how + "（合計" + kgText(o.total) + "）";
}

/* 持っているダンベルで作れる使い方を、軽い順に並べる。同じ重さになる使い方は1つに絞る */
function gearOptions(id){
  const h = holdOf(id); if(!h) return [];
  const inv = inventory(), out = [];
  inv.forEach(({kg, n, adjN})=>{
    const fixedN = n - adjN;
    if(h.pair && n >= 2){
      const adjUsed = Math.max(0, Math.min(2, 2 - fixedN));
      out.push({n:2, pieces:[kg, kg], adjPieces:[adjUsed >= 1, adjUsed >= 2], adjUsed,
                total:kg * 2, key:h.per === "arm" ? kg : kg * 2, how:h.pair});
    }
    if(h.one && !(h.per === "arm" && h.pair && n >= 2)){
      const adjUsed = fixedN >= 1 ? 0 : 1;
      out.push({n:1, pieces:[kg], adjPieces:[adjUsed >= 1], adjUsed, total:kg, key:kg, how:h.one});
    }
  });
  if(h.mixed){
    /* 違う重さ2つを同時に使うので、可変式1本が同時に2つの重さにはなれない点を物として確かめる
       （固定の行の扱いは変わらない: 別々の行・別々の本数はいつも通り独立に数える） */
    const rows = gearItems().filter(r => r.n > 0 && (r.adj ? true : r.kg > 0));
    for(let i = 0; i < inv.length; i++) for(let j = i + 1; j < inv.length; j++){
      const a = inv[j].kg, b = inv[i].kg;
      if(!twoUnitFeasible(rows, a, b)) continue;
      const adjA = rowsCovering(rows, a).some(r => !r.adj) ? 0 : 1;
      const adjB = rowsCovering(rows, b).some(r => !r.adj) ? 0 : 1;
      out.push({n:2, pieces:[a, b], adjPieces:[adjA >= 1, adjB >= 1], adjUsed:adjA + adjB,
                total:a + b, key:a + b, how:h.pair, mixed:true});
    }
  }
  const rank = o => h.prefer === "one" ? (o.n === 1 ? 0 : o.mixed ? 2 : 1) : (o.n === 2 && !o.mixed ? 0 : o.mixed ? 1 : 2);
  /* 追加の優先: 同じ重さ（key）を作れる使い方が複数あるときは、固定のダンベルだけで作れるものを先にする */
  out.sort((x, y) => (x.key - y.key) || (rank(x) - rank(y)) || ((x.adjUsed > 0 ? 1 : 0) - (y.adjUsed > 0 ? 1 : 0)));
  const uniq = [];
  out.forEach(o => { if(!uniq.length || Math.abs(uniq[uniq.length - 1].key - o.key) > 1e-9) uniq.push(o); });
  uniq.forEach(o => {
    o.total = Math.round(o.total * 10) / 10;
    o.text = optionText(o);
  });
  return uniq;
}
function optionIndex(opts, o){ return o ? opts.findIndex(x => Math.abs(x.key - o.key) < 1e-9) : -1; }
function optionByTotal(id, w){
  if(w === undefined || w === null || isNaN(w)) return null;
  return gearOptions(id).find(o => Math.abs(o.total - w) < 0.01) || null;
}
/* 持っている組み合わせにない重さ w に一番近い使い方（w 以下で一番重いもの。なければ一番軽いもの） */
function nearestOption(opts, w){
  let best = null;
  opts.forEach(o => { if(o.total <= w + 1e-9 && (!best || o.total > best.total)) best = o; });
  return best || opts.reduce((a, o) => o.total < a.total ? o : a, opts[0]);
}

/* 記録がない種目の最初の重さの目安(per が arm の種目は片腕あたり)。この重さ以下で一番重い使い方から始める */
const START_KG = {goblet:10, rdl:12, rdl1:10, split:10, hipthrust:15, row:8, ohp:5, lateral:3, floorpress:6, curl:5, triext:6, calf:10, farmer:Infinity, pullover:8, rear:3, hammer:6, deadlift:12};
function startKg(id){ const v = START_KG[id] !== undefined ? START_KG[id] : START_KG[baseOf(id)]; return v === undefined ? 8 : v; }
function defaultOption(id){
  const opts = gearOptions(id); if(!opts.length) return null;
  const lim = startKg(id);
  let pick = opts[0];
  opts.forEach(o => { if(o.key <= lim + 1e-9) pick = o; });
  return pick;
}
/* 種目の回数（秒の種目は秒数）の幅。解説の「10〜15回」「20〜45秒」から読む */
function repRange(id, item){
  const d = DETAIL[id] || DETAIL[baseOf(id)] || {};
  const m = /(\d+)〜(\d+)(回|秒)/.exec(d.reps || "");
  if(m) return {lo:+m[1], hi:+m[2]};
  const r = (item && item.r) || EXMAP[id].r || 10;
  return {lo:Math.max(4, r - 2), hi:r + 3};
}
/* 「片手ずつ」「片手だけ」で行う組み方か（ダンベルは1つで持つ） */
function isOneHanded(item){
  return /片手/.test(item.tag || "") || /^片手(ずつ|だけ)/.test(item.note || "");
}
/* その組み方で使える持ち方。片手で行う組み方は、1つで持つ使い方だけにする
   （腕の種目は、2つ持てるときは「両手に1つずつ」しか並ばないため） */
function itemOptions(item){
  const id = item.ex, h = holdOf(id);
  if(!h) return [];
  if(!isOneHanded(item) || !h.one) return gearOptions(id);
  return inventory().map(({kg, n, adjN}) => {
    const adj = (n - adjN) < 1;
    return {n:1, pieces:[kg], adjPieces:[adj], adjUsed:adj ? 1 : 0, total:kg, key:kg, how:h.one,
            text:(adj ? "可変式ダンベルを" + kgText(kg) + "にして1つ、" : kgText(kg) + "を1つ、") + h.one};
  });
}
function defaultOptionFor(item){
  const opts = itemOptions(item); if(!opts.length) return null;
  const lim = startKg(item.ex);
  let pick = opts[0];
  opts.forEach(o => { if(o.key <= lim + 1e-9) pick = o; });
  return pick;
}
/* 腕の種目（片腕あたりで重さを見る種目）で、2つ持つ使い方か。重さは「片手 5kg」と見せる */
function perArm(id){ const h = holdOf(id); return !!(h && h.per === "arm"); }
function armCount(item, total){
  const o = itemOptions(item).find(x => Math.abs(x.total - total) < 0.01);
  return o ? o.n : (perArm(item.ex) && !isOneHanded(item) ? 2 : 1);
}
/* 画面に出す重さ（腕の種目は片手あたり）。記録は合計のまま */
function wShown(item, total){
  if(total === undefined || total === null || isNaN(total)) return total;
  return perArm(item.ex) ? Math.round(total / armCount(item, total) * 10) / 10 : total;
}
function wStored(item, shown){
  if(!perArm(item.ex)) return shown;
  const o = itemOptions(item).find(x => Math.abs(x.key - shown) < 0.01);
  return o ? o.total : Math.round(shown * (isOneHanded(item) ? 1 : 2) * 10) / 10;
}
function wUnit(item){ return perArm(item.ex) ? "kg（片手）" : "kg"; }
/* 「5kg」「片手 5kg」の書き方（記録は合計の重さ） */
function kgFor(item, total){ return (perArm(item.ex) ? "片手 " : "") + kgText(wShown(item, total)); }

/* 日用品で負荷を変えるやり方（ダンベルは買い足さない前提） */
const HOUSE = {
  goblet:    {up:"本や水を入れたペットボトルを詰めたリュックを背負い、ダンベルと一緒に使う", down:"水を入れた2Lのペットボトルを胸の前で抱える"},
  rdl:       {up:"タオルを床に敷いて仰向けになり、かかとを乗せて引き寄せるレッグカールを足す（フローリング向き）", down:"水を入れた2Lのペットボトルを両手に持つ"},
  split:     {up:"荷物を詰めたリュックを背負い、ダンベルと一緒に使う", down:"何も持たずに行う"},
  hipthrust: {up:"荷物を詰めたリュックをダンベルと一緒に骨盤に乗せる（畳んだタオルを挟むと痛くない）", down:"何も持たずに行う"},
  row:       {up:"本や水のペットボトルを詰めたリュックの持ち手を握って引く", down:"水を入れた2Lのペットボトルで行う"},
  ohp:       {down:"水を入れたペットボトルで行う"},
  lateral:   {down:"水を入れた500mlか2Lのペットボトルで行う"},
  floorpress:{up:"腕立て伏せに切り替え、慣れたら荷物を詰めたリュックを背負う", down:"水を入れたペットボトルで行う"},
  pushup:    {up:"荷物を詰めたリュックを背負う"},
  curl:      {up:"タオルの真ん中を片足で踏み、両端を握って足の抵抗に逆らいながら巻き上げる", down:"水を入れたペットボトルで行う"},
  triext:    {up:"椅子の座面の縁に手をついて体を沈めるディップスを足す（椅子は壁につけて動かないようにする）", down:"水を入れたペットボトルで行う"},
  plank:     {up:"足の下にタオルを敷き、プランクの姿勢のまま体を前後に滑らせる（フローリング向き）"},
  deadbug:   {up:"水を入れたペットボトルを両手で持って行う"},
  crunch:    {up:"水を入れたペットボトルを胸に抱える"},
  sideplank: {up:"上の手に水を入れたペットボトルを持ち、天井へ伸ばす"},
  calf:      {up:"荷物を詰めたリュックを背負う"},
  farmer:    {up:"持ち手にタオルを巻いて太くする（握る力の負荷が上がる）", down:"水を入れたペットボトルや荷物を入れた袋を持つ"},
  sumo:      {up:"荷物を詰めたリュックを背負い、ダンベルと一緒に使う", down:"水を入れた2Lのペットボトルを胸の前で抱える"},
  splitfloor:{up:"荷物を詰めたリュックを背負う", down:"何も持たずに行う"},
  bridge:    {up:"荷物を詰めたリュックを骨盤に乗せる（畳んだタオルを挟むと痛くない）"},
  pushupknee:{up:"膝を離して通常の腕立て伏せへ"},
  fly:       {down:"水を入れたペットボトルで行う"},
  skull:     {down:"水を入れたペットボトルで行う"},
  front:     {down:"水を入れた500mlのペットボトルで行う"},
  shrug:     {up:"荷物を詰めたリュックの持ち手を両手で持つ", down:"水を入れた2Lのペットボトルを両手に持つ"},
  row2:      {up:"本や水のペットボトルを詰めたリュックの持ち手を握って引く", down:"水を入れた2Lのペットボトルで行う"},
  calfseat:  {up:"荷物を詰めたリュックを膝の上に乗せる", down:"水を入れた2Lのペットボトルを膝に乗せる"},
  sidebend:  {up:"荷物を詰めた袋を持つ", down:"水を入れた2Lのペットボトルを持つ"},
  sidelunge: {up:"荷物を詰めたリュックを背負う", down:"水を入れた2Lのペットボトルを胸の前で抱える"},
  slidecurl: {up:"荷物を詰めたリュックを骨盤に乗せる（畳んだタオルを挟むと痛くない）"},
  pullover:  {down:"水を入れた2Lのペットボトルを両手でまとめて持つ"},
  twist:     {up:"荷物を詰めた袋を持つ"},
  sissy:     {up:"荷物を詰めたリュックを胸の前で抱える"},
  rear:      {down:"水を入れた500mlのペットボトルで行う"},
  abduct:    {up:"水を入れたペットボトルを太ももの外側に乗せ、手で押さえて行う"},
  hammer:    {down:"水を入れたペットボトルを縦に持って行う"},
  adduct:    {up:"水を入れたペットボトルを下の脚の内ももに乗せ、上の手で押さえて行う"},
  backext:   {up:"水を入れた500mlのペットボトルを両手で持ち、頭の後ろに添えて行う"},
  deadlift:  {up:"本や水を入れたペットボトルを詰めたリュックを背負い、ダンベルと一緒に使う", down:"水を入れた2Lのペットボトルを両手に1本ずつ持つ"}
};
function houseOf(id){ return HOUSE[id] || HOUSE[baseOf(id)] || {}; }

/* 「使うダンベル」の一文 */
function gearLine(id, sug){
  if(!holdOf(id)) return "";
  const opts = gearOptions(id);
  if(!opts.length){
    const hs = houseOf(id);
    return "ダンベルが登録されていません。" + (hs.down ? "「" + hs.down + "」で代用できます。" : "この種目は飛ばしてください。");
  }
  const o = sug ? sug.opt : defaultOption(id);
  if(!o){
    if(sug && sug.w !== undefined && sug.w !== null && !isNaN(sug.w)) return kgText(sug.w) + "は、登録しているダンベルでは作れない重さです（日用品を足しているなら、そのままで構いません）。";
    return defaultOption(id).text;
  }
  const hs = houseOf(id);
  const heavy = optionIndex(opts, o) === 0 && o.key > startKg(id) * 2 && hs.down
    ? "　持っている中で一番軽くても重めです。きつすぎたら「" + hs.down + "」に替えてください。" : "";
  return o.text + heavy;
}
/* 解説文の「5kg」などの数字は、5kg×2本の前提で書いてある。登録が違えば数字を出さない言い方にする */
function gearText(s){
  if(!s) return "";
  if(isDefaultGear()) return s;
  return String(s).replace(/\d+(?:\.\d+)?\s*kg/g, "軽いダンベル");
}
/* メモのうち持ち方に触れた一文（「両手に1つずつ持つ」「2つ担げば10kgになる」）は、実際の使い方と合うときだけ残す */
function noteFor(item, opt){
  const note = item.note;
  if(!note) return "";
  if(isDefaultGear() && opt && opt.n === 2 && !opt.mixed) return note;
  const kept = note.split("。").filter(x => x && !/kg|[2２]つ|両手に[1１]つずつ/.test(x));
  return kept.length ? kept.join("。") + "。" : "";
}

/* 設定できる重さの短い一覧（多いときは先頭3つと最後だけ）。例: 「2, 4, 6 … 24kg（12段階）」 */
function adjListSummary(list){
  const fmt = v => Math.round(v * 10) / 10, n = list.length;
  if(n <= 4) return list.map(fmt).join("、") + "kg（" + n + "段階）";
  return list.slice(0, 3).map(fmt).join("、") + " … " + kgText(list[n - 1]) + "（" + n + "段階）";
}
function gearCard(){
  const rows = gearItems();
  const fixedRow = (x, i) => `<div class="dbrow">
      <div class="fld"><label>重さ kg</label>
        <div class="stepper">
          <button data-act="dbstep" data-i="${i}" data-t="kg" data-d="-1" aria-label="軽く">−</button>
          <input type="number" id="db_kg_${i}" value="${x.kg}" step="0.5" min="0.5" inputmode="decimal">
          <button data-act="dbstep" data-i="${i}" data-t="kg" data-d="1" aria-label="重く">＋</button>
        </div></div>
      <div class="fld"><label>本数</label>
        <div class="stepper">
          <button data-act="dbstep" data-i="${i}" data-t="n" data-d="-1" aria-label="減らす">−</button>
          <input type="number" id="db_n_${i}" value="${x.n}" step="1" min="1" inputmode="numeric">
          <button data-act="dbstep" data-i="${i}" data-t="n" data-d="1" aria-label="増やす">＋</button>
        </div></div>
      <button class="dbdel" data-act="dbdel" data-i="${i}" aria-label="この重さを削除">×</button>
    </div>`;
  const adjField = (i, field, label, val, step, min) => `<div class="fld"><label>${label}</label>
      <div class="stepper">
        <button data-act="adjstep" data-i="${i}" data-f="${field}" data-d="-1" aria-label="減らす">−</button>
        <input type="number" id="adj_${field}_${i}" value="${val}" step="${step}" min="${min}" inputmode="decimal">
        <button data-act="adjstep" data-i="${i}" data-f="${field}" data-d="1" aria-label="増やす">＋</button>
      </div></div>`;
  const adjRow = (x, i) => `<div class="dbrow adjrow">
      <div class="adjdelwrap"><b>可変式ダンベル</b><button class="dbdel" data-act="adjdel" data-i="${i}" aria-label="この可変式ダンベルを削除">×</button></div>
      <div class="adjflds">
        ${adjField(i, "min", "一番軽い kg", x.min, 0.25, 0.25)}
        ${adjField(i, "max", "一番重い kg", x.max, 0.25, 0.25)}
        ${adjField(i, "step", "刻み kg", x.step, 0.25, 0.25)}
        ${adjField(i, "n", "本数", x.n, 1, 1)}
      </div>
      <p class="lastline">設定できる重さ: ${esc(adjListSummary(adjWeights(x)))}</p>
      <div class="fld"><label>刻みが一定でないときは、設定できる重さを「,」で区切って入力</label>
        <input type="text" id="adjlist_${i}" value="${esc((x.list || []).join(", "))}" placeholder="例: 2.5, 3.5, 4.5, 6.5" inputmode="decimal"></div>
    </div>`;
  const invText = x => x.adj
    ? "可変式 " + (x.list
        ? (Math.round(x.list[0] * 10) / 10) + "〜" + kgText(x.list[x.list.length - 1]) + "（" + x.list.length + "段階）"
        : (Math.round(x.min * 10) / 10) + "〜" + kgText(x.max) + "（" + (Math.round(x.step * 100) / 100) + "kg刻み）")
      + "×" + x.n + "本"
    : kgText(x.kg) + "×" + x.n + "本";
  return `<h3 class="sec">持っているダンベル</h3>
  <div class="card">
    ${rows.length ? rows.map((x, i) => x.adj ? adjRow(x, i) : fixedRow(x, i)).join("") : `<p style="margin:0;font-size:14px">登録なし</p>`}
    <div class="rowbtns"><button data-act="dbadd">${rows.length ? "別の重さを追加" : "ダンベルを追加"}</button><button data-act="adjadd">可変式ダンベルを追加</button></div>
    ${!state.gear ? `<p class="lastline"><b>ダンベルがまだ登録されていません。</b>いまは5kg×2本をお持ちの前提で提案しています。実際の内容に直してください。</p>` : ""}
    <p class="lastline">${rows.length ? (state.gear ? "登録中: " : "前提: ") + rows.map(invText).join("、") : "登録なし。ダンベルを使わない種目と、日用品で代用するやり方を提案します"}</p>
    <p class="lastline">持っている重さと本数を入れてください。</p>
  </div>`;
}
function dbStep(i, t, d){
  const it = gearItems(); if(!it[i] || it[i].adj) return;
  if(t === "kg"){
    const cur = it[i].kg;
    const st = d > 0 ? (cur >= 20 ? 2.5 : cur >= 3 ? 1 : 0.5) : (cur > 20 ? 2.5 : cur > 3 ? 1 : 0.5);
    it[i].kg = Math.max(0.5, Math.round((cur + d * st) * 10) / 10);
  }else{
    it[i].n = Math.max(1, Math.min(20, it[i].n + d));
  }
  setGearItems(it); render();
}
/* 可変式の行の −／＋（min/max/step/本数）。値がおかしくならないよう min<=max を保ち、
   readGearItem の検査を通ったときだけ反映する（設定できる重さが80個を超える変更などは無視し、
   保存→読み込みで行が消える不具合を防ぐ） */
function adjStep(i, field, d){
  const it = gearItems(); if(!it[i] || !it[i].adj) return;
  const row = Object.assign({}, it[i]);
  if(field === "n") row.n = Math.max(1, Math.min(20, row.n + d));
  else if(field === "step") row.step = Math.max(0.25, Math.round((row.step + d * (row.step >= 5 ? 1 : 0.25)) * 100) / 100);
  else{
    const cur = row[field], st = d > 0 ? (cur >= 20 ? 2.5 : cur >= 3 ? 1 : 0.5) : (cur > 20 ? 2.5 : cur > 3 ? 1 : 0.5);
    row[field] = Math.max(0.25, Math.round((cur + d * st) * 100) / 100);
    if(row.min > row.max){ if(field === "min") row.max = row.min; else row.min = row.max; }
  }
  const checked = readGearItem(row);
  if(!checked) return;                  /* 検査に落ちる変更（設定できる重さが80個を超えるなど）は反映しない */
  it[i] = checked;
  setGearItems(it); render();
}
ACTIONS.adjstep = el => adjStep(+el.dataset.i, el.dataset.f, +el.dataset.d);
ACTIONS.adjdel = el => { const it = gearItems(); it.splice(+el.dataset.i, 1); setGearItems(it); render(); };
ACTIONS.adjadd = () => { const it = gearItems(); it.push({adj:true, min:2, max:24, step:2, n:2}); setGearItems(it); render(); };
/* 可変式の行の入力欄（min/max/step/本数・「,」区切りの一覧）。設定タブを描くたびに shell.js から呼ぶ。
   ここも readGearItem の検査を通ったときだけ反映する（adjStep と同じ理由） */
function wireGearCard(root){
  root.querySelectorAll('input[id^="adj_"]').forEach(inp => {
    inp.onchange = () => {
      const parts = inp.id.split("_"), field = parts[1], i = +parts[2];
      const it = gearItems();
      if(!it[i] || !it[i].adj){ render(); return; }
      const val = parseFloat(inp.value || "0");
      if(isNaN(val) || val <= 0){ render(); return; }
      const row = Object.assign({}, it[i]);
      if(field === "n") row.n = Math.max(1, Math.min(20, Math.round(val)));
      else{
        row[field] = Math.round(val * 100) / 100;
        if(row.min > row.max){ if(field === "min") row.max = row.min; else row.min = row.max; }
      }
      const checked = readGearItem(row);
      if(!checked){ render(); return; }
      it[i] = checked;
      setGearItems(it); render();
    };
  });
  root.querySelectorAll('input[id^="adjlist_"]').forEach(inp => {
    inp.onchange = () => {
      const i = +inp.id.slice("adjlist_".length);
      const it = gearItems();
      if(!it[i] || !it[i].adj){ render(); return; }
      const txt = inp.value.trim();
      const row = Object.assign({}, it[i]);
      if(!txt) delete row.list;
      else{
        const nums = txt.split(/[,、]/).map(s => parseFloat(s.trim())).filter(v => isFinite(v) && v > 0 && v <= 100);
        if(nums.length >= 2) row.list = nums; else delete row.list;
      }
      const checked = readGearItem(row);
      if(!checked){ render(); return; }
      it[i] = checked;
      setGearItems(it); render();
    };
  });
}

function settingsCard(){
  const sound = PREF.get("sound", true), sure = PREF.get("sure", false), vib = PREF.get("vib", false),
        notif = PREF.get("notify", false), wake = PREF.get("wake", true);
  const notifState = !notifySupported() ? "この画面では使えません"
    : (typeof Notification !== "undefined" && Notification.permission === "denied") ? "ブラウザ側で拒否されています"
    : (notif ? "オン" : "オフ");
  return `<h3 class="sec">休憩の終わりを知らせる</h3>
  <div class="card">
    <div class="setrow"><span>音で知らせる</span>
      <button data-act="pref" data-k="sound" class="tg ${sound?"on":""}">${sound?"オン":"オフ"}</button></div>
    <div class="setrow"><span>マナーモード・画面ロック中も鳴らす<small>オンにすると確実に鳴りますが、休憩中はほかのアプリの音楽が止まります</small></span>
      <button data-act="pref" data-k="sure" class="tg ${sure?"on":""}">${sure?"オン":"オフ"}</button></div>
    <div class="setrow"><span>振動で知らせる<small>対応端末のみ。PCでは動きません</small></span>
      <button data-act="pref" data-k="vib" class="tg ${vib?"on":""}">${vib?"オン":"オフ"}</button></div>
    <div class="setrow"><span>端末に通知を出す<small>${notifState}</small></span>
      <button data-act="asknotify" class="tg ${notif?"on":""}">${notif?"オン":"許可する"}</button></div>
    <div class="setrow"><span>休憩中は画面を消さない</span>
      <button data-act="pref" data-k="wake" class="tg ${wake?"on":""}">${wake?"オン":"オフ"}</button></div>
    <div class="rowbtns"><button data-act="testalert">今の設定で鳴らしてみる</button></div>
    <p class="lastline">${sure
      ? "休憩のあいだ無音の音声を流し、終わりに合図を鳴らします。画面を消していても鳴りますが、端末によっては止まることがあります。"
      : "音楽と一緒に使えます。鳴るのはアプリを開いて画面がついている間だけで、iPhoneはマナーモード中だと鳴りません。画面から離れている間に休憩が終わったら、戻ったときに知らせます。"}</p>
  </div>`;
}
