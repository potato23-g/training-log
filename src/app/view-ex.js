/* ---------- 種目 ---------- */
/* 「やり方」に足す文。解説の「準備」「どこまで動かすか」（DETAIL の setup・rom）のうち、やり方の手順にまだ書かれていない文だけを出す
   （2026-10-11 本人の要望: 「準備」「どこまで動かすか」は、必要な部分だけ「やり方」に入れる）。
   手順と同じ内容かどうかは、文の中の2文字の並びが手順にどれだけ出てくるかで見る（半分以上なら同じ内容として出さない）。
   「それ以上は…」のように前の文を受ける文が残るときは、「どこまで動かすか」は全文を出す */
function howExtra(id){
  const d = DETAIL[id] || DETAIL[baseOf(id)] || {};
  const grams = s => { const t = s.replace(/[、。・\s（）「」]/g, ""), o = []; for(let i = 0; i + 1 < t.length; i++) o.push(t.slice(i, i + 2)); return o; };
  const how = new Set(grams(exHow(id).join("")));
  const fresh = x => { const g = grams(x); return g.length >= 5 && g.filter(k => how.has(k)).length / g.length < 0.5; };
  const parts = t => (t || "").split("。").map(x => x.trim()).filter(Boolean);
  const rom = parts(d.rom), romNew = rom.filter(fresh);
  return parts(d.setup).filter(fresh).concat(romNew.some(x => /^(それ|そこ)/.test(x)) ? [rom.join("。")] : romNew).map(x => x + "。");
}
function viewEx(){
  const ex = EXMAP[refEx], bid = baseOf(refEx), d = DETAIL[refEx] || DETAIL[bid] || {}, hs = houseOf(refEx);
  const refItem = itemOf(refEx);
  const refSug = suggestNext(refItem, entryFor(TODAY, refEx, false), lastPerformance(refEx, TODAY));
  const refOpts = holdOf(refEx) ? gearOptions(refEx) : [];
  const refNext = ex.kind === "w" && refSug.opt ? refOpts[optionIndex(refOpts, refSug.opt) + 1] : null;
  const opts = EX.map(e=>`<option value="${e.id}" ${e.id===refEx?"selected":""}>${e.name}</option>`).join("");
  const chips = ex.p.map(m=>`<span class="chip p">${MUSCLES[m]}</span>`).join("")
    + (ex.s||[]).map(m=>`<span class="chip s">${MUSCLES[m]}</span>`).join("");
  const extra = howExtra(refEx);
  const kindLabel = ex.kind==="w" ? "ダンベル" : (ex.kind==="t" ? "時間で計測" : "自重");

  const left = `
    <div class="card">
      <h4>動き<span class="refhead">${motionOf(refEx) ? "再生中は左右にドラッグすると回せます" : ""}</span></h4>
      ${diaHTML(refEx, false, null, refSug.opt)}
    </div>
    <div class="card" id="refFig">
      <h4>効く部位</h4>
      ${bothFigs(false)}
      <div class="mlist">${chips}</div>
      <p class="lastline">濃い色が主に効く部位、枠線だけが補助的に使われる部位です。</p>
    </div>
    <div class="card">
      <h4>目安</h4>
      <p style="margin:0 0 6px;font-size:14px">${kindLabel}　${d.reps||""}</p>
      ${holdOf(refEx)?`<p class="lastline" style="margin-top:0"><b>使うダンベル</b>　${gearLine(refEx, refSug)}</p>`:""}
      <div class="rowbtns"><button data-act="addtoday" data-ex="${ex.id}">${{in: "今日のメニューで開く", skipped: "今日のメニューに戻す"}[menuState(ex.id)] || "今日のメニューに追加"}</button><button data-act="exoff" data-ex="${ex.id}" aria-pressed="${!exOn(ex.id)}">${exOn(ex.id) ? "メニューに入れない" : "メニューに入れる"}</button></div>
      ${exOn(ex.id) ? "" : `<p class="lastline">${EX_OFF_NOTE}</p>`}
    </div>`;

  const right = `
    ${ex.variant?`<div class="card"><h4>両脚版との違い</h4><p style="margin:0;font-size:14px">${ex.variant}</p></div>`:""}
    <div class="card">
      <h4>やり方</h4>
      <ol class="steps">${exHow(refEx).map(x=>`<li>${gearText(x)}</li>`).join("")}</ol>
      ${extra.length ? `<ul class="plain howextra">${extra.map(x=>`<li>${gearText(x)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="card">
      <h4>きつい／簡単すぎる場合</h4>
      ${d.easy?`<p style="margin:0 0 6px;font-size:14px"><b>きついとき</b>　${d.easy}</p>`:""}
      ${d.hard?`<p style="margin:0;font-size:14px"><b>簡単すぎるとき</b>　${gearText(d.hard)}</p>`:""}
      ${ex.kind==="w" && hs.down?`<p style="margin:6px 0 0;font-size:14px"><b>ダンベルが重すぎるとき</b>　${hs.down}</p>`:""}
    </div>
    <div class="card">
      <h4>${ex.kind==="w" ? "今の重さが軽くなったら" : "楽にできるようになったら"}</h4>
      ${refNext
        ? `<p style="margin:0 0 6px;font-size:14px"><b>まず持ち替える</b>　持っているダンベルで次に重い使い方は「${refNext.text}」です。そこも軽くなったら、下の順に進みます。</p>`
        : `<p class="lastline" style="margin-top:0">${ex.kind==="w" && refOpts.length ? "持っているダンベルでは今が一番重い使い方です。" : ""}上から順に試してください。</p>`}
      <ol class="steps">${exUp(refEx).map(x=>`<li>${gearText(x)}</li>`).join("")}</ol>
      ${hs.up?`<p style="margin:6px 0 0;font-size:14px"><b>日用品を使う</b>　${hs.up}</p>`:""}
    </div>
`;

  return `<div class="card"><select id="exSel">${opts}</select></div>
    <div class="splitcols"><div>${left}</div><div>${right}</div></div>`;
}

