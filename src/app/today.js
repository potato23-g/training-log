function viewToday(){
  const items = todayItems();
  const s = session(TODAY);
  const msg = todayMsg; todayMsg = "";          /* 一度出したら消す */

  let next = null;
  for(const it of items){
    const e = entryFor(TODAY, it.ex, false);
    if(!e || e.sets.length < (it.sets||3)){ next = it; break; }
  }

  let hero;
  if(!items.length){
    hero = `<div class="hero"><p class="kicker">今日のメニュー</p><h2>今日は休み</h2>
      <p class="sub">${restText()}</p></div>`;
  }else if(!next){
    const total = s.entries.reduce((a,e)=>a+e.sets.length,0);
    hero = `<div class="hero"><p class="kicker">今日のメニュー</p><h2>完了</h2>
      <div class="bigset"><span class="v num" style="color:var(--done)">${total}</span><span class="u">セット</span></div>
      <p class="sub">お疲れさまでした。直したい記録は、各種目の「修正」から消せます。</p></div>`;
  }else{
    const ex = EXMAP[next.ex];
    const e = entryFor(TODAY, next.ex, false);
    const sug = suggestNext(next, e, lastPerformance(next.ex, TODAY));
    const inner = ex.kind==="w"
      ? `<div class="bigset"><span class="v num">${sug.w}</span><span class="x num">×</span><span class="v num">${sug.r}</span><span class="u">kg・回</span></div>`
      : `<div class="bigset"><span class="v num">${sug.r}</span><span class="u">${ex.kind==="t"?"秒":"回"}${next.side?"・左右":""}</span></div>`;
    hero = `<div class="hero"><p class="kicker">次の種目</p>
      <h2>${itemName(next)}</h2>${inner}
      ${sug.opt ? `<p class="sub">${sug.opt.text}</p>` : ""}
      <p class="sub">${sug.src}${sug.why?"　→　"+sug.why:""}</p>
      ${items.filter(i => !i.extra).length < 3 ? `<p class="sub">回復の途中の部位と、今週の量が足りている部位が多いため、今日は種目を少なめにしています。</p>` : ""}</div>`;
  }

  const rows = items.map(it=>exRow(it)).join("");
  return hero + rows + `
    <div class="rowbtns"><button data-act="addauto">おまかせで1種目追加</button><button data-act="addex">種目を選んで追加</button><button data-act="replan">メニューを組み直す</button></div>
    ${msg ? `<p class="lastline flash">${msg}</p>` : ""}
    <h3 class="sec">今日のメモ</h3>
    <div class="card">
      <textarea id="note" placeholder="睡眠、体調、気づいたこと。一行でいい。">${(s.note||"").replace(/</g,"&lt;")}</textarea>
    </div>
    ${gearCard()}
    ${settingsCard()}
    <p class="lastline" style="text-align:center;margin-top:18px">バージョン ${BUILD_VERSION}（更新があるときは、アプリを開き直すと切り替わります）</p>`;
}

