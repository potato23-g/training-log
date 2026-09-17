/* ============================================================
   保存層（Artifact 版）: db があれば db、なければこの端末内
   ============================================================ */
const LS = "trainlog.v1";
let DB = null;
let state = { sessions:{}, program: DEFAULT_PROGRAM.slice() };

function loadLocal(){
  try{
    const raw = localStorage.getItem(LS);
    if(raw){
      const o = JSON.parse(raw);
      state.sessions = o.sessions||{};
      state.program = o.program||DEFAULT_PROGRAM.slice();
      state.gear = readGear(o.gear);          /* 持っているダンベル（旧形式は読み替える） */
      ensureIds(state);                       /* 古い記録にもセットごとのIDを振る */
    }
  }catch(e){}
}
function saveLocal(){
  try{ localStorage.setItem(LS, JSON.stringify(state)); }catch(e){}
}
function setStatus(t){ document.getElementById("status").textContent = t; }

async function initStore(){
  loadLocal();
  render();
  let db = null;
  try{ db = await claude.use("db"); }catch(e){ db = null; }
  if(!db){ setStatus("この端末内に保存しています"); return; }
  DB = db;
  try{
    DB.collection("sessions").orderBy("date","desc").limit(500).onSnapshot(snap=>{
      const next = {};
      snap.docs.forEach(d=>{ const v = d.data(); if(v) next[d.id] = v; });
      state.sessions = next;
      saveLocal();
      render();
      setStatus("保存済み");
    }, err=>{
      DB = null;
      setStatus("保存領域に接続できないため、この端末内に保存しています");
    });
    const cfg = await DB.doc("meta/config").get();
    if(cfg.exists && cfg.data() && Array.isArray(cfg.data().program)){
      state.program = cfg.data().program; saveLocal(); render();
    }
  }catch(e){
    DB = null;
    setStatus("この端末内に保存しています");
  }
}

let writing = Promise.resolve();
function persistSession(date){
  saveLocal();
  if(!DB) return;
  const body = state.sessions[date];
  writing = writing.then(()=>{
    if(!body) return DB.doc("sessions/"+date).delete().catch(()=>{});
    return DB.doc("sessions/"+date).set(body).catch(()=>{});
  });
}
function persistProgram(){
  saveLocal();
  if(!DB) return;
  writing = writing.then(()=> DB.doc("meta/config").set({program: state.program}).catch(()=>{}));
}

/* ファイル書き出し（downloads capability があれば使う） */
async function saveFile(filename, text){
  let dl = null;
  try{ dl = await claude.use("downloads"); }catch(e){ dl = null; }
  if(!dl) return false;
  try{
    await dl.save({filename, data: text});
    return true;
  }catch(err){
    if(err && err.code === "declined") return true;   /* 本人が断っただけ */
    return false;
  }
}

/* 履歴タブの書き出しカードに足すボタン（Artifact 版は無し） */
function storeButtons(){ return ""; }
