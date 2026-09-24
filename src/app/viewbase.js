/* ============================================================
   画面
   ============================================================ */
let tab = "today";
let openEx = null;
let refEx = EX[0].id;
let bodyDays = 7;
let selMuscle = null;

document.querySelectorAll("nav.tabs button").forEach(b=>{
  b.onclick = ()=>{
    tab = b.dataset.tab;
    document.querySelectorAll("nav.tabs button").forEach(x=>x.setAttribute("aria-selected", String(x===b)));
    render();
    window.scrollTo(0,0);
  };
});

/* ============================================================
   物理的な拘束
   pins  : 床や台に接していて動かない関節（位置は開始姿勢のものを使う）
   floor : これより下に体の点は行けない
   hold  : 何がどこに接しているかの説明
   ============================================================ */
/* 接地の説明（新しい図解でもそのまま使う） */
const PHYS = {
  goblet:{hold:"両足は床につけたまま。ダンベルは胸の前で両手で支える"},
  rdl:{hold:"両足は床につけたまま。ダンベルは両手で体の前に持つ"},
  rdl1:{hold:"片足だけが床。ダンベルは体の前に持つ"},
  split:{hold:"前足は床、後ろ足の甲をベッドに乗せる。ダンベルは両手に1つずつ"},
  hipthrust:{hold:"肩甲骨をベッドの縁に当て、足裏は床。ダンベルは骨盤の上に置いて手で支える"},
  row:{hold:"片手と片膝を椅子に乗せ、反対の足は床。ダンベルは垂らした手に1つ"},
  ohp:{hold:"両足は床。ダンベルは両手に1つずつ"},
  lateral:{hold:"両足は床。ダンベルは両手に1つずつ"},
  curl:{hold:"両足は床。肘は体側に固定。ダンベルは両手に1つずつ"},
  farmer:{hold:"両足は床。ダンベルは両手に1つずつ、体の横で保持"},
  triext:{hold:"両足は床。ダンベル1つを両手で持ち、頭の後ろへ"},
  floorpress:{hold:"背中と足裏は床。ダンベルは胸の横から真上へ"},
  pushup:{hold:"手のひらとつま先だけが床に接する"},
  plank:{hold:"前腕とつま先だけが床に接する"},
  sideplank:{hold:"下側の前腕と足の外側だけが床に接する"},
  deadbug:{hold:"背中と腰は床につけたまま。手足だけを動かす"},
  crunch:{hold:"腰と足裏は床につけたまま。肩甲骨だけを浮かせる"},
  calf:{hold:"母趾球だけが段差に乗り、かかとは空中。手すりや壁に軽く触れてよい"},
  sumo:{hold:"両足は床につけたまま。ダンベルは胸の前で両手で支える"},
  splitfloor:{hold:"前足は床、後ろ足はつま先立ち。ダンベルは両手に1つずつ"},
  bridge:{hold:"肩と足裏は床。腰だけを持ち上げる"},
  pushupknee:{hold:"手のひらと膝が床に接する"},
  fly:{hold:"背中と足裏は床。ダンベルは胸の上で開閉する"},
  skull:{hold:"背中と足裏は床。上腕は床に垂直のまま"},
  front:{hold:"両足は床。ダンベルは両手に1つずつ"},
  shrug:{hold:"両足は床。腕は伸ばしたまま、ダンベルは両手に1つずつ"},
  row2:{hold:"両足は床。上体を倒したまま、ダンベルは両手に1つずつ"},
  calfseat:{hold:"椅子に座り、母趾球だけを床につける。ダンベルは膝の上に置く"},
  sidebend:{hold:"両足は床。ダンベルは片手に1つ、体の横に垂らす"},
  sidelunge:{hold:"両足は床につけたまま。ダンベルは胸の前で両手で支える"}
};

