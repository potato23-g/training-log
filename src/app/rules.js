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
   ・間隔: 主役（主働筋）として3セット以上やった部位は、中1日をはさんで2日は主役にしない（本人の要望）。
          昨日しっかり使った部位（有効セットが3以上。回復の早い腹直筋・腹斜筋は10、ふくらはぎ・前腕は6）も今日は主役にしない
   ・1日の負荷: 大きい部位（脚・尻・胸・背中）は8セット、ほかの部位は6セットまで。1回は16セット・6種目・50分くらいまで
   ・1週間の量: 直近7日で各部位10セットを目標に、目標までの不足を2乗で数えて、価値の大きい種目から1つずつ入れる。
               目標から遠い部位ほど価値が急に上がるので、大きい部位ばかりで埋まって小さい部位が0セットのまま、にはならない。
               部位の重み（PLAN_WEIGHT）は大きい部位を少しだけ重くしてある。入れ終わって時間が残れば、足りない部位の
               種目のセットを増やす（4セットまで）。目標に届いた部位も、16セットまでは少しだけ価値を残す（毎日やる人の分）
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
const SESSION_MAX = {sets:16, exercises:6, minutes:50};
/* 足りないときに優先する度合い（大きい部位ほど高い） */
const PRIORITY = {quads:1, glutes:1, hams:1, chest:1, lats:1, shoulders:0.8,
                  triceps:0.5, biceps:0.5, calves:0.5, abs:0.4, obliques:0.4, traps:0.4,
                  erectors:0.2, forearms:0.2, adductors:0.2};
/* メニューを選ぶときの部位の重み。不足を2乗で数えるので、差は小さめにしてある（PRIORITY は「からだ」タブの並び順用） */
const PLAN_WEIGHT = {quads:1, glutes:1, hams:1, chest:1, lats:1, shoulders:0.9,
                     triceps:0.8, biceps:0.8, calves:0.8, abs:0.6, obliques:0.6, traps:0.6,
                     erectors:0.3, forearms:0.3, adductors:0.3};
/* 主役として使った部位を休ませる日数と、そのあいだの主役のセット数の目安（これ以上なら回復の途中） */
const RECOVER_DAYS = 2, RECOVER_PRIMARY = 3;
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
/* 部位 m が回復の途中か: 中1日をはさんで2日のうちに主役で3セット以上、または昨日しっかり使った */
function recovering(m){
  return primaryLoadBetween(m, 1, RECOVER_DAYS) >= RECOVER_PRIMARY || muscleLoadBetween(m, 1, 1) >= recoverLimit(m);
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
/* 回復の途中の主働筋（なければ null）。種目を選ぶシートの印と「今日の調整」の回復優先で使う（メニュー作りと同じ決まり） */
function tiredMuscle(exId){
  const ex = EXMAP[exId];
  return ex.p.find(recovering) || null;
}
