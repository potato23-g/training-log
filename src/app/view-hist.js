/* ---------- 履歴 ---------- */
function viewHist(){
  const dates = sortedDates().filter(d=> (state.sessions[d].entries||[]).some(e=>e.sets.length));
  const addDayRow = `<div class="rowbtns"><button data-act="addpastday">記録していない日を足す</button></div>`;
  /* 記録がない端末でも、共有の接続とバックアップからの復元はできる（右上の ⚙ の設定のシート） */
  if(!dates.length) return `<div class="empty">まだ記録がありません。<br>「今日」タブから最初の1セットを記録してください。<br>別の端末の記録を使う場合は、右上の ⚙ の「スマホとPCで記録を共有」か「バックアップから復元」から取り込めます。</div>
    ${addDayRow}`;

  const streakDays = dates.length;
  const totalSets = dates.reduce((a,d)=>a+(state.sessions[d].entries||[]).reduce((x,e)=>x+e.sets.length,0),0);
  const last7 = dates.filter(d=>daysAgo(d)<7).length;

  const table = dates.slice(0,30).map(d=>{
    const s = state.sessions[d];
    const sets = (s.entries||[]).reduce((a,e)=>a+e.sets.length,0);
    const names = (s.entries||[]).filter(e=>e.sets.length).map(e=>EXMAP[e.ex]?EXMAP[e.ex].name:e.ex).join("、");
    return `<tr data-act="histday" data-d="${d}"><td>${esc(fmtDate(d))}<div style="font-size:11.5px;color:var(--ink-3)">${esc(names)}</div>${s.note?`<div style="font-size:11.5px;color:var(--ink-2)">${esc(s.note)}</div>`:""}</td><td class="n">${sets}</td></tr>`;
  }).join("");

  return `
    <div class="card">
      <h4>これまで</h4>
      <div class="bigset"><span class="v num">${streakDays}</span><span class="u">回のトレーニング（合計 ${totalSets} セット）</span></div>
      <p class="lastline">直近7日で ${last7} 回。</p>
    </div>
    <h3 class="sec">種目ごとの推移</h3>
    <p class="lastline" style="margin-top:0">線は日ごとの一番よいセット。重いほど、同じ重さなら回数が多いほど上。<span style="color:var(--muscle)">●</span>は自己ベストの日</p>
    ${trendCards(dates)}
    <h3 class="sec">セッション</h3>
    <p class="lastline" style="margin-top:0">日付をタップすると、その日の中身を直せます。</p>
    <div class="card overflowx">
      <table class="hist"><thead><tr><th>日付</th><th style="text-align:right">セット</th></tr></thead><tbody>${table}</tbody></table>
    </div>
    ${addDayRow}
    <h3 class="sec">書き出し</h3>
    <div class="card">
      <p class="lastline" style="margin-top:0">CSVで保存するか、テキストを貼り付けて共有できます。</p>
      <div class="rowbtns">
        <button data-act="csv">CSVで保存</button>
        <button data-act="txt">テキストで表示</button>
      </div>
    </div>`;
}
ACTIONS.histday = el => openDaySheet(el.dataset.d);
ACTIONS.addpastday = () => openAddDaySheet();

/* ============================================================
   種目ごとの推移（U10+F4）: (ex, label) ごとに、最高セット・同じ重さでの回数の伸び・
   回ごとの最高回数の折れ線（SVG）と、自己ベストの印を出す
   ============================================================ */
