let editEx = null;                         /* 規定セットを終えた種目のうち「修正」を開いているもの */
/* 記録した日数（説明文を最初のうちだけ出すため） */
function recordedDays(){
  return Object.keys(state.sessions).filter(d => (state.sessions[d].entries || []).some(e => e.sets.length)).length;
}
/* 1セットの書き方。腕の種目は片手あたりの重さで出す */
function setTextFor(item, st){
  const ex = EXMAP[item.ex];
  if(ex.kind === "w") return (perArm(item.ex) ? "片手 " : "") + wShown(item, st.w) + " kg × " + st.r;
  if(ex.kind === "t") return (st.w !== undefined ? kgText(st.w) + "・" : "") + st.r + " 秒";
  return st.r + " 回";
}
function exRow(item){
  const id = item.ex, ex = EXMAP[id]; if(!ex) return "";
  const e = entryFor(TODAY, id, false);
  const sets = e ? e.sets : [];
  const n = sets.length;
  const target = SETS_PER_EXERCISE;          /* セット数は3で固定（本人の要望） */
  const sideTag = item.side ? '<span class="side">左右</span>' : "";
  const name = esc(itemName(item));
  const setLines = sets.map((st,i)=>`
      <div class="setline">
        <span class="i num">${i+1}</span>
        <span class="val num">${esc(setTextFor(item, st))}</span>
        <button class="del" data-act="delset" data-ex="${id}" data-i="${i}" aria-label="このセットを消す">消す</button>
      </div>`).join("");

  /* 規定のセット数を終えた種目は、もう記録できない。
     「修正」で間違えたセットを消すと規定に届かなくなり、また記録できるようになる */
  if(n >= target){
    const editing = editEx === id;
    return `<div class="exrow done${editing ? " editing" : ""}">
      <div class="exhead">
        <span><span class="nm">${name}${sideTag}</span><span class="meta">${esc(sets.map(x=>setTextFor(item, x)).join(" / "))}</span></span>
        <span class="cnt num">${n} / ${target}</span>
        <button class="fix" data-act="edit" data-ex="${id}">${editing ? "閉じる" : "修正"}</button>
      </div>
      ${editing ? `<div class="exbody exedit">
        ${setLines}
        <p class="lastline">間違えたセットを消すと、この種目をもう一度記録できるようになります。</p>
      </div>` : ""}
    </div>`;
  }

  const open = openEx === id;
  const parts = ex.p.map(m=>MUSCLES[m]).join("・");
  const sug = suggestNext(item, e);
  const adv = todayAdvice(item, sug);

  let body = "";
  if(open){
    const p = sug.prog;
    const weighted = !!sug.opt;
    const wfld = weighted ? `
      <div class="fld"><label>重量 ${wUnit(item)}</label>
        <div class="stepper">
          <button data-act="step" data-t="w" data-ex="${id}" data-d="-1" aria-label="軽く">−</button>
          <input type="number" id="w_${id}" value="${wShown(item, sug.w)}" step="0.5" inputmode="decimal">
          <button data-act="step" data-t="w" data-ex="${id}" data-d="1" aria-label="重く">＋</button>
        </div></div>` : "";
    /* その日まだ1セットも記録していないうちに開いた種目には、ウォームアップの一言を添える */
    const firstOfDay = !n && !(session(TODAY).entries || []).some(x => x.sets.length);
    const warm = firstOfDay ? warmupText(item, sug) : "";
    const last = p && p.last;
    const hold = holdOf(id) ? gearLine(id, sug) : "";
    /* 「記録」ボタンより上には、セットごとに長さの変わるものを置かない（目標の理由・ウォームアップはボタンの下）。
       上に置くと、1セット目のあとでそれらが消えたり短くなったりしてボタンが上にずれ、同じ場所をもう一度押したときに
       別のところを押してしまう（2回続けて記録を押しても2回目が入らない、の原因の1つ: 2026-10-02） */
    body = `<div class="exbody"><div class="exmain">
      <div class="target">
        <span class="tl">${n ? "次のセット" : "今日の目標"}</span>
        <span class="tv num">${esc(sugText(item, sug))}</span>
      </div>
      <div class="entry">
        ${wfld}
        <div class="fld"><label>${ex.kind==="t"?"秒":"回数"}</label>
          <div class="stepper">
            <button data-act="step" data-t="r" data-ex="${id}" data-d="-1" aria-label="減らす">−</button>
            <input type="number" id="r_${id}" value="${sug.r}" inputmode="numeric">
            <button data-act="step" data-t="r" data-ex="${id}" data-d="1" aria-label="増やす">＋</button>
          </div></div>
        <div class="recrow"><button class="addbtn" data-act="addset" data-ex="${id}">記録</button></div>
      </div>
      <p class="lastline">${esc(sug.src)}${sug.why ? "　→　" + esc(sug.why) : ""}</p>
      ${warm ? `<p class="warmup">ウォームアップ: ${esc(warm)}</p>` : ""}
      ${setLines}
      ${adv ? `<p class="lastline"><b>今日の調整</b>　${esc(adv.text)}</p>` : ""}
      ${adv && adv.alt && !n ? `<div class="rowbtns"><button data-act="swapto" data-from="${id}" data-ex="${adv.alt}">${esc(EXMAP[adv.alt].name)}に替える</button></div>` : ""}
      ${hold ? `<p class="lastline"><b>使うダンベル</b>　<span id="wh_${id}">${esc(hold)}</span></p>` : ""}
      ${noteFor(item, sug.opt) ? `<p class="lastline">${esc(noteFor(item, sug.opt))}</p>` : ""}
      ${last ? `<p class="lastline">前回（${daysAgo(last.date)}日前）: <b>${esc(last.sets.map(x=>setTextFor(item, x)).join(" / "))}</b></p>` : ""}
      ${!n ? stepButtons(item) : ""}
      ${!n ? `<div class="cardtools"><button data-act="later" data-ex="${id}">後に回す</button><button data-act="skip" data-ex="${id}">今日は外す</button></div>` : ""}
      ${recordedDays() < 3 ? `<p class="lastline">「記録」を押すと休憩のカウントダウンが始まり、次のセットを始められる時間になると、音で知らせます。</p>` : ""}
      <div class="rowbtns">
        <button data-act="goref" data-ex="${id}">解説を見る</button>
      </div>
      </div><div class="exside">${diaHTML(id, true, item, sug.opt)}</div></div>`;
  }

  return `<div class="exrow">
    <button class="exhead" data-act="toggle" data-ex="${id}">
      <span><span class="nm">${name}${sideTag}${adv && adv.short?`<span class="adv ${adv.warn?"warn":""}">${esc(adv.short)}</span>`:""}</span><span class="meta">${esc(parts)}</span></span>
      <span class="cnt num">${n} / ${target}</span>
    </button>
    ${body}
  </div>`;
}
