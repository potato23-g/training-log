/* ---------- 今日 ---------- */
const REST = {split:120, goblet:120, sumo:120, splitfloor:120, rdl:120, rdl1:120, hipthrust:105, bridge:90,
              row:105, row2:105, ohp:105, pushup:105, pushupknee:105, floorpress:105, fly:90,
              sidelunge:120, slidecurl:90, pullover:90};
function restFor(item){
  const ex = EXMAP[item.ex];
  if(ex.kind === "t") return 60;
  return REST[item.ex] || 90;
}
/* ---- 今日のメニューを決める ----
   回復の間隔と、1日・1週間にかける負荷から組む。数字は一般的な目安で、研究間のばらつきも個人差も大きいので絶対視しない。
   数え方は「からだ」タブと同じ有効セット（主に効く部位は1セット=1.0、補助的に使う部位は0.5）。
   ・間隔: 主役（主働筋）として3セット以上やった部位は、部位ごとの日数（RECOVER_GAP）だけ空けてから主役にする
          （脚・尻・ハムストリングは中3日、胸・背中は中2日、肩・腕は中1日、腹筋・前腕・ふくらはぎは連日でもよい）。
          その日に主役で6セット以上やったときは1日延ばす。昨日しっかり使った部位（補助も含めた有効セットが3以上。
          腹直筋・腹斜筋は10、ふくらはぎ・前腕は6）も今日は主役にしない。今日「筋肉痛」と選んだ部位も主役にしない
   ・1日の負荷: 大きい部位（脚・尻・胸・背中）は8セット、ほかの部位は6セットまで。1回は15セット・5種目・50分くらいまで
   ・1週間の量: 直近7日で各部位10セットを目標に、目標までの不足を2乗で数えて価値を決め、価値の大きい種目から入れる。
               目標から遠い部位ほど価値が急に上がるので、大きい部位ばかりで埋まって小さい部位が0セットのまま、にはならない。
               セット数はどの種目も3で固定（本人の要望。重さ・回数は本人が調整する）。
               部位の重み（PLAN_WEIGHT）は大きい部位を少しだけ重くしてある。目標に届いた部位も、16セットまでは少しだけ価値を残す
   これまでの決まりもそのまま守る:
   ・同じ動きの種目（例: ゴブレットスクワットとブルガリアンスクワット）は1日1つ
   ・昨日（暦の昨日）やった動きは、今日は出さない
   ・ダンベルが要る種目は、持っているダンベルで作れるものだけ
   ・動きごとに、今日やる組み方は伸ばし方（progress.js）で決まる。気分では入れ替えない
   A〜Dの各メニュー（ROUTINES）は、種目ごとのセット数・回数・メモの出どころとしてだけ使う。
   記録を始めた日は、そのときのメニューを保存して、その日のうちは変えない。 */
const PATTERN = {
  goblet:"squat", split:"squat", rdl:"hinge", rdl1:"hinge", hipthrust:"bridge", calf:"calf",
  pushup:"hpush", floorpress:"hpush", ohp:"vpush", lateral:"raise", row:"pull", farmer:"carry",
  curl:"curl", triext:"ext", plank:"abs", deadbug:"abs", crunch:"abs", sideplank:"side",
  sumo:"squat", splitfloor:"squat", bridge:"bridge", pushupknee:"hpush", fly:"fly",
  skull:"ext", front:"raise", shrug:"shrug", row2:"pull",
  calfseat:"calf", sidebend:"side", sidelunge:"lunge",
  slidecurl:"legcurl", pullover:"pullover", twist:"twist"
};
/* メニューに並べる順（大きい動きを先に、体幹は最後に） */
const PATTERN_ORDER = ["squat","lunge","hinge","legcurl","hpush","fly","pull","pullover","vpush","bridge","carry","shrug","raise","curl","ext","calf","abs","side","twist"];
/* 昨日この有効セット数以上使った部位は、今日は主役にしない。体幹・ふくらはぎ・前腕は回復が早い */
const RECOVER_SETS = {abs:10, obliques:10, calves:6, forearms:6};
const WEEK_TARGET = 10, WEEK_MAX = 16;
const BIG_MUSCLES = ["quads","glutes","hams","chest","lats"];
/* 1日にかける上限（有効セット） */
function dayMax(m){ return BIG_MUSCLES.includes(m) ? 8 : 6; }
const SESSION_MAX = {sets:15, exercises:5, minutes:50};     /* 1種目3セットで5種目まで */
/* 足りないときに優先する度合い（大きい部位ほど高い） */
const PRIORITY = {quads:1, glutes:1, hams:1, chest:1, lats:1, shoulders:0.8,
                  triceps:0.5, biceps:0.5, calves:0.5, abs:0.4, obliques:0.4, traps:0.4,
                  erectors:0.2, forearms:0.2, adductors:0.2};
