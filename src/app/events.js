/* ============================================================
   イベント
   ============================================================ */
function wire(){
  const v = document.getElementById("view");
  wireActs(v);
  wireInputs(v);
  WIRES.forEach(f => f(v));

  const sel = v.querySelector("#exSel");
  if(sel) sel.onchange = ()=>{ refEx = sel.value; render(); };

  const note = v.querySelector("#note");
  if(note){
    let t=null;
    note.oninput = ()=>{
      clearTimeout(t);
      t = setTimeout(()=>{
        const s = session(TODAY); s.note = note.value; s.noteAt = Date.now(); persistSession(TODAY);
        if(typeof syncSchedule === "function") syncSchedule();      /* 同期: メモを変えたとき */
      }, 600);
    };
  }

  if(tab==="ex"){
    const ex = EXMAP[refEx];
    const w = {}; ex.p.forEach(m=>w[m]=1); (ex.s||[]).forEach(m=>{ if(!w[m]) w[m]=0.45; });
    paintFigs(v.querySelector("#refFig"), w, 1);
  }
  if(tab==="body"){
    const load = muscleLoad(bodyDays);
    const max = Math.max(1, ...Object.values(load));
    paintFigs(v, load, max);
    v.querySelectorAll("svg.fig .rg").forEach(el=>{
      if(selMuscle && el.getAttribute("data-m")===selMuscle) el.classList.add("sel");
      el.onclick = ()=>{ selMuscle = el.getAttribute("data-m"); render(); };
    });
  }
  if(typeof syncWire === "function") syncWire(v);
  if(settingsOpen) refreshSettings();
}
/* data-act のボタン。画面（#view）と設定のシートの両方で使う */
function wireActs(root){
  root.querySelectorAll("[data-act]").forEach(el=>{ el.onclick = (ev)=> onAct(el, ev); });
}
function onAct(el, ev){
  const a = el.dataset.act;
  if(a==="toggle"){
    openEx = (openEx===el.dataset.ex)?null:el.dataset.ex;
    render();
    /* 開いた種目の見出しを画面の上に合わせ、入力と「記録」が見えるようにする */
    if(openEx){
      const h = document.querySelector('[data-act="toggle"][data-ex="' + openEx + '"]');
      if(h && h.scrollIntoView) h.scrollIntoView({block: "start"});
    }
  }
  else if(a==="addset"){ addSet(el.dataset.ex); }
  else if(a==="delset"){ delSet(el.dataset.ex, +el.dataset.i); }
  else if(a==="step"){ step(el.dataset.t, el.dataset.ex, +el.dataset.d); }
  else if(a==="pref"){ const k = el.dataset.k; PREF.set(k, !PREF.get(k, PREF_DEFAULT[k])); render(); }
  else if(a==="edit"){ editEx = (editEx===el.dataset.ex) ? null : el.dataset.ex; render(); }
  else if(a==="dbstep"){ dbStep(+el.dataset.i, el.dataset.t, +el.dataset.d); }
  else if(a==="dbdel"){ const it = gearItems(); it.splice(+el.dataset.i, 1); setGearItems(it); render(); }
  else if(a==="dbadd"){
    const it = gearItems(), mx = it.reduce((m, x)=>Math.max(m, x.kg), 0);
    it.push({kg: mx ? (mx < 10 ? mx + 2 : mx + 5) : 5, n: 2}); setGearItems(it); render();
  }
  else if(a==="swapto"){ replaceInPlan(el.dataset.from, el.dataset.ex); }
  else if(a==="asknotify"){ if(PREF.get("notify",false)){ PREF.set("notify",false); render(); } else askNotify(); }
  else if(a==="testalert"){ testChime(); buzz(); notify("テスト", "この知らせ方で鳴ります"); }
  else if(a==="goref"){ refEx = el.dataset.ex; switchTab("ex"); }
  else if(a==="addex"){ openPicker(); }
  else if(a==="addauto"){ addAutoToday(); }
  else if(a==="stepto"){ replaceInPlan(el.dataset.from, el.dataset.ex, el.dataset.label || ""); }
  else if(a==="replan"){ replanToday(); }
  else if(a==="replanshort"){ replanToday({short: true}); }
  else if(a==="addtoday"){ addToProgramToday(el.dataset.ex, el.dataset.label || ""); }
  else if(a==="days"){ bodyDays = +el.dataset.d; selMuscle=null; render(); }
  else if(a==="play"){ togglePlay(el.dataset.ex); }
  else if(a==="csv"){ exportCSV(); }
  else if(a==="txt"){ showText(); }
  else if(a==="backup" && typeof backupSave === "function"){ backupSave(); }
  else if(a==="restore" && typeof backupLoad === "function"){ backupLoad(); }
  else if(a==="restorepaste" && typeof backupPaste === "function"){ backupPaste(); }
  else if(ACTIONS[a]){ ACTIONS[a](el, ev); }
}
/* 入力欄（ダンベルの登録・重量） */
function wireInputs(root){
  root.querySelectorAll('input[id^="db_"]').forEach(inp=>{
    inp.onchange = ()=>{
      const [, t, i] = inp.id.split("_");
      const it = gearItems(), val = parseFloat(inp.value || "0");
      if(!it[+i] || isNaN(val) || val <= 0){ render(); return; }
      if(t === "kg") it[+i].kg = Math.round(val * 10) / 10;
      else it[+i].n = Math.max(1, Math.round(val));
      setGearItems(it); render();
    };
  });
  /* 重量を手で打ち替えたら「使うダンベル」の一文も合わせる */
  root.querySelectorAll('input[id^="w_"]').forEach(inp=>{
    inp.oninput = ()=>{
      const id = inp.id.slice(2), h = document.getElementById("wh_" + id);
      const item = itemOf(id), total = wStored(item, parseFloat(inp.value));
      const opt = itemOptions(item).find(o => Math.abs(o.total - total) < 0.01) || null;
      if(h) h.textContent = gearLine(id, {opt, w: total});
    };
  });
}
function switchTab(t){
  tab = t;
  document.querySelectorAll("nav.tabs button").forEach(x=>x.setAttribute("aria-selected", String(x.dataset.tab===t)));
  render(); window.scrollTo(0,0);
}
ACTIONS.gotab = el => switchTab(el.dataset.tab);

