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

function viewToday(){
  const all = todayItems(), items = all.filter(it => !it.skip), skipped = all.filter(it => it.skip);
  const s = session(TODAY);
  const msg = todayMsg; todayMsg = "";          /* 一度出したら消す */
  if(msg) shownMsg = msg;

  let next = null;
  for(const it of items){
    const e = entryFor(TODAY, it.ex, false);
    if(!e || e.sets.length < (it.sets||3)){ next = it; break; }
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
    hero = `<div class="hero"><p class="kicker">次の種目</p>
      <h2>${esc(itemName(next))}</h2>${inner}
      ${sug.opt ? `<p class="sub">${esc(sug.opt.text)}</p>` : ""}
      <p class="sub">${esc(sug.src)}${sug.why ? "　→　" + esc(sug.why) : ""}</p>
      ${dl && dl.active ? `<p class="sub">軽めの週（${esc(fmtDate(dl.until))}まで）: 1回の種目を3つまでにしています。</p>` : ""}
      ${items.filter(i => !i.extra).length < 3 ? `<p class="sub">回復の途中の部位と、今週の量が足りている部位が多いため、今日は種目を少なめにしています。</p>` : ""}</div>`;
  }

  const undo = undoDel && Date.now() < undoDel.until
    ? `<div class="flash">「${esc(undoDel.name)}」のセットを消しました。<div class="rowbtns"><button data-act="undodel">取り消す</button></div></div>` : "";
  const deloadAsk = dl && dl.suggest
    ? `<div class="flash">同じ重さで回数が続けて減っている動きがあります。今週を軽めの週（1回3種目まで）にすると、疲れが抜けて、また伸びやすくなります。
        <div class="rowbtns"><button data-act="deloadon">今週を軽めの週にする</button><button data-act="gotab" data-tab="plan">理由を見る</button></div></div>` : "";
  const rows = items.map(it=>exRow(it)).join("");
  const skippedLine = skipped.length
    ? `<p class="skipped">今日は外した: ${skipped.map(it => esc(itemName(it)) + `<button data-act="unskip" data-ex="${it.ex}">戻す</button>`).join("　")}</p>` : "";
  const sore = soreToday();
  const soreLine = sore.length ? `<p class="skipped">筋肉痛: ${sore.map(m => MUSCLES[m]).join("・")}（今日はメインで鍛えません）</p>` : "";
  return storeBanners() + deloadAsk + hero + undo + rows + skippedLine + soreLine + `
    <div class="rowbtns"><button data-act="addauto">おまかせで1種目追加</button><button data-act="addex">種目を選んで追加</button><button data-act="replan">メニューを組み直す</button><button data-act="replanshort">20分で組み直す</button><button data-act="sore">筋肉痛の部位</button></div>
    ${msg ? `<p class="lastline flash">${esc(msg)}</p>` : ""}
    <h3 class="sec">今日のメモ</h3>
    <div class="card">
      <textarea id="note" placeholder="睡眠・体調・気づいたことなど">${esc(s.note||"")}</textarea>
    </div>
    ${typeof backupReminder === "function" ? backupReminder() : ""}
    <p class="lastline" style="text-align:center;margin-top:18px">バージョン ${esc(BUILD_VERSION)}</p>`;
}
