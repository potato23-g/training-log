/* ============================================================
   保存層（ローカル版）: この端末の中だけで完結する。外部通信なし。
   記録は localStorage に置き、JSON のバックアップで端末間を移す。
   ・読めない保存データは上書きせずに別のキーへ残し、空の状態で開く（画面が知らせる）
   ・1日1回、読めた記録を3世代まで控えに残す（端末の控えから戻せる）
   ・同じ端末で2つのタブを開いていても、保存するときに別のタブの記録と合流させる
   ============================================================ */
const LS = "trainlog.v1";
const LS_CORRUPT = LS + ".corrupt";
const LS_BACKUP_AT = "trainlog.backup.lastSaved";   /* 最後に「バックアップを保存」した時刻 */
const BAK_GENERATIONS = 3;
let state = { sessions:{}, program: DEFAULT_PROGRAM.slice() };
let lastSaved = "";
let lastRaw = null;          /* このタブが最後に読んだ・書いた保存の中身。別のタブが書いたかの見分けに使う */
let STORE_PROBLEM = null;    /* 起動時に保存データを読めなかったとき {kind:"corrupt", savedAs:残したキー} */

/* 読んだデータを確かめてから state に入れる */
function applyLoaded(o){
  const c = typeof sanitizeState === "function" ? sanitizeState(o) : o;
  state.sessions = c.sessions || {};
  state.program = c.program && c.program.length ? c.program : DEFAULT_PROGRAM.slice();
  state.gear = readGear(c.gear);          /* 持っているダンベル（旧形式は読み替える） */
  ensureIds(state);                       /* 古い記録にもセットごとのIDを振る */
}
function loadLocal(){
  let raw = null;
  try{ raw = localStorage.getItem(LS); }catch(e){ return; }
  if(!raw) return;
  let o = null;
  try{ o = JSON.parse(raw); }catch(e){ o = null; }
  if(!o || typeof o !== "object" || !o.sessions || typeof o.sessions !== "object" || Array.isArray(o.sessions)){
    /* 読めない。元の文字列は消さずに別のキーへ写し、空の状態で開く */
    STORE_PROBLEM = {kind:"corrupt", savedAs: keepCorrupt(raw)};
    return;
  }
  applyLoaded(o);
  lastRaw = raw;
}
/* 読めなかった保存データの置き場。すでにあるものは上書きしない */
function keepCorrupt(raw){
  for(let i = 1; i <= 5; i++){
    const k = LS_CORRUPT + (i === 1 ? "" : "." + i);
    try{ if(localStorage.getItem(k) === null){ localStorage.setItem(k, raw); return k; } }catch(e){ return null; }
  }
  return null;
}
function isQuotaError(e){
  return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014);
}
function saveLocal(){
  try{
    /* 別のタブが書いていたら、上書きせずに合流させてから書く（片方のタブの記録が消えないように） */
    let cur = null;
    try{ cur = localStorage.getItem(LS); }catch(e){}
    if(cur && cur !== lastRaw && typeof mergeState === "function"){
      try{
        const other = sanitizeState(JSON.parse(cur));
        const m = mergeState(state, other);
        state.sessions = m.sessions;
        if(m.gear) state.gear = m.gear;
      }catch(e){}
    }
    /* 消した印（del）は古い日ならもう要らない。統合のときだけでなく、ここでも間引く
       （同期を設定していない・同じ端末の1タブしか無い、といった mergeState を通らない
       保存でも、del が消えずに増え続けないように） */
    if(typeof syncPruneOldDel === "function") syncPruneOldDel(state.sessions);
    const next = JSON.stringify(state);
    try{ localStorage.setItem(LS, next); }
    catch(e){
      /* 容量が足りなければ、古い控えを捨ててもう一度（控えより本体の記録を優先する） */
      if(!isQuotaError(e)) throw e;
      for(let i = BAK_GENERATIONS; i >= 2; i--){ try{ localStorage.removeItem(LS + ".bak" + i); }catch(x){} }
      localStorage.setItem(LS, next);
    }
    lastRaw = next;
    lastSaved = new Date().toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"});
    setStatus("この端末に保存しています（最終保存 " + lastSaved + "）");
    return true;
  }catch(e){
    const msg = "保存できませんでした。ブラウザの保存領域がいっぱいか、履歴の保存が止められています";
    setStatus(msg);
    if(typeof onStoreFail === "function") onStoreFail(msg);
    return false;
  }
}
function setStatus(t){
  const el = document.getElementById("status");
  if(el) el.textContent = t;
}

