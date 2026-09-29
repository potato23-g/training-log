/* ---------- ピッカー ---------- */
const sheet = document.getElementById("sheet");
const sheetInner = document.getElementById("sheetInner");
sheet.onclick = (e)=>{ if(e.target===sheet) sheet.classList.remove("on"); };
/* Escキーでも閉じる（種目を選ぶシートに限らず、この#sheetを使うどの画面でも閉じてよい） */
document.addEventListener("keydown", (e)=>{
  if(e.key === "Escape" && sheet.classList.contains("on")) sheet.classList.remove("on");
});

/* 動きの見出し（種目を選ぶシートと、履歴の「セットを追加」の種目選びで共通に使う） */
const PATTERN_HEAD = {
  squat:"しゃがむ（スクワット系）", lunge:"踏み込む（ランジ系）", hinge:"股関節を折る（ヒンジ系）",
  hpush:"床を押す（腕立て系）", fly:"胸を開閉する（フライ）", pull:"引く（ロウ系）",
  vpush:"上に押す（プレス系）", bridge:"お尻を上げる（ヒップリフト系）", carry:"持って歩く",
  shrug:"肩をすくめる", raise:"腕を上げる（レイズ）", curl:"肘を曲げる（カール）",
  ext:"肘を伸ばす（エクステンション）", calf:"かかとを上げる（カーフ）", abs:"腹を固める・丸める",
  side:"横に曲げる・支える", legcurl:"膝を曲げる（レッグカール）", pullover:"頭の上から引く（プルオーバー）",
  twist:"ひねる（ツイスト）"
};

/* 種目に付ける小さな印（今日のメニュー・昨日の動き・回復中） */
function pickerTags(id){
  let out = "";
  if(todayItems().some(it=>it.ex===id)) out += `<span class="pktag plan">今日のメニューにある</span>`;
  if(patternsYesterday().has(patternOf(id))) out += `<span class="pktag">昨日やった動き</span>`;
  const tired = tiredMuscle(id);
  if(tired) out += `<span class="pktag warn">${soreToday().includes(tired) ? "筋肉痛" : "回復中"}</span>`;
  return out;
}
/* 種目の下に並べる組み方（catalog() の中で同じ ex・label ありの行） */
function pickerVariants(id){
  const rows = catalog().filter(c=>c.ex===id && c.label);
  if(!rows.length) return "";
  return `<div class="pickvariants">` + rows.map(v=>{
    const m = /[（(]([^）)]+)[）)]\s*$/.exec(v.label);
    const short = m ? m[1] : v.label;
    return `<button class="pickvariant" data-pick="${esc(id)}" data-label="${esc(v.label)}">${esc(short)}${v.note?`<span>${esc(v.note)}</span>`:""}</button>`;
  }).join("") + `</div>`;
}

function openPicker(){
  const lvText = {1:"やさしい", 2:"標準", 3:"難しい"};
  const groups = {};
  EX.forEach(e=>{ const p = patternOf(e.id); (groups[p] = groups[p] || []).push(e); });
  const body = PATTERN_ORDER.filter(p=>groups[p] && groups[p].length).map(p=>{
    const items = groups[p].map(e=>`
      <div class="pickgroup">
        <button class="pickmain" data-pick="${esc(e.id)}">${esc(e.name)}${pickerTags(e.id)}<span>${e.p.map(m=>MUSCLES[m]).join("・")}　${lvText[e.level || 2]}</span></button>
        ${pickerVariants(e.id)}
      </div>`).join("");
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
      <p class="lastline" style="margin-top:0">選んだ部位は、今日のメニューで主役にしません（今日だけ）。</p>
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
