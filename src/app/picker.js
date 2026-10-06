/* ---------- ピッカー ---------- */
const sheet = document.getElementById("sheet");
const sheetInner = document.getElementById("sheetInner");
sheet.onclick = (e)=>{ if(e.target===sheet) sheet.classList.remove("on"); };
/* Escキーでも閉じる（種目を選ぶシートに限らず、この#sheetを使うどの画面でも閉じてよい） */
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape" && sheet.classList.contains("on")) sheet.classList.remove("on");
});

/* 動きのまとまり（rules.js の PATTERN_GROUP）の見出し（種目を選ぶシートと、履歴の「セットを追加」の種目選びで共通に使う） */
const PATTERN_HEAD = {
  squat:"しゃがむ（スクワット系）", lunge:"踏み込む（ランジ系）", hinge:"股関節を折る（ヒンジ系）",
  hpush:"床を押す（腕立て系）", fly:"胸を開閉する（フライ）", pull:"引く（ロウ系）",
  vpush:"上に押す（プレス系）", bridge:"お尻を上げる（ヒップリフト系）", carry:"持って歩く",
  shrug:"肩をすくめる", raise:"腕を横に上げる（サイドレイズ）", fraise:"腕を前に上げる（フロントレイズ）",
  rear:"上体を倒して腕を開く（リアレイズ）", curl:"肘を曲げる（カール）",
  ext:"肘を伸ばす（エクステンション）", calf:"かかとを上げる（カーフ）", abs:"腹を固める・丸める",
  side:"横に曲げる・支える", legcurl:"膝を曲げる（レッグカール）", pullover:"頭の上から引く（プルオーバー）",
  twist:"ひねる（ツイスト）", kneeext:"膝を伸ばす（シシースクワット）", abduct:"脚を横に上げる（アブダクション）",
  adduct:"脚を内側に寄せる（アダクション）", backext:"背中を反らす（バックエクステンション）"
};

/* 種目に付ける小さな印（今日のメニューでの扱い・昨日の動き・筋肉痛・回復まであと何日・ダンベル）。
   今日のメニューでの扱いは menuState()、回復は exRest() で、ほかの画面と同じ判定を使う */
function pickerTags(id){
  let out = "";
  const st = menuState(id);
  if(st === "in") out += `<span class="pktag plan">今日のメニューにある</span>`;
  else if(st === "skipped") out += `<span class="pktag">今日は外した</span>`;
  if(patternsYesterday().has(patternOf(id))) out += `<span class="pktag">昨日やった動き</span>`;
  const rest = exRest(id);
  if(rest && rest.sore.length) out += `<span class="pktag warn">筋肉痛</span>`;
  if(rest && rest.left) out += `<span class="pktag warn">${recoverTag(rest.left)}</span>`;
  if(holdOf(id) && !gearOptions(id).length) out += `<span class="pktag warn">ダンベルが必要</span>`;
  return out;
}
/* その行の難しさ。種目そのものの難しさ（EX.level）に、基本のやり方との段階の差を足して出す */
function pickLevelText(row){
  const lv = (EXMAP[row.ex].level || 2) + itemLevel(row) - itemLevel(catalogItem(row.ex));
  return lv <= 1 ? "やさしい" : (lv >= 3 ? "難しい" : "標準");
}

/* 種目ごとに1行だけ出す（やり方の小さいボタンは出さない: 2026-10-02 本人の要望）。
   押すと入るのは pickRowFor() のやり方（前回の続き。初めてなら基本）で、名前と難しさもそのやり方のものを出す。
   入れたあとの持ち替えは、種目カードの「やさしく／難しく」で行う */
function openPicker(){
  const groups = {};
  EX.forEach(e=>{ const p = groupOf(patternOf(e.id)); (groups[p] = groups[p] || []).push(e); });
  const body = groupOrder().filter(p=>groups[p] && groups[p].length).map(p=>{
    const items = groups[p].map(e=>{
      const row = pickRowFor(e.id);
      return `
      <div class="pickgroup">
        <button class="pickmain" data-pick="${esc(e.id)}" data-label="${esc(row.label || "")}">${esc(itemName(row))}${pickerTags(e.id)}<span>${e.p.map(m=>MUSCLES[m]).join("・")}　${pickLevelText(row)}</span></button>
      </div>`;
    }).join("");
    return `<h4 class="pickhead">${esc(PATTERN_HEAD[p] || p)}</h4><div class="picklist">${items}</div>`;
  }).join("");

  sheetInner.innerHTML = `<h4>種目を選んで追加</h4>
    ${body}
    <div class="rowbtns"><button data-close="1">閉じる</button></div>`;
  sheetInner.querySelectorAll("[data-pick]").forEach(b=>{
    b.onclick = ()=>{ sheet.classList.remove("on"); addToProgramToday(b.dataset.pick, b.dataset.label || ""); };
  });
  sheetInner.querySelector("[data-close]").onclick = ()=> sheet.classList.remove("on");
  sheet.classList.add("on");
}

/* ---- 筋肉痛の部位を選ぶシート ----
   選んだ部位は、今日のメニューで主役にしない（その日だけ）。決めると、その部位を避けて組み直す */
function openSoreSheet(){
  const sel = new Set(soreToday());
  const order = Object.keys(MUSCLES).sort((a, b) => (PRIORITY[b] || 0) - (PRIORITY[a] || 0));
  const draw = () => {
    sheetInner.innerHTML = `<h4>筋肉痛の部位</h4>
      <p class="lastline" style="margin-top:0">選んだ部位をメインで鍛える種目は、今日のメニューから外します（今日だけ）。</p>
      <div class="sorechips">${order.map(m => `<button class="sorechip${sel.has(m) ? " on" : ""}" data-m="${m}" aria-pressed="${sel.has(m)}">${MUSCLES[m]}</button>`).join("")}</div>
      <div class="rowbtns"><button data-apply="1">この部位を避けて組み直す</button><button data-close="1">閉じる</button></div>`;
    sheetInner.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
      const m = b.dataset.m;
      if(sel.has(m)) sel.delete(m); else sel.add(m);
      draw();
    });
    sheetInner.querySelector("[data-apply]").onclick = () => {
      sheet.classList.remove("on");
      if(rollDay()){ render(); setStatus("日付が変わったので、今日のメニューに切り替えました"); return; }
      const s = session(TODAY);
      s.sore = order.filter(m => sel.has(m));      /* 空でも残す（全部外したことも同期で伝える） */
      s.soreAt = stampNow();
      replanToday({sore: true});                    /* 保存・同期・描き直しもここで */
    };
    sheetInner.querySelector("[data-close]").onclick = () => sheet.classList.remove("on");
  };
  draw();
  sheet.classList.add("on");
}
ACTIONS.sore = () => openSoreSheet();