function step(t, id, d){
  const map = {w:"w_", r:"r_", e:"e_"};
  const inp = document.getElementById(map[t]+id);
  if(!inp) return;
  let val = parseFloat(inp.value||"0");
  if(t==="w"){
    /* 重量は、持っているダンベルで作れる使い方だけを順にたどる（腕の種目は片手あたりで見せる） */
    const item = itemOf(id), opts = itemOptions(item);
    if(opts.length){
      const total = wStored(item, val);
      let i = opts.findIndex(o => Math.abs(o.total - total) < 0.01);
      i = i < 0 ? opts.indexOf(nearestOption(opts, isNaN(total) ? 0 : total)) : Math.max(0, Math.min(opts.length - 1, i + d));
      inp.value = String(wShown(item, opts[i].total));
      const h = document.getElementById("wh_" + id);
      if(h) h.textContent = gearLine(id, {opt: opts[i]});
      return;
    }
    val = Math.max(0, val + d*0.5);
  }
  else if(t==="e") val = Math.min(10, Math.max(1, val + d));
  else val = Math.max(1, val + d);
  inp.value = (t==="w") ? String(val) : String(Math.round(val));
}
/* きつさのボタン。選び直すと取り消し。入力欄は描き直さない（打ち替えた回数・重さを消さないため） */
ACTIONS.rpe = el=>{
  const id = el.dataset.ex, v = +el.dataset.v;
  rpeSel[id] = rpeSel[id] === v ? 0 : v;
  const hid = document.getElementById("e_" + id);
  if(hid) hid.value = rpeSel[id] || "";
  (el.parentNode ? el.parentNode.querySelectorAll("button") : []).forEach(b => {
    const on = +b.dataset.v === rpeSel[id];
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
  });
};

