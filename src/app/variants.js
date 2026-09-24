/* 楽にする／大変にするやり方。同じ種目の別の組み方として候補に入れる。
   [（　）に出す短い言い方, カードに出す説明] の順。
   ほかの種目に移るだけの案（「後ろ足を台に乗せる」など）は、その種目自体があるので入れていない */
const VARIANT_TEXT = {
  goblet:     {hard: ["深くしゃがむ",     "太ももが床と平行になるより下まで沈む。腰が丸まる手前で止める。"],
               easy: ["椅子に触れて止める", "椅子の座面に軽く触れるところまでで止める（ボックススクワット）。"]},
  rdl:        {hard: ["深く下ろす",       "もも裏の伸びを感じる位置まで下ろす。腰が丸まる手前で止める。"],
               easy: ["壁で折り方を覚える", "壁に尻を向けて立ち、尻で壁を触りにいく。股関節の折り方だけ練習する。"]},
  rdl1:       {hard: ["深く下ろす",       "もも裏の伸びを感じる位置まで下ろす。腰が丸まる手前で止める。"],
               easy: ["壁に指先を添える",  "壁や椅子に指先を添えて、バランスを取りながら行う。"]},
  split:      {hard: ["深く沈む",         "後ろの膝が床に近づくまで沈む。"]},
  hipthrust:  {hard: ["上で3秒止める",    "一番上で3秒止めてから下ろす。"]},
  bridge:     {hard: ["片脚で行う",       "片脚を浮かせ、床についた脚だけで持ち上げる。"],
               easy: ["高さを下げる",      "持ち上げる高さを下げ、腰が反らない範囲で止める。"]},
  row:        {hard: ["下で一度止める",    "下ろしきって一瞬止めてから引く。"],
               easy: ["台に手をついて支える", "反対の手を台につき、体を安定させて引く。"]},
  row2:       {hard: ["上で2秒止める",    "引いた位置で2秒止めてから下ろす。"]},
  ohp:        {hard: ["片手ずつ押す",      "片手ずつ押し上げる。体幹の負荷も上がる。"],
               easy: ["背もたれに寄りかかる", "椅子の背もたれに寄りかかって座って行う。"]},
  lateral:    {hard: ["5秒かけて下ろす",   "上げるのは1〜2秒、下ろすのに5秒かける。"],
               easy: ["肘を深く曲げる",    "肘をもっと深く曲げ、腕を短くして上げる。"]},
  front:      {hard: ["5秒かけて下ろす",   "上げるのは1〜2秒、下ろすのに5秒かける。"],
               easy: ["片手ずつ上げる",    "片手ずつ上げ、左右を入れ替える。"]},
  shrug:      {hard: ["上で2秒止める",    "肩をすくめきった位置で2秒止める。"],
               easy: ["軽くして回数を増やす", "一段軽い持ち方にして、回数を増やす。"]},
  floorpress: {hard: ["3秒かけて下ろす",   "押すのは1秒、下ろすのに3秒かける。"],
               easy: ["片手ずつ押す",      "片手ずつ行い、反対の手は床について体を安定させる。"]},
  fly:        {hard: ["4秒かけて開く",     "閉じるのは1〜2秒、開くのに4秒かける。"],
               easy: ["浅めに開く",        "上腕が床につく手前までにして、開く角度を狭くする。"]},
  pushup:     {hard: ["足を台に乗せる",    "足を台に乗せて角度をきつくする。"],
               easy: ["机に手をつく",      "机や壁に手をついて角度を緩める。"]},
  pushupknee: {hard: ["3秒かけて下ろす",   "押すのは1秒、下ろすのに3秒かける。"],
               easy: ["机に手をつく",      "手を机や椅子に乗せて角度を緩める。"]},
  curl:       {hard: ["4秒かけて下ろす",   "巻き上げるのは1〜2秒、下ろすのに4秒かける。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  triext:     {hard: ["4秒かけて下ろす",   "伸ばすのは1秒、下ろすのに4秒かける。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  skull:      {hard: ["4秒かけて下ろす",   "伸ばすのは1秒、下ろすのに4秒かける。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  sumo:       {hard: ["3秒かけて下ろす",   "立ち上がるのは1秒、沈むのに3秒かける。"],
               easy: ["浅めに止める",      "太ももが床と平行になる手前で止める。"]},
  splitfloor: {hard: ["3秒かけて下ろす",   "戻すのは1秒、沈むのに3秒かける。"],
               easy: ["壁に指先を添える",  "壁に指先を添えて、バランスを取りながら行う。"]},
  sidelunge:  {hard: ["3秒かけて下ろす",   "戻すのは1秒、沈むのに3秒かける。"],
               easy: ["浅めに沈む",        "沈む深さを浅くし、内ももが伸びる手前で止める。"]},
  sidebend:   {hard: ["3秒かけて下ろす",   "起こすのは1〜2秒、倒すのに3秒かける。"]},
  calf:       {easy: ["床の上で行う",      "段差を使わず床の上で行う。可動域は狭くなる。"]},
  calfseat:   {hard: ["上で2秒止める",    "かかとを上げきった位置で2秒止める。"]},
  farmer:     {hard: ["片手だけで持つ",    "片手だけで持って歩く。体幹への負荷が大きく上がる。"],
               easy: ["時間を短くする",    "保持する時間を短くする。"]},
  plank:      {hard: ["片脚を上げる",      "片脚を床から浮かせ、腰が傾かないように保つ。"],
               easy: ["膝をつく",          "膝をついて行い、頭から膝までを一直線に保つ。"]},
  sideplank:  {hard: ["上の脚を上げる",    "上側の脚を床から浮かせて保つ。"],
               easy: ["膝をつく",          "下側の膝をついて行う。"]},
  crunch:     {hard: ["胸に重りを抱える",  "ダンベルを胸に抱えて行う。"],
               easy: ["腕を体の横に置く",  "手を体の横に置き、首を引っ張らないようにして行う。"]},
  deadbug:    {hard: ["ゆっくり動かす",    "伸ばすのに4秒、戻すのに4秒かける。"],
               easy: ["腕か脚だけ動かす",  "腕だけ、または脚だけを動かす。"]}
};

/* 組み方ごとの動き（src/motions_f.js）。無いものは基本のやり方の図を出し、
   「図は基本のやり方です」と添える */
const VARIANT_MOTION = {
  "goblet|深くしゃがむ":"goblet_deep", "goblet|椅子に触れて止める":"goblet_box",
  "rdl|深く下ろす":"rdl_deep", "rdl1|深く下ろす":"rdl1_deep",
  "split|深く沈む":"split_deep", "hipthrust|上で3秒止める":"hipthrust_hold",
  "bridge|片脚で行う":"bridge_one", "bridge|高さを下げる":"bridge_low",
  "row|下で一度止める":"row_pause", "row2|上で2秒止める":"row2_hold",
  "ohp|片手ずつ押す":"ohp_one",
  "lateral|5秒かけて下ろす":"lateral_slow", "lateral|肘を深く曲げる":"lateral_short",
  "front|5秒かけて下ろす":"front_slow", "front|片手ずつ上げる":"front_one",
  "shrug|上で2秒止める":"shrug_hold",
  "floorpress|3秒かけて下ろす":"floorpress_slow", "floorpress|片手ずつ押す":"floorpress_one",
  "fly|4秒かけて開く":"fly_slow", "fly|浅めに開く":"fly_shallow",
  "pushupknee|3秒かけて下ろす":"pushupknee_slow",
  "curl|4秒かけて下ろす":"curl_slow", "curl|肘を手で支える":"curl_one",
  "triext|4秒かけて下ろす":"triext_slow", "triext|肘を手で支える":"triext_one",
  "skull|4秒かけて下ろす":"skull_slow", "skull|肘を手で支える":"skull_one",
  "sumo|3秒かけて下ろす":"sumo_slow", "sumo|浅めに止める":"sumo_shallow",
  "splitfloor|3秒かけて下ろす":"splitfloor_slow",
  "sidelunge|3秒かけて下ろす":"sidelunge_slow", "sidelunge|浅めに沈む":"sidelunge_shallow",
  "sidebend|3秒かけて下ろす":"sidebend_slow",
  "calf|床の上で行う":"calf_floor", "calfseat|上で2秒止める":"calfseat_hold",
  "farmer|片手だけで持つ":"farmer_one",
  "plank|片脚を上げる":"plank_leg", "sideplank|上の脚を上げる":"sideplank_leg",
  "crunch|胸に重りを抱える":"crunch_db", "crunch|腕を体の横に置く":"crunch_arms",
  "deadbug|ゆっくり動かす":"deadbug_slow", "deadbug|腕か脚だけ動かす":"deadbug_half"
};
/* 動きの見た目が基本と変わらない組み方（重さや時間だけ変えるもの）。図の断り書きを出さない */
const VARIANT_SAME_LOOK = {
  "shrug|軽くして回数を増やす":1, "farmer|時間を短くする":1, "row|台に手をついて支える":1
};

const VARIANT_ROWS = (function(){
  const rows = [];
  /* 「腹筋（クランチ）」のように名前がもう（　）で終わるときは、中に足す */
  const compose = (name, label) => /）$/.test(name) ? name.slice(0, -1) + "・" + label + "）" : name + "（" + label + "）";
  EX.forEach(e => {
    const v = VARIANT_TEXT[e.id];
    if(!v) return;
    [["hard", 1, 0.8], ["easy", -1, 1.15]].forEach(function(spec){
      const t = v[spec[0]];
      if(!t) return;
      const key = e.id + "|" + t[0];
      const row = {ex: e.id, label: compose(e.name, t[0]), lv: spec[1], sets: e.sets || 3,
                   r: Math.max(4, Math.round((e.r || 10) * spec[2])), note: t[1], tag: t[0]};
      if(VARIANT_MOTION[key]) row.mo = VARIANT_MOTION[key];
      else if(!VARIANT_SAME_LOOK[key]) row.baseFig = true;
      if(e.side) row.side = true;
      rows.push(row);
    });
  });
  return rows;
})();
