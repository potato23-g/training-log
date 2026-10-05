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
          その日に主役で6セット以上やったときは1日延ばす。今日「筋肉痛」と選んだ部位も主役にしない。
          少しやっただけ（主役で1〜2セット・補助で使っただけ）の部位は、回復の対象にしない（2026-10-02 本人の要望。
          それまでは、補助も含めた有効セットが昨日3以上なら1日休ませていた）
          7日使えていない部位が、回復の途中の部位も使う種目でしか鍛えられないときだけは、回復の途中でもその種目を入れる
          （2026-10-05 本人の判断。planner.js の overdue。入れたことは今日タブに出す: restIncluded）
   ・1日の負荷: 大きい部位（脚・尻・胸・背中）は9セット、ほかの部位は6セットまで（その種目がメインで鍛える部位について見る。
               補助で使うだけの部位の量では外さない）。1回は30セット・10種目・90分まで（SESSION_MAX）
   ・1週間の量: 直近7日で各部位10セットを目標に、目標までの不足を2乗で数えて価値を決め、価値の大きい種目から入れる。
               目標から遠い部位ほど価値が急に上がるので、大きい部位ばかりで埋まって小さい部位が0セットのまま、にはならない。
               そのあと、メインで鍛える部位が目標に届いていない種目を、上限の範囲で足す（2026-10-05 本人の要望:
               種目が増えてもよいので目標に届くように）。届いている部位ばかりの日は種目が少ない。
               セット数はどの種目も3で固定（本人の要望。重さ・回数は本人が調整する）。
               部位の重み（PLAN_WEIGHT）は大きい部位を少しだけ重くしてある。目標に届いた部位も、16セットまでは少しだけ価値を残す
   これまでの決まりもそのまま守る:
   ・同じ動きの種目（例: ゴブレットスクワットとブルガリアンスクワット）は1日1つ
   ・昨日（暦の昨日）3セット以上やった動きは、今日は出さない
   ・ダンベルが要る種目は、持っているダンベルで作れるものだけ
   ・動きごとに、今日やる組み方は伸ばし方（progress.js）で決まる。気分では入れ替えない
   A〜Dの各メニュー（ROUTINES）は、種目ごとのセット数・回数・メモの出どころとしてだけ使う。
   記録を始めた日は、そのときのメニューを保存して、その日のうちは変えない。 */
const PATTERN = {
  goblet:"squat", split:"squat", rdl:"hinge", rdl1:"hinge", hipthrust:"bridge", calf:"calf",
  pushup:"hpush", floorpress:"hpush", ohp:"vpush", lateral:"raise", row:"pull", farmer:"carry",
  curl:"curl", triext:"ext", plank:"abs", deadbug:"abs", crunch:"abs", sideplank:"side",
  sumo:"squat", splitfloor:"squat", bridge:"bridge", pushupknee:"hpush", fly:"fly",
  skull:"ext", front:"fraise", shrug:"shrug", row2:"pull",
  calfseat:"calf", sidebend:"side", sidelunge:"lunge",
  slidecurl:"legcurl", pullover:"pullover", twist:"twist",
  /* 2026-10-03: フロントレイズは肩の前・サイドレイズは肩の横で狙う部位が違うので、別の動きにした
     （同じ動きのままだと、前回やった方だけが続けて出て、もう一方が出なくなる）。
     ハンマーカールは、ダンベルカールとほぼ同じ「肘を曲げる」動きだが、別の動きとして扱う（2026-10-05 本人の判断:
     違う種目なら、ほぼ同じ動きでも別のものとして入れてよい）。同じ日に両方が入ることもある */
  sissy:"kneeext", rear:"rear", abduct:"abduct", hammer:"hammer"
};
/* メニューに並べる順（大きい動きを先に、体幹は最後に） */
const PATTERN_ORDER = ["squat","lunge","kneeext","hinge","legcurl","hpush","fly","pull","pullover","vpush","bridge","abduct","carry","shrug",
                       "raise","fraise","rear","curl","hammer","ext","calf","abs","side","twist"];
/* 動きの中で、メニュー作りが選ぶ種目を決めてある動き。前回ほかの種目をやっていても、この種目（とその楽／大変のやり方）で続ける。
   ふくらはぎは立って段差で行う方を基本にする: 座って行う方は腓腹筋がほとんど太らず、ヒラメ筋の太り方も
   立って行う方と同じくらいだった（Kinoshita 2023 doi:10.3389/fphys.2023.1272106）。座って行う方は種目を選ぶシートからは選べる */
