/* ============================================================
   保存層（ローカル版）: この端末の中だけで完結する。外部通信なし。
   記録は localStorage に置き、JSON のバックアップで端末間を移す。
   ============================================================ */
const LS = "trainlog.v1";
let state = { sessions:{}, program: DEFAULT_PROGRAM.slice() };
let lastSaved = "";

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
  try{
    localStorage.setItem(LS, JSON.stringify(state));
    lastSaved = new Date().toLocaleTimeString("ja-JP", {hour:"2-digit", minute:"2-digit"});
    setStatus("この端末に保存しています（最終保存 " + lastSaved + "）");
  }catch(e){
    setStatus("保存できませんでした。ブラウザの保存領域がいっぱいか、履歴の保存が止められています");
  }
}
function setStatus(t){
  const el = document.getElementById("status");
  if(el) el.textContent = t;
}

async function initStore(){
  loadLocal();
  render();
  const n = Object.keys(state.sessions).length;
  setStatus(n ? "この端末に保存しています（" + n + "日分）" : "この端末に保存しています");
  /* 自動バックアップ: 直近の状態をもう1つ別キーに置いておく */
  try{ localStorage.setItem(LS + ".bak", localStorage.getItem(LS) || ""); }catch(e){}
}

function persistSession(date){
  if(state.sessions[date]) state.sessions[date].updatedAt = Date.now();
  saveLocal();
  if(typeof syncSchedule === "function") syncSchedule();
}
function persistProgram(){
  saveLocal();
  if(typeof syncSchedule === "function") syncSchedule();
}

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
  if(!ok){
    sheetInner.innerHTML = `<h4>バックアップ（コピーして保存）</h4>
      <textarea style="min-height:280px" readonly>${backupJSON().replace(/</g,"&lt;")}</textarea>
      <div class="rowbtns"><button data-close="1">閉じる</button></div>`;
    sheetInner.querySelector("[data-close]").onclick = ()=> sheet.classList.remove("on");
    sheet.classList.add("on");
  }
}
function applyBackup(text){
  let o = null;
  try{ o = JSON.parse(text); }catch(e){ alert("バックアップを読めませんでした（JSONの形式が違います）"); return; }
  if(!o || typeof o !== "object" || !o.sessions){ alert("このファイルはこのアプリのバックアップではないようです"); return; }
  const days = Object.keys(o.sessions).length;
  const merge = typeof mergeState === "function";
  if(!confirm("バックアップから " + days + "日分を取り込みます。" + (merge
      ? "同じ日付の記録は、この端末の記録とまとめます（どちらかにしかないセットも残ります）。"
      : "同じ日付の記録は取り込んだ内容で置き換えます。") + "よろしいですか？")) return;
  const incoming = {sessions: o.sessions, gear: readGear(o.gear)};
  ensureIds(incoming);
  if(merge){
    const m = mergeState(state, incoming);
    state.sessions = m.sessions;
    if(m.gear) state.gear = m.gear;
  }else{
    Object.keys(incoming.sessions).forEach(d=>{ state.sessions[d] = incoming.sessions[d]; });
    if(incoming.gear) state.gear = incoming.gear;
  }
  if(Array.isArray(o.program) && o.program.length) state.program = o.program;
  saveLocal();
  if(typeof syncSchedule === "function") syncSchedule();
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

/* 履歴タブの書き出しカードに足すボタン */
function storeButtons(){
  return `<div class="rowbtns">
      <button data-act="backup">バックアップを保存</button>
      <button data-act="restore">バックアップから復元</button>
      <button data-act="restorepaste">貼り付けて復元</button>
    </div>
    <p class="lastline">共有を設定していない場合、記録はこの端末の中だけにあります。機種変更やブラウザの掃除で消えるので、ときどきバックアップを保存してください。</p>`;
}