async function initStore(){
  loadLocal();
  migrateOldBak();
  if(!STORE_PROBLEM) rotateBackups();
  render();
  const n = Object.keys(state.sessions).length;
  setStatus(STORE_PROBLEM ? "この端末の保存データを読めなかったので、空の状態で開きました"
          : n ? "この端末に保存しています（" + n + "日分）" : "この端末に保存しています");
}

function persistSession(date){
  if(state.sessions[date]) state.sessions[date].updatedAt = typeof stampNow === "function" ? stampNow() : Date.now();
  return saveLocal();
}
function persistProgram(){
  return saveLocal();
}

/* 別のタブが保存したら、その中身と合流して描き直す。
   このタブにしかない記録があれば書き足す（中身が同じになれば書かないので、行ったり来たりしない） */
try{
  window.addEventListener("storage", e=>{
    if(!e || e.key !== LS || !e.newValue || typeof mergeState !== "function") return;
    let other;
    try{ other = sanitizeState(JSON.parse(e.newValue)); }catch(x){ return; }
    const m = mergeState(state, other);
    const key = o => (typeof stableKey === "function" ? stableKey : JSON.stringify)({sessions: o.sessions, gear: o.gear});
    const mineOnly = key(m) !== key(other);
    state.sessions = m.sessions;
    if(m.gear) state.gear = m.gear;
    lastRaw = e.newValue;
    if(mineOnly) saveLocal();
    if(typeof syncSafeRender === "function") syncSafeRender(); else render();
  });
}catch(e){}

/* ---- 端末の控え（世代つき） ----
   trainlog.v1.bak1（新しい）〜 bak3（古い）。中身は {savedAt, day, data}。
   本体が読めたときだけ、1日1回回す。読めなかった日は回さない（壊れたものを控えに入れない） */
