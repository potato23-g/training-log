/* ---------- 今日 ---------- */
const REST = {split:120, goblet:120, sumo:120, splitfloor:120, rdl:120, rdl1:120, hipthrust:105, bridge:90,
              row:105, row2:105, ohp:105, pushup:105, pushupknee:105, floorpress:105, fly:90,
              sidelunge:120, slidecurl:90, pullover:90, deadlift:120};
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
   ・使えていない部位: 7日使えていない部位（下の unusedSoFar）を使う種目が、組んだメニューに1つも入らなかったとき（主でも補助でも）は、
               その部位をメインで鍛える種目を先に入れてから組み直す（2026-10-06。planner.js の buildPlan）。
               ヒップアダクションを足すと、内転筋を7日使えていないのに、内転筋を使う種目が1つも入らない日ができた
               （ヒップアダクションは重みが0.15で1回10種目の取り合いに負け、サイドランジは回復の途中の部位を使わない種目が
               あるので入らない）。入らなかったときだけ組み直すので、ひと通り使えている日のメニューは変わらない。
               20分で組むとき・軽い週は、これまでどおり
   これまでの決まりもそのまま守る:
   ・同じ動きの種目は1日1つ。同じ動きにまとめるのは、片方がもう片方のやさしい版・難しい版になっている種目だけ
     （膝つき腕立て伏せと腕立て伏せ、スプリットスクワットとブルガリアンスクワットなど）。それ以外は、ほぼ同じ動きでも
     別の動きとして扱い、同じ日に両方が入ることがある（2026-10-05 本人の判断。下の PATTERN）
   ・昨日（暦の昨日）3セット以上やった動きは、今日は出さない
   ・ダンベルが要る種目は、持っているダンベルで作れるものだけ
   ・動きごとに、今日やる組み方は伸ばし方（progress.js）で決まる。気分では入れ替えない
   A〜Dの各メニュー（ROUTINES）は、種目ごとのセット数・回数・メモの出どころとしてだけ使う。
   記録を始めた日は、そのときのメニューを保存して、その日のうちは変えない。 */
/* 動き: 段階を上げていく単位。同じ動きの種目は1日1つで、メニューには前回の続き（次の段階）だけを入れる。
   同じ動きにまとめるのは、片方がもう片方のやさしい版・難しい版になっている種目だけ:
     膝つき腕立て伏せ→腕立て伏せ、スプリットスクワット→ブルガリアンスクワット、ヒップリフト→ヒップスラスト、
     ルーマニアンデッドリフトの両脚→片脚、カーフレイズ（立って行う方が基本: 下の PATTERN_MAIN）
     （ダンベルデッドリフトは、膝も曲げて床の近くから立つ別の動き。ルーマニアンデッドリフトとは別に数える: 2026-10-09）
   それ以外は、ほぼ同じ動きでも別の動きにする（2026-10-05 本人の判断: 違う種目なら、ほぼ同じ動きでも別のものとして
   入れてよい）。同じ日に両方が入ることがある:
     ゴブレットスクワット／ワイドスクワット／スプリットスクワット、腕立て伏せ／フロアプレス、ワンハンドロウ／ベントオーバーロウ、
     トライセプスエクステンション／フロアトライセプスエクステンション、プランク／デッドバグ／クランチ、
     サイドプランク／サイドベンド、ダンベルカール／ハンマーカール、サイドレイズ／フロントレイズ
   それまでは「しゃがむ」「床を押す」のような大きなまとまりごとに1日1つで、まとまりの中では前回やった種目だけが続けて出て、
   ほかの種目は出なかった */
