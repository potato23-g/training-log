/* ---------- テーマ ---------- */
/* ---- アプリの更新 ----
   PWAは端末に保存した版で動くので、押したときに版の日時をネットから確かめる（端末の保存を通さない）。
   新しければ Service Worker に新しい版を取り込ませ、切り替わったら開き直す */
const updBtn = document.getElementById("updBtn");
if(updBtn) updBtn.onclick = async ()=>{
  const back = (label, msg, wait)=>{
    updBtn.disabled = false; updBtn.textContent = label;
    if(msg) setStatus(msg);
    if(label !== "更新") setTimeout(()=>{ updBtn.textContent = "更新"; }, wait || 2500);
  };
  updBtn.disabled = true; updBtn.textContent = "確認中";
  if(!/^https?:$/.test(location.protocol)){
    back("更新", "このファイル1つで動く版なので、更新の取り込みはありません（版 " + BUILD_VERSION + "）");
    return;
  }
  try{
    const here = location.pathname + (location.search || "");
    /* ?__check= を付けると Service Worker は保存を返さず、そのままネットへ行く（service-worker.js） */
    const res = await fetch(here + (here.indexOf("?") < 0 ? "?" : "&") + "__check=" + Date.now(), {cache: "no-store"});
    if(!res || !res.ok) throw new Error("fetch");
    const txt = await res.text();
    const m = txt.match(/BUILD_VERSION = "([^"]*)"/);
    if(m && m[1] === BUILD_VERSION){ back("最新です", "すでに最新の版です（" + BUILD_VERSION + "）"); return; }
    updBtn.textContent = "更新中";
    setStatus("新しい版（" + (m ? m[1] : "") + "）を取り込んでいます");
    /* 新しい Service Worker が保存をそろえて動き出すまで待つ（動き出すと build.py の登録処理が開き直す） */
    let switched = false;
    if("serviceWorker" in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg){
        await reg.update();
        const w = reg.installing || reg.waiting;
        if(w) switched = await new Promise(done=>{
          const timer = setTimeout(()=> done(false), 20000);
          const check = ()=>{
            if(w.state === "activated"){ clearTimeout(timer); done(true); }
            else if(w.state === "redundant"){ clearTimeout(timer); done(false); }
          };
          w.addEventListener("statechange", check); check();
        });
      }
    }
    /* 新しい Service Worker が見つからない・取り込めなかったときは、取り直した画面を今の保存に入れて開き直す */
    if(!switched && typeof caches !== "undefined"){
      const html = ()=> new Response(txt, {headers: {"Content-Type": "text/html; charset=utf-8"}});
      for(const n of await caches.keys()){
        if(n.indexOf("trainlog-") !== 0) continue;
        const c = await caches.open(n);
        for(const key of [here, "./", "./index.html"]){
          try{ await c.put(key, html()); }catch(e){}
        }
      }
    }
    setStatus("新しい版（" + (m ? m[1] : "") + "）に切り替えます");
    if(!window.__swReloaded){ window.__swReloaded = true; setTimeout(()=> location.reload(), 200); }
  }catch(e){
    back("更新", "更新を確認できませんでした。通信を確かめてもう一度押してください");
  }
};

const themeBtn = document.getElementById("themeBtn");
(function(){
  let t = null;
  try{ t = localStorage.getItem("trainlog.theme"); }catch(e){}
  if(t) document.documentElement.setAttribute("data-theme", t);
  themeBtn.onclick = ()=>{
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur==="dark" ? "light" : (cur==="light" ? "" : "dark");
    if(next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    try{ next ? localStorage.setItem("trainlog.theme", next) : localStorage.removeItem("trainlog.theme"); }catch(e){}
    figThemeChanged(); render();
  };
})();

/* ---- 設定のシート（右上の ⚙） ----
   ダンベルの登録・1日の区切り・休憩の知らせ方・同期・バックアップを1か所にまとめる */
let settingsOpen = false;
function dayStartCard(){
  const h = dayStartHour();
  const opts = [0, 1, 2, 3, 4, 5, 6].map(v => `<option value="${v}"${v === h ? " selected" : ""}>${v === 0 ? "夜中の0時" : "朝" + v + "時"}</option>`).join("");
  return `<h3 class="sec">1日の区切り</h3>
  <div class="card">
    <div class="fld"><label>この時刻までは、前の日のトレーニングとして記録する</label>
      <select id="dayStartSel">${opts}</select></div>
    <p class="lastline">夜遅くに始めて0時を過ぎても、区切りの時刻までは同じ日の記録になります。</p>
  </div>`;
}
function settingsHTML(){
  return `<h4 data-settings="1">設定</h4>
    ${gearCard()}
    ${dayStartCard()}
    ${settingsCard()}
    ${typeof syncCard === "function" ? syncCard() : ""}
    ${typeof backupCard === "function" ? backupCard() : ""}
    <div class="rowbtns"><button data-close="1">閉じる</button></div>`;
}
function wireSettings(){
  wireActs(sheetInner);
  wireInputs(sheetInner);
  if(typeof syncWire === "function") syncWire(sheetInner);
  const sel = sheetInner.querySelector("#dayStartSel");
  if(sel) sel.onchange = ()=>{
    PREF.set("dayStart", +sel.value);
    if(rollDay()) setStatus("1日の区切りを変えたので、今日のメニューを切り替えました");
    render();
  };
  const close = sheetInner.querySelector("[data-close]");
  if(close) close.onclick = closeSettings;
}
function openSettings(){
  settingsOpen = true;
  sheetInner.innerHTML = settingsHTML();
  wireSettings();
  sheet.classList.add("on");
}
/* 設定を変えると画面を描き直すので、そのときシートの中身も今の設定で描き直す（スクロール位置は保つ） */
function refreshSettings(){
  /* シートが閉じた・ほかの中身（貼り付けて復元など）に替わったときは描き直さない */
  if(!sheet.classList.contains("on") || !sheetInner.querySelector("[data-settings]")){ settingsOpen = false; return; }
  const y = sheetInner.scrollTop;
  sheetInner.innerHTML = settingsHTML();
  wireSettings();
  sheetInner.scrollTop = y;
}
function closeSettings(){
  settingsOpen = false;
  sheet.classList.remove("on");
}
const setBtn = document.getElementById("setBtn");
if(setBtn) setBtn.onclick = openSettings;
