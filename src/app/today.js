/* 端末に保存できなかったとき（store-local.js の saveLocal から呼ばれる） */
let storeFailMsg = "";
function onStoreFail(msg){ storeFailMsg = msg || "保存できませんでした"; }
/* セットを消した直後の「取り消す」（5秒） */
let undoDel = null;
/* 最後にボタンの下へ出した一言（画面下の状態表示にも出すため。描き直すと todayMsg は空になる） */
let shownMsg = "";

/* 保存データまわりの知らせ（読めなかった・保存できなかった） */
function storeBanners(){
  let out = "";
  if(typeof STORE_PROBLEM !== "undefined" && STORE_PROBLEM){
    const canSync = typeof syncLoadConfig === "function" && !!syncLoadConfig();
    const baks = typeof listBackups === "function" ? listBackups() : [];
    out += `<div class="banner"><b>この端末の保存データを読めなかったので、空の状態で開きました。</b>
      元のデータは消さずに残しています${STORE_PROBLEM.savedAs ? "（" + esc(STORE_PROBLEM.savedAs) + "）" : ""}。
      ${canSync ? "GitHub に同期していた記録は、下のボタンで取り直せます。" : ""}${baks.length ? "端末の控えからも戻せます。" : ""}
      <div class="rowbtns">
        ${canSync ? `<button data-act="refetchall">GitHubから全部取り直す</button>` : ""}
        ${baks.map(b => `<button data-act="restorebak" data-key="${esc(b.key)}">控え（${b.day ? esc(fmtDate(b.day)) : "以前の版"}・${b.days}日分）から戻す</button>`).join("")}
        <button data-act="dismissproblem">閉じる</button>
      </div></div>`;
  }
  if(storeFailMsg){
    out += `<div class="banner"><b>記録をこの端末に保存できませんでした。</b>${esc(storeFailMsg)}。このまま閉じると、保存できなかった記録は消えます。バックアップを保存してから、ブラウザの保存領域を空けてください。
      <div class="rowbtns"><button data-act="backup">バックアップを保存</button><button data-act="dismissfail">閉じる</button></div></div>`;
  }
  return out;
}
ACTIONS.refetchall = () => {
  if(typeof syncRefetchAll !== "function") return;
  if(!confirm("GitHub から全部の月を読み直して、この端末の記録とまとめます。よろしいですか？")) return;
  if(typeof STORE_PROBLEM !== "undefined") STORE_PROBLEM = null;
  syncRefetchAll();
  render();
};
ACTIONS.dismissproblem = () => { STORE_PROBLEM = null; render(); };
ACTIONS.dismissfail = () => { storeFailMsg = ""; render(); };

/* 今日の進み具合（終えた種目の数と、残りのおよその時間）。メニューがある日だけ出す（2026-10-11 本人の要望） */
function dayProgress(items){
  if(!items.length) return "";
  const done = items.filter(it => isDoneToday(it.ex)).length;
  const left = items.reduce((a, it) => {
    const e = entryFor(TODAY, it.ex, false), n = e ? e.sets.length : 0, t = setsOf(it);
    return a + (n >= t ? 0 : itemMinutes(it) * (t - n) / t);
  }, 0);
  return `<div class="dayprog" data-dayprog="1"><span>今日 <b class="num">${done} / ${items.length}</b> 種目</span>
    <span>${done >= items.length ? "" : "残り 約" + Math.max(1, Math.round(left)) + "分"}</span>
    <i><i style="width:${Math.round(done / items.length * 100)}%"></i></i></div>`;
}
/* 「次の種目」のカードの「この内容で記録」。種目のカードを開いてから、そのカードの「記録」と同じ処理（addSet）で入れる。
   押した直後はカードが開いて行の位置が変わるので、同じ場所を続けて押しても種目の見出し（開け閉め）が反応しないようにする */
