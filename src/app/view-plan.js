/* ============================================================
   提案（ルールベース。外部通信なし。state.sessions の実績だけで判断する）
   ・動きごとの今の段階と、次の段階まであと何回か（伸ばし方 progress.js と同じ決まり）
   ・同じ重さで回数が続けて減っている動きが2つ以上あれば「軽い週」を勧める
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
/* 動きのまとまり（rules.js の PATTERN_GROUP）の呼び名 */
const PATTERN_NAME = {squat:"しゃがむ", lunge:"横に踏み出す", hinge:"股関節を折る", hpush:"胸で押す", fly:"胸を開く",
  pull:"引く", vpush:"上へ押す", bridge:"お尻を持ち上げる", carry:"持って歩く", shrug:"肩をすくめる", raise:"腕を横に上げる",
  fraise:"腕を前に上げる", rear:"腕を後ろへ開く", kneeext:"膝を伸ばす", abduct:"脚を横に上げる", adduct:"脚を内側に寄せる", backext:"背中を反らす",
  curl:"肘を曲げる", ext:"肘を伸ばす", calf:"かかとを上げる", abs:"お腹", side:"わき腹",
  legcurl:"膝を曲げる", pullover:"頭の上から引く", twist:"ひねる"};

/* 動きごとの今の段階（記録のある動きだけ） */
function ladderRows(){
  const out = [];
  PATTERN_ORDER.forEach(pat => {
    const K = patternNext(pat);
    if(!K) return;
    const p = progressFor(K), u = unitOf(EXMAP[K.ex].kind);
    const hs = houseOf(K.ex);
    const tip = hs.up ? "。さらに負荷を上げるなら「" + gearText(hs.up) + "」" : "";
    let next;
    if(p.change === "top"){
      next = "今の道具では、この動きの一番上の段階で、回数も上限です" + tip;
    }else{
      const opts = itemOptions(K), i = p.opt ? optionIndex(opts, p.opt) : -1, nx = i >= 0 ? opts[i + 1] : null;
      const heavier = nx && (nx.key <= p.opt.key * PROG.jumpRatio || nx.key - p.opt.key <= PROG.jumpKg);
      const up = heavier ? null : stepItem(K, 1);
      const left = Math.max(0, Math.round((p.hi - p.target) / p.step)) + 1;   /* 今日を含めて、上限の回に届くまでの回数 */
      next = heavier ? "あと" + left + "回のトレーニングで、ダンベルを一段重く（" + nx.text + "）"
           : up ? "あと" + left + "回のトレーニングで「" + itemName(up) + "」へ"
           : "あと" + left + "回のトレーニングで" + u + "数が範囲の上限（" + p.hi + u + "）に届きます。今の道具では、この先の段階はありません";
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
      const cands = EX.filter(e=>e.p.includes(m) && exOn(e.id)).slice(0,3).map(e=>e.name);
      out.push({kind:"balance", muscle:m,
        title: MUSCLES[m] + "：直近30日でほぼ使えていません",
        body: cands.length ? "候補: " + cands.join("、") : "",
        why: "有効セット数 " + v.toFixed(1) + "（大きい筋肉なので、優先して入れたい部位です）"});
    }
  });
  return out;
}

/* 軽い週のカード（勧めるとき・軽い週のあいだ） */
function deloadCard(){
  const d = deloadAdvice();
  if(!d) return "";
  if(d.active) return `<div class="card">
      <h4>軽めの週（${esc(fmtDate(d.until))}まで）</h4>
      <p style="margin:0 0 6px;font-size:14px">1回の種目を3つまでにして、目標の回数は据え置いています。疲れを抜いてから、また伸ばしていきます。</p>
      <div class="rowbtns"><button data-act="deloadoff">軽めの週をやめる</button></div>
    </div>`;
  return `<div class="card">
      <h4>今週は軽めの週にしませんか</h4>
      <p style="margin:0 0 6px;font-size:14px">${d.patterns.map(p => "「" + esc(PATTERN_NAME[p] || p) + "」").join("")}の動きで、同じ重さでの回数が2回続けて減っています。7日間だけ1回の種目を3つまでにすると、疲れが抜けて、また伸びやすくなります。</p>
      <div class="rowbtns"><button data-act="deloadon">今週を軽めの週にする</button></div>
    </div>`;
}

/* ---------- 提案 ---------- */
function viewPlan(){
  const total = sortedDates().filter(d=>(state.sessions[d].entries||[]).some(e=>e.sets.length)).length;
  if(total < 1){
    return `<div class="empty">記録がまだありません。記録すると、動きごとの今の段階と、次の段階までの回数がここに出ます。</div>`;
  }
  const rows = ladderRows();
  /* 見出しは動きのまとまりごとに1回（同じまとまりの種目が続くあいだは出さない） */
  const head = (r, i) => i && groupOf(rows[i - 1].pat) === groupOf(r.pat) ? ""
    : `<p class="lk">${esc(PATTERN_NAME[groupOf(r.pat)] || "")}</p>`;
  const ladder = rows.length ? `<div class="card">${rows.map((r, i) => `
      <div class="ladder">
        ${head(r, i)}
        <p class="ln"><b>${esc(itemName(r.item))}</b>　次の目標 ${r.p.target}${r.u}（範囲 ${r.p.lo}〜${r.p.hi}${r.u}）</p>
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
    <h3 class="sec">動きごとの今の段階</h3>
    ${ladder}
    <h3 class="sec">部位のバランス</h3>
    ${balanceCards}
    <div class="card">
      <h4>この提案の仕組み</h4>
      <p style="margin:0;font-size:14px">前回の同じやり方で、全部のセットが目標に届いたら、次は1回（秒の種目は5秒）増やします。回数が範囲の上限に届いたら、持っているダンベルで無理なく重くできれば重く、できなければ同じ動きの一段難しいやり方に進みます。</p>
      <p style="margin:8px 0 0;font-size:14px">目標より少なかったときは、前回の最高の回数を次の目標にします。ダンベルの重さを変えた回は、その重さでできた回数から始め直します。同じ重さで2回続けて回数の範囲の下限より少ないときだけ、一段軽く（やさしく）します。</p>
      <p style="margin:8px 0 0;font-size:14px">種目は、週の目標から遠い部位を優先して選び、メインで鍛える部位が週の目標に届いていない種目を、1回${SESSION_MAX.exercises}種目・${SESSION_MAX.minutes}分までの範囲で入れます。メインで鍛えた部位は、部位ごとに決めた日数を空けてから、また鍛えます。${UNUSED_DAYS}日以上使えていない部位を使う種目が1つも入らないときは、その部位をメインで鍛える種目を、ほかの種目より先に入れます。その部位が、回復の途中の部位も使う種目でしか鍛えられないときは、回復の途中でもその種目を入れます。今日「筋肉痛の部位」で選んだ部位は、メインで鍛えません。設定の「${EX_OFF_HEAD}」で外した種目は入れません。</p>
      <p style="margin:8px 0 0;font-size:14px">今日のメニューの種目と反対の部位（胸と背中、上腕二頭筋と上腕三頭筋など）を鍛える種目が入れられるときは、その種目を先に選んで隣に並べます。1セットずつ交互に行うと、片方を動かしているあいだにもう片方が休めます。</p>
      <p class="lastline">${esc(recoverGapText())}</p>
    </div>`;
}
