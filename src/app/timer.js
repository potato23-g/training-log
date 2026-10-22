/* ============================================================
   休憩タイマー
   残り秒数を1秒ずつ減らすのではなく「終わる時刻」を持つ。
   画面が消えたりアプリを切り替えたりしてタイマーが止められても、戻った時点で正しい残りになる。
   ============================================================ */
let restEnd = 0, restIv = null, restLabel = "", restRearm = false;
function restLeftSec(){ return Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)); }
function startRest(sec, label){
  beginRest(Date.now() + sec * 1000, label);
}
function beginRest(end, label){
  restEnd = end;
  restLabel = label || "";
  saveRest();
  document.getElementById("timer").classList.add("on");
  document.getElementById("timerLb").textContent = restLabel;
  armChime();
  drawRest();
  clearInterval(restIv);
  if(PREF.get("wake", true)) keepAwake(true);
  restIv = setInterval(tickRest, 250);
}
function tickRest(){
  if(!restIv) return;
  if(restLeftSec() > 0){ drawRest(); syncChime(); return; }
  clearInterval(restIv); restIv = null;
  document.getElementById("timerT").textContent = "0:00";
  ensureChimeNow(); buzz();
  notify("休憩が終わりました", restLabel || "次のセットへ");
  const mine = restEnd;
  setTimeout(()=>{ if(restEnd === mine && !restIv) stopRest(); }, 4000);
}
function drawRest(){
  const left = restLeftSec(), m = Math.floor(left / 60), s = left % 60;
  document.getElementById("timerT").textContent = m + ":" + String(s).padStart(2, "0");
}
function stopRest(){
  clearInterval(restIv); restIv = null; restRearm = false;
  PREF.set("rest", null);
  cancelChime(); stopRestAudio();
  document.getElementById("timer").classList.remove("on");
  keepAwake(false);
}
document.getElementById("timerStop").onclick = stopRest;
document.getElementById("timerPlus").onclick = ()=>{
  if(!restIv) return;
  restEnd += 30000; saveRest();
  tapAudio(); armChime(); drawRest();
};
/* 30秒縮める（残りが30秒を切っているときは、すぐ終わりにする） */
document.getElementById("timerMinus").onclick = ()=>{
  if(!restIv) return;
  restEnd = Math.max(Date.now(), restEnd - 30000); saveRest();
  tapAudio(); armChime(); drawRest(); tickRest();
};
/* 休憩の終わる時刻をこの端末に残し、更新・開き直したあとも続ける（2026-10-22 本人の要望「更新してもタイマーが継続する」）。
   開き直した直後は指で触れていないので音を鳴らせないことがある。最初に画面に触れたときに合図を予約し直す */

function saveRest(){ PREF.set("rest", {end: restEnd, label: restLabel}); }
function resumeRest(){
  const r = PREF.get("rest", null);
  if(!r || typeof r.end !== "number" || r.end <= Date.now() + 500){ if(r) PREF.set("rest", null); return; }
  beginRest(r.end, typeof r.label === "string" ? r.label : "");
  restRearm = true;
}
["pointerdown","touchend","keydown"].forEach(t=>document.addEventListener(t, ()=>{
  if(!restRearm) return;
  restRearm = false;
  if(restIv){ tapAudio(); armChime(); }
}, {capture:true, passive:true}));

