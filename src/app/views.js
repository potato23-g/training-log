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
      <div class="rowbtns"><button data-act="addtoday" data-ex="${ex.id}">今日のメニューに追加</button></div>
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
      <p style="margin:0;font-size:14px">関節（膝・腰・肩）に鋭い痛みが走ったら、その種目はその場で中止してください。翌日以降にくる筋肉痛とは別物です。痛みが数日続く場合は整形外科の判断が先で、このアプリの助言は当てになりません。</p>
    </div>`;

  return `<div class="card"><select id="exSel">${opts}</select></div>
    <div class="splitcols"><div>${left}</div><div>${right}</div></div>`;
}

/* ---------- からだ ---------- */
function viewBody(){
  const load = muscleLoad(bodyDays);
  const vals = Object.values(load);
  const max = Math.max(1, ...vals);
  const ranked = Object.keys(MUSCLES).map(k=>({k, v:load[k]})).sort((a,b)=>b.v-a.v);
  const zero = ranked.filter(x=>x.v<=0);

  let detail = "";
  if(selMuscle){
    const hits = [];
    for(const d of sortedDates()){
      if(daysAgo(d) >= bodyDays) continue;
      for(const e of (state.sessions[d].entries||[])){
        const ex = EXMAP[e.ex]; if(!ex) continue;
        const role = ex.p.includes(selMuscle) ? "主" : ((ex.s||[]).includes(selMuscle) ? "補助" : null);
        if(role) hits.push({d, name:ex.name, n:e.sets.length, role});
      }
    }
    detail = `<div class="card">
      <h4>${MUSCLES[selMuscle]}</h4>
      <p class="lastline" style="margin-top:0">直近${bodyDays}日で <b>${(load[selMuscle]||0).toFixed(1)}</b> 有効セット</p>
      ${hits.length ? `<ul class="plain">${hits.map(h=>`<li>${fmtDate(h.d)}　${h.name}　${h.n}セット（${h.role}）</li>`).join("")}</ul>`
        : `<p style="font-size:14px;margin:6px 0 0">この期間、この部位を使う種目はありません。</p>`}
      ${zeroAdvice(selMuscle)}
    </div>`;
  }

  const fig = `
    <div class="card">
      <h4>直近${bodyDays}日の刺激</h4>
      ${bothFigs(true)}
      <div class="legend"><span>少</span><span class="bar"></span><span>多</span></div>
      <p class="lastline" style="text-align:center">部位をタップすると内訳が出ます。</p>
      <div class="rowbtns">
        <button data-act="days" data-d="7" ${bodyDays===7?'style="border-color:var(--ink);color:var(--ink)"':''}>7日</button>
        <button data-act="days" data-d="14" ${bodyDays===14?'style="border-color:var(--ink);color:var(--ink)"':''}>14日</button>
        <button data-act="days" data-d="30" ${bodyDays===30?'style="border-color:var(--ink);color:var(--ink)"':''}>30日</button>
      </div>
    </div>`;
  const side = `
    ${detail}
    <div class="card">
      <h4>使えていない部位</h4>
      ${zero.length ? `<div class="mlist">${zero.map(x=>`<span class="chip">${MUSCLES[x.k]}</span>`).join("")}</div>
        <p class="lastline">全部を毎週埋める必要はありません。ただし大腿四頭筋・大殿筋・ハムストリング・広背筋がここに並び続けている場合は、メニューの組み方を見直したほうがいいです。体の中で大きい筋肉が抜けていると、同じ時間をかけても効果の範囲が狭くなります。</p>`
        : `<p style="margin:0;font-size:14px">この期間、主要な部位はひと通り使えています。</p>`}
    </div>`;
  const note = `
    <div class="card">
      <h4>有効セット数とは</h4>
      <p style="margin:0;font-size:14px">主に効く部位は1セットを1.0、補助的に使う部位は0.5として足した数です。重量は含めていません。週あたり各部位10前後が初心者の一般的な目安とされますが、この数字は研究間でばらつきが大きく、個人差も大きいので、絶対視しないでください。偏りを見るための指標だと思ってもらうのが適切です。</p>
    </div>`;
  return `<div class="splitcols"><div>${fig}</div><div>${side}${note}</div></div>`;
}
function zeroAdvice(m){
  const cands = EX.filter(e=>e.p.includes(m)).slice(0,3);
  if(!cands.length) return "";
  return `<p class="lastline">この部位を主に使う種目: ${cands.map(c=>c.name).join("、")}</p>`;
}

/* ============================================================
   提案（ルールベース。外部通信なし。state.sessions の実績だけで判断する）
   ============================================================ */

/* ある種目の、記録のあるセッションだけを古い→新しい順に並べる */
function exerciseHistory(exId){
  const out = [];
  sortedDates().slice().reverse().forEach(d=>{
    const e = (state.sessions[d].entries||[]).find(x=>x.ex===exId && x.sets && x.sets.length);
    if(e) out.push({date:d, sets:e.sets});
  });
  return out;
}
function sessionSummary(exId, sets){
  const kind = EXMAP[exId].kind;
  const avgRpe = sets.reduce((a,s)=>a+(s.rpe||0),0) / sets.length;
  const maxR = sets.reduce((a,s)=>Math.max(a,s.r||0),0);
  const vol = kind==="w" ? sets.reduce((a,s)=>a+(s.w||0)*(s.r||0),0) : sets.reduce((a,s)=>a+(s.r||0),0);
  return {avgRpe, maxR, vol, kind};
}

/* 種目ごとの「そろそろ変え時／まだ様子見／余裕あり」判定。
   持っているダンベルで一段重くできるならその持ち替えを先に出し、できなければ
   EX[id].up（可動域・テンポ・片側化など）と日用品のやり方を次の一手として出す。 */
function heavierOption(exId){
  if(EXMAP[exId].kind !== "w") return null;
  const hist = exerciseHistory(exId), opts = gearOptions(exId);
  if(!hist.length || !opts.length) return null;
  const w = hist[hist.length-1].sets[0].w;
  const cur = optionByTotal(exId, w) || nearestOption(opts, +w || 0);
  const i = optionIndex(opts, cur);
  return i >= 0 && i < opts.length - 1 ? opts[i+1] : null;
}
function nextStepText(exId){
  const ex = EXMAP[exId], next = heavierOption(exId), hs = houseOf(exId);
  if(next) return "持っているダンベルで一段重い「" + next.text + "」に持ち替える";
  const up = exUp(exId), first = gearText(up && up[0] ? up[0] : "");
  return first + (hs.up ? (first ? "。" : "") + "日用品を使うなら「" + hs.up + "」" : "");
}

function levelSuggestions(){
  const out = [];
  Object.keys(EXMAP).forEach(exId=>{
    const ex = EXMAP[exId];
    if(!ex.up || !ex.up.length) return;
    const hist = exerciseHistory(exId);
    if(hist.length < 3) return;
    const ceil = clampR(ex.kind, 9999);
    const sums = hist.map(h=>sessionSummary(exId, h.sets));
    const recent3 = sums.slice(-3);

    const atCeiling = recent3.every(s=>s.maxR >= ceil*0.9 && s.avgRpe >= 8.5);
    if(atCeiling){
      out.push({exId, kind:"levelup",
        title: itemName({ex:exId}) + "：そろそろ切り替え時",
        body: "次の一手 → " + nextStepText(exId),
        why: "直近3回とも" + (ex.kind==="t" ? "秒数" : "回数") + "が上限付近で、きつさの平均が " + recent3[recent3.length-1].avgRpe.toFixed(1) + "。" + (ex.kind !== "w" ? "今のやり方のままでは伸びしろが少ない状態です。"
             : heavierOption(exId) ? "持っているダンベルで、まだ一段重くできます。"
             : "持っているダンベルの一番重い使い方でも上限に来ています。")});
      return;
    }

    if(hist.length >= 4){
      const sums4 = sums.slice(-4);
      const first = sums4[0].vol, last = sums4[sums4.length-1].vol;
      const avgRpe4 = sums4.reduce((a,s)=>a+s.avgRpe,0) / sums4.length;
      if(first > 0 && last <= first*1.05 && avgRpe4 >= 8){
        out.push({exId, kind:"plateau",
          title: itemName({ex:exId}) + "：伸び悩みぎみ",
          body: "次の一手 → " + nextStepText(exId),
          why: "直近4回できつさは高いまま（平均 " + avgRpe4.toFixed(1) + "）ですが、量はほぼ横ばいです。"});
        return;
      }
    }

    const easy3 = recent3.every(s=>s.avgRpe <= 6 && s.maxR < ceil*0.7);
    if(easy3){
      out.push({exId, kind:"easy",
        title: itemName({ex:exId}) + "：余裕が続いています",
        body: "回数を増やすか、早めに次の一手 → " + nextStepText(exId),
        why: "直近3回のきつさ平均が " + (recent3.reduce((a,s)=>a+s.avgRpe,0)/3).toFixed(1) + "。8〜9を狙う設計に対して軽すぎる状態です。"});
    }
  });
  return out;
}

/* 大きな部位が長期間ゼロに近い＝メニュー全体の見直しサイン */
function balanceSuggestions(){
  const BIG = ["quads","glutes","hams","lats"];
  const load30 = muscleLoad(30);
  const out = [];
  BIG.forEach(m=>{
    const v = load30[m] || 0;
    if(v <= 2){
      const cands = EX.filter(e=>e.p.includes(m)).slice(0,3).map(e=>e.name);
      out.push({kind:"balance", muscle:m,
        title: MUSCLES[m] + "：直近30日でほぼ使えていません",
        body: cands.length ? "候補: " + cands.join("、") : "",
        why: "有効セット数 " + v.toFixed(1) + "（体の中で大きい筋肉なので、抜けると効果の範囲が狭くなります）"});
    }
  });
  return out;
}

function planSummary(){
  const totalSessions = sortedDates().filter(d=>(state.sessions[d].entries||[]).some(e=>e.sets.length)).length;
  return { totalSessions, level: levelSuggestions(), balance: balanceSuggestions() };
}

/* ---------- 提案 ---------- */
function viewPlan(){
  const p = planSummary();
  if(p.totalSessions < 3){
    return `<div class="empty">記録がまだ少ないため、提案はもう少し先になります。<br>あと${3 - p.totalSessions}回ほど記録すると、傾向が見えてきます。</div>`;
  }

  const levelCards = p.level.length
    ? p.level.map(s=>`<div class="card">
        <h4>${s.title}</h4>
        <p style="margin:0 0 6px;font-size:14px">${s.body}</p>
        <p class="lastline" style="margin-top:0">${s.why}</p>
        <div class="rowbtns"><button data-act="goref" data-ex="${s.exId}">種目を見る</button></div>
      </div>`).join("")
    : `<div class="card"><p style="margin:0;font-size:14px">切り替えが必要な種目はありません。いまのメニューのまま続けてください。</p></div>`;

  const balanceCards = p.balance.length
    ? p.balance.map(s=>`<div class="card">
        <h4>${s.title}</h4>
        ${s.body ? `<p style="margin:0 0 6px;font-size:14px">${s.body}</p>` : ""}
        <p class="lastline" style="margin-top:0">${s.why}</p>
      </div>`).join("")
    : `<div class="card"><p style="margin:0;font-size:14px">直近30日、主要な部位はひと通り使えています。</p></div>`;

  return `
    <h3 class="sec">種目の切り替え時</h3>
    ${levelCards}
    <h3 class="sec">部位のバランス</h3>
    ${balanceCards}
    <div class="card">
      <h4>この提案の仕組み</h4>
      <p style="margin:0;font-size:14px">判定はこの端末の中で、記録と「持っているダンベル」の登録を見て、あらかじめ決めたルールで行っています。ClaudeなどのAIには送っていません。重さの提案は登録したダンベルで作れる使い方だけで、持っていない重さは勧めません。「次の一手」は各種目の解説ページと同じ内容です。</p>
    </div>`;
}

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

