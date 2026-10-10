/* ---------- テーマ ---------- */
/* ---- 新しい版への切り替え（再読み込み）を後回しにする判定 ----
   入力欄・メモ欄にフォーカスがある間、または休憩タイマーが動いている間は、
   Service Worker が新しい版を取り込んだときの自動の再読み込みを後回しにする。休憩中に
   打ちかけた数字やメモの入力が、気づかないうちの再読み込みで消えないようにするため。
   後回しにした条件が外れたとき・画面が隠れたときに、保存待ちのメモを確定させてから行う。
   休憩タイマー（restIv。src/app/timer.js）はそちらを直接編集せず、外に出ている変数を読むだけ */
function swBusyEditing(){
  try{
    const el = document.activeElement;
    if(!el) return false;
    const tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }catch(e){ return false; }
}
function swBusyResting(){
  try{ return !!restIv; }catch(e){ return false; }
}
function swReloadBlocked(){
  return swBusyEditing() || swBusyResting();
}
/* 保存待ちのメモ（今日のメモ #note・履歴の編集シートのメモ #hnote）があれば確定して保存する。
   どちらも入力から600ms後に保存する作り（src/app/events.js・src/app/view-hist.js）なので、
   その手前で再読み込みされると、打ちかけの文字が保存されないまま消えてしまう。
   #hnote は「閉じる」で sheet.classList を外すだけで中身（innerHTML）は残るため、閉じたあとも
   古い値のまま要素が残る。sheet が開いている（表示中の）ときだけ確定させる — そうしないと、
   閉じたシートの古い値で、あとから同期で届いた新しいメモを上書きしてしまう */
function swFlushPendingNotes(){
  let dirty = false;
  try{
    const note = document.getElementById("note");
    if(note && typeof session === "function" && typeof TODAY !== "undefined"){
      const s = session(TODAY);
      if((s.note || "") !== note.value){
        s.note = note.value;
        s.noteAt = typeof stampNow === "function" ? stampNow() : Date.now();
        persistSession(TODAY);
        dirty = true;
      }
    }
  }catch(e){}
  try{
    const sheetOpen = typeof sheet !== "undefined" && sheet && sheet.classList && sheet.classList.contains("on");
    const hnote = sheetOpen ? document.getElementById("hnote") : null;
    if(hnote && typeof session === "function"){
      const marker = document.querySelector("[data-histday]");
      const date = marker && marker.dataset ? marker.dataset.histday : null;
      if(date){
        const sx = session(date);
        if((sx.note || "") !== hnote.value){
          sx.note = hnote.value;
          sx.noteAt = typeof stampNow === "function" ? stampNow() : Date.now();
          persistSession(date);
          dirty = true;
        }
      }
    }
  }catch(e){}
  try{
    if(dirty && typeof syncNow === "function") syncNow();             /* 同期: メモを確定させたとき */
    else if(typeof syncFlushPending === "function") syncFlushPending(); /* 何も無くても、他の変更が同期待ちなら送る */
  }catch(e){}
}
/* 後回しにする条件が外れる（フォーカスが外れる・休憩が終わる）か、画面が隠れたときに
   保存してから fn を1回呼ぶ。条件が最初から外れていれば、保存だけしてすぐ呼ぶ */
function swWhenReady(fn){
  const go = ()=>{ swFlushPendingNotes(); fn(); };
  if(!swReloadBlocked()){ go(); return; }
  let done = false;
  const finish = ()=>{
    if(done) return;
    done = true;
    try{ document.removeEventListener("focusout", onClear, true); }catch(e){}
    try{ document.removeEventListener("visibilitychange", onHidden); }catch(e){}
    clearInterval(poll);
    go();
  };
  const onClear = ()=> setTimeout(()=>{ if(!swReloadBlocked()) finish(); }, 0);
  const onHidden = ()=>{ if(document.hidden) finish(); };
  try{ document.addEventListener("focusout", onClear, true); }catch(e){}
  try{ document.addEventListener("visibilitychange", onHidden); }catch(e){}
  /* 休憩タイマーはイベントを出さないので、念のためポーリングでも確かめる */
  const poll = setInterval(()=>{ if(!swReloadBlocked()) finish(); }, 1000);
}

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
    if(typeof swFlushPendingNotes === "function") swFlushPendingNotes();   /* 保存待ちのメモを先に保存する */
    if(!window.__swReloaded){ window.__swReloaded = true; setTimeout(()=> location.reload(), 200); }
  }catch(e){
    back("更新", "更新を確認できませんでした。通信を確かめてもう一度押してください");
  }
};