const lastAddAt = {};                      /* 「記録」の二重押しを防ぐ */
function addSet(id){
  const ex = EXMAP[id];
  const rIn = document.getElementById("r_"+id), eIn = document.getElementById("e_"+id);
  if(!rIn) return;
  if(Date.now() - (lastAddAt[id] || 0) < 800) return;
  const item = itemOf(id);
  const rRaw = parseFloat(rIn.value || ""), rpeRaw = eIn && eIn.value !== "" ? parseFloat(eIn.value) : 0;
  const wIn = document.getElementById("w_"+id);
  const wRaw = wIn ? parseFloat(wIn.value || "") : NaN;
  /* 入れた値を確かめる。おかしければ記録せずにボタンの下で知らせる */
  const maxR = ex.kind === "t" ? 600 : 200;
  let bad = "";
  if(isNaN(rRaw) || rRaw < 1 || rRaw > maxR || Math.round(rRaw) !== rRaw) bad = (ex.kind === "t" ? "秒数" : "回数") + "は1〜" + maxR + "の整数で入れてください";
  else if(isNaN(rpeRaw) || rpeRaw < 0 || rpeRaw > 10) bad = "きつさは1〜10で選んでください";
  else if(wIn && (isNaN(wRaw) || wRaw < 0 || wRaw > 300)) bad = "重量は0〜300kgの数で入れてください";
  if(bad){ todayMsg = bad; render(); return; }
  /* 前日の画面のまま押された場合は、前日に記録せず今日のメニューに切り替える（入れた数字は知らせに残す） */
  if(rollDay()){
    todayMsg = "日付が変わったので、今日のメニューに切り替えました。入力した「" + itemName(item) + " "
      + (wIn ? wRaw + "kg × " : "") + rRaw + (ex.kind === "t" ? "秒" : "回") + (rpeRaw ? "・きつさ" + rpeRaw : "") + "」は記録していません。続けるときは今日のメニューで記録してください";
    render(); setStatus(shownMsg); return;
  }
  if(isDoneToday(id)){ render(); return; }          /* 規定のセット数を終えた種目は、修正で消すまで記録できない */
  lastAddAt[id] = Date.now();
  unlockAudio();
  const e0 = entryFor(TODAY, id, false);
  const sugNow = suggestNext(item, e0);
  const st = {id:newSetId(), at:Date.now(), r:rRaw};
  if(rpeRaw) st.rpe = Math.round(rpeRaw);
  if(wIn) st.w = wStored(item, wRaw);
  st.label = item.label || "";                      /* どの組み方でやったか（次の回の目標を組み方ごとに出すため） */
  st.target = sugNow.target;                        /* この日の目標（届いたかどうかを次の回に使う） */
  const s = session(TODAY);
  fixPlan(s);
  const e = entryFor(TODAY, id, true);
  e.sets.push(st);
  rpeSel[id] = 0;
  const ok = persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: 記録したとき */
  if(ok && typeof prMessage === "function"){
    const pr = prMessage(id, item.label || "", st, TODAY);
    if(pr) todayMsg = pr;
  }

  const doneNow = e.sets.length >= (item.sets||3);
  if(doneNow){ openEx = null; editEx = null; }
  let label;
  if(doneNow){
    const nx = activeItems().find(it=>{ const en = entryFor(TODAY, it.ex, false); return !en || en.sets.length < (it.sets||3); });
    label = nx ? "次: " + itemName(nx) : "今日のメニュー完了";
  }else{
    label = itemName(item) + "  " + sugText(item, suggestNext(item, e));
  }
  render();
  startRest(restFor(item), label);
}
function delSet(id, i){
  if(rollDay()){ render(); setStatus("日付が変わったので、今日のメニューに切り替えました"); return; }
  const e = entryFor(TODAY, id, false);
  if(!e || !e.sets[i]) return;
  const s = session(TODAY);
  const wasDone = isDoneToday(id);
  const gone = e.sets.splice(i,1)[0];
  if(gone && gone.id) s.del = (s.del || []).concat(gone.id);        /* 別の端末から復活しないように、消した印を残す */
  const inPlan = todayItems().some(x => x.ex === id && !x.extra);
  if(!e.sets.length && !inPlan){
    s.entries = s.entries.filter(x => x !== e);
  }
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: 修正で消したとき */
  /* 5秒間「取り消す」を出す */
  undoDel = {date: TODAY, ex: id, set: gone, index: i, name: itemName(itemOf(id)), until: Date.now() + 5000};
  setTimeout(()=>{ if(undoDel && Date.now() >= undoDel.until){ undoDel = null; if(tab === "today") render(); } }, 5100);
  /* 修正で規定に届かなくなったら、そのまま記録できる状態で開く */
  if(wasDone && !isDoneToday(id)){ editEx = null; openEx = id; }
  render();
}
/* 消したセットを戻す。消した印はもう同期で送っているので、新しい id を付けて戻す */
ACTIONS.undodel = ()=>{
  const u = undoDel; undoDel = null;
  if(!u || u.date !== TODAY){ render(); return; }
  const e = entryFor(TODAY, u.ex, true);
  const st = Object.assign({}, u.set, {id: newSetId()});
  e.sets.splice(Math.min(u.index, e.sets.length), 0, st);
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();                   /* 同期: 修正したとき */
  render();
};
/* 種目を選んで今日のメニューに足す（組み方も選べる）。足した種目は今日のメニューに入り、
   組み直しても残る（manual）。すでにあって外していたら戻す */