/* ---------- 図解（3Dマネキン） ---------- */
const DIANOTE = {
  goblet: "ダンベルは胸の前で固定したまま、股関節から後ろに座る。膝だけを前に出さない。",
  rdl: "膝の角度は最初に決めたまま動かさない。曲げるのは股関節だけ。ダンベルは脚をこすりながら下ろす。",
  split: "後ろ脚は支えるだけ。前脚のかかとで床を押して戻る。",
  hipthrust: "上げるのは股関節。腰を反って上げていたら、それは別の動きになっている。",
  row: "起点は肩甲骨。腕で引くと背中に入らない。上体はひねらず固定する。",
  ohp: "肋骨を締めて腰が反らないようにする。下ろす位置は耳の高さまで。",
  lateral: "肘の角度は固定したまま真横へ。上げるより、3秒かけて下ろすほうが効く。",
  floorpress: "上腕は体幹から45度くらい。真横に開くと肩を痛めやすい。",
  pushup: "頭からかかとまで一直線。腰が落ちたらそこが限界なので、膝つきか台に手を乗せて角度を緩める。",
  curl: "肘の位置を動かさない。肘が前に出たらそれは肩の動き。",
  triext: "肘の位置は固定。開かないように前へ向けたまま保つ。",
  plank: "腰が落ちた時点でフォームは終わっている。時間を延ばすより、まっすぐな姿勢で終えるほうが意味がある。",
  deadbug: "腰を床に押し付けたまま。腰が浮かない範囲までしか伸ばさない。1回に4秒かける。",
  crunch: "起き上がるのではなく背中を丸める。首を手で引っ張らない。",
  sideplank: "肘は肩の真下。腰が落ちるか、体が前後に傾いたら終了の合図。",
  calf: "段差のふちにつま先を乗せる。下も上も可動域いっぱいまで使う。",
  farmer: "肩は下げて後ろに引いたまま。すくんで前に丸まり、肩幅が狭くなってきたらそこが限界。",
  sumo: "つま先と膝を同じ方向に開いたまま、まっすぐ下に沈む。",
  splitfloor: "上体を立てたまま真下に沈む。前の膝はつま先より前に出しすぎない。",
  bridge: "上げるのは股関節。腰を反らせて高さを稼がない。",
  pushupknee: "頭から膝までを一直線に保つ。腰が反らないよう腹を締める。",
  fly: "肘の角度は固定したまま。肩の前が突っ張る手前で止める。",
  skull: "上腕は床に垂直のまま。動かすのは肘から先だけ。",
  front: "肩の高さまで。反動を使わず、下ろす動作をゆっくり。",
  shrug: "肩をまっすぐ上下させる。回さない。",
  row2: "上体の角度を保ったまま、肘を腰へ引く。起点は肩甲骨。",
  calfseat: "膝は動かさず、かかとだけを上下させる。上げきったところで止めると効く。",
  sidebend: "倒すのは真横だけ。前後に傾くと腹斜筋から外れる。",
  sidelunge: "膝とつま先の向きを合わせたまま、股関節から横へ座る。反対の脚は伸ばしたまま。",
};

let FIG = null, animRAF = null, playingId = null, playSlot = null, playBtn = null;
const figAz = {};                 /* 種目ごとの視点。指で左右にドラッグすると回る */
const figShots = {};              /* 静止画のキャッシュ */