/* アドレスバーの色（<meta name="theme-color">）を、今のテーマに合わせる。
   自動（テーマを固定していない）ときは、ライト/ダークそれぞれの media 付きタグが
   OSの設定に追従するのでそのまま。「表示」ボタンで固定したときは、両方のタグの中身を
   固定した側の色に揃える（どちらの media に一致してもその色になる） */
function applyThemeColorMeta(){
  try{
    const forced = document.documentElement.getAttribute("data-theme");
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if(!metas.length) return;
    if(forced === "dark" || forced === "light"){
      const c = forced === "dark" ? "#13171B" : "#EFEFE9";
      metas.forEach(m=> m.setAttribute("content", c));
    }else{
      const defaults = {"(prefers-color-scheme: light)":"#EFEFE9", "(prefers-color-scheme: dark)":"#13171B"};
      metas.forEach(m=>{
        const key = m.getAttribute("media");
        if(key && defaults[key]) m.setAttribute("content", defaults[key]);
      });
    }
  }catch(e){}
}
const themeBtn = document.getElementById("themeBtn");
(function(){
  let t = null;
  try{ t = localStorage.getItem("trainlog.theme"); }catch(e){}
  if(t) document.documentElement.setAttribute("data-theme", t);
  applyThemeColorMeta();
  themeBtn.onclick = ()=>{
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur==="dark" ? "light" : (cur==="light" ? "" : "dark");
    if(next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    try{ next ? localStorage.setItem("trainlog.theme", next) : localStorage.removeItem("trainlog.theme"); }catch(e){}
    applyThemeColorMeta();
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
/* メニューに入れない種目（押して切り替える。色の付いた種目は入らない: 筋肉痛の部位のシートと同じ向き）。判定と保存は rules.js の exOn・setExOn */
function exOffBody(){
  const order = EX.slice().sort((a, b) => PATTERN_ORDER.indexOf(patternOf(a.id)) - PATTERN_ORDER.indexOf(patternOf(b.id)));
  return `<p class="lastline" style="margin-top:0">やりたくない種目を押して選んでください。選んだ種目は、${EX_OFF_NOTE}</p>
    <div class="sorechips">${order.map(e => `<button class="sorechip${exOn(e.id) ? "" : " on"}" data-act="exoff" data-ex="${e.id}" aria-pressed="${!exOn(e.id)}">${esc(e.name)}</button>`).join("")}</div>`;
}
/* 提案タブの「目標の上げ方」「メニューの組み方」（rules.js の state.tune と exOff）。
   2026-10-11 本人の要望で、設定のシートから提案タブへ移した（設定のシートに残すのは、道具・1日の区切り・休憩の合図・同期・バックアップ）。
   値はどれも rules.js の関数（progNeed・progGain・progJump・progFirst・pairOn・recoverGap・patPref・exOn）から読む。
   長い一覧は畳んでおく（開いたかどうかは、描き直しても保つ） */
const PROG_HEAD = "目標の上げ方", MENU_HEAD = "メニューの組み方", PREF_HEAD = "種目を入れる頻度";
const tuneOpen = {gap: false, pref: false, off: false};
function tuneSel(key, cur, opts){
  return `<select data-tune="${key}">${opts.map(o => `<option value="${o[0]}"${String(o[0]) === String(cur) ? " selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
}
function progCard(){
  const step = progGain("w"), jump = progJump(), first = progFirst();
  const jumpNote = !jump ? "" : (step ? "回数が範囲の上限に届いたら重くして、回数は範囲の下限から始め直します。" : "目標に届いたら重くします。回数は変えません。")
                 + (jump === 2 ? "2段では重すぎるときは、一段だけ重くします。" : "");
  /* 重くしないときは、やり方を「重くする前に」「重くできないときに」で分ける意味が無いので、進むか変えないかだけを出す */
  const ways = jump ? [["keep", "進まない"], ["heavier", "重くできなくなったら進む"], ["harder", "重くする前に進む"]]
                    : [["keep", "進まない"], [first === "harder" ? "harder" : "heavier", "進む"]];
  return `<h3 class="sec">${PROG_HEAD}</h3>
  <div class="card">
    <p class="lastline" style="margin-top:0">全部のセットで目標に届いたあと、次の目標をどう上げるかを選べます。</p>
    <div class="fld tunefld"><label>上げるタイミング</label>
      ${tuneSel("need", progNeed(), [[1, "目標に届いたら、次の回から上げる"], [2, "2回続けて届いたら上げる"], [3, "3回続けて届いたら上げる"]])}</div>
    <div class="fld tunefld"><label>回数</label>
      ${tuneSel("step", step, [[0, "増やさない"], [1, "1回ずつ増やす（秒の種目は5秒ずつ）"], [2, "2回ずつ増やす（秒の種目は10秒ずつ）"], [3, "3回ずつ増やす（秒の種目は15秒ずつ）"]])}</div>
    <div class="fld tunefld"><label>ダンベルの重さ</label>
      ${tuneSel("jump", jump, [[0, "重くしない"], [1, "一段ずつ重くする"], [2, "2段ずつ重くする"]])}
      ${jumpNote ? `<p class="lastline" data-jumpnote="1" style="margin:4px 0 0">${jumpNote}</p>` : ""}</div>
    <div class="fld tunefld"><label>同じ動きの、一段難しいやり方へ</label>
      ${tuneSel("first", first, ways)}</div>
    ${tuneIsDefault("prog") ? "" : `<div class="rowbtns"><button data-act="tunereset" data-part="prog">初めの設定に戻す</button></div>`}
  </div>`;
}
function menuCard(){
  const gapRows = Object.keys(MUSCLES).map(m => {
    const d = recoverGapDefault(m), opts = [];
    for(let g = 0; g <= RECOVER_GAP_MAX; g++) opts.push([g, recoverGapLabel(g)]);
    return `<div class="tunerow"><span>${esc(MUSCLES[m])}${recoverGap(m) !== d ? `<small data-gapwas="${m}">初めの設定は「${esc(recoverGapLabel(d))}」</small>` : ""}</span>${tuneSel("gap:" + m, recoverGap(m), opts)}</div>`;
  }).join("");
  const prefRows = PATTERN_ORDER.map(pat => {
    const names = EX.filter(e => !e.base && patternOf(e.id) === pat).map(e => e.name);
    if(!names.length) return "";
    return `<div class="tunerow"><span>${esc(names.join("・"))}</span>${tuneSel("pref:" + pat, patPref(pat), [[1, EX_PREF_LABEL["1"]], [0, EX_PREF_LABEL["0"]], [-1, EX_PREF_LABEL["-1"]]])}</div>`;
  }).join("");
  const nOff = EX.filter(e => !exOn(e.id)).length;
  const changed = ["pref", "gap", "pair"].some(k => !tuneIsDefault(k));
  return `<h3 class="sec">${MENU_HEAD}</h3>
  <div class="card">
    <div class="fld tunefld" style="margin-top:0"><label>反対の部位（胸と背中、上腕二頭筋と上腕三頭筋など）</label>
      ${tuneSel("pair", pairOn() ? 1 : 0, [[1, "同じ日に入れて、続けて並べる"], [0, "組み合わせない"]])}</div>
    <details class="tune" data-tune-d="gap"${tuneOpen.gap ? " open" : ""}><summary>部位ごとの回復の日数</summary>
      <p class="lastline" style="margin-top:0">${esc(RECOVER_NOTE)}。</p>
      ${gapRows}
    </details>
    <details class="tune" data-tune-d="pref"${tuneOpen.pref ? " open" : ""}><summary>${PREF_HEAD}</summary>
      <p class="lastline" style="margin-top:0">「${EX_PREF_LABEL["1"]}」にした種目は、入れられる日には優先して入れます。「${EX_PREF_LABEL["-1"]}」にした種目は、メインで鍛える部位の量が足りていないときだけ入れます。</p>
      ${prefRows}
    </details>
    <details class="tune" data-tune-d="off"${tuneOpen.off ? " open" : ""}><summary>${EX_OFF_HEAD}${nOff ? "（" + nOff + "種目）" : ""}</summary>
      ${exOffBody()}
    </details>
    ${changed ? `<div class="rowbtns"><button data-act="tunereset" data-part="menu">初めの設定に戻す</button></div>` : ""}
  </div>`;
}
/* 決まりを変えたあと: メニューにかかわる変更で、今日のメニューがもう決まっていれば組み直す（記録した種目・自分で追加した種目は残る） */
function tuneApplied(menu, msg){
  planMemo = null; resetProg();
  const s = state.sessions[TODAY];
  if(menu && s && s.plan) replanToday(); else render();
  setStatus(msg);
}
function wireTune(root){
  root.querySelectorAll("details[data-tune-d]").forEach(d => { d.ontoggle = () => { tuneOpen[d.dataset.tuneD] = d.open; }; });
  root.querySelectorAll("select[data-tune]").forEach(el => {
    el.onchange = () => {
      const k = el.dataset.tune, v = el.value, at = k.indexOf(":"), kind = at < 0 ? k : k.slice(0, at), id = at < 0 ? "" : k.slice(at + 1);
      if(kind === "pair"){
        setTune("pair", v === "0" ? {off: true} : {});
        tuneApplied(true, v === "0" ? "反対の部位を組み合わせないようにしました" : "反対の部位を同じ日に入れるようにしました");
      }else if(kind === "step"){
        setProg("step", +v);
        tuneApplied(false, progGain("w") ? "回数を" + progGain("w") + "回ずつ増やすようにしました" : "回数を増やさないようにしました");
      }else if(kind === "need"){
        setProg("need", +v);
        tuneApplied(false, progNeed() > 1 ? progNeed() + "回続けて届いたら上げるようにしました" : "目標に届いたら、次の回から上げるようにしました");
      }else if(kind === "jump"){
        setProg("jump", +v);
        tuneApplied(false, !progJump() ? "ダンベルを重くしないようにしました" : progJump() === 2 ? "ダンベルを2段ずつ重くするようにしました" : "ダンベルを一段ずつ重くするようにしました");
      }else if(kind === "first"){
        setProg("first", v);
        tuneApplied(false, progFirst() === "keep" ? "難しいやり方へ進まないようにしました" : !progJump() ? "一段難しいやり方へ進むようにしました"
          : progFirst() === "harder" ? "重くする前に、難しいやり方へ進むようにしました" : "重くできなくなったら、難しいやり方へ進むようにしました");
      }else if(kind === "gap" && MUSCLES[id]){
        setRecoverGap(id, +v);
        tuneApplied(true, MUSCLES[id] + "の回復の日数を「" + recoverGapLabel(recoverGap(id)) + "」にしました");
      }else if(kind === "pref" && PATTERN_ORDER.includes(id)){
        setPatPref(id, +v);
        tuneApplied(true, "入れる頻度を「" + EX_PREF_LABEL[String(patPref(id))] + "」にしました");
      }
    };
  });
}
WIRES.push(wireTune);
/* 「目標の上げ方」だけ・「メニューの組み方」だけを初めの設定に戻す（メニューに入れない種目は戻さない） */
ACTIONS.tunereset = el => {
  const prog = el && el.dataset.part === "prog";
  if(prog) setTune("prog", {});
  else{ setTune("pref", {map: {}}); setTune("gap", {map: {}}); setTune("pair", {}); }
  tuneApplied(!prog, "「" + (prog ? PROG_HEAD : MENU_HEAD) + "」を初めの設定に戻しました");
};
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
  if(typeof wireGearCard === "function") wireGearCard(sheetInner);
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
