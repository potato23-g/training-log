/* ---------- ピッカー ---------- */
const sheet = document.getElementById("sheet");
const sheetInner = document.getElementById("sheetInner");
sheet.onclick = (e)=>{ if(e.target===sheet) sheet.classList.remove("on"); };

function openPicker(){
  const lvText = {1:"やさしい", 2:"標準", 3:"難しい"};
  sheetInner.innerHTML = `<h4>種目を選んで追加</h4>
    <p class="lastline" style="margin-top:0">回復や1日の上限は見ません。アプリに選ばせるときは「おまかせで1種目追加」を使ってください。</p>
    <div class="picklist">` +
    EX.map(e=>`<button data-pick="${e.id}">${e.name}<span>${e.p.map(m=>MUSCLES[m]).join("・")}　${lvText[e.level || 2]}</span></button>`).join("") +
    `</div>`;
  sheetInner.querySelectorAll("[data-pick]").forEach(b=>{
    b.onclick = ()=>{ sheet.classList.remove("on"); addToProgramToday(b.dataset.pick); };
  });
  sheet.classList.add("on");
}

