let editEx = null;                         /* 規定セットを終えた種目のうち「修正」を開いているもの */
function exRow(item){
  const id = item.ex, ex = EXMAP[id]; if(!ex) return "";
  const e = entryFor(TODAY, id, false);
  const sets = e ? e.sets : [];
  const n = sets.length;
  const target = item.sets || ex.sets || 3;
  const sideTag = item.side ? '<span class="side">左右</span>' : "";
  const setLines = sets.map((st,i)=>`
      <div class="setline">
        <span class="i num">${i+1}</span>
        <span class="val num">${setText(st, ex.kind)}</span>
        ${st.rpe?`<span class="rpe">きつさ ${st.rpe}</span>`:""}
        <button class="del" data-act="delset" data-ex="${id}" data-i="${i}" aria-label="このセットを消す">×</button>
      </div>`).join("");

  /* 規定のセット数を終えた種目は、もう記録できない。
     「修正」で間違えたセットを消すと規定に届かなくなり、また記録できるようになる */
  if(n >= target){
    const editing = editEx === id;
    return `<div class="exrow done${editing ? " editing" : ""}">
      <div class="exhead">
        <span><span class="nm">${itemName(item)}${sideTag}</span><span class="meta">${sets.map(x=>setText(x, ex.kind)).join(" / ")}</span></span>
        <span class="cnt num">${n} / ${target}</span>
        <button class="fix" data-act="edit" data-ex="${id}">${editing ? "閉じる" : "修正"}</button>
      </div>
      ${editing ? `<div class="exbody exedit">
        ${setLines}
        <p class="lastline">間違えたセットを × で消すと、この種目をもう一度記録できるようになります。</p>
      </div>` : ""}
    </div>`;
  }

  const open = openEx === id;
  const last = lastPerformance(id, TODAY);
  const parts = ex.p.map(m=>MUSCLES[m]).join("・");
  const sug = suggestNext(item, e, last);
  const adv = todayAdvice(item, sug);

  let body = "";
  if(open){
    const wfld = ex.kind==="w" ? `
      <div class="fld"><label>重量 kg</label>
        <div class="stepper">
          <button data-act="step" data-t="w" data-ex="${id}" data-d="-1">−</button>
          <input type="number" id="w_${id}" value="${sug.w}" step="0.5" inputmode="decimal">
          <button data-act="step" data-t="w" data-ex="${id}" data-d="1">＋</button>
        </div></div>` : "";

    body = `<div class="exbody"><div class="exmain">
      ${setLines}
      <div class="target">
        <span class="tl">次のセット</span>
        <span class="tv num">${sugText(item, sug)}</span>
        <span class="tw">${sug.src}${sug.why?"　→　"+sug.why:""}</span>
      </div>
      ${holdOf(id)?`<p class="lastline"><b>使うダンベル</b>　<span id="wh_${id}">${gearLine(id, sug)}</span></p>`:""}
      ${adv?`<p class="lastline"><b>今日の調整</b>　${adv.text}</p>`:""}
      ${adv && adv.alt && !n?`<div class="rowbtns"><button data-act="swapto" data-from="${id}" data-ex="${adv.alt}">${EXMAP[adv.alt].name}に替える</button></div>`:""}
      ${!n ? stepButtons(item) : ""}
      ${noteFor(item, sug.opt)?`<p class="lastline">${noteFor(item, sug.opt)}</p>`:""}
      ${last?`<p class="lastline">前回（${daysAgo(last.date)}日前）: <b>${last.sets.map(x=>setText(x,ex.kind)).join(" / ")}</b></p>`:""}
      <div class="entry">
        ${wfld}
        <div class="fld"><label>${ex.kind==="t"?"秒":"回数"}</label>
          <div class="stepper">
            <button data-act="step" data-t="r" data-ex="${id}" data-d="-1">−</button>
            <input type="number" id="r_${id}" value="${sug.r}" inputmode="numeric">
            <button data-act="step" data-t="r" data-ex="${id}" data-d="1">＋</button>
          </div></div>
        <div class="fld"><label>きつさ 1-10</label>
          <div class="stepper">
            <button data-act="step" data-t="e" data-ex="${id}" data-d="-1">−</button>
            <input type="number" id="e_${id}" value="8" min="1" max="10" inputmode="numeric">
            <button data-act="step" data-t="e" data-ex="${id}" data-d="1">＋</button>
          </div></div>
        <button class="addbtn" data-act="addset" data-ex="${id}">記録</button>
      </div>
      <p class="lastline">きつさは 8〜9 が狙いです。10は限界、7以下は軽すぎます。入れた数字で次のセットの回数が変わります。</p>
      <p class="lastline">「記録」を押すと休憩のカウントダウンが始まります。次のセットに入っていい時間になると、音でお知らせします。</p>
      <div class="rowbtns">
        <button data-act="goref" data-ex="${id}">解説を見る</button>
      </div>
      </div><div class="exside">${diaHTML(id, true, item, sug.opt)}</div></div>`;
  }

  return `<div class="exrow">
    <button class="exhead" data-act="toggle" data-ex="${id}">
      <span><span class="nm">${itemName(item)}${sideTag}${adv?`<span class="adv ${adv.warn?"warn":""}">${adv.short}</span>`:""}</span><span class="meta">${parts}</span></span>
      <span class="cnt num">${n} / ${target}</span>
    </button>
    ${body}
  </div>`;
}

