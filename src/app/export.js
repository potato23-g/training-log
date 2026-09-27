/* ---------- 書き出し ---------- */
function buildCSV(){
  const rows = [["日付","種目","セット","重量kg","回数/秒","きつさ","メモ"]];
  sortedDates().slice().reverse().forEach(d=>{
    const s = state.sessions[d];
    let first = true;
    (s.entries||[]).forEach(e=>{
      const ex = EXMAP[e.ex];
      e.sets.forEach((st,i)=>{
        rows.push([d, ex?ex.name:e.ex, i+1, st.w!==undefined?st.w:"", st.r, st.rpe||"", first?(s.note||""):""]);
        first = false;
      });
    });
    /* セットが無くメモだけの日も、日付とメモだけの行として出す（今までは丸ごと抜けていた） */
    if(first && s.note) rows.push([d, "", "", "", "", "", s.note]);
  });
  return rows.map(r=>r.map(c=>{
    let v = String(c===undefined?"":c);
    /* = + - @ やタブ・改行で始まるセル（メモなど）は表計算ソフトに式として読まれうるので、
       頭に ' を付けて文字列として扱わせる */
    if(/^[=+\-@\t\r\n]/.test(v)) v = "'" + v;
    return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
  }).join(",")).join("\n");
}
async function exportCSV(){
  const csv = "\ufeff" + buildCSV();
  const ok = await saveFile("training-" + TODAY + ".csv", csv);
  if(!ok) showText();          /* 保存できない環境では画面に出す */
}
function showText(){
  const lines = [];
  sortedDates().slice().reverse().forEach(d=>{
    const s = state.sessions[d];
    const es = (s.entries||[]).filter(e=>e.sets.length);
    if(!es.length && !s.note) return;          /* セットが無くメモだけの日は、メモだけ出す */
    lines.push(fmtDate(d));
    es.forEach(e=>{
      const ex = EXMAP[e.ex];
      lines.push("  " + (ex?ex.name:e.ex) + "  " + e.sets.map(st=>setText(st, ex?ex.kind:"b") + (st.rpe?`(${st.rpe})`:"")).join(" / "));
    });
    if(s.note) lines.push("  メモ: " + s.note);
    lines.push("");
  });
  const txt = lines.join("\n") || "記録がありません";
  sheetInner.innerHTML = `<h4>コピーして共有</h4>
    <p class="lastline" style="margin-top:0">括弧内はきつさの自己評価です。</p>
    <textarea style="min-height:280px" readonly>${txt.replace(/</g,"&lt;")}</textarea>
    <div class="rowbtns"><button data-close="1">閉じる</button></div>`;
  const t = sheetInner.querySelector("textarea");
  t.onfocus = ()=> t.select();
  sheetInner.querySelector("[data-close]").onclick = ()=> sheet.classList.remove("on");
  sheet.classList.add("on");
}