function addToProgramToday(id, label){
  if(isDoneToday(id)){
    openEx = null; editEx = null;
    switchTab("today");
    setStatus("「" + itemNameOf(id) + "」は今日の分を記録済みです。直すときは「修正」を押してください");
    return;
  }
  const s = session(TODAY);
  const row = (label && catalogRow(id, label)) || catalogItem(id);
  fixPlan(s);
  if(!s.plan) s.plan = [];
  const cur = s.plan.find(x => x.ex === id);
  const e = entryFor(TODAY, id, false);
  if(cur){
    delete cur.skip;
    if((cur.label || "") !== (row.label || "") && !(e && e.sets.length)){
      const i = s.plan.indexOf(cur);
      s.plan[i] = Object.assign({}, row, {manual: true});
    }
  }else{
    s.plan.push(Object.assign({}, row, {manual: true}));
  }
  s.planAt = Date.now();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
  openEx = id; editEx = null;
  switchTab("today");
}
/* 今日のメニューの種目を別の種目に替える（「今日の調整」と、やさしく／難しくの持ち替え）。
   toLabel は「カーフレイズ（片脚）」のような同じ種目の別の組み方を指すときに使う */
function replaceInPlan(fromId, toId, toLabel){
  const s = session(TODAY);
  fixPlan(s);
  if(!s.plan) s.plan = [];
  const to = catalog().find(c => c.ex === toId && (c.label || "") === (toLabel || "")) || catalogItem(toId);
  const e = entryFor(TODAY, fromId, false);
  const i = s.plan.findIndex(x => x.ex === fromId);
  if(i >= 0 && !(e && e.sets.length)){
    s.plan[i] = Object.assign({}, to, s.plan[i].manual ? {manual: true} : {});
    if(e) s.entries = s.entries.filter(x => x !== e);
  }else if(!s.plan.some(x => x.ex === toId && (x.label || "") === (toLabel || ""))){
    s.plan.push(Object.assign({}, to));
    if(e && !e.sets.length) s.entries = s.entries.filter(x => x !== e);
  }
  s.planAt = Date.now();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
  openEx = toId; editEx = null;
  todayMsg = "「" + itemName(to) + "」に替えました";
  switchTab("today");
  setStatus(shownMsg);
}
/* 今日のメニューの並びを変える・外す・戻す */
function editPlanItem(id, fn){
  const s = session(TODAY);
  fixPlan(s);
  if(!s.plan) return;
  const i = s.plan.findIndex(x => x.ex === id);
  if(i < 0) return;
  fn(s.plan, i);
  s.planAt = Date.now();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
}
ACTIONS.later = el=>{
  const id = el.dataset.ex;
  editPlanItem(id, (plan, i)=>{ const it = plan.splice(i, 1)[0]; plan.push(it); });
  if(openEx === id) openEx = null;
  todayMsg = "「" + itemName(itemOf(id)) + "」を後に回しました";
  render();
};
ACTIONS.skip = el=>{
  const id = el.dataset.ex;
  editPlanItem(id, (plan, i)=>{ plan[i].skip = true; });
  if(openEx === id) openEx = null;
  todayMsg = "「" + itemName(itemOf(id)) + "」を今日は外しました。組み直しても入りません。下の「戻す」で戻せます";
  render();
};
ACTIONS.unskip = el=>{
  const id = el.dataset.ex;
  editPlanItem(id, (plan, i)=>{ delete plan[i].skip; });
  render();
};

