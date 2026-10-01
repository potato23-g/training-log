/* ============================================================
   伸ばし方（ダブルプログレッション）と軽い週
   ・前回の同じ組み方で、全部のセットが目標に届いた → 目標を1回（秒の種目は5秒）増やす
   ・目標が回数の幅（解説の「10〜15回」）の上限を超えるなら一段上へ:
       持っているダンベルで無理なく重くできれば重く、できなければ同じ動きの一段難しい組み方へ（回数は幅の下限から）
   ・目標より少ない回は「届かなかった」とは限らない（重いダンベルに替えた・多すぎて抑えた。2026-10-01 本人の指摘）ので、
     疲れとは見ず、実際にやった回数に合わせる:
       重さを変えた回は、その重さでどのセットもできた回数から始め直す。
       同じ重さで少なかった回は、前回の最高の回数を次の目標にする（前回の目標より上げない）。
       同じ重さで2回続けて回数の幅の下限より少なかったときだけ、一段軽く（やさしく）する
   ・軽い週を勧めるのは、同じ組み方・同じ重さで1セットあたりの回数が2回続けて減った動きが2つ以上あるとき
   ・きつさ（RPE）は使わない（2026-09-29 本人の要望で入力をやめた。重さ・回数は本人が調整する）
   ・軽い週（ディロード）の記録は判断に使わない。軽い週のあいだは目標を据え置き、種目を少なめにする（セット数は3で固定）
   記録（その日の組み方と目標）から毎回計算し直すので、別に覚えておく状態は無い（2台で同期しても食い違わない）。
   次のセットの入力欄に入れる数字は suggest.js
   ============================================================ */
