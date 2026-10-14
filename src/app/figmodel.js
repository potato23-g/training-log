/* ---------- キャラクターの図 ----------
   公開版（GitHub Pages）だけ。図は「キャラクター」か「線の図」のどちらか一方で出す（設定タブで選ぶ）。
   キャラクターのときは、止まった姿も、再生も、組み方ごとの動きも、すべてキャラクターで出す。
   止まった姿は公開前に描いておいた画像（docs/mmd/stills/）、再生は「動きを再生」を押したときに初めて読むモデル。
   どちらかが読めなかったら、その回は画面のすべてを線の図に切り替える（1 枚の画面に両方を混ぜない） */
const MMD_BASE = "__MMD__";       /* build.py が site のときだけ "./mmd/" を入れる。ほかの版では空 */
const MMD_STILLS = "__MMD_STILLS__";     /* 画像がある動きの id → 枠の形（t 縦長・s 正方形・w 横長・x もっと横長）。build.py が入れる */
const MMD_SHAPES = {t: [720, 960], s: [840, 840], w: [960, 660], x: [960, 500]};
let MMD = null, mmdLoading = null, mmdOff = false;

function figKind(){
  let k = null;
  try{ k = localStorage.getItem("trainlog.fig"); }catch(e){}
  return k === "line" ? "line" : "model";
}
function setFigKind(k){
  try{ k === "line" ? localStorage.setItem("trainlog.fig", "line") : localStorage.removeItem("trainlog.fig"); }catch(e){}
  mmdOff = false;
  stopAnim(); render();
}
/* 今、図をキャラクターで出すか */
function mmdOn(){
  return !!MMD_BASE && !!MMD_STILLS && typeof MMD_STILLS === "object" && !mmdOff && figKind() === "model";
}
function mmdStill(mo, dbn){
  return MMD_BASE + "stills/" + mo + (dbn ? "." + dbn : "") + ".webp";
}
/* 読めなかった: この回は線の図にする */
function mmdFail(){
  if(mmdOff) return;
  mmdOff = true;
  if(MMD){ try{ MMD.dispose(); }catch(e){} }
  MMD = null;
  render();
}
function mmdLoad(){
  if(MMD) return Promise.resolve(MMD);
  if(!mmdLoading){
    mmdLoading = import(new URL(MMD_BASE + "player.js", location.href).href)
      .then(m => m.create())
      .then(p => {
        p.canvas.className = "figcanvas";
        bindFigDrag(p.canvas);
        /* 描画の土台が失われたら手放し、次に再生するときに作り直す */
        p.canvas.addEventListener("webglcontextlost", (e)=>{ e.preventDefault(); if(MMD === p){ stopAnim(); try{ p.dispose(); }catch(x){} MMD = null; } }, false);
        mmdLoading = null;
        return (MMD = p);
      }, e => { mmdLoading = null; throw e; });
  }
  return mmdLoading;
}

/* ---------- 線の図の時間割 → キャラクターの姿勢 ----------
   秒数（下ろす・止める・上げるの長さ）は線の図の動き（MOTION）だけが持つ。キャラクターは、その時刻の線の図の関節の値を読んで、
   同じところまで動く。[読む値, 動きの始めの値, 動ききったときの値]。組み方で止める時間や深さが変わっても、この表は変えなくてよい */