let heroRecAt = 0;
ACTIONS.herorec = el => {
  openEx = el.dataset.ex; editEx = null;
  render();
  addSet(el.dataset.ex);
  heroRecAt = Date.now();
};
function viewToday(){
  const all = todayItems(), items = all.filter(it => !it.skip), skipped = all.filter(it => it.skip);
  const s = session(TODAY);
  /* 開いていた種目がメニューから無くなったら（同期でメニューが替わった、など）閉じる */
  if(openEx && !items.some(it => it.ex === openEx)) openEx = null;
  if(editEx && !items.some(it => it.ex === editEx)) editEx = null;
  const menuNote = Date.now() < menuSyncedUntil
    ? `<div class="flash">ほかの端末の変更を取り込み、今日のメニューが変わりました。</div>` : "";
  const msg = todayMsg; todayMsg = "";          /* 一度出したら消す */
  if(msg) shownMsg = msg;

  let next = null;
  for(const it of items){
    const e = entryFor(TODAY, it.ex, false);
    if(!e || e.sets.length < setsOf(it)){ next = it; break; }
  }
  const dl = deloadAdvice();

  let hero;
  if(!items.length){
    hero = `<div class="hero"><p class="kicker">今日のメニュー</p><h2>今日は休み</h2>
      <p class="sub">${esc(restText())}</p></div>`;
  }else if(!next){
    const total = s.entries.reduce((a,e)=>a+e.sets.length,0);
    hero = `<div class="hero"><p class="kicker">今日のメニュー</p><h2>完了</h2>
      <div class="bigset"><span class="v num" style="color:var(--done)">${total}</span><span class="u">セット</span></div>
      <p class="sub">お疲れさまでした。直したい記録は、各種目の「修正」から消せます。</p></div>`;
  }else if(openEx){
    /* 種目カードを開いている間は、カードと同じ内容になるので1行に縮める */
    hero = `<div class="hero compact"><p class="kicker">次の種目</p><h2>${esc(itemName(next))}</h2></div>`;
  }else{
    const ex = EXMAP[next.ex];
    const e = entryFor(TODAY, next.ex, false);
    const sug = suggestNext(next, e);
    const inner = ex.kind==="w"
      ? `<div class="bigset"><span class="v num">${wShown(next, sug.w)}</span><span class="x num">×</span><span class="v num">${sug.r}</span><span class="u">${perArm(next.ex) ? "kg（片手）・回" : "kg・回"}${next.side?"・左右":""}</span></div>`
      : `<div class="bigset"><span class="v num">${sug.r}</span><span class="u">${ex.kind==="t"?"秒":"回"}${next.side?"・左右":""}</span></div>`;
    /* このカードからそのまま記録できる（2026-10-11 本人の要望。押すと下の種目のカードが開き、この目標で1セット入る） */
    hero = `<div class="hero"><p class="kicker">次の種目</p>
      <h2>${esc(itemName(next))}</h2>${inner}
      <div class="herorec"><button class="addbtn" data-act="herorec" data-ex="${next.ex}">この内容で記録</button></div>
      ${sug.opt ? `<p class="sub">${esc(sug.opt.text)}</p>` : ""}
      <p class="sub">${esc(sug.src)}${sug.why ? "　→　" + esc(sug.why) : ""}</p>
      ${dl && dl.active ? `<p class="sub">軽めの週（${esc(fmtDate(dl.until))}まで）: 1回の種目を3つまでにしています。</p>` : ""}
      ${items.filter(i => !i.extra).length < 3 && !skipped.length ? `<p class="sub">${esc(fewItemsText())}</p>` : ""}</div>`;
  }

  const undo = undoDel && Date.now() < undoDel.until
    ? `<div class="flash">「${esc(undoDel.name)}」のセットを消しました。<div class="rowbtns"><button data-act="undodel">取り消す</button></div></div>` : "";
  const deloadAsk = dl && dl.suggest
    ? `<div class="flash">同じ重さで回数が続けて減っている動きがあります。今週を軽めの週（1回3種目まで）にすると、疲れが抜けて、また伸びやすくなります。
        <div class="rowbtns"><button data-act="deloadon">今週を軽めの週にする</button><button data-act="gotab" data-tab="plan">理由を見る</button></div></div>` : "";
  const rows = items.map(it=>exRow(it, items.length > 1)).join("");
  const skippedLine = skipped.length
    ? `<p class="skipped">今日は外した: ${skipped.map(it => esc(itemName(it)) + `<button data-act="unskip" data-ex="${it.ex}">戻す</button>`).join("　")}</p>` : "";
  const sore = soreToday();
  const soreLine = sore.length ? `<p class="skipped">筋肉痛: ${sore.map(m => MUSCLES[m]).join("・")}（今日はメインで鍛えません）</p>` : "";
  /* 回復の途中の部位があるのに、メニュー作りが入れた種目（7日使えていない部位のため）。種目カードの「今日の調整」と同じ
     restIncluded・restIncludedText から出す（カードを開かなくても、入れたことと理由が分かるように: 2026-10-05 本人の要望） */
  const includedLine = items.map(it => ({it, r: restIncluded(it)})).filter(x => x.r)
    .map(x => `<p class="skipped">${esc(itemName(x.it))}: ${esc(restIncludedText(x.r))}</p>`).join("");
  /* 反対の部位どうしで隣に並んだ種目（rules.js の menuPairs）。両方終わった組は出さない */
  const pairLine = menuPairs(items).filter(p => !p.every(it => isDoneToday(it.ex)))
    .map(p => `<p class="skipped">${esc(itemName(p[0]))}と${esc(itemName(p[1]))}: 反対の部位を使う種目です。1セットずつ交互に行えます。</p>`).join("");
  return storeBanners() + menuNote + deloadAsk + dayProgress(items) + hero + undo + rows + includedLine + pairLine + skippedLine + soreLine + dailyPickCard() + `
    <div class="rowbtns"><button data-act="addauto">おまかせで1種目追加</button><button data-act="addex">種目を選んで追加</button><button data-act="replan">メニューを組み直す</button><button data-act="replanshort">20分で組み直す</button><button data-act="sore">筋肉痛の部位</button></div>
    ${msg ? `<p class="lastline flash">${esc(msg)}</p>` : ""}
    <h3 class="sec">今日のメモ</h3>
    <div class="card">
      <textarea id="note" placeholder="睡眠・体調・気づいたことなど">${esc(s.note||"")}</textarea>
    </div>
    ${typeof backupReminder === "function" ? backupReminder() : ""}
    <p class="lastline" style="text-align:center;margin-top:18px">バージョン ${esc(BUILD_VERSION)}</p>`;
}

