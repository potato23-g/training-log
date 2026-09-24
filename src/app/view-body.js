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
    </div>
    ${muscleBarCard(ranked, bodyDays)}`;
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
/* 数の表示: 整数はそのまま、半端は小数1桁 */
function fmtSets(v){
  const r = Math.round(v*10)/10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
/* 部位ごとの有効セットを横棒で並べたカード。目標線は7日でWEEK_TARGET、14・30日はその日数に比例。
   図の部位が小さくてタップしづらい問題の代わりにもなるよう、棒をタップしても同じ内訳が開く */
function muscleBarCard(ranked, days){
  const target = WEEK_TARGET / 7 * days;
  const scaleMax = Math.max(1, target, ...ranked.map(x=>x.v));
  const rows = ranked.map(x=>{
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

