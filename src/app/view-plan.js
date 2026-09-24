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

