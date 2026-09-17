/* ============================================================
   同期（GitHub）: この端末と、利用者自身の非公開GitHubリポジトリの trainlog.json を
   突き合わせて、スマホとPCで記録を共有する。

   前提（環境が用意するグローバル。ここでは定義しない）:
     state        { sessions:{date:session}, program:[...], gear? }
     saveLocal()  state を localStorage に書く（同期は走らない）
     render()     #view を今のタブで描き直す
     setStatus(t) 画面下のステータス行
     ensureIds(st) / newSetId()  src/ids.js

   トップレベルでは document / window / localStorage に触れない（関数の中でだけ使う）。
   classic script。import/export なし。var は Bun の node:vm からも直接触れるように。
   ============================================================ */

var SYNC_LS_KEY = "trainlog.sync.v1";
var SYNC_API_OVERRIDE_KEY = "trainlog.sync.api";
var SYNC_LAST_KEY = "trainlog.sync.lastAt";
var SYNC_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var SYNC_BACKOFF_MS = [800, 1600];

/* デバウンス・巡回間隔・可視化スロットル。テストから縮めて使う */
var SYNC_TUNE = { debounce: 4000, interval: 5 * 60 * 1000, visThrottle: 15000 };

var syncStatusText = "";
var syncRunning = false;
var syncRerunRequested = false;
var syncDebounceTimer = null;
var syncLastAttemptAt = 0;
var syncRenderPending = false;
var syncIntervalHandle = null;

/* ============================================================
   設定の保存（localStorage["trainlog.sync.v1"] = {repo, token}）
   ============================================================ */
function syncApiBase(){
  try{
    var v = localStorage.getItem(SYNC_API_OVERRIDE_KEY);
    /* テスト用の差し替えは、この端末の中のサーバー（localhost）だけ受け付ける。鍵を外へ送らないため */
    if(v && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v)) return v;
  }catch(e){}
  return "https://api.github.com";
}
function syncLoadConfig(){
  try{
    var raw = localStorage.getItem(SYNC_LS_KEY);
    if(!raw) return null;
    var o = JSON.parse(raw);
    if(!o || typeof o !== "object" || !o.repo || !o.token) return null;
    return { repo: String(o.repo), token: String(o.token) };
  }catch(e){ return null; }
}
function syncSaveConfig(cfg){
  try{ localStorage.setItem(SYNC_LS_KEY, JSON.stringify({ repo: cfg.repo, token: cfg.token })); }catch(e){}
}
function syncClearConfig(){
  try{ localStorage.removeItem(SYNC_LS_KEY); }catch(e){}
  try{ localStorage.removeItem(SYNC_LAST_KEY); }catch(e){}
}
function syncLastDisplay(){
  try{
    var raw = localStorage.getItem(SYNC_LAST_KEY);
    var t = raw ? parseInt(raw, 10) : 0;
    if(!t) return "";
    return new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }catch(e){ return ""; }
}

/* ============================================================
   base64 ⇔ UTF-8（GitHub Contents API は base64。大きなデータでも
   call stack を溢れさせないよう String.fromCharCode をチャンクに分ける）
   ============================================================ */