const PATTERN = {
  goblet:"squat", sumo:"sumo", splitfloor:"splitsq", split:"splitsq", sidelunge:"lunge", sissy:"kneeext",
  rdl:"hinge", rdl1:"hinge", deadlift:"deadlift", slidecurl:"legcurl", hipthrust:"bridge", bridge:"bridge", abduct:"abduct", adduct:"adduct",
  pushupknee:"hpush", pushup:"hpush", floorpress:"floorpress", fly:"fly",
  row:"pull", row2:"row2", pullover:"pullover", ohp:"vpush", farmer:"carry", shrug:"shrug",
  lateral:"raise", front:"fraise", rear:"rear", curl:"curl", hammer:"hammer", triext:"ext", skull:"skull",
  calf:"calf", calfseat:"calf", backext:"backext", plank:"abs", deadbug:"deadbug", crunch:"crunch",
  sideplank:"side", sidebend:"sidebend", twist:"twist"
};
/* 動きのまとまり: 種目を選ぶシートと履歴の種目選びの見出し（picker.js の PATTERN_HEAD）、提案タブの「動きごとの今の段階」の
   見出し（view-plan.js の PATTERN_NAME）、軽い週を勧める判定（progress.js の deloadAdvice）に使う。
   書いていない動きは、その動きだけのまとまり。メニュー作りには使わない */
const PATTERN_GROUP = {sumo:"squat", splitsq:"squat", deadlift:"hinge", floorpress:"hpush", row2:"pull", hammer:"curl", skull:"ext",
                       deadbug:"abs", crunch:"abs", sidebend:"side"};
function groupOf(pat){ return PATTERN_GROUP[pat] || pat; }
/* メニューに並べる順（大きい動きを先に、体幹は最後に）。同じまとまりの動きは続けて並べる */
const PATTERN_ORDER = ["squat","sumo","splitsq","lunge","kneeext","hinge","deadlift","legcurl","hpush","floorpress","fly","pull","row2","pullover",
                       "vpush","bridge","abduct","adduct","carry","shrug","raise","fraise","rear","curl","hammer","ext","skull",
                       "calf","backext","abs","deadbug","crunch","side","sidebend","twist"];
/* まとまりの並び（PATTERN_ORDER に出てくる順） */
function groupOrder(){ return Array.from(new Set(PATTERN_ORDER.map(groupOf))); }
/* 動きの中で、メニュー作りが選ぶ種目を決めてある動き。前回ほかの種目をやっていても、この種目（とその楽／大変のやり方）で続ける。
   ふくらはぎは立って段差で行う方を基本にする: 座って行う方は腓腹筋がほとんど太らず、ヒラメ筋の太り方も
   立って行う方と同じくらいだった（Kinoshita 2023 doi:10.3389/fphys.2023.1272106）。座って行う方は種目を選ぶシートからは選べる */
const PATTERN_MAIN = {calf:"calf"};
/* 記録の無い動きを、どの種目から始めるか */
const PATTERN_FIRST = {calf:"calf"};
/* 仕上げに足す動き: 書いてある動きを先に組んだ日だけ入れる。シシースクワット（膝を伸ばす）は大腿四頭筋だけを使うので、
   別の日に入れると大殿筋の回復の日とずれて、スクワット・ランジ（大腿四頭筋と大殿筋の両方を使う）が入る日がなくなる */
const PATTERN_AFTER = {kneeext:["squat", "sumo", "splitsq", "lunge"]};
/* メニューに入れない種目（2026-10-08 本人の要望: やりたくない種目は、メニューに入らないようにオンオフできるように）。
   state.exOff = {ids:[種目id], updatedAt}。ダンベルの登録と同じく端末をまたいで同期する（settings.json。時刻は gear と別に持つ）。
   効くのはメニュー作りが選ぶところだけ（planner.js の why の "off"・やさしく／難しくの持ち替え先）。
   「種目を選んで追加」からは、入れない種目も自分で入れられる。記録や推移には触れない。
   画面の印・ボタン・メニュー作りは、どれも exOn() で判定する */