function rotateBackups(){
  /* 保存データを読めて、セットのある日が1日以上あるときだけ（最初の描画が作る空の「今日」は数えない） */
  if(!lastRaw) return;
  if(!Object.keys(state.sessions).some(d => (state.sessions[d].entries || []).some(e => e.sets && e.sets.length))) return;
  let b1 = null;
  try{ b1 = JSON.parse(localStorage.getItem(LS + ".bak1") || "null"); }catch(e){ b1 = null; }
  if(b1 && b1.day === TODAY) return;
  try{
    for(let i = BAK_GENERATIONS; i >= 2; i--){
      const older = localStorage.getItem(LS + ".bak" + (i - 1));
      if(older !== null) localStorage.setItem(LS + ".bak" + i, older);
    }
    localStorage.setItem(LS + ".bak1", JSON.stringify({savedAt: new Date().toISOString(), day: TODAY,
      data: {sessions: state.sessions, program: state.program, gear: state.gear}}));
  }catch(e){}                              /* 容量が足りなければ控えはあきらめる（本体の保存を優先） */
}
/* 以前の版の控え（trainlog.v1.bak。起動のたびに上書きしていた）を、一度だけ新しい控えへ移す */
function migrateOldBak(){
  let old = null;
  try{ old = localStorage.getItem(LS + ".bak"); }catch(e){ return; }
  if(old === null) return;
  try{
    const o = JSON.parse(old);
    if(o && o.sessions && localStorage.getItem(LS + ".bak1") === null){
      localStorage.setItem(LS + ".bak1", JSON.stringify({savedAt: null, day: null, data: o}));
    }
  }catch(e){ if(old) keepCorrupt(old); }  /* 読めないものは消さずに残す */
  try{ localStorage.removeItem(LS + ".bak"); }catch(e){}
}
/* 画面から使う: 控えの一覧 [{key, savedAt, day, days}]（days = セットが1つ以上ある日の数） */
function listBackups(){
  const out = [];
  for(let i = 1; i <= BAK_GENERATIONS; i++){
    const key = LS + ".bak" + i;
    try{
      const o = JSON.parse(localStorage.getItem(key) || "null");
      if(!o || !o.data || !o.data.sessions) continue;
      const days = Object.keys(o.data.sessions).filter(d => (o.data.sessions[d].entries || []).some(e => e.sets && e.sets.length)).length;
      out.push({key, savedAt: o.savedAt || null, day: o.day || null, days});
    }catch(e){}
  }
  return out;
}
function restoreBackup(key){
  let o = null;
  try{ o = JSON.parse(localStorage.getItem(key) || "null"); }catch(e){ o = null; }
  if(!o || !o.data || !o.data.sessions){ alert("この控えは読めませんでした"); return; }
  const incoming = sanitizeState(o.data);
  const days = Object.keys(incoming.sessions).length;
  const merge = typeof mergeState === "function";
  if(!confirm("端末の控え（" + (o.day ? fmtDate(o.day) : "以前の版") + "）から " + days + "日分を取り込みます。" + (merge
      ? "今の記録とまとめます（どちらかにしかないセットも残ります）。"
      : "同じ日付の記録は控えの内容で置き換えます。") + "よろしいですか？")) return;
  ensureIds(incoming);
  if(merge){
    const m = mergeState(state, incoming);
    state.sessions = m.sessions;
    if(m.gear) state.gear = m.gear;
  }else{
    Object.keys(incoming.sessions).forEach(d=>{ state.sessions[d] = incoming.sessions[d]; });
    if(incoming.gear) state.gear = incoming.gear;
  }
  STORE_PROBLEM = null;
  saveLocal();
  if(typeof syncNow === "function") syncNow();                   /* 同期: 記録を戻したとき */
  render();
  setStatus(days + "日分を控えから取り込みました");
}
ACTIONS.restorebak = el => restoreBackup(el.dataset.key);

/* ファイル書き出し（ブラウザのダウンロード） */
async function saveFile(filename, text){
  try{
    const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
    return true;
  }catch(e){ return false; }
}

