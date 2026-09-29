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
      <p class="lastline" style="margin-top:2px">回復の目安: ${recoverGap(selMuscle) ? "中" + recoverGap(selMuscle) + "日" : "連日でもよい"}。${
        soreToday().includes(selMuscle) ? "今日は筋肉痛と選んでいます"
        : recoverDaysLeft(selMuscle) ? "次に主役にできるのは " + fmtDate(addDays(TODAY, recoverDaysLeft(selMuscle))) + " から"
        : "今日から主役にできます"}</p>
      ${hits.length ? `<ul class="plain">${hits.map(h=>`<li>${fmtDate(h.d)}　${h.name}　${h.n}セット（${h.role}）</li>`).join("")}</ul>`
        : `<p style="font-size:14px;margin:6px 0 0">この期間、この部位を使う種目はありません。</p>`}
      ${exercisesForMuscle(selMuscle)}
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
    </div>
    ${muscleBarCard(load, bodyDays)}`;
  const side = `
    ${detail}
    <div class="card">
      <h4>使えていない部位</h4>
      ${zero.length ? `<div class="mlist">${zero.map(x=>`<span class="chip">${MUSCLES[x.k]}</span>`).join("")}</div>`
        : `<p style="margin:0;font-size:14px">この期間、主要な部位はひと通り使えています。</p>`}
    </div>`;
  const note = `
    <div class="card">
      <h4>有効セット数とは</h4>
      <p style="margin:0;font-size:14px">主に効く部位は1セットを1.0、補助的に使う部位は0.5として足した数です。重量は含めていません。週あたり各部位10前後が初心者の一般的な目安です（個人差があります）。</p>
    </div>`;
  return `<div class="splitcols"><div>${fig}</div><div>${side}${note}</div></div>`;
}
/* この部位に効く種目の一覧（主に効く／補助で使う）。押すと種目タブの解説が開き、
   今日のメニューにまだ無ければその場で足せる */
function exByRow(e){
  /* 「今日は外した」種目（skip:true）は、今日のメニューには実質無いのと同じ。印を付けて
     足すボタンを隠すと戻せなくなるので、外した種目は「まだ無い」側として扱う
     （addToProgramToday はskipを消して戻す作りなので、そのまま押せば戻る） */
  const inPlan = todayItems().some(it=>it.ex===e.id && !it.skip);
  const noGear = holdOf(e.id) && !gearOptions(e.id).length;
  const right = inPlan ? `<span class="exbytag plan">今日のメニューにある</span>`
    : noGear ? `<span class="exbytag warn">ダンベルが必要</span>`
    : `<button class="exbyadd" data-act="addtoday" data-ex="${e.id}">今日のメニューに足す</button>`;
  return `<div class="exbyrow">
    <button class="exbyname" data-act="goref" data-ex="${e.id}">${esc(e.name)}</button>
    ${right}
  </div>`;
}
function exByList(title, list){
  if(!list.length) return "";
  return `<p class="exbyhead">${title}</p><div class="exbylist">${list.map(exByRow).join("")}</div>`;
}
function exercisesForMuscle(m){
  const primary = EX.filter(e=>e.p.includes(m));
  const secondary = EX.filter(e=>!e.p.includes(m) && (e.s||[]).includes(m));
  return exByList("主に効く種目", primary) + exByList("補助で使う種目", secondary);
}
/* 数の表示: 整数はそのまま、半端は小数1桁 */
function fmtSets(v){
  const r = Math.round(v*10)/10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
/* 部位ごとの有効セットを横棒で並べたカード。目標線は7日でWEEK_TARGET、14・30日はその日数に比例。
   図の部位が小さくてタップしづらい問題の代わりにもなるよう、棒をタップしても同じ内訳が開く。
   並びは今の数値の大小ではなく、体の中で大きい部位（PRIORITY）を先に固定する。
   数値順だと記録を足すたびに並びが入れ替わり、指の下で棒が動いてしまうため */
function muscleBarCard(load, days){
  const target = WEEK_TARGET / 7 * days;
  const order = Object.keys(MUSCLES).map(k=>({k, v: load[k] || 0}))
    .sort((a, b) => (PRIORITY[b.k] || 0) - (PRIORITY[a.k] || 0));
  /* 目盛りいっぱいに余白を持たせる。ちょうど余白が無いと、誰も目標に届いていないときに
     目標の縦線が右端に張り付いて見えなくなるため */
  const scaleMax = Math.max(1, target, ...order.map(x=>x.v)) * 1.15;
  const rows = order.map(x=>{
    const pct = Math.min(100, x.v / scaleMax * 100);
    const tpct = Math.min(100, target / scaleMax * 100);
    const cls = "mbar" + (x.v >= target ? " reach" : "") + (x.k === selMuscle ? " sel" : "");
    return `<button class="${cls}" data-act="selmuscle" data-m="${x.k}">
      <span class="mbn">${MUSCLES[x.k]}</span>
      <span class="mbtrack"><i class="mbfill" style="width:${pct}%"></i><i class="mbtgt" style="left:${tpct}%"></i></span>
      <span class="mbv num">${fmtSets(x.v)}</span>
    </button>`;
  }).join("");
  return `<div class="card">
    <h4>部位ごとの有効セット</h4>
    <p class="lastline" style="margin-top:0">縦線は目標（${days}日で${fmtSets(target)}セット）。大きい部位から並べています。棒をタップすると内訳が出ます。</p>
    <div class="mbars">${rows}</div>
  </div>`;
}
ACTIONS.selmuscle = el => { selMuscle = el.dataset.m; render(); };