/* メニューを選ぶときの部位の重み。不足を2乗で数えるので、差は小さめにしてある（PRIORITY は「からだ」タブの並び順用） */
/* 腹直筋・脊柱起立筋・前腕・内転筋はほかの種目の補助で十分に使われるので軽くしてある */
const PLAN_WEIGHT = {quads:1, glutes:1, hams:1, chest:1, lats:1, shoulders:0.9,
                     triceps:0.8, biceps:0.8, calves:0.9, abs:0.5, obliques:0.8, traps:0.6,
                     erectors:0.3, forearms:0.3, adductors:0.15};
/* 同じくらいの価値なら、定番の動き（スクワット・ヒンジ・ロウ・プレス）を少し先にする係数。
   部位の不足だけで比べると、主役の部位が多い種目（サイドランジ）や補助の多い種目（プルオーバー）が
   いつも勝ってしまい、スクワットやロウが出なくなるため。書いていない動きは1 */
const PATTERN_PREF = {lunge:0.7, pullover:0.8, fly:0.9, carry:0.85, shrug:0.85, raise:0.9};
/* 部位ごとの回復の日数: 主役（主働筋）として3セット以上やった日から、次に主役にするまで空ける日数
   （0=連日でもよい、1=中1日=48時間、2=中2日=72時間、3=中3日=96時間）。その日に主役で6セット以上やったときは1日延ばす。
   文献の目安（2026-09-29 に調べたもの）: 下肢の大きい筋は中2日が最小で、量が多い・下ろす動作が強いと1日（ハムストリングは
   2日）延びる（González-Badillo ら Int J Sports Med PMID26667923、Chen ら Eur J Appl Physiol PMID20852880）。
   胸・背中は中2日、肩・腕は中1日（筋タンパク合成は36〜48時間で戻る: MacDougall 1995 PMID8563679、
   頻度の研究: Schoenfeld 2019 J Sports Sci PMID30558493）。腹筋・前腕・ふくらはぎは連日でもよいとされる
   （部位ごとの研究は少なく根拠は弱い。ACSM の指針 Garber 2011 PMID21694556 などから）。
   脚・尻・ハムストリングは、本人の実感（中2日ではまだ早い）に合わせて文献の「量が多い日」の側の中3日にしてある */
const RECOVER_GAP = {quads:3, glutes:3, hams:3, chest:2, lats:2, shoulders:1, traps:1, erectors:2,
                     biceps:1, triceps:1, forearms:0, abs:0, obliques:0, calves:0, adductors:2};
const RECOVER_PRIMARY = 3, RECOVER_HEAVY = 6;
/* 1種目のセット数。本人の要望で3に固定（2026-09-29。重さ・回数は本人が調整する） */
const SETS_PER_EXERCISE = 3;
function recoverGap(m){ return RECOVER_GAP[m] === undefined ? 2 : RECOVER_GAP[m]; }
/* 部位 m が主役（主働筋）だったセット数（fromDaysAgo〜toDaysAgo 日前） */
function primaryLoadBetween(m, fromDaysAgo, toDaysAgo){
  let n = 0;
  sortedDates().forEach(d => {
    const ago = daysAgo(d);
    if(ago < fromDaysAgo || ago > toDaysAgo) return;
    (state.sessions[d].entries || []).forEach(e => { const ex = EXMAP[e.ex]; if(ex && ex.p.includes(m)) n += e.sets.length; });
  });
  return n;
}
/* 部位 m が回復の途中か: 部位ごとの日数（RECOVER_GAP）のうちに主役で3セット以上、
   量が多かった日（主役で6セット以上）はもう1日、または昨日しっかり使った（補助も含めた有効セット） */