/* ---- バックアップ（JSON） ---- */
function backupJSON(){
  return JSON.stringify({ app:"trainlog", version:1, savedAt:new Date().toISOString(),
                          sessions: state.sessions, program: state.program, gear: state.gear }, null, 1);
}
async function backupSave(){
  const ok = await saveFile("trainlog-backup-" + TODAY + ".json", backupJSON());
  if(ok){ try{ localStorage.setItem(LS_BACKUP_AT, String(Date.now())); }catch(e){} return; }
  sheetInner.innerHTML = `<h4>バックアップ（コピーして保存）</h4>
    <textarea style="min-height:280px" readonly>${esc(backupJSON())}</textarea>
    <div class="rowbtns"><button data-close="1">閉じる</button></div>`;
  sheetInner.querySelector("[data-close]").onclick = ()=> sheet.classList.remove("on");
  sheet.classList.add("on");
}
function applyBackup(text){
  let o = null;
  try{ o = JSON.parse(text); }catch(e){ alert("バックアップを読めませんでした（JSONの形式が違います）"); return; }
  if(!o || typeof o !== "object" || !o.sessions){ alert("このファイルはこのアプリのバックアップではないようです"); return; }
  const incoming = sanitizeState(o);
  const days = Object.keys(incoming.sessions).length;
  const merge = typeof mergeState === "function";
  if(!confirm("バックアップから " + days + "日分を取り込みます。" + (merge
      ? "同じ日付の記録は、この端末の記録とまとめます（どちらかにしかないセットも残ります）。"
      : "同じ日付の記録は取り込んだ内容で置き換えます。") + "よろしいですか？")) return;
  ensureIds(incoming);
  if(merge){
    const m = mergeState(state, incoming);
    state.sessions = m.sessions;
    if(m.gear) state.gear = m.gear;
  }else{
    Object.keys(incoming.sessions).forEach(d=>{ state.sessions[d] = incoming.sessions[d]; });
    if(incoming.gear) state.gear = incoming.gear;
  }
  if(incoming.program && incoming.program.length) state.program = incoming.program;
  STORE_PROBLEM = null;
  saveLocal();
  render();
  setStatus(days + "日分を取り込みました");
}
function backupLoad(){
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "application/json,.json,text/plain";
  inp.onchange = ()=>{
    const f = inp.files && inp.files[0];
    if(!f) return;
    const r = new FileReader();
    r.onload = ()=> applyBackup(String(r.result || ""));
    r.readAsText(f);
  };
  inp.click();
}
/* ファイル選択が使えない環境用に、貼り付けでも取り込めるようにする */
function backupPaste(){
  sheetInner.innerHTML = `<h4>バックアップを貼り付けて取り込む</h4>
    <p class="lastline" style="margin-top:0">書き出したJSONをそのまま貼り付けてください。</p>
    <textarea id="bkpaste" style="min-height:220px" placeholder='{"app":"trainlog",...}'></textarea>
    <div class="rowbtns"><button data-go="1">取り込む</button><button data-close="1">閉じる</button></div>`;
  sheetInner.querySelector("[data-go]").onclick = ()=>{
    applyBackup(sheetInner.querySelector("#bkpaste").value);
    sheet.classList.remove("on");
  };
  sheetInner.querySelector("[data-close]").onclick = ()=> sheet.classList.remove("on");
  sheet.classList.add("on");
}

/* バックアップのボタン */
function storeButtons(){
  return `<div class="rowbtns">
      <button data-act="backup">バックアップを保存</button>
      <button data-act="restore">バックアップから復元</button>
      <button data-act="restorepaste">貼り付けて復元</button>
    </div>
    <p class="lastline">共有を設定していない場合、記録はこの端末の中だけにあります。機種変更やブラウザの掃除で消えるので、ときどきバックアップを保存してください。</p>`;
}
/* 端末の控えとバックアップのカード */
function backupCard(){
  const list = listBackups();
  const rows = list.map(b => `<div class="setrow"><span>${b.day ? esc(fmtDate(b.day)) : "以前の版の控え"}<small>${b.days}日分の記録</small></span>
      <button data-act="restorebak" data-key="${esc(b.key)}">この控えから戻す</button></div>`).join("");
  return `<h3 class="sec">バックアップ</h3>
  <div class="card">
    ${storeButtons()}
    <h4 style="margin-top:14px">端末の控え</h4>
    <p class="lastline" style="margin-top:0">記録が読めたときに1日1回、この端末の中に控えを取っています（新しいものから${BAK_GENERATIONS}つ）。戻すときは今の記録とまとめるので、今の記録は消えません。</p>
    ${rows || `<p class="lastline">まだ控えはありません。</p>`}
  </div>`;
}
/* 同期を設定しておらず、しばらくバックアップを保存していないときの一言（それ以外は ""） */
function backupReminder(){
  if(typeof syncLoadConfig === "function" && syncLoadConfig()) return "";
  const days = Object.keys(state.sessions).filter(d => (state.sessions[d].entries || []).some(e => e.sets.length)).length;
  if(days < 3) return "";
  let last = 0;
  try{ last = +(localStorage.getItem(LS_BACKUP_AT) || 0); }catch(e){}
  if(last && Date.now() - last < 30 * 86400000) return "";
  return `<div class="flash">記録はこの端末の中だけにあります。${last ? "前回のバックアップから30日たちました。" : ""}
    <div class="rowbtns" style="margin-top:6px"><button data-act="backup">バックアップを保存</button></div></div>`;
}
