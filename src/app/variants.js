/* 楽にする／大変にするやり方。同じ種目の別の組み方として候補に入れる。
   [（　）に出す短い言い方, カードに出す説明] の順。
   ほかの種目に移るだけの案（「後ろ足を台に乗せる」など）は、その種目自体があるので入れていない */
const VARIANT_TEXT = {
  goblet:     {hard: ["一番下で3秒止める", "一番下で3秒止め、反動を使わずに立ち上がる。"],
               easy: ["椅子に触れて止める", "椅子の座面に軽く触れるところまでで止める（ボックススクワット）。"]},
  rdl:        {hard: ["一番下で2秒止める", "もも裏が突っ張った位置で2秒止めてから起き上がる。"],
               easy: ["壁で折り方を覚える", "壁に尻を向けて立ち、尻で壁を触りにいく。股関節の折り方だけ練習する。"]},
  rdl1:       {hard: ["一番下で2秒止める", "片脚のまま、もも裏が突っ張った位置で2秒止めてから起き上がる。"],
               easy: ["壁に指先を添える",  "壁や椅子に指先を添えて、バランスを取りながら行う。"]},
  split:      {hard: ["一番下で2秒止める", "後ろの膝が床に近づいた位置で2秒止めてから立ち上がる。"]},
  bridge:     {hard: ["片脚で行う",       "片脚を浮かせ、床についた脚だけで持ち上げる。"],
               easy: ["高さを下げる",      "持ち上げる高さを下げ、腰が反らない範囲で止める。"]},
  row:        {hard: ["下で2秒止める",    "下ろしきった位置で2秒止め、反動を使わずに引く。"],
               easy: ["台に手をついて支える", "反対の手を台につき、体を安定させて引く。"]},
  row2:       {hard: ["上で3秒止める",    "引いた位置で3秒止めてから下ろす。"]},
  ohp:        {hard: ["片手ずつ押す",      "片手ずつ押し上げる。体幹の負荷も上がる。"],
               easy: ["背もたれに寄りかかる", "椅子の背もたれに寄りかかって座って行う。"]},
  lateral:    {hard: ["上で2秒止める",    "肩の高さで2秒止めてから下ろす。"],
               easy: ["肘を深く曲げる",    "肘をもっと深く曲げ、腕を短くして上げる。"]},
  front:      {hard: ["上で2秒止める",    "肩の高さで2秒止めてから下ろす。"],
               easy: ["片手ずつ上げる",    "片手ずつ上げ、左右を入れ替える。"]},
  shrug:      {hard: ["上で3秒止める",    "肩をすくめきった位置で3秒止める。"],
               easy: ["軽くして回数を増やす", "一段軽い持ち方にして、回数を増やす。"]},
  floorpress: {hard: ["一番下で2秒止める", "肘を床につけたまま2秒止め、力を抜かずに押し上げる。"],
               easy: ["片手ずつ押す",      "片手ずつ行い、反対の手は床について体を安定させる。"]},
  fly:        {hard: ["床の手前で2秒止める", "上腕が床につく手前で2秒止めてから閉じる。"],
               easy: ["浅めに開く",        "上腕が床につく手前までにして、開く角度を狭くする。"]},
  pushup:     {hard: ["足を台に乗せる",    "足を台に乗せて角度をきつくする。"],
               easy: ["机に手をつく",      "机や壁に手をついて角度を緩める。"]},
  pushupknee: {hard: ["一番下で2秒止める", "胸が床から拳一つ分の位置で2秒止めてから押す。"],
               easy: ["机に手をつく",      "手を机や椅子に乗せて角度を緩める。"]},
  curl:       {hard: ["途中で2秒止める",   "前腕が床と平行になったところで2秒止め、上まで巻き上げてから下ろす。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  triext:     {hard: ["下ろしたところで2秒止める", "頭の後ろまで下ろした位置で2秒止めてから伸ばす。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  skull:      {hard: ["下ろしたところで2秒止める", "耳の横まで下ろした位置で2秒止めてから伸ばす。"],
               easy: ["肘を手で支える",    "片手ずつ行い、反対の手で肘を支える。"]},
  sumo:       {hard: ["一番下で2秒止める", "一番下で2秒止め、反動を使わずに立ち上がる。"],
               easy: ["浅めに止める",      "太ももが床と平行になる手前で止める。"]},
  splitfloor: {hard: ["一番下で2秒止める", "後ろの膝が床に近づいた位置で2秒止めてから戻る。"],
               easy: ["壁に指先を添える",  "壁に指先を添えて、バランスを取りながら行う。"]},
  sidelunge:  {hard: ["一番下で2秒止める", "沈みきった位置で2秒止めてから戻る。"],
               easy: ["浅めに沈む",        "沈む深さを浅くし、内ももが伸びる手前で止める。"]},
  sidebend:   {hard: ["一番下で3秒止める", "倒しきった位置で3秒止め、反対のわき腹で起こす。"]},
  calf:       {easy: ["床の上で行う",      "段差を使わず床の上で行う。可動域は狭くなる。"]},
  calfseat:   {hard: ["片脚ずつ行う",      "ダンベルを片方の膝にまとめて置き、片脚ずつ上げる。左右を入れ替える。", {side:true}]},
  farmer:     {hard: ["片手だけで持つ",    "片手だけで持って歩く。体幹への負荷が大きく上がる。"],
               easy: ["時間を短くする",    "保持する時間を短くする。"]},
  plank:      {hard: ["片脚を上げる",      "片脚を床から浮かせ、腰が傾かないように保つ。"],
               easy: ["膝をつく",          "膝をついて行い、頭から膝までを一直線に保つ。"]},
  sideplank:  {hard: ["上の脚を上げる",    "上側の脚を床から浮かせて保つ。"],
               easy: ["膝をつく",          "下側の膝をついて行う。"]},
  crunch:     {hard: ["胸に重りを抱える",  "ダンベルを胸に抱えて行う。"],
               easy: ["腕を体の横に置く",  "手を体の横に置き、首を引っ張らないようにして行う。"]},
  deadbug:    {hard: ["ダンベルを持って行う", "両手に1つずつダンベルを持ち、いつもどおり対角の腕と脚を伸ばす。腰が浮くなら片手だけで持つ。"],
               easy: ["腕か脚だけ動かす",  "腕だけ、または脚だけを動かす。"]}
};

/* 組み方ごとの動き（src/motions_f.js）。無いものは基本のやり方の図を出し、
   「図は基本のやり方です」と添える */
const VARIANT_MOTION = {
  "goblet|一番下で3秒止める":"goblet_hold", "goblet|椅子に触れて止める":"goblet_box",
  "rdl|一番下で2秒止める":"rdl_hold", "rdl1|一番下で2秒止める":"rdl1_hold",
  "split|一番下で2秒止める":"split_hold",
  "bridge|片脚で行う":"bridge_one", "bridge|高さを下げる":"bridge_low",
  "row|下で2秒止める":"row_hold", "row2|上で3秒止める":"row2_hold",
  "ohp|片手ずつ押す":"ohp_one",
  "lateral|上で2秒止める":"lateral_hold", "lateral|肘を深く曲げる":"lateral_short",
  "front|上で2秒止める":"front_hold", "front|片手ずつ上げる":"front_one",
  "shrug|上で3秒止める":"shrug_hold",
  "floorpress|一番下で2秒止める":"floorpress_hold", "floorpress|片手ずつ押す":"floorpress_one",
  "fly|床の手前で2秒止める":"fly_hold", "fly|浅めに開く":"fly_shallow",
  "pushupknee|一番下で2秒止める":"pushupknee_hold",
  "curl|途中で2秒止める":"curl_hold", "curl|肘を手で支える":"curl_one",
  "triext|下ろしたところで2秒止める":"triext_hold", "triext|肘を手で支える":"triext_one",
  "skull|下ろしたところで2秒止める":"skull_hold", "skull|肘を手で支える":"skull_one",
  "sumo|一番下で2秒止める":"sumo_hold", "sumo|浅めに止める":"sumo_shallow",
  "splitfloor|一番下で2秒止める":"splitfloor_hold",
  "sidelunge|一番下で2秒止める":"sidelunge_hold", "sidelunge|浅めに沈む":"sidelunge_shallow",
  "sidebend|一番下で3秒止める":"sidebend_hold",
  "calf|床の上で行う":"calf_floor", "calfseat|片脚ずつ行う":"calfseat_single",
  "farmer|片手だけで持つ":"farmer_one",
  "plank|片脚を上げる":"plank_leg", "sideplank|上の脚を上げる":"sideplank_leg",
  "crunch|胸に重りを抱える":"crunch_db", "crunch|腕を体の横に置く":"crunch_arms",
  "deadbug|ダンベルを持って行う":"deadbug_db", "deadbug|腕か脚だけ動かす":"deadbug_half"
};
/* 動きの見た目が基本と変わらない組み方（重さや時間だけ変えるもの）。図の断り書きを出さない */
const VARIANT_SAME_LOOK = {
  "shrug|軽くして回数を増やす":1, "farmer|時間を短くする":1, "row|台に手をついて支える":1
};

/* DETAIL[id または base].reps の「A〜B回」「A〜B秒」を読み、その幅に r を収める（外れたら近い端へ） */
function detailRepsRange(id){
  const det = DETAIL[id] || DETAIL[baseOf(id)];
  const m = det && /(\d+)\s*〜\s*(\d+)\s*(?:回|秒)/.exec(det.reps);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}
function clampToDetailReps(id, r){
  const rng = detailRepsRange(id);
  if(!rng) return r;
  return r < rng[0] ? rng[0] : (r > rng[1] ? rng[1] : r);
}
/* B19: EX に side が無くても、ROUTINES にラベル無し・side:true で載っている種目は
   左右それぞれ行う種目として扱う（片側の段 +1 を、組み方の行にも伝える） */
function routineWantsSide(id){
  for(const r of ROUTINES){
    for(const it of r.items){
      if(it.ex === id && it.side && !it.label) return true;
    }
  }
  return false;
}

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
      const cfg = t[2] || {};
      const key = e.id + "|" + t[0];
      const row = {ex: e.id, label: compose(e.name, t[0]), lv: spec[1], sets: e.sets || 3,
                   r: clampToDetailReps(e.id, Math.max(4, Math.round((e.r || 10) * spec[2]))), note: t[1], tag: t[0]};
      if(VARIANT_MOTION[key]) row.mo = VARIANT_MOTION[key];
      else if(!VARIANT_SAME_LOOK[key]) row.baseFig = true;
      if(e.side || cfg.side || routineWantsSide(e.id)) row.side = true;
      rows.push(row);
    });
  });
  return rows;
})();