/* 毎日やってよい種目（メインで鍛える部位の回復の日数がどれも0: rules.js の recoverGap）から、今日やるものを選ぶ欄。
   押すと今日のメニューに入り、もう一度押すと外れる（2026-10-25 本人の要望）。記録した種目は外せない。
   2日続けてメインで鍛えた部位の種目には「3日目」と添える（メニュー作りは入れない: planner.js の "run"） */
function dailyPickList(){
  return EX.filter(e => !e.base && exOn(e.id) && e.p.length && e.p.every(m => recoverGap(m) === 0));
}
function dailyPickCard(){
  const list = dailyPickList();
  if(!list.length) return "";
  const parts = [];
  list.forEach(e => e.p.forEach(m => { if(!parts.includes(MUSCLES[m])) parts.push(MUSCLES[m]); }));
  const chips = list.map(e => {
    const on = menuState(e.id) === "in", en = entryFor(TODAY, e.id, false), n = en ? en.sets.length : 0;
    const third = e.p.some(m => dailyRun(m) >= DAILY_RUN_MAX);
    return `<button class="sorechip${on ? " on" : ""}" data-act="dailypick" data-ex="${e.id}" aria-pressed="${on}">${esc(e.name)}${n ? "（記録済み）" : third ? "（3日目）" : ""}</button>`;
  }).join("");
  return `<h3 class="sec">毎日やってよい種目</h3>
    <div class="card dailypick">
      <p class="lastline" style="margin-top:0">${esc(parts.join("・"))}は、毎日鍛えてもかまいません。押すと今日のメニューに入り、もう一度押すと外れます。</p>
      <div class="sorechips">${chips}</div>
    </div>`;
}
/* 今日のカードの並べ替え（2026-10-25 本人の要望）。左端のつまみを押したまま上下に動かし、離したところに置く。
   並べた順は今日のメニューに保存し、種目ごとの位置を覚えて次からのメニューの並びにも使う（rules.js の learnOrder・orderPlan） */
