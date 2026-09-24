/* ---------- 履歴 ---------- */
function viewHist(){
  const dates = sortedDates().filter(d=> (state.sessions[d].entries||[]).some(e=>e.sets.length));
  /* 記録がない端末でも、共有の接続とバックアップからの復元はできるようにする（別の端末の記録を持ってくるため） */
  if(!dates.length) return `<div class="empty">まだ記録がありません。<br>「今日」タブから最初の1セットを記録してください。<br>別の端末の記録を使う場合は、下の共有か復元から取り込めます。</div>
    ${typeof syncCard === "function" ? syncCard() : ""}
    ${typeof storeButtons === "function" ? `<h3 class="sec">バックアップ</h3><div class="card">${storeButtons()}</div>` : ""}`;

  const streakDays = dates.length;
  const totalSets = dates.reduce((a,d)=>a+(state.sessions[d].entries||[]).reduce((x,e)=>x+e.sets.length,0),0);
  const last7 = dates.filter(d=>daysAgo(d)<7).length;

  const perEx = {};
  dates.slice().reverse().forEach(d=>{
    (state.sessions[d].entries||[]).forEach(e=>{
      if(!e.sets.length) return;
      const ex = EXMAP[e.ex]; if(!ex) return;
      const vol = ex.kind==="w" ? e.sets.reduce((a,s)=>a+s.w*s.r,0) : e.sets.reduce((a,s)=>a+s.r,0);
      (perEx[e.ex] = perEx[e.ex] || []).push({d, vol, best: bestSet(e.sets, ex.kind)});
    });
  });

  const prog = Object.keys(perEx).map(id=>{
    const ex = EXMAP[id], rows = perEx[id];
    const max = Math.max(...rows.map(r=>r.vol), 1);
    const bars = rows.slice(-12).map(r=>`<i style="height:${Math.max(4, Math.round(r.vol/max*44))}px" title="${fmtDate(r.d)}"></i>`).join("");
    const first = rows[0], lastR = rows[rows.length-1];
    const delta = first.vol>0 ? Math.round((lastR.vol/first.vol-1)*100) : 0;
    const unit = ex.kind==="w" ? "kg·回" : (ex.kind==="t"?"秒":"回");
    return `<div class="card">
      <h4>${ex.name}</h4>
      <div class="spark">${bars}</div>
      <p class="lastline" style="margin-top:2px">総量 <b>${Math.round(lastR.vol)}</b> ${unit}　最高セット <b>${setText(lastR.best, ex.kind)}</b>${rows.length>1?`　開始時比 <b>${delta>=0?"+":""}${delta}%</b>`:""}</p>
    </div>`;
  }).join("");

  const table = dates.slice(0,30).map(d=>{
    const s = state.sessions[d];
    const sets = (s.entries||[]).reduce((a,e)=>a+e.sets.length,0);
    const names = (s.entries||[]).filter(e=>e.sets.length).map(e=>EXMAP[e.ex]?EXMAP[e.ex].name:e.ex).join("、");
    return `<tr><td>${fmtDate(d)}<div style="font-size:11.5px;color:var(--ink-3)">${names}</div>${s.note?`<div style="font-size:11.5px;color:var(--ink-2)">${s.note.replace(/</g,"&lt;")}</div>`:""}</td><td class="n">${sets}</td></tr>`;
  }).join("");

  return `
    <div class="card">
      <h4>これまで</h4>
      <div class="bigset"><span class="v num">${streakDays}</span><span class="u">回のトレーニング（合計 ${totalSets} セット）</span></div>
      <p class="lastline">直近7日で ${last7} 回。</p>
    </div>
    <h3 class="sec">種目ごとの推移</h3>
    ${prog}
    <h3 class="sec">セッション</h3>
    <div class="card overflowx">
      <table class="hist"><thead><tr><th>日付</th><th style="text-align:right">セット</th></tr></thead><tbody>${table}</tbody></table>
    </div>
    ${typeof syncCard === "function" ? syncCard() : ""}
    <h3 class="sec">書き出し</h3>
    <div class="card">
      <p class="lastline" style="margin-top:0">CSVで保存するか、テキストを貼り付けて共有できます。</p>
      <div class="rowbtns">
        <button data-act="csv">CSVで保存</button>
        <button data-act="txt">テキストで表示</button>
      </div>
      ${typeof storeButtons === "function" ? storeButtons() : ""}
    </div>`;
}