function figDark(){
  const t = document.documentElement.getAttribute("data-theme");
  if(t) return t === "dark";
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function figInit(){
  if(FIG !== null) return FIG;
  try{
    if(typeof THREE === "undefined" || typeof MOTION === "undefined" || typeof FIGURE3D === "undefined") return (FIG = false);
    const c = document.createElement("canvas");
    c.className = "figcanvas";
    const f = FIGURE3D.create(THREE, c, {theme: figDark() ? "dark" : "light", dpr: window.devicePixelRatio || 1});
    f.setSize(480, 560);
    f.canvas = c;
    bindFigDrag(c);
    FIG = f;
  }catch(e){ FIG = false; }
  return FIG;
}
function bindFigDrag(c){
  let down = false, x0 = 0, a0 = 0;
  const start = (e)=>{ if(!playingId) return; down = true; x0 = e.clientX; a0 = figAz[playingId] || 0;
    try{ c.setPointerCapture(e.pointerId); }catch(err){} };
  const move = (e)=>{ if(!down || !playingId) return; figAz[playingId] = a0 + (e.clientX - x0) * 0.5; };
  const end = ()=>{ down = false; };
  c.addEventListener("pointerdown", start);
  c.addEventListener("pointermove", move);
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
}
function motionOf(id){
  if(typeof MOTION === "undefined") return null;
  return MOTION.motions[id] || MOTION.motions[baseOf(id)] || null;
}
function figView(m, id){
  const v = Object.assign({}, m.view || {});
  v.az = (v.az === undefined ? 40 : v.az) + (figAz[id] || 0);
  return v;
}
function stillTime(m){
  if(m.still !== undefined) return m.still;
  const T = MOTION.cycleTime(m);
  const ps = m.phases || [];
  /* 「よくある崩れ」の場面は静止画に使わない */
  if(ps.some(p => p.wrong)){
    for(let i = 0; i < ps.length; i++){
      if(!ps[i].wrong){
        const end = (i + 1 < ps.length) ? ps[i+1].t : T;
        return (ps[i].t + end) / 2;
      }
    }
  }
  return T * 0.35;
}
function figSize(f, m){
  let w = 480, h = 560;
  try{
    const r = f.frameShape ? f.frameShape(m).ratio : 1;
    if(r > 1.15){ h = Math.round(Math.max(300, 560 / Math.min(2.0, r / 0.85))); w = 560; }
  }catch(e){}
  f.setSize(w, h);
}
function figShot(id, dbn){
  const f = figInit(), m = motionOf(id);
  if(!f || !m) return "";
  figSize(f, m);
  const key = id + "|" + (figDark() ? "d" : "l") + "|" + Math.round(figAz[id] || 0) + "|" + (dbn || "");
  if(figShots[key]) return figShots[key];
  try{
    f.render(m, stillTime(m), Object.assign(figView(m, id), {dbCount: dbn || null}));
    const keys = Object.keys(figShots);
    if(keys.length > 10) delete figShots[keys[0]];     /* 画像を抱え込みすぎない */
    return (figShots[key] = f.canvas.toDataURL("image/png"));
  }catch(e){ return ""; }
}
function phaseLabel(m, t){
  let lb = "";
  (m.phases || []).forEach(p => { if(t >= p.t) lb = p.label; });
  return lb;
}
function diaHTML(id, compact, item, opt){
  const mo = (item && item.mo) || id;
  const m = motionOf(mo);
  /* 図に描くダンベルの本数。使う本数のほうが少なければ、その分だけ描く */
  const figDb = m && (m.dumbbells || []).length;
  const useDb = opt ? opt.n : null;
  const dbn = (useDb && figDb && useDb < figDb) ? useDb : null;
  const dbNote = (useDb && figDb && useDb > figDb)
    ? `<p class="dianote">図は1つで持つ形です。今日は「${opt.how}」で行ってください。</p>` : "";
  const hold = ((PHYS[id] || PHYS[baseOf(id)] || {}).hold) || "";
  const note = DIANOTE[id] || DIANOTE[baseOf(id)] || "";
  const tail = (hold ? `<p class="diahold"><b>接地</b>　${hold}</p>` : "")
             + (compact || !note ? "" : `<p class="dianote">${note}</p>`);
  if(!m) return `<div class="dia">${tail}</div>`;
  const shot = figShot(mo, dbn);
  const fignote = item && item.baseFig
    ? `<p class="dianote">図は基本のやり方です。この組み方では${item.note || ""}</p>` : "";
  return `<div class="dia" data-dia="${mo}" data-db="${dbn || ""}">
    <div class="figslot">
      ${shot ? `<img class="figstill" src="${shot}" alt="${itemNameOf(id)}の姿勢">`
             : `<p class="diahint">この端末では動きの図を表示できません</p>`}
      <div class="figphase"></div>
      <div class="figbar"><span></span></div>
    </div>
    ${shot ? `<div class="rowbtns"><button data-act="play" data-ex="${mo}">動きを再生</button></div>` : ""}
    ${fignote}${dbNote}${tail}
  </div>`;
}
function itemNameOf(id){ return EXMAP[id] ? EXMAP[id].name : ""; }
function stopAnim(){
  if(animRAF) cancelAnimationFrame(animRAF);
  animRAF = null;
  if(playSlot){
    if(FIG && FIG.canvas && FIG.canvas.parentNode === playSlot) playSlot.removeChild(FIG.canvas);
    const img = playSlot.querySelector(".figstill");
    if(img) img.style.display = "";
    const ph = playSlot.querySelector(".figphase");
    if(ph) ph.textContent = "";
    const bb = playSlot.querySelector(".figbar");
    if(bb){ bb.style.display = "none"; bb.firstChild.style.width = "0%"; }
  }
  if(playBtn) playBtn.textContent = "動きを再生";
  playSlot = null; playBtn = null; playingId = null;
}
function togglePlay(id){
  const wrap = document.querySelector('[data-dia="' + id + '"]');
  const f = figInit(), m = motionOf(id);
  if(!wrap || !f || !m) return;
  if(playingId === id){ stopAnim(); return; }
  stopAnim();
  figSize(f, m);
  const slot = wrap.querySelector(".figslot");
  const img = slot.querySelector(".figstill");
  if(img) img.style.display = "none";
  slot.insertBefore(f.canvas, slot.firstChild);
  playSlot = slot;
  playBtn = wrap.querySelector('[data-act="play"]');
  if(playBtn) playBtn.textContent = "停止";
  playingId = id;
  const phase = slot.querySelector(".figphase");
  const bar = slot.querySelector(".figbar span");
  if(bar) bar.parentNode.style.display = "block";
  const T = MOTION.cycleTime(m);
  const dbn = +(wrap.dataset.db || 0) || null;
  const t0 = performance.now();
  let last = 0;
  const tick = (now)=>{
    animRAF = requestAnimationFrame(tick);
    if(now - last < 33) return;
    last = now;
    const t = ((now - t0) / 1000) % T;
    f.render(m, t, Object.assign(figView(m, id), {dbCount: dbn}));
    if(phase) phase.textContent = phaseLabel(m, t);
    if(bar) bar.style.width = (t / T * 100).toFixed(1) + "%";
  };
  animRAF = requestAnimationFrame(tick);
}
function figThemeChanged(){
  Object.keys(figShots).forEach(k => delete figShots[k]);
  if(FIG) FIG.setTheme(figDark() ? "dark" : "light");
}

function render(){
  stopAnim();
  rollDay();
  planMemo = null;
  document.getElementById("todayLabel").textContent = fmtDate(TODAY);
  const v = document.getElementById("view");
  v.className = "view-" + tab;
  if(tab==="today") v.innerHTML = viewToday();
  else if(tab==="ex") v.innerHTML = viewEx();
  else if(tab==="body") v.innerHTML = viewBody();
  else if(tab==="hist") v.innerHTML = viewHist();
  else v.innerHTML = viewPlan();
  wire();
}

