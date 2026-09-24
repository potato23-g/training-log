/* ---------- 日付の切り替わり ----------
   画面に戻ったとき・1分ごとに確かめる（入力中は邪魔しないよう次の機会にする） */
function checkNewDay(){
  const el = document.activeElement;
  if(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && document.getElementById("view").contains(el)) return;
  if(rollDay()) render();
}
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "visible") checkNewDay(); });
window.addEventListener("pageshow", checkNewDay);
setInterval(checkNewDay, 60000);

/* ---------- 起動 ---------- */
render();
initStore().then(()=>{ if(typeof syncInit === "function") syncInit(); });
