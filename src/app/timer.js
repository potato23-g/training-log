/* ============================================================
   休憩タイマー
   残り秒数を1秒ずつ減らすのではなく「終わる時刻」を持つ。
   画面が消えたりアプリを切り替えたりしてタイマーが止められても、戻った時点で正しい残りになる。
   ============================================================ */
let restEnd = 0, restIv = null, restLabel = "";
function restLeftSec(){ return Math.max(0, Math.ceil((restEnd - Date.now()) / 1000)); }
function startRest(sec, label){
  restEnd = Date.now() + sec * 1000;
  restLabel = label || "";
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
  if(restLeftSec() > 0){ drawRest(); return; }
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
  clearInterval(restIv); restIv = null;
  cancelChime(); stopRestAudio();
  document.getElementById("timer").classList.remove("on");
  keepAwake(false);
}
document.getElementById("timerStop").onclick = stopRest;
document.getElementById("timerPlus").onclick = ()=>{
  if(!restIv) return;
  restEnd += 30000;
  armChime(); drawRest();
};
/* 30秒縮める（残りが30秒を切っているときは、すぐ終わりにする） */
document.getElementById("timerMinus").onclick = ()=>{
  if(!restIv) return;
  restEnd = Math.max(Date.now(), restEnd - 30000);
  armChime(); drawRest(); tickRest();
};

