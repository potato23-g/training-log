/* ============================================================
   提案（ルールベース。外部通信なし。state.sessions の実績だけで判断する）
   ・動きごとの今の段と、次の段まであと何回か（伸ばし方 progress.js と同じ決まり）
   ・疲れのしるしが出たら「軽い週」
   ・大きな部位が長く抜けていないか
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
/* 動きの呼び名 */
const PATTERN_NAME = {squat:"しゃがむ", lunge:"横に踏み出す", hinge:"股関節を折る", hpush:"胸で押す", fly:"胸を開く",
  pull:"引く", vpush:"上へ押す", bridge:"尻を持ち上げる", carry:"持って歩く", shrug:"肩をすくめる", raise:"腕を上げる",
  curl:"肘を曲げる", ext:"肘を伸ばす", calf:"かかとを上げる", abs:"お腹", side:"わき腹"};

/* 動きごとの今の段（記録のある動きだけ） */
function ladderRows(){
  const out = [];
  PATTERN_ORDER.forEach(pat => {
    const K = patternNext(pat);
    if(!K) return;
    const p = progressFor(K), u = unitOf(EXMAP[K.ex].kind);
    const hs = houseOf(K.ex);
    const tip = hs.up ? "。次の一手は「" + gearText(hs.up) + "」" : "";
    let next;
    if(p.change === "top"){
      next = "今の道具では、この動きの一番上の段で、回数も上限です" + tip;
    }else{
      const opts = itemOptions(K), i = p.opt ? optionIndex(opts, p.opt) : -1, nx = i >= 0 ? opts[i + 1] : null;
      const heavier = nx && (nx.key <= p.opt.key * PROG.jumpRatio || nx.key - p.opt.key <= PROG.jumpKg);
      const up = heavier ? null : stepItem(K, 1);
      const left = Math.max(0, Math.round((p.hi - p.target) / p.step)) + 1;   /* 今日を含めて、上限の回に届くまでの回数 */
      next = heavier ? "あと" + left + "回のトレーニングで、ダンベルを一段重く（" + nx.text + "）"
           : up ? "あと" + left + "回のトレーニングで「" + itemName(up) + "」へ"
           : "あと" + left + "回のトレーニングで" + u + "数の上限（" + p.hi + "）。今の道具では、この先の段はありません";
    }
    out.push({pat, item: K, p, u, next});
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

/* 軽い週のカード（勧めるとき・軽い週のあいだ） */
function deloadCard(){
  const d = deloadAdvice();
  if(!d) return "";
  if(d.active) return `<div class="card">
      <h4>軽い週（${esc(fmtDate(d.until))}まで）</h4>
      <p style="margin:0 0 6px;font-size:14px">セット数を半分にして、目標の回数は据え置いています。疲れを抜いてから、また伸ばしていきます。</p>
      <div class="rowbtns"><button data-act="deloadoff">軽い週をやめる</button></div>
    </div>`;
  return `<div class="card">
      <h4>今週は軽い週にしませんか</h4>
      <p style="margin:0 0 6px;font-size:14px">${d.patterns.map(p => esc(PATTERN_NAME[p] || p)).join("・")}で、目標に届かない回が続いているか、同じ目標なのにきつさが上がってきています。7日間だけセット数を半分にすると、疲れが抜けてまた伸びやすくなります。</p>
      <div class="rowbtns"><button data-act="deloadon">今週を軽い週にする</button></div>
    </div>`;
}

/* ---------- 提案 ---------- */
function viewPlan(){
  const total = sortedDates().filter(d=>(state.sessions[d].entries||[]).some(e=>e.sets.length)).length;
  if(total < 1){
    return `<div class="empty">記録がまだありません。記録すると、動きごとの今の段と、次の段までの回数がここに出ます。</div>`;
  }
  const rows = ladderRows();
  const ladder = rows.length ? `<div class="card">${rows.map(r => `
      <div class="ladder">
        <p class="lk">${esc(PATTERN_NAME[r.pat] || r.pat)}</p>
        <p class="ln"><b>${esc(itemName(r.item))}</b>　次の目標 ${r.p.target}${r.u}（幅 ${r.p.lo}〜${r.p.hi}${r.u}）</p>
        <p class="lastline" style="margin-top:0">${esc(r.next)}</p>
      </div>`).join("")}
    </div>` : "";
  const balance = balanceSuggestions();
  const balanceCards = balance.length
    ? balance.map(s=>`<div class="card">
        <h4>${esc(s.title)}</h4>
        ${s.body ? `<p style="margin:0 0 6px;font-size:14px">${esc(s.body)}</p>` : ""}
        <p class="lastline" style="margin-top:0">${esc(s.why)}</p>
      </div>`).join("")
    : `<div class="card"><p style="margin:0;font-size:14px">直近30日、主要な部位はひと通り使えています。</p></div>`;

  return `
    ${deloadCard()}
    <h3 class="sec">動きごとの今の段</h3>
    ${ladder}
    <h3 class="sec">部位のバランス</h3>
    ${balanceCards}
    <div class="card">
      <h4>この提案の仕組み</h4>
      <p style="margin:0;font-size:14px">前回の同じ組み方で、全部のセットが目標に届き、きつさの平均が9以下なら、次は1回（秒の種目は5秒）増やします。回数の幅の上限に届いたら、持っているダンベルで無理なく重くできれば重く、できなければ同じ動きの一段難しい組み方に進みます。2回続けて届かないときは1回減らします。判定はこの端末の中で行い、ClaudeなどのAIには送っていません。持っていない重さは勧めません。</p>
    </div>`;
}