function trendCards(dates){
  const map = {};
  dates.slice().reverse().forEach(d=>{
    const s = state.sessions[d];
    (s.entries||[]).forEach(e=>{
      const ex = EXMAP[e.ex]; if(!ex) return;
      e.sets.forEach(st=>{
        const label = setLabel(d, e.ex, st);
        const key = e.ex + "|" + label;
        (map[key] = map[key] || {ex:e.ex, label, rows:[]}).rows.push({d, st});
      });
    });
  });
  const groups = Object.keys(map).map(k=>map[k]).sort((a,b)=>{
    const la = a.rows[a.rows.length-1].d, lb = b.rows[b.rows.length-1].d;
    return la < lb ? 1 : (la > lb ? -1 : 0);
  });
  return groups.map(g=>{
    const ex = EXMAP[g.ex], rows = g.rows, last = rows[rows.length-1];
    const best = bestSet(rows.map(r=>r.st), ex.kind);
    const points = dailyMaxPoints(rows, g.ex, g.label, ex.kind);
    const growth = repGrowth(rows, ex.kind, {ex:g.ex, label:g.label});
    /* その日の最後のセットは疲れて数字が落ちがちなので、最新の日にやったセットのうち
       自己ベストになっているものを（あれば）探す。最後のセットとは限らない */
    const lastDaySets = rows.filter(r=>r.d===last.d).map(r=>r.st);
    let pr = "";
    for(const st of lastDaySets){ pr = prMessage(g.ex, g.label, st, last.d); if(pr) break; }
    return `<div class="card">
      <h4>${esc(itemName({ex:g.ex, label:g.label}))}</h4>
      ${sparkSVG(points)}
      <p class="lastline" style="margin-top:4px">最高セット <b>${esc(setTextFor({ex:g.ex, label:g.label}, best))}</b></p>
      ${growth ? `<p class="lastline" style="margin-top:2px">${esc(growth)}</p>` : ""}
      ${pr ? `<p class="lastline" style="margin-top:2px;color:var(--muscle)"><b>${esc(pr)}</b>　${esc(fmtDate(last.d))}</p>` : ""}
    </div>`;
  }).join("");
}
/* 日ごとの一番よいセット（直近20点、折れ線のY値）。「段と回数」で上下する:
   重さの種目は、使った重さを軽い順に段0・1・2…とし、段の中は回数の幅（下限〜上限）で
   0〜0.9 だけ上げる。重さを上げた日は回数が下限に戻っても、前の段の上限より上に描かれる。
   回数・秒の種目は、その日の最多の数。
   pr はその日、この種目・組み方のどれかのセットがそのとき時点の自己ベストだったか */
function dailyMaxPoints(rows, exId, label, kind){
  const item = {ex:exId, label:label || ""};
  const byDate = {};
  rows.forEach(r=>{ (byDate[r.d] = byDate[r.d] || []).push(r.st); });
  const dates = Object.keys(byDate).sort().slice(-20);
  const bests = dates.map(d => bestSet(byDate[d], kind));
  let rungOf = null, rr = null;
  if(kind === "w"){
    const ws = [...new Set(bests.map(st => st.w || 0))].sort((a,b)=>a-b);
    rungOf = w => ws.indexOf(w || 0);
    rr = repRange(exId, catalogRow(exId, label) || EXMAP[exId]);
  }
  return dates.map((d, i)=>{
    const st = bests[i], r = st.r || 0;
    const pr = byDate[d].some(x => !!prMessage(exId, label, x, d));
    if(kind !== "w") return {d, v:r, pr, text:r + (kind === "t" ? "秒" : "回")};
    const frac = Math.max(0, Math.min(0.9, (r - rr.lo) / Math.max(1, rr.hi - rr.lo + 1)));
    return {d, v:rungOf(st.w) + frac, pr, text:kgFor(item, st.w || 0) + "×" + r + "回"};
  });
}
/* 同じ重さでの回数の伸び（最初にその重さを使った日→最近使った日、それぞれ最高回数で比べる）。
   1セットだけを比べると、疲れて回数が落ちた最後のセットのせいで伸びていても縮んで見えることがある。
   重さの種目でないときは回数・秒そのものの伸び */