const EX_OFF_HEAD = "メニューに入れない種目", EX_OFF_TAG = "メニューに入れない";
const EX_OFF_NOTE = "メニューには入りません。「種目を選んで追加」からは追加できます。";
function exOffIds(){ const o = state.exOff; return o && Array.isArray(o.ids) ? o.ids : []; }
function exOn(id){ return !exOffIds().includes(id); }
function setExOn(id, on){
  const ids = exOffIds().filter(x => x !== id);          /* この版に無い種目の id は、そのまま残す */
  if(!on) ids.push(id);
  state.exOff = {ids, updatedAt: typeof stampNow === "function" ? stampNow() : Date.now()};
  persistProgram();
  if(typeof syncSchedule === "function") syncSchedule();
}
/* 本人が変えられる決まり（2026-10-10 本人の要望: 提案を細かくカスタマイズできるようにしたい。選んだのは
   種目の出やすさ・反対の部位と回復の日数・回数や重量の増え方）。
   state.tune = {pref:{map:{動き:1|-1}, updatedAt}, pair:{off:true, updatedAt}, gap:{map:{部位:日数}, updatedAt},
                 prog:{step:2, first:"harder", updatedAt}}
   初めの設定と同じ値は持たない（map から消す・キーを書かない）ので、何も変えていなければ今までとまったく同じに動く。
   4つのまとまりは別々の時刻で持ち、端末をまたいで同期する（settings.json。2台で別のまとまりを変えても両方残る）。
   読むところは、どれも下の関数から（画面とメニュー作り・伸ばし方で食い違わない） */
const TUNE_KEYS = ["pref", "pair", "gap", "prog"];
function tunePart(k){ const t = state.tune; return (t && t[k] && typeof t[k] === "object") ? t[k] : null; }
function setTune(k, part){
  const t = Object.assign({}, state.tune || {});
  t[k] = Object.assign({}, part, {updatedAt: typeof stampNow === "function" ? stampNow() : Date.now()});
  state.tune = t;
  persistProgram();
  if(typeof syncSchedule === "function") syncSchedule();
}
/* そのまとまりが初めの設定のままか */
function tuneIsDefault(k){
  const p = tunePart(k);
  if(!p) return true;
  if(k === "pref" || k === "gap") return !p.map || !Object.keys(p.map).length;
  if(k === "pair") return p.off !== true;
  return p.step !== 2 && p.first !== "harder";
}
function tuneChanged(){ return TUNE_KEYS.some(k => !tuneIsDefault(k)); }
/* 種目の出やすさ（動きごと）: 1=よく出す / 0=ふつう / -1=あまり出さない。
   よく出す: 回復と上限の範囲で入れられる日は、ほかの種目より先に入れる（planner.js の compose の最初）。
   あまり出さない: メインで鍛える部位が週の目標から遠いとき（価値がしきい値 1 以上）と、7日使えていない部位を埋めるときだけ入れる */
const EX_PREF_LABEL = {"1": "よく出す", "0": "ふつう", "-1": "あまり出さない"};
const EX_PREF_FACTOR = {"1": 1.5, "0": 1, "-1": 0.6};
function patPref(pat){ const p = tunePart("pref"), v = p && p.map ? p.map[pat] : 0; return v === 1 || v === -1 ? v : 0; }
function exPref(id){ return patPref(patternOf(id)); }
function setPatPref(pat, v){
  const p = tunePart("pref"), map = Object.assign({}, p && p.map);
  if(v === 1 || v === -1) map[pat] = v; else delete map[pat];
  setTune("pref", {map});
}
/* 反対の部位を同じ日に鍛えるか（しないときは、相手を足さない・隣に並べない・今日タブの一行も出さない: 下の opposite） */
function pairOn(){ const p = tunePart("pair"); return !(p && p.off === true); }
/* 回数の増やし方: 全部のセットで目標に届いた次の回に増やす数（秒の種目は 5 倍）。入力欄の ± の刻み（progress.js の progStep）とは別 */
function progGain(kind){ const p = tunePart("prog"), n = p && p.step === 2 ? 2 : 1; return (kind === "t" ? 5 : 1) * n; }
/* 回数の範囲の上限に届いたとき、先にどちらへ進むか: "heavier"=ダンベルを重く（初めの設定）/ "harder"=一段難しいやり方 */
function progFirst(){ const p = tunePart("prog"); return p && p.first === "harder" ? "harder" : "heavier"; }
const RECOVER_GAP_MAX = 5;