function recovering(m){ return recoverDaysLeft(m) > 0; }
/* 「中3日: 大腿四頭筋・大殿筋…／…／連日でもよい: 腹直筋…」（提案タブの説明用。表から作るので値を変えても食い違わない） */
function recoverGapText(){
  const gaps = Array.from(new Set(Object.keys(MUSCLES).map(recoverGap))).sort((a, b) => b - a);
  return gaps.map(g => (g ? "中" + g + "日: " : "連日でもよい: ")
    + Object.keys(MUSCLES).filter(m => recoverGap(m) === g).map(m => MUSCLES[m]).join("・")).join("／")
    + "（1日に6セット以上やった部位は、空ける日を1日増やします）";
}
/* 今日「筋肉痛」と選んだ部位（その日だけ。今日のメニューでは主役にしない） */
function soreToday(){
  const s = state.sessions[TODAY];
  return (s && Array.isArray(s.sore) ? s.sore : []).filter(m => MUSCLES[m]);
}
/* 部位 m を次に主役にできる日（今日から数えて何日後か。0=今日から）。今のまま記録が増えなければ */
function recoverDaysLeft(m){
  const g = recoverGap(m);
  let left = 0;
  for(let ago = 1; ago <= g + 1; ago++){
    const n = primaryLoadBetween(m, ago, ago);
    const need = n >= RECOVER_HEAVY ? g + 2 : (n >= RECOVER_PRIMARY ? g + 1 : 0);
    left = Math.max(left, need - ago);
  }
  if(muscleLoadBetween(m, 1, 1) >= recoverLimit(m)) left = Math.max(left, 1);
  return left;
}
function patternOf(id){ return PATTERN[id] || PATTERN[baseOf(id)] || id; }
function recoverLimit(m){ return RECOVER_SETS[m] || 3; }
/* 種目の難しさ（1=やさしい, 2=標準, 3=難しい）。書いていなければ標準。
   同じ種目でも片脚でやる組み方は、1段難しいものとして扱う */
function levelOf(id){ return (EXMAP[id] || {}).level || (EXMAP[baseOf(id)] || {}).level || 2; }
function itemLevel(it){
  const ex = EXMAP[it.ex] || {};
  return Math.max(0, Math.min(5, levelOf(it.ex) + (it.side && !ex.side ? 1 : 0) + (it.lv || 0)));
}
/* 昨日1セットでも手を付けた種目 */
function touchedYesterday(){
  const out = new Set();
  for(const d of sortedDates()){
    if(d >= TODAY) continue;
    if(Math.round((asDate(TODAY) - asDate(d)) / 86400000) !== 1) continue;   /* 今日から見た昨日 */
    (state.sessions[d].entries || []).forEach(e => { if(e.sets.length) out.add(e.ex); });
  }
  return out;
}
/* 昨日やった動き。同じ動きは2日続けない。
   （種目ではなく動きで見る。種目だけで見ると、同じ動きの中で別の種目に入れ替わってしまう） */
function patternsYesterday(){
  const out = new Set();
  touchedYesterday().forEach(id => out.add(patternOf(id)));
  return out;
}
/* 同じ動きの中で、1段やさしい（dir=-1）／1段難しい（dir=+1）組み方。無ければ null。
   負荷を合わせるための持ち替え先なので、同じ段のもの（＝名前が違うだけ）は出さない */
function stepItem(item, dir){
  const now = itemLevel(item), pat = patternOf(item.ex);
  const cands = catalog().filter(c => {
    if(patternOf(c.ex) !== pat) return false;
    if(c.ex === item.ex && (c.label || "") === (item.label || "")) return false;
    if(!gearReady(c.ex, c)) return false;   /* 持っているダンベルで作れない（種目の種類・needsDb の組み方を問わず） */
    const lv = itemLevel(c);
    return dir > 0 ? lv > now : lv < now;
  });
  /* 段が同じなら、同じ種目のやり方（〜（深く）など）を先に出す */
  cands.sort((a, b) => (dir > 0 ? (itemLevel(a) - itemLevel(b)) : (itemLevel(b) - itemLevel(a)))
                    || ((b.ex === item.ex) - (a.ex === item.ex)));
  return cands.length ? cands[0] : null;
}
/* 回復の途中か、今日筋肉痛と選んだ主働筋（なければ null）。種目を選ぶシートの印と「今日の調整」の回復優先で使う
   （メニュー作りと同じ決まり） */
function tiredMuscle(exId){
  const ex = EXMAP[exId], sore = soreToday();
  return ex.p.find(m => sore.includes(m)) || ex.p.find(recovering) || null;
}