/* 種目カードに出す「やさしく／難しく」。同じ動きの中で1段ずつ持ち替える */
function stepButtons(item){
  const down = stepItem(item, -1), up = stepItem(item, 1);
  if(!down && !up) return "";
  const btn = (it, label) => `<button data-act="stepto" data-from="${item.ex}" data-ex="${it.ex}" data-label="${esc(it.label || "")}">${label}　${esc(itemName(it))}</button>`;
  return `<p class="lastline" style="margin-bottom:4px">きつすぎる・軽すぎるときは、同じ動きのまま段を変えられます。</p>
    <div class="rowbtns">${down ? btn(down, "やさしく") : ""}${up ? btn(up, "難しく") : ""}</div>`;
}

/* アプリに選ばせて1種目足す（今のメニューに合うものを、回復と上限の範囲で選ぶ） */
function addAutoToday(){
  const s = session(TODAY);
  fixPlan(s);
  const all = todayItems(), cur = all.filter(it => !it.skip);
  const attempt = (relax) => {
    planSeed = cur.map(x => Object.assign({}, x));
    planSkip = new Set(all.filter(it => it.skip).map(it => patternOf(it.ex)));
    planRelax = relax; planMemo = null;
    try{
      return buildPlan().find(it => !cur.some(c => c.ex === it.ex && (c.label || "") === (it.label || "")));
    }finally{
      planSeed = null; planSkip = null; planRelax = false; planMemo = null;
    }
  };
  /* まず1回の量の目安に収まる範囲で探し、無ければ目安を外して探す（そのときは一言添える） */
  let picked = attempt(false), over = false;
  if(!picked){ picked = attempt(true); over = !!picked; }
  if(!picked){
    todayMsg = "今日足せる種目がありません。回復を待っている部位ばかりか、今週の量が上限に届いています。それでも足すときは「種目を選んで追加」から選んでください。";
    render();
    setStatus(shownMsg);
    return;
  }
  if(!s.plan) s.plan = [];
  s.plan = s.plan.concat([Object.assign({}, picked)]);
  s.planAt = Date.now();
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
  openEx = picked.ex; editEx = null;
  todayMsg = "「" + itemName(picked) + "」を足しました（" + EXMAP[picked.ex].p.map(m => MUSCLES[m]).join("・") + "の今週の量が足りていません）"
    + (over ? "。1回の目安（" + SESSION_MAX.exercises + "種目・" + SESSION_MAX.sets + "セット・" + SESSION_MAX.minutes + "分）は超えます" : "");
  render();
  /* 足した種目は一覧の最後に付くので、その位置まで動かして見えるようにする */
  const el = document.querySelector('[data-act="toggle"][data-ex="' + picked.ex + '"]');
  if(el && el.scrollIntoView) el.scrollIntoView({block: "center"});
  setStatus(shownMsg);
}