/* 反対の部位（関節をはさんで逆の働きをする部位）。メニュー作りは、今日のメニューに入れた種目と反対の部位を
   メインで鍛える種目が入れられるとき、それを少し先に選び、隣に並べる（2026-10-08 本人の要望）。
   回復・1日と1週間の上限・外した動き・入れない種目の決まりはそのままで、入れられない種目を入れることはしない。
   2026-10-09 本人の指摘（上腕二頭筋と上腕三頭筋を同じ日に出せるのに出なかった。できる限り入れる）で、相手のいない種目には、
   入れられるかぎり反対の部位の種目を足すようにした（planner.js の pairFill）。組み直し・追加の後も隣に並べる（pairUp・addBeside）。
   文献: 反対の部位の種目を1セットずつ交互に行うと、ふつうの順でやるのと比べて、筋肉の付き方・筋力の伸びは同じくらいで
   時間は短く済む（Mang 2025 doi:10.1519/JSC.0000000000005246）。休憩を削らずに交互にやると、こなせる回数・量が増える
   （Chien 2026 doi:10.3390/jfmk11030370、Paz 2019 doi:10.1519/JSC.0000000000002353）。
   脚の大きい種目どうし（スクワットとルーマニアンデッドリフト）は、どちらも大殿筋をメインで使うので組にしない（下の opposite） */
const ANTAGONIST = {chest:"lats", lats:"chest", biceps:"triceps", triceps:"biceps", quads:"hams", hams:"quads",
                    frontdelt:"reardelt", reardelt:"frontdelt", abs:"erectors", erectors:"abs", adductors:"gmed", gmed:"adductors"};
/* 同じくらいの価値なら、今日のメニューの種目と反対の部位の種目を先にする係数 */
let PAIR_PREF = 1.1;
/* 2つの種目が反対の部位どうしか: メインで鍛える部位に反対の組があり、同じ部位をメインで使っていない */
function opposite(a, b){
  const A = EXMAP[a], B = EXMAP[b];
  if(!pairOn()) return false;
  if(!A || !B || a === b || A.p.some(m => B.p.includes(m))) return false;
  return A.p.some(m => B.p.includes(ANTAGONIST[m]));
}
/* 反対の部位どうしの組を、できるだけ多く作る（1つの種目は1つの組にだけ入る）。返すのは 相手の位置の表（組にならない種目は -1）。
   前から順に最初の相手を取るだけだと、相手の取り合いで組が減ることがある（サイドランジがスライディングレッグカールを取ると、
   ゴブレットスクワットの相手がいなくなる、など）ので、全部の組み合わせから組の数が一番多いものを選ぶ。
   同じ数なら、前の種目から先に組にする。外した種目は組にしない */
function pairMates(items){
  const n = items.length, ok = (i, j) => !items[i].skip && !items[j].skip && opposite(items[i].ex, items[j].ex);
  const memo = {};
  const best = used => {                               /* used: もう決まった種目の印。残りで作れる組 [数, [[i,j],…]] */
    let i = 0;
    while(i < n && used[i]) i++;
    if(i >= n) return [0, []];
    const key = used.join("");
    if(memo[key]) return memo[key];
    let top = null;
    used[i] = 1;
    for(let j = i + 1; j < n; j++){
      if(used[j] || !ok(i, j)) continue;
      used[j] = 1;
      const r = best(used);
      used[j] = 0;
      if(!top || r[0] + 1 > top[0]) top = [r[0] + 1, [[i, j]].concat(r[1])];
    }
    const alone = best(used);
    used[i] = 0;
    if(!top || alone[0] > top[0]) top = alone;
    return memo[key] = top;
  };
  const mate = items.map(() => -1);
  best(items.map(() => 0))[1].forEach(p => { mate[p[0]] = p[1]; mate[p[1]] = p[0]; });
  return mate;
}
/* メニューの並びを、反対の部位どうしが隣になるように直す（組の後ろの種目を、前の種目のすぐ後へ持ってくる） */
function pairUp(items){
  const mate = pairMates(items), out = [], done = items.map(() => false);
  items.forEach((a, i) => {
    if(done[i]) return;
    out.push(a); done[i] = true;
    if(mate[i] >= 0){ out.push(items[mate[i]]); done[mate[i]] = true; }
  });
  return out;
}
/* 反対の部位どうしで、組になっていない種目（外した種目は除く） */
function unpaired(items){
  const mate = pairMates(items);
  return items.filter((it, i) => mate[i] < 0 && !it.skip);
}
/* 保存してあるメニューに種目を1つ足す。反対の部位の種目がまだ組になっていなければ、そのすぐ後に入れる。無ければ最後 */
function addBeside(plan, row){
  const free = unpaired(plan), b = free.find(it => opposite(it.ex, row.ex));
  const out = plan.slice();
  out.splice(b ? plan.indexOf(b) + 1 : plan.length, 0, row);
  return out;
}
/* 今日のメニューで隣り合っている、反対の部位どうしの組 [[a, b], …]（1つの種目は1つの組にだけ入る）。
   組は保存しない。画面に出すところは、どこもここから作る */
