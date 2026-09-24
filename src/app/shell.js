/* ---------- テーマ ---------- */
/* ---- アプリの更新 ----
   PWAは端末に保存した版で動くので、押したときにこの画面を取り直して版の日時を比べる。
   新しければ端末に保存してある画面を入れ替えて開き直す */
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
    const res = await fetch(here, {cache: "reload"});
    if(!res || !res.ok) throw new Error("fetch");
    const txt = await res.text();
    const m = txt.match(/BUILD_VERSION = "([^"]*)"/);
    if(m && m[1] === BUILD_VERSION){ back("最新です", "すでに最新の版です（" + BUILD_VERSION + "）"); return; }
    /* 端末に保存してある画面を、取り直したものに入れ替える */
    if(typeof caches !== "undefined"){
      const html = ()=> new Response(txt, {headers: {"Content-Type": "text/html; charset=utf-8"}});
      for(const n of await caches.keys()){
        const c = await caches.open(n);
        for(const key of [here, "./", "./index.html"]){
          try{ await c.put(key, html()); }catch(e){}
        }
      }
    }
    window.__swReloaded = true;                 /* 切り替えの二重リロードを防ぐ（更新より先に立てる） */
    if("serviceWorker" in navigator){
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg) await reg.update();
    }
    updBtn.textContent = "更新中";
    setStatus("新しい版（" + (m ? m[1] : "") + "）に切り替えます");
    setTimeout(()=> location.reload(), 300);
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

