
/* ============================================================
   日付など
   ============================================================ */
/* 1日の区切りの時刻（0〜6時。既定は朝4時）。夜中の0時をまたいでも、この時刻までは前の日のトレーニングとして扱う。
   設定はこの端末だけ（設定タブで変えられる）。prefs.js より前に読まれるので localStorage を直接読む */
const DAY_START_DEFAULT = 4;
function dayStartHour(){
  try{
    const v = JSON.parse(localStorage.getItem("trainlog.dayStart"));
    if(typeof v === "number" && v >= 0 && v <= 6) return v;
  }catch(e){}
  return DAY_START_DEFAULT;
}
function todayKey(){
  const d = new Date(Date.now() - dayStartHour() * 3600000);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function fmtDate(k){
  const [y,m,d] = k.split("-").map(Number);
  const wd = ["日","月","火","水","木","金","土"][new Date(y,m-1,d).getDay()];
  return m+"月"+d+"日("+wd+")";
}
function asDate(k){ const [y,m,d] = k.split("-").map(Number); return new Date(y, m-1, d); }
function daysAgo(k){
  return Math.round((asDate(todayKey()) - asDate(k)) / 86400000);
}
/* この端末の時計に、GitHub同期で見積もったずれ（サーバー時刻との差。sync-github.js の
   syncEstimateClockSkew が localStorage に置く）を足した「だいたい合っている」今の時刻。
   ずれの記録が無ければ Date.now() と同じ。noteAt・planAt・gear.updatedAt・削除の印など、
   端末をまたいで「後から書いたほうが勝つ」判定に使う時刻はこれを使う。
   キー名の文字列は sync-github.js 側にも直書きしてある（artifact 版など sync-github.js が
   無い版でも動くように、ここから sync-github.js への依存は作らない） */
function stampNow(){
  var skew = 0;
  try{
    var v = parseInt(localStorage.getItem("trainlog.sync.clockSkew"), 10);
    if(isFinite(v)) skew = v;
  }catch(e){}
  return Date.now() + skew;
}
/* この画面がいつ作られた版か（build.py が日時に置き換える）。
   端末に保存された古い版を見ていないか確かめるために出す */
const BUILD_VERSION = "__BUILD__";
let TODAY = todayKey();
/* アプリを開いたまま日付が変わっていたら、今日に切り替える（前日の記録はそのまま残る）。切り替えたら true */
function rollDay(){
  const k = todayKey();
  if(k === TODAY) return false;
  TODAY = k;
  openEx = null; editEx = null;
  return true;
}

function session(date){
  if(!state.sessions[date]) state.sessions[date] = { date, entries:[], note:"" };
  return state.sessions[date];
}
function sortedDates(){ return Object.keys(state.sessions).sort().reverse(); }
/* fromDaysAgo〜toDaysAgo 日前の記録（記録のある日だけ）。記録の全部を見て回らず、その日付の記録だけを引く。
   メニュー作りは1回に何百回も部位の量を数えるので、記録が増えても遅くならないようにする
   （日付のキーは YYYY-MM-DD だけ: sanitize.js が限っている。日数は daysAgo と同じく todayKey() から数える） */
function sessionsBetween(fromDaysAgo, toDaysAgo){
  const out = [], base = todayKey();
  for(let ago = fromDaysAgo; ago <= toDaysAgo; ago++){
    const s = state.sessions[addDays(base, -ago)];
    if(s) out.push(s);
  }
  return out;
}

function entryFor(date, exId, create){
  const s = session(date);
  let e = s.entries.find(x=>x.ex===exId);
  if(!e && create){ e = {ex:exId, sets:[]}; s.entries.push(e); }
  return e;
}
function lastPerformance(exId, beforeDate){
  for(const d of sortedDates()){
    if(d >= beforeDate) continue;
    const e = (state.sessions[d].entries||[]).find(x=>x.ex===exId && x.sets.length);
    if(e) return {date:d, sets:e.sets};
  }
  return null;
}
/* そのセットをどの組み方でやったか（組み方の名前。素の種目なら ""）。
   セットに書いていない古い記録は、その日のメニューにあった組み方から読む */
function setLabel(date, exId, st){
  if(st && typeof st.label === "string") return st.label;
  const s = state.sessions[date];
  const it = s && Array.isArray(s.plan) ? s.plan.find(x => x && x.ex === exId) : null;
  return (it && it.label) || "";
}
/* 組み方ごとに記録を分けるときの見出し（種目id と組み方の名前） */
function itemKey(it){ return it.ex + "|" + (it.label || ""); }
/* 一番よいセット。重さの種目は一番重いセット、同じ重さなら回数の多いほう
   （重さ×回数で比べると、軽くて回数の多いセットが重いセットより上に来てしまう） */
function bestSet(sets, kind){
  if(!sets.length) return null;
  if(kind==="w") return sets.slice().sort((a,b)=> ((b.w||0)-(a.w||0)) || ((b.r||0)-(a.r||0)))[0];
  return sets.slice().sort((a,b)=> b.r-a.r)[0];
}
function setText(st, kind){
  if(kind==="w") return st.w+" kg × "+st.r;
  if(kind==="t") return st.r+" 秒";
  return st.r+" 回";
}