function menuPairs(items){
  const out = [];
  for(let i = 0; i + 1 < items.length; i++){
    if(opposite(items[i].ex, items[i + 1].ex)){ out.push([items[i], items[i + 1]]); i++; }
  }
  return out;
}
const WEEK_TARGET = 10, WEEK_MAX = 16;
const BIG_MUSCLES = ["quads","glutes","hams","chest","lats"];
/* 1日にかける上限（有効セット）。大きい部位は3種目ぶん、ほかの部位は2種目ぶん。その種目がメインで鍛える部位について見る
   （2026-10-05: 大きい部位を8から9へ。8だと、スクワットとルーマニアンデッドリフトで大殿筋が6になった日は、当時は内転筋を
   メインで鍛えるただ1つの種目だったサイドランジが入らなかった） */
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
   いつも勝ってしまい、スクワットやロウが出なくなるため。書いていない動きは1。
   使う部位が同じ種目どうし（ワンハンドロウとベントオーバーロウなど）は、価値がまったく同じになるので、
   定番の方を少し先にしてある */
const PATTERN_PREF = {lunge:0.7, pullover:0.8, fly:0.9, carry:0.85, shrug:0.85, raise:0.9,
                      fraise:0.8, rear:0.9, kneeext:0.8, abduct:0.85, adduct:0.85, backext:0.85, hammer:0.8,
                      sumo:0.85, splitsq:0.95, row2:0.95, skull:0.95, crunch:0.95, deadbug:0.9, sidebend:0.95,
                      /* デッドリフトは大殿筋と大腿四頭筋の1日の上限をスクワットと分け合うので、サイドランジと同じ順にする。
                         1 のままだとサイドランジが入らない日が増えて、毎日やる場合の内転筋が週 9.4 → 8.3 に減った（2026-10-09 の試算） */
                      deadlift:0.7};
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
/* 初めの設定の日数と、今の日数（本人が設定で変えた部位はその日数: 上の state.tune.gap） */
function recoverGapDefault(m){ return RECOVER_GAP[m] === undefined ? 2 : RECOVER_GAP[m]; }
function recoverGap(m){
  const p = tunePart("gap"), v = p && p.map ? p.map[m] : undefined;
  return (typeof v === "number" && v >= 0 && v <= RECOVER_GAP_MAX && v === Math.floor(v)) ? v : recoverGapDefault(m);
}
function setRecoverGap(m, v){
  const p = tunePart("gap"), map = Object.assign({}, p && p.map);
  if(v === recoverGapDefault(m)) delete map[m]; else map[m] = v;
  setTune("gap", {map});
}
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
    if(c.ex !== item.ex && !exOn(c.ex)) return false;   /* メニューに入れない種目へは持ち替えない */
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
/* 昨日までの UNUSED_DAYS-1 日に、その部位を1セットも使えていないか（補助で使った分も数える）。
   exRest の unused と、メニュー作りが先に種目を入れる部位（planner.js の buildPlan）が、どちらもこれで決める */
function unusedSoFar(m){ return muscleLoadBetween(m, 1, UNUSED_DAYS - 1) <= 0; }
function exRest(exId){
  const ex = EXMAP[exId], picked = soreToday();
  const sore = ex.p.filter(m => picked.includes(m));
  let muscle = null, left = 0;
  const resting = [];
  ex.p.forEach(m => { const d = recoverDaysLeft(m); if(d > 0) resting.push({m, left: d}); if(d > left){ left = d; muscle = m; } });
  if(!sore.length && !left) return null;
  const unused = sore.length ? [] : ex.p.filter(unusedSoFar);
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