const PROG = {
  jumpRatio: 1.6,        /* 重い持ち方へ上げてよい上がり幅（今の1.6倍以下か、+3kg以下） */
  jumpKg: 3,
  deloadDays: 7,         /* 軽い週の長さ */
  deloadGap: 28          /* 前の軽い週からこれだけ空くまでは、次の軽い週を勧めない */
};
let progMemo = {items:{}, hist:{}, deload:null};    /* 描画1回のあいだだけ使い回す（resetProg() で空にする） */
function resetProg(){ progMemo = {items:{}, hist:{}, deload:null}; }
function progStep(kind){ return kind === "t" ? 5 : 1; }
function unitOf(kind){ return kind === "t" ? "秒" : "回"; }
function daysBetween(a, b){ return Math.round((asDate(b) - asDate(a)) / 86400000); }
function addDays(k, n){
  const d = asDate(k); d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* 初めての組み方の目標: 幅のまん中（秒は5秒刻み） */
function midTarget(item){
  const {lo, hi} = repRange(item.ex, item), mid = (lo + hi) / 2;
  return EXMAP[item.ex].kind === "t" ? Math.round(mid / 5) * 5 : Math.floor(mid);
}
/* 候補一覧の中の、その種目・組み方の行（無ければ null） */
function catalogRow(ex, label){
  return catalog().find(c => c.ex === ex && (c.label || "") === (label || "")) || null;
}

/* ---- 軽い週 ----
   始めた日のセッションに deload:true を付ける。その日から7日間が軽い週 */
function deloadDays(){
  if(progMemo.deload) return progMemo.deload;
  const on = new Set();
  Object.keys(state.sessions).forEach(d => {
    if(!state.sessions[d].deload) return;
    for(let i = 0; i < PROG.deloadDays; i++) on.add(addDays(d, i));
  });
  return (progMemo.deload = on);
}
function deloadOn(date){ return deloadDays().has(date); }
/* 今の軽い週の始まりと終わり（軽い週でなければ null） */
function deloadNow(){
  if(!deloadOn(TODAY)) return null;
  for(let i = 0; i < PROG.deloadDays; i++){
    const d = addDays(TODAY, -i);
    if(state.sessions[d] && state.sessions[d].deload) return {start: d, until: addDays(d, PROG.deloadDays - 1)};
  }
  return null;
}

/* ---- その動きをやった回（今日より前・軽い週を除く）。新しい順 ----
   {date, ex, label, item, sets, planned}。label は実際にやった組み方の名前（今は無い組み方は素の種目として扱う） */
function patternHistory(pattern){
  if(progMemo.hist[pattern]) return progMemo.hist[pattern];
  const out = [];
  for(const d of sortedDates()){
    if(d >= TODAY || deloadOn(d)) continue;
    const s = state.sessions[d];
    (s.entries || []).forEach(e => {
      if(!e.sets || !e.sets.length || !EXMAP[e.ex] || patternOf(e.ex) !== pattern) return;
      let label = setLabel(d, e.ex, e.sets[e.sets.length - 1]);
      let item = catalogRow(e.ex, label);
      if(!item){ label = ""; item = catalogRow(e.ex, "") || catalogItem(e.ex); }
      const inPlan = (s.plan || []).find(x => x && x.ex === e.ex);
      /* セット数は3で固定（2026-09-29）。それより前の版が保存した4〜5セットの行（古い版の端末から同期されたものも）は3として見る */
      const planned = Math.min(SETS_PER_EXERCISE, (inPlan && inPlan.sets) || item.sets || SETS_PER_EXERCISE);
      out.push({date: d, ex: e.ex, label, item, sets: e.sets, planned});
    });
  }
  return (progMemo.hist[pattern] = out);
}
/* 1回ぶんの出来: 目標・全部届いたか・その回の重さ・その重さでやったセットの回数（最少・最高・1セットあたり） */
function evalSession(h){
  const kind = EXMAP[h.ex].kind, sets = h.sets, last = sets[sets.length - 1];
  const w = last.w;                                            /* 最後のセットの重さを、その回の重さとする */
  const work = w !== undefined ? sets.filter(s => Math.abs((s.w || 0) - w) < 0.01) : sets;
  const target = typeof last.target === "number" ? last.target : sets[0].r;   /* 目標を書いていない古い記録は1セット目の回数 */
  const allHit = sets.length >= h.planned && work.every(s => (s.r || 0) >= (typeof s.target === "number" ? s.target : target));
  const reps = work.map(s => s.r || 0);
  return {target, allHit, w, kind, minR: Math.min(...reps), maxR: Math.max(...reps),
          meanR: reps.reduce((a, b) => a + b, 0) / reps.length};
}
/* 2回の重さが同じか（重さを使わない種目どうしは同じとみなす） */
function sameWeight(a, b){
  if(a.w === undefined || b.w === undefined) return a.w === b.w;
  return Math.abs(a.w - b.w) < 0.01;
}

/* ---- 今日のその組み方の目標 ----
   {target, opt, w, change, why, src, next, lo, hi, last}
   change: first（はじめて）/ stepped-up・stepped-down・switched（段を移って1回目）/ up（1回増やす）/
           heavier（重くする）/ harder（次は一段難しい組み方へ）/ top（今の道具で一番上）/
           hold（据え置き）/ match（前回の最高の回数に合わせる）/ rebase（重さを変えたので、その重さで始め直す）/
           lighter（軽くする）/ easier（次は一段やさしい組み方へ）/ deload（軽い週） */
function progressFor(item){
  const key = itemKey(item);
  if(progMemo.items[key]) return progMemo.items[key];
  const id = item.ex, ex = EXMAP[id], kind = ex.kind, u = unitOf(kind);
  const rr = repRange(id, item), step = progStep(kind);
  const opts = itemOptions(item);
  const optByW = w => (w === undefined || w === null) ? null : (opts.find(o => Math.abs(o.total - w) < 0.01) || null);
  const res = {lo: rr.lo, hi: rr.hi, step, change: "", why: "", src: "", target: 0, opt: null, w: undefined, next: null, last: null};
  const hist = patternHistory(patternOf(id));
  const mine = hist.filter(h => h.ex === id && h.label === (item.label || ""));

  if(!mine.length){
    /* この組み方は初めて（段を上げた・下げた直後もここ） */
    const prev = hist[0];
    res.target = midTarget(item);
    if(prev){
      const up = itemLevel(item) > itemLevel(prev.item), dn = itemLevel(item) < itemLevel(prev.item);
      if(up) res.target = rr.lo;
      res.change = up ? "stepped-up" : dn ? "stepped-down" : "switched";
      res.src = "前回は「" + itemName(prev.item) + "」";
      res.why = up ? "一段難しい組み方の1回目です。" + u + "数は幅の下限（" + rr.lo + "）から"
              : dn ? "一段やさしい組み方です。" + res.target + u + "から"
              : "この組み方の1回目です";
      if(prev.ex === id) res.opt = optByW(evalSession(prev).w);   /* 同じ種目の別の組み方なら、前回と同じ重さ */
    }else{
      res.change = "first"; res.src = "初回";
      res.why = "初回はフォームを優先します。余力を2〜3回残して終えてください";
    }
    if(!res.opt) res.opt = defaultOptionFor(item);
  }else{
    const h = mine[0], ev = evalSession(h);
    res.last = {date: h.date, target: ev.target, sets: h.sets};
    res.src = "前回の目標 " + ev.target + u;
    let cur = opts.length ? optByW(ev.w) : null;
    if(opts.length && !cur){
      /* 前回の重さが今の登録では作れない（ダンベルの登録を変えた） */
      cur = ev.w !== undefined ? nearestOption(opts, +ev.w || 0) : defaultOptionFor(item);
      if(ev.w !== undefined) res.snap = ev.w;
    }
    res.opt = cur;
    res.target = ev.target;
    if(deloadOn(TODAY)){
      res.change = "deload";
      res.why = "軽い週です。目標は前回と同じにして、種目を少なめにしています";
    }else if(ev.allHit){
      const nt = ev.target + step;
      if(nt <= rr.hi){
        res.target = nt; res.change = "up";
        res.why = "前回は全部のセットで目標に届いたので、" + step + u + "増やします（" + rr.hi + u + "に届いたら次の段へ）";
      }else{
        /* 幅の上限に届いた → 一段上へ */
        const i = cur ? optionIndex(opts, cur) : -1, nx = i >= 0 ? opts[i + 1] : null;
        if(nx && (nx.key <= cur.key * PROG.jumpRatio || nx.key - cur.key <= PROG.jumpKg)){
          res.opt = nx; res.target = rr.lo; res.change = "heavier";
          res.why = u + "数の上限（" + rr.hi + "）に届いたので、ダンベルを一段重くします。" + rr.lo + u + "から";
        }else{
          const nxt = stepItem(item, 1);
          if(nxt){
            res.next = nxt; res.change = "harder"; res.target = rr.hi;
            res.why = u + "数の上限（" + rr.hi + "）に届いたので、次は一段難しい「" + itemName(nxt) + "」に進みます";
          }else{
            res.target = rr.hi; res.change = "top";
            const hs = houseOf(id);
            res.why = "今の道具では、この動きの一番上の段です。" + u + "数は上限のまま続けます"
                    + (hs.up ? "。次の一手は「" + gearText(hs.up) + "」" : "");
          }
        }
      }
    }else{
      /* 目標より少なかった。届かなかったとは限らない（重いダンベルに替えた・多すぎて抑えた）ので、
         疲れとは見ず、実際にやった回数に合わせる */
      const pe = mine[1] ? evalSession(mine[1]) : null, lo = rr.lo;
      if(pe && !sameWeight(ev, pe)){
        /* 重さを変えた回: その重さでどのセットもできた回数から始め直す（幅の下限より少なければ下限から） */
        res.change = "rebase";
        res.target = Math.max(lo, Math.min(rr.hi, ev.minR));
        res.why = "前回はダンベルを" + (ev.w > pe.w ? "重く" : "軽く") + "したので、その重さで"
                + (ev.minR >= lo ? res.target + u + "から始めます" : u + "数の幅の下限（" + lo + u + "）から始めます");
      }else if(pe && ev.maxR < lo && pe.maxR < lo){
        /* 同じ重さで2回続けて幅の下限より少なかった → 一段軽く・やさしく */
        const i = cur ? optionIndex(opts, cur) : -1, pv = i > 0 ? opts[i - 1] : null;
        const prv = pv ? null : stepItem(item, -1);
        const head = "同じ重さで2回続けて" + u + "数の幅の下限（" + lo + u + "）より少なかったので、";
        if(pv){
          res.opt = pv; res.target = midTarget(item); res.change = "lighter";
          res.why = head + "ダンベルを一段軽くします";
        }else if(prv){
          res.next = prv; res.change = "easier"; res.target = lo;
          res.why = head + "次は一段やさしい「" + itemName(prv) + "」にします";
        }else{
          res.target = lo; res.change = "hold";
          res.why = u + "数の幅の下限（" + lo + u + "）を目標に続けます";
        }
      }else{
        /* 同じ重さで少なかった: 前回の最高の回数を次の目標にする（前回の目標より上げない） */
        const best = Math.min(ev.target, ev.maxR), nt = Math.max(lo, best);
        res.target = nt;
        if(nt >= ev.target){
          res.change = "hold";
          res.why = "前回は目標より少ないセットがあったので、同じ目標にしています";
        }else{
          res.change = "match";
          res.why = "前回は最高" + best + u + "だったので、" + (best >= lo ? "目標を" + nt + u + "にします"
                                                                   : u + "数の幅の下限（" + lo + u + "）を目標にします");
        }
      }
    }
  }
  /* 目標はいつも解説の回数の幅の中（B7）。目標を書いていない古い記録（1セット目の回数を目標とみなす）は
     幅の外のことがあるので、幅に収めてそう添える */
  const t0 = Math.round(res.target);
  res.target = Math.max(1, Math.min(rr.hi, Math.max(rr.lo, t0)));
  if(res.target !== t0) res.why += "。解説の" + u + "数の幅（" + rr.lo + "〜" + rr.hi + "）に合わせて" + res.target + u + "にします";
  if(res.opt) res.w = res.opt.total;
  return (progMemo.items[key] = res);
}
/* その動きで今日やる組み方。前回の組み方か、前回の出来で段を移るならその先。記録が無ければ null */
function patternNext(pattern){
  const hist = patternHistory(pattern);
  if(!hist.length) return null;
  const last = hist[0].item, p = progressFor(last);
  return (p.change === "harder" || p.change === "easier") && p.next ? p.next : last;
}

/* ---- 軽い週を勧めるか ----
   直近3週間で、同じ組み方・同じ重さで1セットあたりの回数が2回続けて減った動きが2つ以上あれば勧める。
   目標より少ないだけ・重さを変えた・回数を抑えて同じ数で続けた、は疲れとは見ない（2026-10-01 本人の指摘）。
   軽い週の最中と、前の軽い週から4週間たたないうちは勧めない */
function deloadAdvice(){
  const now = deloadNow();
  if(now) return {active: true, start: now.start, until: now.until};
  const recent = Object.keys(state.sessions).some(d => state.sessions[d].deload && d <= TODAY && daysBetween(d, TODAY) < PROG.deloadGap);
  if(recent) return null;
  const tired = [];
  PATTERN_ORDER.forEach(pat => {
    const hist = patternHistory(pat).filter(h => daysBetween(h.date, TODAY) <= 21);
    if(!hist.length) return;
    const same = hist.filter(h => itemKey(h.item) === itemKey(hist[0].item)).slice(0, 3).map(evalSession);
    if(same.length < 3) return;
    const [a, b, c] = same;                    /* a が一番新しい */
    if(sameWeight(a, b) && sameWeight(b, c) && a.meanR < b.meanR && b.meanR < c.meanR) tired.push(pat);
  });
  return tired.length >= 2 ? {suggest: true, patterns: tired} : null;
}
function setDeload(on){
  if(on){
    const s = session(TODAY);
    s.deload = true;
  }else{
    const now = deloadNow();
    if(now && state.sessions[now.start]){
      delete state.sessions[now.start].deload;
      persistSession(now.start);
    }
  }
  resetProg();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                    /* 同期: 記録（その日の設定）を変えたとき */
}
ACTIONS.deloadon = () => { setDeload(true); replanToday(); };
ACTIONS.deloadoff = () => { setDeload(false); replanToday(); };

/* ---- ウォームアップ（その日の最初の種目の1セット目の前だけ） ----
   ダンベルを使う種目は、今日の重さの半分くらい（60%以下で一番近い使い方、無ければ一番軽い使い方）で8回。
   今日の重さより軽い使い方が無ければ、何も持たずに行う */
function warmupText(item, sug){
  const kind = EXMAP[item.ex].kind;
  if(kind === "t" || !sug) return "";
  if(kind === "w"){
    const opts = itemOptions(item);
    if(!opts.length || sug.w === undefined) return "何も持たずに8回を1セット（記録しない）";
    const pick = nearestOption(opts, sug.w * 0.6);
    return pick.total < sug.w - 1e-9 ? "「" + pick.text + "」で8回を1セット（記録しない）"
                                      : "何も持たずに8回を1セット（記録しない）";
  }
  const reps = Math.max(5, Math.round((sug.r || 10) / 2));
  const easier = stepItem(item, -1);
  return (easier ? "「" + itemName(easier) + "」で" : "") + reps + "回を1セット（記録しない）";
}