function repGrowth(rows, kind, item){
  if(rows.length < 2) return null;
  const bestOnDay = (list, d) => Math.max(...list.filter(r=>r.d===d).map(r=>r.st.r||0));
  if(kind === "w"){
    const w = rows[rows.length-1].st.w;
    const atW = rows.filter(r=>r.st.w===w);
    if(atW.length < 2) return null;
    const firstDay = atW[0].d, lastDay = atW[atW.length-1].d;
    if(firstDay === lastDay) return null;          /* 同じ日の中の話は「伸び」ではない */
    const from = bestOnDay(atW, firstDay), to = bestOnDay(atW, lastDay);
    if(to === from) return null;
    return kgFor(item, w) + "での回数　" + from + "回 → " + to + "回";
  }
  const firstDay = rows[0].d, lastDay = rows[rows.length-1].d;
  if(firstDay === lastDay) return null;
  const from = bestOnDay(rows, firstDay), to = bestOnDay(rows, lastDay);
  if(to === from) return null;
  const unit = kind === "t" ? "秒" : "回";
  return unit + "　" + from + unit + " → " + to + unit;
}
/* 小さな折れ線（SVG、外部ライブラリなし）。pr の点は大きい丸で強調する */
function sparkSVG(points){
  if(!points.length) return `<p class="lastline" style="margin:4px 0">まだ記録がありません。</p>`;
  const W = 300, H = 54, padX = 8, padY = 9;
  const vals = points.map(p=>p.v);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const span = Math.max(1, vmax - vmin);
  const n = points.length;
  const x = i => n===1 ? W/2 : padX + (W - padX*2) * i / (n-1);
  const y = v => H - padY - (H - padY*2) * (v - vmin) / span;
  const line = points.map((p,i)=>x(i).toFixed(1)+","+y(p.v).toFixed(1)).join(" ");
  const dots = points.map((p,i)=>{
    const cx = x(i).toFixed(1), cy = y(p.v).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="${p.pr?3.6:2.2}" class="${p.pr?"prdot":"trenddot"}"><title>${esc(fmtDate(p.d))}　${esc(p.text || String(p.v))}${p.pr ? "　自己ベスト" : ""}</title></circle>`;
  }).join("");
  return `<svg class="trendline" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="段と回数の推移">
    <polyline points="${line}" class="trendpath"/>${dots}
  </svg>`;
}
/* 自己ベストの判定。同じ ex・組み方の中で、date・set より前の記録とだけ比べる。
   重さの種目: 「同じ重さ以上で最多回数」か「最重量」。回数・秒の種目: 最多。
   更新したときだけ「自己ベスト: …」を返す（比べる前の記録が無いときは、まだ「更新」ではないので出さない） */
function historySetsFor(exId, label){
  const out = [];
  sortedDates().slice().reverse().forEach(d=>{
    const s = state.sessions[d];
    (s.entries||[]).forEach(e=>{
      if(e.ex !== exId) return;
      e.sets.forEach(st=>{ if(setLabel(d, exId, st) === (label||"")) out.push({d, st}); });
    });
  });
  return out;
}
function prMessage(exId, label, set, date){
  const ex = EXMAP[exId];
  if(!ex || !set || set.r === undefined || set.r === null) return "";
  const all = historySetsFor(exId, label || "");
  let selfIdx = -1;
  for(let i = all.length - 1; i >= 0; i--){
    if(all[i].st === set || (set.id && all[i].st.id === set.id)){ selfIdx = i; break; }
  }
  /* set がまだ historySetsFor に載っていない（記録前に呼ばれた）ときは、その日のぶんも
     「前」として数える。同じ日の先のセットを見落とすと、その日のうちの2セット目・3セット目が
     不当に自己ベスト扱いになる */
  const prior = (selfIdx >= 0 ? all.slice(0, selfIdx) : all.filter(x=>x.d <= date)).map(x=>x.st);
  if(!prior.length) return "";
  const r = set.r;
  if(ex.kind === "w"){
    const w = set.w || 0;
    const maxWPrior = Math.max(0, ...prior.map(x=>x.w||0));
    const priorAtOrAbove = prior.filter(x=>(x.w||0) >= w);
    const maxRAtWeight = priorAtOrAbove.length ? Math.max(...priorAtOrAbove.map(x=>x.r||0)) : -1;
    const isHeaviest = w > maxWPrior;
    const isMostReps = priorAtOrAbove.length > 0 && r > maxRAtWeight;
    const it = {ex:exId, label:label || ""};
    if(isHeaviest && isMostReps) return "自己ベスト: 最重量・最多回数（" + kgFor(it, w) + "×" + r + "回）";
    if(isHeaviest) return "自己ベスト: 最重量（" + kgFor(it, w) + "×" + r + "回）";
    if(isMostReps) return "自己ベスト: " + kgFor(it, w) + "以上で最多回数（" + r + "回）";
    return "";
  }
  const maxR = Math.max(...prior.map(x=>x.r||0));
  if(r > maxR) return "自己ベスト: 最多" + (ex.kind === "t" ? "（" + r + "秒）" : "（" + r + "回）");
  return "";
}

/* ============================================================
   履歴の日付シート（U9+F3）: その日の中身を見る・直す
   ============================================================ */
let histAdding = false;         /* セットを追加のフォームを開いているか */
let histAddKey = null;          /* フォームで選んでいる ex|label */
let histUndo = null;             /* {date, exId, set} 消した直後の取り消し用 */
let histUndoTimer = null;

function noonAt(date){ return asDate(date).getTime() + 12*3600*1000; }
function splitKey(k){ const i = (k||"").indexOf("|"); return i < 0 ? [k||"", ""] : [k.slice(0,i), k.slice(i+1)]; }
/* 種目選び（catalog() を動きごとにグループ化した <optgroup>） */
function exOptionsHTML(selectedKey){
  const groups = {};
  catalog().forEach(row=>{
    const p = patternOf(row.ex);
    (groups[p] = groups[p] || []).push(row);
  });
  return PATTERN_ORDER.filter(p=>groups[p] && groups[p].length).map(p=>{
    const opts = groups[p].map(row=>{
      const key = row.ex + "|" + (row.label || "");
      return `<option value="${esc(key)}"${key===selectedKey?" selected":""}>${esc(itemName(row))}</option>`;
    }).join("");
    return `<optgroup label="${esc(PATTERN_HEAD[p] || p)}">${opts}</optgroup>`;
  }).join("");
}
/* その日の記録を (ex, label) ごとにまとめる */
function dayGroups(date){
  const s = state.sessions[date], groups = [];
  (s && s.entries || []).forEach(e=>{
    if(!EXMAP[e.ex]) return;
    e.sets.forEach(st=>{
      const label = setLabel(date, e.ex, st), key = e.ex + "|" + label;
      let g = groups.find(x=>x.key===key);
      if(!g){ g = {ex:e.ex, label, key, sets:[]}; groups.push(g); }
      g.sets.push(st);
    });
  });
  return groups;
}
function openDaySheet(date){
  histAdding = false; histAddKey = null;
  renderDaySheet(date);
  sheet.classList.add("on");
}
function addSetFormHTML(date, groups){
  const defKey = groups[0] ? groups[0].key : (catalog()[0] ? catalog()[0].ex + "|" + (catalog()[0].label||"") : "");
  const key = histAddKey || defKey;
  const [exId] = splitKey(key);
  const ex = EXMAP[exId] || EXMAP[catalog()[0].ex];
  return `<div class="card">
    <h4>セットを追加</h4>
    <div class="fld"><label>種目</label><select id="haddex">${exOptionsHTML(key)}</select></div>
    <div class="entry" style="margin-top:10px">
      ${ex.kind==="w" ? `<div class="fld"><label>重さ kg</label><input type="number" id="haddw" step="0.5" min="0" inputmode="decimal"></div>` : ""}
      <div class="fld"><label>${ex.kind==="t"?"秒":"回数"}</label><input type="number" id="haddr" min="1" inputmode="numeric"></div>
      <div class="fld"><label>きつさ 1-10（任意）</label><input type="number" id="hadde" min="1" max="10" inputmode="numeric"></div>
    </div>
    <p class="lastline" id="haddmsg" style="min-height:16px"></p>
    <div class="rowbtns"><button id="haddgo">この内容で追加</button><button id="haddcancel">やめる</button></div>
  </div>`;
}
function renderDaySheet(date){
  const s = state.sessions[date];
  const groups = dayGroups(date);
  const noteVal = (s && s.note) || "";
  const showUndo = !!(histUndo && histUndo.date === date);

  const rowsHTML = groups.length ? groups.map(g=>{
    const ex = EXMAP[g.ex];
    const lines = g.sets.map(st=>`
      <div class="setline">
        <span class="val num">${esc(setTextFor({ex:g.ex, label:g.label}, st))}</span>
        ${st.rpe?`<span class="rpe">きつさ ${st.rpe}</span>`:""}
        <button class="del" data-hex="${esc(g.ex)}" data-hid="${esc(st.id||"")}" aria-label="このセットを消す">消す</button>
      </div>`).join("");
    return `<div class="card"><h4>${esc(itemName({ex:g.ex, label:g.label}))}</h4>${lines}</div>`;
  }).join("") : `<p class="lastline" style="margin-top:0">この日の記録はまだありません。</p>`;

  sheetInner.innerHTML = `<div data-histday="${esc(date)}" hidden></div>
    <h4>${esc(fmtDate(date))}の記録</h4>
    ${showUndo ? `<div class="flash">セットを消しました。<button id="hundo">取り消す</button></div>` : ""}
    ${rowsHTML}
    ${histAdding ? addSetFormHTML(date, groups) : `<div class="rowbtns"><button id="haddopen">セットを追加</button></div>`}
    <div class="card">
      <h4>メモ</h4>
      <textarea id="hnote" placeholder="睡眠、体調、気づいたこと。">${esc(noteVal)}</textarea>
    </div>
    <div class="rowbtns"><button id="hclose">閉じる</button></div>`;

  sheetInner.querySelectorAll(".del[data-hid]").forEach(b=>{
    b.onclick = ()=> histDeleteSet(date, b.dataset.hex, b.dataset.hid);
  });
  if(showUndo){
    const u = sheetInner.querySelector("#hundo");
    if(u) u.onclick = histUndoDelete;
  }
  const openBtn = sheetInner.querySelector("#haddopen");
  if(openBtn) openBtn.onclick = ()=>{ histAdding = true; histAddKey = null; renderDaySheet(date); };
  const exSel = sheetInner.querySelector("#haddex");
  if(exSel){
    exSel.onchange = ()=>{ histAddKey = exSel.value; renderDaySheet(date); };
    sheetInner.querySelector("#haddcancel").onclick = ()=>{ histAdding = false; renderDaySheet(date); };
    sheetInner.querySelector("#haddgo").onclick = ()=>{
      const [exId, label] = splitKey(exSel.value);
      const ex = EXMAP[exId];
      const msgEl = sheetInner.querySelector("#haddmsg");
      const rIn = sheetInner.querySelector("#haddr"), wIn = sheetInner.querySelector("#haddw"), eIn = sheetInner.querySelector("#hadde");
      const r = Math.round(parseFloat((rIn && rIn.value) || ""));
      if(!r || r < 1){ msgEl.textContent = (ex.kind==="t"?"秒数":"回数") + "を入れてください"; return; }
      let w;
      if(ex.kind === "w"){
        w = parseFloat((wIn && wIn.value) || "");
        if(isNaN(w) || w < 0){ msgEl.textContent = "重さを入れてください"; return; }
      }
      const st = {id:newSetId(), at:noonAt(date), r};
      if(ex.kind === "w") st.w = w;
      const epv = eIn ? parseFloat(eIn.value) : NaN;
      if(!isNaN(epv) && epv >= 1 && epv <= 10) st.rpe = Math.round(epv);
      /* label は組み方を選ばなかったときも "" を明示して入れる。無いままだと setLabel() が
         その日の plan から拾ってしまい、たまたま別の組み方に化けることがある */
      st.label = label || "";
      entryFor(date, exId, true).sets.push(st);
      persistSession(date);
      if(typeof syncNow === "function") syncNow();
      histAdding = false; histAddKey = null;
      render();
      renderDaySheet(date);
    };
  }
  const noteEl = sheetInner.querySelector("#hnote");
  if(noteEl){
    let t = null;
    noteEl.oninput = ()=>{
      clearTimeout(t);
      t = setTimeout(()=>{
        const sx = session(date);
        sx.note = noteEl.value; sx.noteAt = stampNow();
        persistSession(date);
        if(typeof syncNow === "function") syncNow();
        render();
      }, 600);
    };
  }
  sheetInner.querySelector("#hclose").onclick = ()=> sheet.classList.remove("on");
}
/* 確認なしで消し、5秒だけ取り消せるようにする */
function histDeleteSet(date, exId, setId){
  const s = state.sessions[date]; if(!s) return;
  const e = (s.entries||[]).find(x=>x.ex===exId); if(!e) return;
  const idx = e.sets.findIndex(x=>x.id===setId); if(idx < 0) return;
  const removed = e.sets.splice(idx,1)[0];
  if(removed.id) s.del = (s.del||[]).concat([removed.id]);
  if(!e.sets.length) s.entries = s.entries.filter(x=>x!==e);
  persistSession(date);
  if(typeof syncNow === "function") syncNow();
  clearTimeout(histUndoTimer);
  histUndo = {date, exId, set: removed};
  histUndoTimer = setTimeout(()=>{
    histUndo = null;
    /* シート全体を作り直さない。セットを追加のフォームを書きかけている途中かもしれないので、
       消えるべきは「取り消す」の帯だけ */
    const marker = sheetInner.querySelector("[data-histday]");
    if(marker && marker.dataset.histday === date){
      const flash = sheetInner.querySelector(".flash");
      if(flash) flash.remove();
    }
  }, 5000);
  render();
  renderDaySheet(date);
}
function histUndoDelete(){
  if(!histUndo) return;
  clearTimeout(histUndoTimer);
  const {date, exId, set} = histUndo;
  histUndo = null;
  const s = session(date);
  /* 消した id は del に残したままにする（同期の del は集合として増える一方の印なので、
     ここで local から外しても、後で他端末やリモートと合流したときに復活し損ねてまた消える。
     代わりに新しい id を振って、別のセットとして書き戻す */
  let e = s.entries.find(x=>x.ex===exId);
  if(!e){ e = {ex:exId, sets:[]}; s.entries.push(e); }
  e.sets.push(Object.assign({}, set, {id: newSetId()}));
  persistSession(date);
  if(typeof syncNow === "function") syncNow();
  render();
  renderDaySheet(date);
}
/* 記録していない日を足す（今日以前の日付だけ選べる） */
function openAddDaySheet(){
  sheetInner.innerHTML = `<h4>記録していない日を足す</h4>
    <p class="lastline" style="margin-top:0">日付を選ぶと、その日の記録シートが開きます。</p>
    <div class="fld"><label>日付</label><input type="date" id="adddate" max="${TODAY}" value="${TODAY}"></div>
    <div class="rowbtns"><button id="haddayGo">この日を開く</button><button id="haddayClose">閉じる</button></div>`;
  sheetInner.querySelector("#haddayGo").onclick = ()=>{
    const v = sheetInner.querySelector("#adddate").value;
    if(!v || v > TODAY) return;
    openDaySheet(v);
  };
  sheetInner.querySelector("#haddayClose").onclick = ()=> sheet.classList.remove("on");
  sheet.classList.add("on");
}