const MDRV = {
  goblet: ["pelvis.y", 0.95, 0.41], sumo: ["pelvis.y", 0.95, 0.41], split: ["pelvis.y", 0.90, 0.61], splitfloor: ["pelvis.y", 0.90, 0.61],
  sidelunge: ["pelvis.z", 0, 0.18, 1],
  rdl: ["pelvis.pitch", 5, 82], rdl1: ["pelvis.pitch", 5, 82], deadlift: ["pelvis.pitch", 3, 66],
  chinning: ["pelvis.y", 0.98, 1.48],
  hipthrust: ["pelvis.pitch", -30, -95], bridge: ["pelvis.pitch", -88, -116], slidecurl: ["shankR.flex", 116, 40], sissy: ["shankR.flex", 4, 90],
  calf: ["footPitch", 22, -36], calfseat: ["footPitch", 0, -32], abduct: ["thighL.abd", 0, 35], adduct: ["thighR.abd", 5, -3],
  row: ["forearmR.flex", 6, 112], row2: ["forearmR.flex", 8, 116], pullover: ["upperarmR.flex", 88, 163], shrug: ["clavR.elev", -4, 14],
  ohp: ["upperarmR.flex", 22, 172], lateral: ["upperarmR.abd", 0, 85], front: ["upperarmR.flex", 8, 88], rear: ["upperarmR.abd", 3, 85],
  curl: ["forearmR.flex", 5, 142], hammer: ["forearmR.flex", 5, 138], triext: ["forearmR.flex", 95, 10],
  /* 次の3つは、キャラクターの側が「腕を伸ばした所」を始めにしている */
  floorpress: ["upperarmR.flex", 90, -15], fly: ["upperarmR.abd", -8, 80], skull: ["forearmR.flex", 8, 96],
  pushup: ["pelvis.y", 0.38, 0.18], pushupknee: ["pelvis.y", 0.38, 0.18], pushup_deep: ["pelvis.y", 0.44, 0.18],
  crunch: ["spineT.flex", 0, 18], backext: ["spineL.flex", 2, -12], sidebend: ["spineL.abd", 0, 22],
  /* 左右を交互に動かす: 右の番（k=0）と左の番（k=1）を、動いている側で決める */
  deadbug: {alt: [["upperarmR.flex", 90, 172], ["upperarmL.flex", 90, 172]]},
  twist: {sign: ["spineC.rot", 20], pos: 1},
  /* 悪い例を見せる動き: 読む値は、悪い例の度合い（0 = 正しい姿勢、1 = 悪い例） */
  farmer: {w: ["clavR.elev", -4, 15], cycle: 1.0},
  plank: {w: ["spineL.flex", 0, -14]},
  sideplank: {w: ["spineL.abd", 0, -12]},
};
function mmdBase(mo){ return String(mo).replace(/_[a-z]+$/, ""); }
function mmdDrv(mo){ return MDRV[mo] || MDRV[mmdBase(mo)] || null; }
function modelAt(mo, m, t){
  const r = mmdDrv(mo), d = MOTION.driversAt(m, t);
  const f = (a) => Math.max(0, Math.min(1, ((d[a[0]] || 0) - a[1]) / (a[2] - a[1])));
  if(!r) return {u: 0, k: 0, w: 0};
  if(Array.isArray(r)) return {u: f(r), k: r[3] || 0, w: 0};
  if(r.alt){ const a = f(r.alt[0]), b = f(r.alt[1]); return a >= b ? {u: a, k: 0, w: 0} : {u: b, k: 1, w: 0}; }
  if(r.sign){ const v = d[r.sign[0]] || 0; return {u: Math.min(1, Math.abs(v) / r.sign[1]), k: v >= 0 ? r.pos : 1 - r.pos, w: 0}; }
  return {u: r.cycle ? (t / r.cycle) % 1 : 0, k: 0, w: f(r.w)};
}

function playModel(id, wrap, m){
  const first = !MMD;
  const slot = wrap.querySelector(".figslot");
  const phase = slot.querySelector(".figphase");
  const bar = slot.querySelector(".figbar span");
  const dbn = +(wrap.dataset.db || 0) || 0;
  playSlot = slot;
  playBtn = wrap.querySelector('[data-act="play"]');
  if(playBtn) playBtn.textContent = "停止";
  playingId = id;
  playStart(id);
  if(!MMD && phase) phase.textContent = "読み込み中…";
  const T = MOTION.cycleTime(m);
  mmdLoad().then(p => {
    if(playingId !== id || playSlot !== slot) return;
    if(first && playClock && playClock.id === id) playClock.t0 = performance.now();     /* 読み込みを待ったぶんは進めない */
    const t0 = playClock.t0;
    if(!p.set(id, {dbn}, modelAt(id, m, ((performance.now() - t0) / 1000) % T))) throw new Error("no motion");
    const img = slot.querySelector(".figstill");
    if(img) img.style.display = "none";
    slot.insertBefore(p.canvas, slot.firstChild);
    if(bar) bar.parentNode.style.display = "block";
    let last = performance.now();
    const tick = (now)=>{
      animRAF = requestAnimationFrame(tick);
      if(now - last < 33) return;
      const t = ((now - t0) / 1000) % T;
      p.frame((now - last) / 1000, -(figAz[id] || 0), modelAt(id, m, t));
      last = now;
      if(phase) phase.textContent = phaseLabel(m, t);
      if(bar) bar.style.width = (t / T * 100).toFixed(1) + "%";
    };
    animRAF = requestAnimationFrame(tick);
  }).catch(() => {
    /* 描き直すと、再生中だった動きは線の図で続く */
    if(playingId === id && playSlot === slot) mmdFail();
  });
}