const PATTERN_MAIN = {calf:"calf"};
/* 記録の無い動きを、どの種目から始めるか */
const PATTERN_FIRST = {calf:"calf"};
/* 仕上げに足す動き: 書いてある動きを先に組んだ日だけ入れる。シシースクワット（膝を伸ばす）は大腿四頭筋だけを使うので、
   別の日に入れると大殿筋の回復の日とずれて、スクワット・ランジ（大腿四頭筋と大殿筋の両方を使う）が入る日がなくなる */
const PATTERN_AFTER = {kneeext:["squat", "lunge"]};
const WEEK_TARGET = 10, WEEK_MAX = 16;
const BIG_MUSCLES = ["quads","glutes","hams","chest","lats"];
/* 1日にかける上限（有効セット）。大きい部位は3種目ぶん、ほかの部位は2種目ぶん。その種目がメインで鍛える部位について見る
   （2026-10-05: 大きい部位を8から9へ。8だと、スクワットとルーマニアンデッドリフトで大殿筋が6になった日は、内転筋を
   メインで鍛えるただ1つの種目のサイドランジが入らなかった） */
function dayMax(m){ return BIG_MUSCLES.includes(m) ? 9 : 6; }
/* 1回の量の上限。週の目標に届かせるのに要る種目だけを入れるので、ふだんはこれより少ない（毎日やる人で平均4〜5種目）。
   上限いっぱいになるのは、週3回のように間が空くとき（2026-10-05 本人の要望: 種目が増えてもよいので目標に届くように。
   それまでは15セット・5種目・50分で、部位を18に分けてからは、週3回だと胸・広背筋・上腕三頭筋が週6〜7セットに減っていた） */
const SESSION_MAX = {sets:30, exercises:10, minutes:90};
/* 足りないときに優先する度合い（大きい部位ほど高い） */
const PRIORITY = {quads:1, glutes:1, hams:1, chest:1, lats:1, frontdelt:0.8, sidedelt:0.8, reardelt:0.8,
                  triceps:0.5, biceps:0.5, calves:0.5, gmed:0.5, abs:0.4, obliques:0.4, traps:0.4,
                  erectors:0.2, forearms:0.2, adductors:0.2};
/* メニューを選ぶときの部位の重み。不足を2乗で数えるので、差は小さめにしてある（PRIORITY は「からだ」タブの並び順用） */
/* 腹直筋・脊柱起立筋・前腕・内転筋・肩の前はほかの種目の補助で十分に使われるので軽くしてある
   （肩の前は腕立て伏せ・フロアプレス・フライでも使う） */
const PLAN_WEIGHT = {quads:1, glutes:1, hams:1, chest:1, lats:1, frontdelt:0.3, sidedelt:0.9, reardelt:0.8,
                     triceps:0.8, biceps:0.8, calves:0.9, gmed:0.5, abs:0.5, obliques:0.8, traps:0.6,
                     erectors:0.3, forearms:0.3, adductors:0.15};
/* 同じくらいの価値なら、定番の動き（スクワット・ヒンジ・ロウ・プレス）を少し先にする係数。
   部位の不足だけで比べると、主役の部位が多い種目（サイドランジ）や補助の多い種目（プルオーバー）が
   いつも勝ってしまい、スクワットやロウが出なくなるため。書いていない動きは1 */
const PATTERN_PREF = {lunge:0.7, pullover:0.8, fly:0.9, carry:0.85, shrug:0.85, raise:0.9,
                      fraise:0.8, rear:0.9, kneeext:0.8, abduct:0.85, hammer:0.8};
/* 部位ごとの回復の日数: 主役（主働筋）として3セット以上やった日から、次に主役にするまで空ける日数
   （0=連日でもよい、1=中1日=48時間、2=中2日=72時間、3=中3日=96時間）。その日に主役で6セット以上やったときは1日延ばす。
   文献の目安（2026-09-29 に調べたもの）: 下肢の大きい筋は中2日が最小で、量が多い・下ろす動作が強いと1日（ハムストリングは
   2日）延びる（González-Badillo ら Int J Sports Med PMID26667923、Chen ら Eur J Appl Physiol PMID20852880）。
   胸・背中は中2日、肩・腕は中1日（筋タンパク合成は36〜48時間で戻る: MacDougall 1995 PMID8563679、
   頻度の研究: Schoenfeld 2019 J Sports Sci PMID30558493）。腹筋・前腕・ふくらはぎは連日でもよいとされる
   （部位ごとの研究は少なく根拠は弱い。ACSM の指針 Garber 2011 PMID21694556 などから）。
   脚・尻・ハムストリングは、本人の実感（中2日ではまだ早い）に合わせて文献の「量が多い日」の側の中3日にしてある */