function wireDrag(v){
  v.querySelectorAll(".exrow .grip").forEach(g => { g.onpointerdown = e => startDrag(e, g.closest(".exrow")); });
}
WIRES.push(wireDrag);
function startDrag(e, row){
  if(!row || e.button > 0) return;
  e.preventDefault();
  const rows = Array.from(row.parentNode.querySelectorAll(":scope > .exrow[data-row]"));
  const from = rows.indexOf(row); if(from < 0 || rows.length < 2) return;
  const gap = 10, h = row.offsetHeight + gap;
  const mids = rows.map(r => { const b = r.getBoundingClientRect(); return b.top + window.scrollY + b.height / 2; });
  const y0 = e.clientY + window.scrollY;
  let to = from, scrollIv = null, lastY = e.clientY;
  row.classList.add("dragging");
  rows.forEach(r => { if(r !== row) r.classList.add("shift"); });
  try{ row.setPointerCapture(e.pointerId); }catch(err){}
  const place = () => {
    const y = lastY + window.scrollY, dy = y - y0;
    row.style.transform = `translateY(${dy}px)`;
    const mid = mids[from] + dy;
    to = from;
    for(let i = 0; i < rows.length; i++){
      if(i < from && mid < mids[i]){ to = i; break; }
    }
    for(let i = rows.length - 1; i > from; i--){
      if(mid > mids[i]){ to = i; break; }
    }
    rows.forEach((r, i) => {
      if(r === row) return;
      const s = from < to && i > from && i <= to ? -h : from > to && i >= to && i < from ? h : 0;
      r.style.transform = s ? `translateY(${s}px)` : "";
    });
  };
  /* 画面の上下の端に近づいたら、そちらへ送る */
  const edge = () => {
    const H = window.innerHeight, d = lastY < 60 ? -12 : lastY > H - 60 ? 12 : 0;
    if(d){ window.scrollBy(0, d); place(); }
  };
  const move = ev => { lastY = ev.clientY; place(); };
  const end = () => {
    row.removeEventListener("pointermove", move);
    row.removeEventListener("pointerup", end);
    row.removeEventListener("pointercancel", end);
    clearInterval(scrollIv);
    rows.forEach(r => { r.classList.remove("shift", "dragging"); r.style.transform = ""; });
    if(to === from) return;
    const ids = rows.map(r => r.dataset.row), id = ids.splice(from, 1)[0];
    ids.splice(to, 0, id);
    /* 描き直しを待たずに、見た目の並びを先に変えておく（押した直後の描き直しは pressDone まで待たされる） */
    if(to > from) rows[to].after(row); else rows[to].before(row);
    reorderToday(ids);
  };
  row.addEventListener("pointermove", move);
  row.addEventListener("pointerup", end);
  row.addEventListener("pointercancel", end);
  scrollIv = setInterval(edge, 30);
}
/* 今日やる種目を ids の順に並べ替える。外した種目は最後のまま。メニューに無い記録の種目は、メニュー外の行として入れる */
function reorderToday(ids){
  if(rollDay()){ render(); setStatus("日付が変わったので、今日のメニューに切り替えました"); return; }
  const s = session(TODAY);
  fixPlan(s);
  if(!s.plan) s.plan = [];
  ids.forEach(id => { if(!s.plan.some(x => x.ex === id)) s.plan.push({ex: id, label: (itemOf(id) || {}).label || "", extra: true}); });
  const rows = ids.map(id => s.plan.find(x => x.ex === id));
  s.plan = rows.concat(s.plan.filter(x => !ids.includes(x.ex)));
  s.planAt = s.planEdit = stampNow();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
  learnOrder(ids);
  planMemo = null; resetProg();
  todayMsg = "並びを変えました。次からのメニューも、この並びに近づけます";
  render();
}
