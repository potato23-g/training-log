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
      if(o.exOff && Array.isArray(o.exOff.ids)) state.exOff = o.exOff;   /* メニューに入れない種目 */
      ensureIds(state);                       /* 古い記録にもセットごとのIDを振る */
    }
  }catch(e){}
}
function saveLocal(){
  try{
    /* 消した印（del）は古い日ならもう要らない。180日より前の日は保存のたびに間引く
       （新しい日の del はそのまま残す）。ただし、日付は古くても最近さわった(updatedAt)日は
       間引かない（そうしないと、半年より前の日を今消したときに del が消え、他の端末に
       まだ届いていない削除が復活しうる）。daysAgo は core.js（常に一緒に埋め込まれる） */
    Object.keys(state.sessions).forEach(function(date){
      var s = state.sessions[date];
      if(!s || !s.del || !s.del.length) return;
      if(typeof daysAgo !== "function" || daysAgo(date) <= 180) return;
      if(s.updatedAt !== undefined && Math.round((Date.now() - s.updatedAt) / 86400000) <= 180) return;
      delete s.del;
    });
    localStorage.setItem(LS, JSON.stringify(state));
    return true;
  }catch(e){ return false; }
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
  var ok = saveLocal();
  if(!DB) return ok;
  const body = state.sessions[date];
  writing = writing.then(()=>{
    if(!body) return DB.doc("sessions/"+date).delete().catch(()=>{});
    return DB.doc("sessions/"+date).set(body).catch(()=>{});
  });
  return ok;
}
function persistProgram(){
  var ok = saveLocal();
  if(!DB) return ok;
  writing = writing.then(()=> DB.doc("meta/config").set({program: state.program}).catch(()=>{}));
  return ok;
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