const RECOVER_GAP = {quads:3, glutes:3, hams:3, chest:2, lats:2, frontdelt:1, sidedelt:1, reardelt:1, traps:1, erectors:2,
                     biceps:1, triceps:1, forearms:0, abs:0, obliques:0, calves:0, adductors:2, gmed:1};
const RECOVER_PRIMARY = 3, RECOVER_HEAVY = 6;
/* 1種目のセット数。本人の要望で3に固定（2026-09-29。重さ・回数は本人が調整する） */
const SETS_PER_EXERCISE = 3;
function recoverGap(m){ return RECOVER_GAP[m] === undefined ? 2 : RECOVER_GAP[m]; }
/* 部位 m が主役（主働筋）だったセット数（fromDaysAgo〜toDaysAgo 日前） */
function primaryLoadBetween(m, fromDaysAgo, toDaysAgo){
  let n = 0;
  sessionsBetween(fromDaysAgo, toDaysAgo).forEach(s => {
    (s.entries || []).forEach(e => { const ex = EXMAP[e.ex]; if(ex && ex.p.includes(m)) n += e.sets.length; });
  });
  return n;
}
/* 部位 m が回復の途中か: 部位ごとの日数（RECOVER_GAP）のうちに主役で3セット以上、
   量が多かった日（主役で6セット以上）はもう1日。補助で使っただけの日・主役で1〜2セットだけの日は数えない */
function recovering(m){ return recoverDaysLeft(m) > 0; }
/* 部位を、空ける日数ごとにまとめる（日数の多い順）。[{gap, muscles}]。
   からだタブの「部位ごとの回復の目安」と提案タブの説明は、どちらもここから作る（表の値を変えても食い違わない） */
function recoverGroups(){
  const gaps = Array.from(new Set(Object.keys(MUSCLES).map(recoverGap))).sort((a, b) => b - a);
  return gaps.map(g => ({gap: g, muscles: Object.keys(MUSCLES).filter(m => recoverGap(m) === g)}));
}
/* 「中3日」「連日でもよい」 */
function recoverGapLabel(g){ return g ? "中" + g + "日" : "連日でもよい"; }
const RECOVER_NOTE = "空けるのは、その部位をメインで" + RECOVER_PRIMARY + "セット以上やったとき。1日に" + RECOVER_HEAVY + "セット以上なら、空ける日を1日増やします";
/* 「中3日: 大腿四頭筋・大殿筋…／…／連日でもよい: 腹直筋…」（提案タブの説明用） */
function recoverGapText(){
  return recoverGroups().map(g => recoverGapLabel(g.gap) + ": " + g.muscles.map(m => MUSCLES[m]).join("・")).join("／")
    + "（" + RECOVER_NOTE + "）";
}
/* 今日「筋肉痛」と選んだ部位（その日だけ。今日のメニューでは主役にしない） */
function soreToday(){
  const s = state.sessions[TODAY];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const out = [];
  (s && Array.isArray(s.sore) ? s.sore : []).forEach(m => (own(MUSCLE_OLD, m) ? MUSCLE_OLD[m] : [m]).forEach(k => {
    if(own(MUSCLES, k) && !out.includes(k)) out.push(k);              /* 以前の版の「肩」は、前・横・後ろの3つとして読む */
  }));
  return out;
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
  return left;
}
function patternOf(id){ return PATTERN[id] || PATTERN[baseOf(id)] || id; }
/* 種目の難しさ（1=やさしい, 2=標準, 3=難しい）。書いていなければ標準。
   同じ種目でも片脚でやる組み方は、1段難しいものとして扱う */
function levelOf(id){ return (EXMAP[id] || {}).level || (EXMAP[baseOf(id)] || {}).level || 2; }
function itemLevel(it){
  const ex = EXMAP[it.ex] || {};
  return Math.max(0, Math.min(5, levelOf(it.ex) + (it.side && !ex.side ? 1 : 0) + (it.lv || 0)));
}
/* 昨日しっかりやった動き（その動きの種目を合わせて RECOVER_PRIMARY セット以上）。同じ動きは2日続けない。
   種目ではなく動きで見る（種目だけで見ると、同じ動きの中で別の種目に入れ替わってしまう）。
   1〜2セットだけ手を付けた動きは数えない（少しやっただけなら回復などを考えなくてよい: 2026-10-02 本人の要望。
   部位の回復の日数 recoverDaysLeft も、主役で RECOVER_PRIMARY セット以上やった日だけを数えている） */
