/* ---------- 種目 ---------- */
function viewEx(){
  const ex = EXMAP[refEx], bid = baseOf(refEx), d = DETAIL[refEx] || DETAIL[bid] || {}, hs = houseOf(refEx);
  const refItem = itemOf(refEx);
  const refSug = suggestNext(refItem, entryFor(TODAY, refEx, false), lastPerformance(refEx, TODAY));
  const refOpts = holdOf(refEx) ? gearOptions(refEx) : [];
  const refNext = ex.kind === "w" && refSug.opt ? refOpts[optionIndex(refOpts, refSug.opt) + 1] : null;
  const opts = EX.map(e=>`<option value="${e.id}" ${e.id===refEx?"selected":""}>${e.name}</option>`).join("");
  const chips = ex.p.map(m=>`<span class="chip p">${MUSCLES[m]}</span>`).join("")
    + (ex.s||[]).map(m=>`<span class="chip s">${MUSCLES[m]}</span>`).join("");
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
    ${d.why?`<div class="card"><h4>この種目を入れる理由</h4><p style="margin:0;font-size:14px">${gearText(d.why)}</p></div>`:""}
    ${d.setup?`<div class="card"><h4>準備</h4><p style="margin:0;font-size:14px">${gearText(d.setup)}</p></div>`:""}
    <div class="card">
      <h4>やり方</h4>
      <ol class="steps">${exHow(refEx).map(x=>`<li>${gearText(x)}</li>`).join("")}</ol>
    </div>
    <div class="card">
      <h4>呼吸とテンポ</h4>
      ${d.breath?`<p style="margin:0 0 6px;font-size:14px"><b>呼吸</b>　${d.breath}</p>`:""}
      ${d.tempo?`<p style="margin:0;font-size:14px"><b>テンポ</b>　${d.tempo}</p>`:""}
    </div>
    ${d.rom?`<div class="card"><h4>どこまで動かすか</h4><p style="margin:0;font-size:14px">${d.rom}</p></div>`:""}
    ${d.feel?`<div class="card"><h4>効いているかの判断</h4><p style="margin:0;font-size:14px">${d.feel}</p></div>`:""}
    <div class="card">
      <h4>よくある間違い</h4>
      <ul class="plain">${exNg(refEx).map(x=>`<li>${gearText(x)}</li>`).join("")}</ul>
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
    <div class="card">
      <h4 class="warn">中止する合図</h4>
      <p style="margin:0;font-size:14px">関節（膝・腰・肩）に鋭い痛みが走ったら、その種目はその場で中止してください。翌日以降にくる筋肉痛とは別物です。痛みが数日続く場合は、整形外科を受診してください。</p>
    </div>`;

  return `<div class="card"><select id="exSel">${opts}</select></div>
    <div class="splitcols"><div>${left}</div><div>${right}</div></div>`;
}