function syncUtf8ToBase64(str){
  var bytes = new TextEncoder().encode(str);
  var binary = "";
  var chunk = 0x8000;
  for(var i = 0; i < bytes.length; i += chunk){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function syncBase64ToUtf8(b64){
  var cleaned = String(b64 || "").replace(/[\r\n]/g, "");
  var binary = atob(cleaned);
  var bytes = new Uint8Array(binary.length);
  for(var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ============================================================
   正準化した JSON（オブジェクトのキーだけをソートする。配列の順は保持する）。
   「何か変わったか」はこれで比較する。参照ではなく中身で見る。
   ============================================================ */
function syncCanon(v){
  if(Array.isArray(v)) return v.map(syncCanon);
  if(v && typeof v === "object"){
    var out = {};
    Object.keys(v).sort().forEach(function(k){
      if(v[k] !== undefined) out[k] = syncCanon(v[k]);
    });
    return out;
  }
  return v;
}
function stableKey(obj){
  return JSON.stringify(syncCanon(obj));
}
function syncCloneDeep(v){
  if(v === undefined || v === null) return v;
  return JSON.parse(JSON.stringify(v));
}

/* ============================================================
   マージ本体。純関数：引数を書き換えない。
   mergeState は同期からも、バックアップ取り込み（applyBackup）からも呼ばれる。
   ============================================================ */
function mergeState(local, remote){
  var a = syncCloneDeep(local) || {};
  var b = syncCloneDeep(remote) || {};
  a.sessions = a.sessions || {};
  b.sessions = b.sessions || {};
  ensureIds(a);
  ensureIds(b);

  var dateSet = {};
  Object.keys(a.sessions).forEach(function(d){ dateSet[d] = true; });
  Object.keys(b.sessions).forEach(function(d){ dateSet[d] = true; });

  var sessions = {};
  Object.keys(dateSet).forEach(function(date){
    var sa = a.sessions[date], sb = b.sessions[date];
    sessions[date] = (sa && sb) ? syncMergeSession(sa, sb) : (sa || sb);
  });

  return { sessions: sessions, gear: syncMergeGear(a.gear, b.gear) };
}

/* del は集合として意味を持つだけで順序は決まっていない。ソートしておかないと
   マージの向き（どちらを local と呼ぶか）で並びが変わり、正準JSONの比較が
   食い違って延々とpushし合う羽目になる。 */
function syncUnionIds(a, b){
  var seen = {}, out = [];
  (a || []).concat(b || []).forEach(function(id){
    if(id !== undefined && id !== null && !seen[id]){ seen[id] = true; out.push(id); }
  });
  out.sort();
  return out;
}

function syncMergeSession(a, b){
  var date = a.date || b.date;
  var del = syncUnionIds(a.del, b.del);
  var delLookup = {};
  del.forEach(function(id){ delLookup[id] = true; });

  /* entries の並び: a のエントリ、続けて a に無い ex を持つ b のエントリ。
     ※ 仕様どおりの非対称な規則。両端末が同じ日に別々の新しい種目を足すと
     並び順そのものは端末ごとに食い違ったままになり得るが、セットの中身（データ）
     は id で正しく収束する。並びだけの食い違いは無害（表示は日付・種目名基準）。 */
  var aMap = {}, order = [];
  (a.entries || []).forEach(function(e){
    if(!(e.ex in aMap)) order.push(e.ex);
    aMap[e.ex] = e;
  });
  var bMap = {};
  (b.entries || []).forEach(function(e){
    if(!(e.ex in bMap)) bMap[e.ex] = e;
    if(!(e.ex in aMap) && order.indexOf(e.ex) === -1) order.push(e.ex);
  });

  var entries = [];
  order.forEach(function(ex){
    var ea = aMap[ex], eb = bMap[ex];
    var setMap = {};
    (eb ? eb.sets || [] : []).forEach(function(s){ setMap[s.id] = s; });
    (ea ? ea.sets || [] : []).forEach(function(s){ setMap[s.id] = s; }); /* 同じidは a が勝つ */
    var sets = Object.keys(setMap).map(function(id){ return setMap[id]; })
      .filter(function(s){ return !delLookup[s.id]; });
    sets.sort(function(x, y){
      var ax = x.at === undefined ? 0 : x.at, ay = y.at === undefined ? 0 : y.at;
      if(ax !== ay) return ax - ay;
      var xi = String(x.id), yi = String(y.id);
      return xi < yi ? -1 : (xi > yi ? 1 : 0);
    });
    if(sets.length > 0 || ea) entries.push({ ex: ex, sets: sets });
  });

  var noteAtA = a.noteAt || 0, noteAtB = b.noteAt || 0;
  var noteWinner = noteAtB > noteAtA ? b : a;

  var hasPlanA = a.plan !== undefined, hasPlanB = b.plan !== undefined;
  var planWinner = null;
  if(hasPlanA && hasPlanB){
    var planAtA = a.planAt === undefined ? Infinity : a.planAt;
    var planAtB = b.planAt === undefined ? Infinity : b.planAt;
    planWinner = planAtB < planAtA ? b : a;
  }else if(hasPlanA){ planWinner = a; }
  else if(hasPlanB){ planWinner = b; }

  var merged = { date: date, entries: entries };
  if(del.length) merged.del = del;
  if(a.note !== undefined || b.note !== undefined) merged.note = noteWinner.note;
  if(noteWinner.noteAt !== undefined) merged.noteAt = noteWinner.noteAt;
  if(planWinner){
    merged.plan = planWinner.plan;
    if(planWinner.planAt !== undefined) merged.planAt = planWinner.planAt;
  }
  var routine = a.routine || b.routine;
  if(routine !== undefined) merged.routine = routine;
  var updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  if(updatedAt) merged.updatedAt = updatedAt;
  return merged;
}

/* gear は丸ごと勝ち負け（中身の形は問わない。updatedAt だけ見る）。
   両者とも updatedAt が無い/同じなら local(a) を残す。 */
function syncMergeGear(a, b){
  var atA = (a && a.updatedAt) || 0;
  var atB = (b && b.updatedAt) || 0;
  if(atB > atA) return b;
  if(a) return a;
  return b;
}

/* ============================================================
   エラー分類とメッセージ（日本語）
   ============================================================ */
function syncErrorMessage(kind){
  switch(kind){
    case "auth": return "鍵が無効か期限切れです。GitHubで作り直して入れ直してください";
    case "forbidden": return "鍵にこのリポジトリへの書き込み権限がありません（Contents を Read and write に）";
    case "repo404": return "リポジトリが見つかりません。名前と、鍵で選んだリポジトリを確認してください";
    case "public": return "公開リポジトリなので保存しません。非公開（Private）のリポジトリを指定してください";
    case "network": return "通信できませんでした。つながる場所で開くと自動で同期します";
    case "conflict": return "同期が混み合っています。少し待ってからもう一度お試しください";
    case "badformat": return "リポジトリの trainlog.json がこのアプリの形式ではありません";
    case "progress": return "同期しています…";
    case "needrepo": return "リポジトリと鍵の両方を入力してください";
    case "badrepo": return "リポジトリは「ユーザー名/リポジトリ名」の形式で入力してください";
    default: return "エラーが発生しました。しばらくしてからお試しください";
  }
}
function syncMakeError(kind, cause){
  var err = new Error(syncErrorMessage(kind));
  err.syncKind = kind;
  err.cause = cause;
  return err;
}

/* ============================================================
   GitHub REST（Contents API）
   ============================================================ */
function syncContentsUrl(repo){
  return syncApiBase() + "/repos/" + repo + "/contents/trainlog.json";
}
function syncHeaders(token, extra){
  var h = {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if(extra){ for(var k in extra){ if(extra.hasOwnProperty(k)) h[k] = extra[k]; } }
  return h;
}

async function syncCheckRepo(repo, token){
  var res;
  try{
    res = await fetch(syncApiBase() + "/repos/" + repo, { headers: syncHeaders(token), cache: "no-store" });
  }catch(e){ throw syncMakeError("network", e); }
  if(res.status === 401) throw syncMakeError("auth");
  if(res.status === 404) throw syncMakeError("repo404");
  if(res.status === 403) throw syncMakeError("forbidden");
  if(!res.ok) throw syncMakeError("network");
  var data;
  try{ data = await res.json(); }catch(e){ throw syncMakeError("network", e); }
  if(data.private !== true) throw syncMakeError("public");
  return true;
}

async function syncPull(cfg){
  var url = syncContentsUrl(cfg.repo);
  var res;
  try{
    res = await fetch(url, { headers: syncHeaders(cfg.token), cache: "no-store" });
  }catch(e){ throw syncMakeError("network", e); }
  if(res.status === 404) return { remote: null, sha: null };
  if(res.status === 401) throw syncMakeError("auth");
  if(res.status === 403) throw syncMakeError("forbidden");
  if(!res.ok) throw syncMakeError("network");
  var data;
  try{ data = await res.json(); }catch(e){ throw syncMakeError("network", e); }

  var text;
  if(!data.content || data.encoding === "none"){
    var raw;
    try{
      raw = await fetch(url, { headers: syncHeaders(cfg.token, { "Accept": "application/vnd.github.raw+json" }), cache: "no-store" });
    }catch(e){ throw syncMakeError("network", e); }
    if(!raw.ok) throw syncMakeError("network");
    text = await raw.text();
  }else{
    text = syncBase64ToUtf8(data.content);
  }

  var parsed;
  try{ parsed = JSON.parse(text); }catch(e){ throw syncMakeError("badformat", e); }
  if(!parsed || parsed.app !== "trainlog") throw syncMakeError("badformat");
  return { remote: parsed, sha: data.sha };
}

async function syncPush(cfg, payloadObj, sha){
  var url = syncContentsUrl(cfg.repo);
  var body = { message: "記録を同期", content: syncUtf8ToBase64(JSON.stringify(payloadObj)) };
  if(sha) body.sha = sha;
  var res;
  try{
    res = await fetch(url, {
      method: "PUT",
      headers: syncHeaders(cfg.token, { "Content-Type": "application/json" }),
      cache: "no-store",
      body: JSON.stringify(body)
    });
  }catch(e){ throw syncMakeError("network", e); }
  if(res.status === 401) throw syncMakeError("auth");
  if(res.status === 403) throw syncMakeError("forbidden");
  if(res.status === 409 || res.status === 422) throw syncMakeError("conflict");
  if(!res.ok) throw syncMakeError("network");
  var data = null;
  try{ data = await res.json(); }catch(e){}
  return { sha: (data && data.content) ? data.content.sha : null };
}

/* ============================================================
   ステータス表示（カード内の #syncStatus に直接反映。フル render は呼ばない）
   ============================================================ */
function syncUpdateStatusEl(text){
  syncStatusText = text;
  try{
    var el = document.getElementById("syncStatus");
    if(el) el.textContent = text;
  }catch(e){}
}

/* 編集中の入力を巻き戻さないための安全な再描画。
   #view 内の INPUT/TEXTAREA/SELECT にフォーカスがあれば、focusout まで待つ。 */
function syncIsEditableFocus(){
  try{
    var el = document.activeElement;
    if(!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    if(tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return false;
    var view = document.getElementById("view");
    return !!(view && view.contains && view.contains(el));
  }catch(e){ return false; }
}
function syncSafeRender(){
  if(syncIsEditableFocus()){
    if(!syncRenderPending){
      syncRenderPending = true;
      try{
        var view = document.getElementById("view");
        if(view && view.addEventListener){
          var handler = function(){
            view.removeEventListener("focusout", handler);
            syncRenderPending = false;
            render();
          };
          view.addEventListener("focusout", handler);
        }else{
          syncRenderPending = false;
        }
      }catch(e){ syncRenderPending = false; }
    }
    return;
  }
  try{ render(); }catch(e){}
}

/* ============================================================
   同期本体
   ============================================================ */
function syncDelay(ms){
  return new Promise(function(resolve){ setTimeout(resolve, ms); });
}

async function syncAttempt(cfg){
  var pulled = await syncPull(cfg);
  var remote = pulled.remote, sha = pulled.sha;

  var localSnapshot = { sessions: state.sessions, gear: state.gear };
  var merged = mergeState(localSnapshot, remote || { sessions: {}, gear: undefined });

  var localKey = stableKey(localSnapshot);
  var mergedKey = stableKey(merged);
  if(mergedKey !== localKey){
    state.sessions = merged.sessions;
    state.gear = merged.gear;
    saveLocal();
    syncSafeRender();
  }

  var remoteForCompare = { sessions: (remote && remote.sessions) || {}, gear: remote && remote.gear };
  var remoteKey = stableKey(remoteForCompare);
  if(mergedKey !== remoteKey){
    var payload = { app: "trainlog", format: 1, savedAt: new Date().toISOString(), sessions: merged.sessions, gear: merged.gear };
    await syncPush(cfg, payload, sha);
  }

  syncOnSuccess();
}

function syncOnSuccess(){
  var hhmm = new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  try{ localStorage.setItem(SYNC_LAST_KEY, String(Date.now())); }catch(e){}
  syncUpdateStatusEl("GitHubと同期しました（" + hhmm + "）");
  setStatus("この端末とGitHubに保存しています（同期 " + hhmm + "）");
}
function syncReportError(err){
  syncUpdateStatusEl((err && err.message) || syncErrorMessage("network"));
}

async function syncRunOnce(cfg){
  syncLastAttemptAt = Date.now();
  syncUpdateStatusEl(syncErrorMessage("progress"));
  var lastErr = null;
  for(var attempt = 0; attempt < 3; attempt++){
    if(attempt > 0) await syncDelay(SYNC_BACKOFF_MS[attempt - 1]);
    try{
      await syncAttempt(cfg);
      return;
    }catch(e){
      lastErr = e;
      if(!e || e.syncKind !== "conflict") break;
    }
  }
  syncReportError(lastErr);
}

/* 二重起動防止：実行中なら「終わったらもう一回」の印だけ残す */
async function syncNow(){
  var cfg = syncLoadConfig();
  if(!cfg) return;
  if(syncRunning){ syncRerunRequested = true; return; }
  syncRunning = true;
  try{
    await syncRunOnce(cfg);
  }finally{
    syncRunning = false;
    if(syncRerunRequested){
      syncRerunRequested = false;
      syncNow();
    }
  }
}

/* ============================================================
   デバウンス起動・定期実行
   ============================================================ */
function syncSchedule(){
  var cfg = syncLoadConfig();
  if(!cfg) return;
  if(syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(function(){
    syncDebounceTimer = null;
    syncNow();
  }, SYNC_TUNE.debounce);
}
function syncFlushPending(){
  if(syncDebounceTimer){
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
    syncNow();
  }
}

function syncInit(){
  var cfg = syncLoadConfig();
  if(cfg) syncNow();

  try{
    document.addEventListener("visibilitychange", function(){
      if(!document.hidden){
        var now = Date.now();
        if(now - syncLastAttemptAt >= SYNC_TUNE.visThrottle) syncNow();
      }else{
        syncFlushPending();
      }
    });
  }catch(e){}
  try{ window.addEventListener("online", function(){ syncNow(); }); }catch(e){}
  try{ window.addEventListener("pagehide", function(){ syncFlushPending(); }); }catch(e){}
  try{
    syncIntervalHandle = setInterval(function(){
      if(!document.hidden) syncNow();
    }, SYNC_TUNE.interval);
  }catch(e){}
}

/* ============================================================
   接続・解除
   ============================================================ */
async function syncConnect(repoRaw, tokenRaw){
  var repo = String(repoRaw || "").trim();
  var token = String(tokenRaw || "").trim();
  if(!repo || !token){ syncUpdateStatusEl(syncErrorMessage("needrepo")); return false; }
  if(!SYNC_REPO_RE.test(repo)){ syncUpdateStatusEl(syncErrorMessage("badrepo")); return false; }

  syncUpdateStatusEl(syncErrorMessage("progress"));
  try{
    await syncCheckRepo(repo, token);
  }catch(e){
    syncUpdateStatusEl((e && e.message) || syncErrorMessage("network"));
    return false;
  }

  syncSaveConfig({ repo: repo, token: token });
  syncUpdateStatusEl("");
  render();
  await syncNow();
  return true;
}
function syncDisconnect(){
  var ok = true;
  try{ ok = confirm("同期を解除しますか？記録はこの端末には残ります。"); }catch(e){ ok = true; }
  if(!ok) return;
  syncClearConfig();
  syncStatusText = "";
  render();
}

/* ============================================================
   UI（履歴タブに置くカード）
   ============================================================ */
function syncEsc(s){
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* GitHub の作成画面を、名前・公開範囲・権限を入れた状態で開くリンク（GitHub公式のURLパラメータ） */
var SYNC_REPO_NAME = "training-log-data";
function syncNewRepoUrl(){
  return "https://github.com/new?name=" + SYNC_REPO_NAME + "&visibility=private";
}
function syncNewTokenUrl(){
  /* 鍵の名前は重複できないので、作った日時を付けて端末ごとに別の名前にする */
  var d = new Date(), p = function(n){ return String(n).padStart(2, "0"); };
  var name = "trainlog-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  return "https://github.com/settings/personal-access-tokens/new?name=" + name
    + "&description=" + encodeURIComponent("トレーニング記録アプリの同期用")
    + "&expires_in=none&contents=write";
}

function syncCard(){
  var cfg = syncLoadConfig();
  if(!cfg){
    return `<h3 class="sec">スマホとPCで記録を共有</h3>
    <div class="card">
      <p class="lastline" style="margin-top:0">GitHubの非公開リポジトリを介して、この記録をスマホとPCの両方から使えるようにします。</p>
      <details>
        <summary>はじめての設定（5分ほど）</summary>
        <ol class="steps">
          <li><a href="${syncNewRepoUrl()}" target="_blank" rel="noopener">リポジトリ作成画面を開く</a>。名前（${SYNC_REPO_NAME}）と「Private」は入力済み。「Add README」をオンにして「Create repository」を押す。</li>
          <li><a href="${syncNewTokenUrl()}" target="_blank" rel="noopener">鍵の作成画面を開く</a>。名前・期限なし・Contents の書き込み権限は入力済み。Repository access で「Only select repositories」を選び、${SYNC_REPO_NAME} を選んでから、一番下の「Generate token」を押す。</li>
          <li>表示された鍵（github_pat_ で始まる文字列）をコピーする。この画面を閉じると二度と表示されない。</li>
          <li>下の欄に「GitHubのユーザー名/${SYNC_REPO_NAME}」と鍵を入れて「接続」を押す。</li>
          <li>スマホでも、ホーム画面に追加したアプリを開いて同じ欄に同じ2つを入れる（Safariで開いた画面とは別扱いになる）。</li>
        </ol>
        <p class="lastline">鍵はこの端末のブラウザの中にだけ保存し、GitHub以外には送りません。記録はそのリポジトリの trainlog.json に保存されます。鍵が要らなくなったら、GitHubの Settings → Developer settings → Fine-grained tokens から削除できます。</p>
      </details>
      <div class="fld" style="margin-top:12px"><label>リポジトリ（ユーザー名/リポジトリ名）</label>
        <input type="text" id="syncRepo" placeholder="ユーザー名/training-log-data" style="width:100%"></div>
      <div class="fld" style="margin-top:8px"><label>鍵</label>
        <input type="password" id="syncToken" autocomplete="off" placeholder="github_pat_..." style="width:100%"></div>
      <div class="rowbtns"><button data-sync="connect">接続</button></div>
      <p class="lastline" id="syncStatus">${syncEsc(syncStatusText)}</p>
    </div>`;
  }
  var last = syncLastDisplay();
  return `<h3 class="sec">スマホとPCで記録を共有</h3>
    <div class="card">
      <h4>接続中: ${syncEsc(cfg.repo)}</h4>
      <p class="lastline" style="margin-top:0">${last ? "最終同期 " + last : "まだ同期していません"}</p>
      <div class="rowbtns">
        <button data-sync="now">今すぐ同期</button>
        <button data-sync="disconnect">接続を解除</button>
      </div>
      <p class="lastline" id="syncStatus">${syncEsc(syncStatusText)}</p>
    </div>`;
}

function syncWire(root){
  if(!root || !root.querySelector) return;
  var connectBtn = root.querySelector('[data-sync="connect"]');
  if(connectBtn){
    connectBtn.onclick = function(){
      var repoEl = root.querySelector("#syncRepo");
      var tokenEl = root.querySelector("#syncToken");
      syncConnect(repoEl ? repoEl.value : "", tokenEl ? tokenEl.value : "");
    };
  }
  var nowBtn = root.querySelector('[data-sync="now"]');
  if(nowBtn) nowBtn.onclick = function(){ syncNow(); };
  var discBtn = root.querySelector('[data-sync="disconnect"]');
  if(discBtn) discBtn.onclick = function(){ syncDisconnect(); };
}