function patternsYesterday(){
  const n = {};
  for(const d of sortedDates()){
    if(d >= TODAY) continue;
    if(Math.round((asDate(TODAY) - asDate(d)) / 86400000) !== 1) continue;   /* 今日から見た昨日 */
    (state.sessions[d].entries || []).forEach(e => {
      if(!EXMAP[e.ex]) return;
      const p = patternOf(e.ex);
      n[p] = (n[p] || 0) + e.sets.length;
    });
  }
  return new Set(Object.keys(n).filter(p => n[p] >= RECOVER_PRIMARY));
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
/* その種目の主働筋のうち、今日メインで鍛えないほうがよい部位の様子（どれも無ければ null。メニュー作りと同じ決まり）。
   種目を選ぶシートの印と、種目カードの「今日の調整」で同じものを使う（画面ごとに言うことが食い違わないように）。
   sore: 今日「筋肉痛の部位」に選んだ主働筋
   left: 回復まであと何日か。主働筋のうち一番長いもの（メニュー作りは主働筋が全部回復するまでその種目を出さないので、
         最初に見つかった部位ではなく一番長い部位で数える）。muscle はその部位
   resting: 回復の途中の主働筋をすべて。[{m, left}]
   unused: 主働筋のうち、昨日までの UNUSED_DAYS-1 日に1セットも使えていない部位（補助で使った分も数える。今日を入れて
         UNUSED_DAYS 日ぶんで、からだタブの「使えていない部位」の7日と同じ窓）。これがあれば、ほかの主働筋が回復中でも
         メニュー作りはその種目を入れてよい（2026-10-05 本人の判断。筋肉痛と選んだ部位があるときは入れないので空）。
         今日の記録は数えない: 数えると、その種目を1セットやったところでカードの説明が入れ替わってしまう */
const UNUSED_DAYS = 7;
function exRest(exId){
  const ex = EXMAP[exId], picked = soreToday();
  const sore = ex.p.filter(m => picked.includes(m));
  let muscle = null, left = 0;
  const resting = [];
  ex.p.forEach(m => { const d = recoverDaysLeft(m); if(d > 0) resting.push({m, left: d}); if(d > left){ left = d; muscle = m; } });
  if(!sore.length && !left) return null;
  const unused = sore.length ? [] : ex.p.filter(m => muscleLoadBetween(m, 1, UNUSED_DAYS - 1) <= 0);
  return {sore, muscle, left, resting, unused};
}
/* メニュー作りが、回復の途中の部位があるのに入れた種目なら、その様子（exRest の結果）。そうでなければ null。
   メニュー作りが入れるのは unused のある種目だけ（planner.js の overdue）なので、同じ exRest から決める。
   自分で足した種目（manual）・メニューに無い記録（extra）は、メニュー作りが入れたものではないので当てはめない。
   今日タブの種目カード（advice.js の todayAdvice）と、種目の下の1行（today.js）が、どちらもこれを使う */
function restIncluded(item){
  if(item.manual || item.extra || item.skip) return null;
  const r = exRest(item.ex);
  return r && r.left && r.unused.length ? r : null;
}
/* 「大腿四頭筋を7日以上使えていないので、回復の途中の部位（大殿筋はあと2日）があっても入れています。」 */
function restIncludedText(r){
  return r.unused.map(m => MUSCLES[m]).join("・") + "を" + UNUSED_DAYS + "日以上使えていないので、回復の途中の部位（"
       + recoverDaysText(r.resting) + "）があっても入れています。";
}
/* 「回復中・あと2日」（印に使う短い書き方） */
function recoverTag(left){ return "回復中・あと" + left + "日"; }
/* 「明日から」「10月4日(日)から」（left 日後からメインで鍛えられる） */
function recoverFrom(left){ return left === 1 ? "明日から" : fmtDate(addDays(TODAY, left)) + "から"; }
/* 回復の途中の部位（体の中で大きい部位から）。[{m, left}]。only があれば、その部位の中だけ */
function recoveringList(only){
  return Object.keys(MUSCLES).filter(m => !only || only.includes(m))
    .map(m => ({m, left: recoverDaysLeft(m)})).filter(x => x.left > 0)
    .sort((a, b) => (PRIORITY[b.m] || 0) - (PRIORITY[a.m] || 0));
}
/* 「大腿四頭筋・大殿筋はあと2日、胸はあと1日」 */
function recoverDaysText(list){
  const days = Array.from(new Set(list.map(x => x.left))).sort((a, b) => b - a);
  return days.map(d => list.filter(x => x.left === d).map(x => MUSCLES[x.m]).join("・") + "はあと" + d + "日").join("、");
}
