/* ---------- 種目セット ----------
   あらかじめ選んだ種目のまとまりに名前を付けて取っておき、押すとそのまま今日のメニューにする
   （2026-11-04 本人の要望「複数作って日によって違うセットをすぐできるように」）。
   state.tune.kits = {list: [{id, name, items: [{ex, label}]}], updatedAt}。設定と同じく settings.json で端末をまたいで同期する
   （sync-github.js の syncMergeTune。まとまりごと新しいほうが勝つ）。決まりではないので TUNE_KEYS には入れない */
const KITS_MAX = 20, KIT_ITEMS_MAX = 15, KIT_NAME_MAX = 20;
function kitList(){
  const p = tunePart("kits");
  return p && Array.isArray(p.list) ? p.list.filter(k => k && Array.isArray(k.items)) : [];
}
function setKits(list){ setTune("kits", {list}); }
/* セットの中の種目のうち、この版で使えるもの */
function kitRows(kit){ return kit.items.filter(it => it && EXMAP[it.ex]); }
function kitNewId(){ return "k" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

/* セットを今日のメニューにする。今日もう記録した種目は、セットに無くても残す（記録の行が宙に浮かないように） */
function applyKit(kitId){
  if(rollDay()){ render(); setStatus("日付が変わったので、今日のメニューに切り替えました"); return; }
  const kit = kitList().find(k => k.id === kitId);
  if(!kit) { render(); return; }
  const s = session(TODAY);
  fixPlan(s);
  const before = s.plan || [];
  const rows = kitRows(kit).map(it => {
    const row = Object.assign({}, catalogRow(it.ex, it.label || "") || pickRowFor(it.ex));
    ["skip", "extra", "seed"].forEach(k => delete row[k]);
    return Object.assign(row, {manual: true});
  });
  const done = (s.entries || []).filter(e => e.sets.length).map(e => e.ex);
  /* 今日もう記録した種目は、今のやり方（label）の行をそのまま使う。セットのやり方に替えると、記録と目標が食い違う */
  const recorded = ex => {
    const cur = before.find(x => x.ex === ex), x = Object.assign({}, cur || catalogItem(ex));
    delete x.skip; delete x.extra; return x;
  };
  rows.forEach((r, i) => { if(done.includes(r.ex)) rows[i] = recorded(r.ex); });
  const kept = done.filter(ex => !rows.some(r => r.ex === ex)).map(recorded);
  s.entries = (s.entries || []).filter(e => e.sets.length);          /* セットの無い箱は残さない */
  s.plan = kept.concat(rows);
  s.planAt = s.planEdit = stampNow();                /* 利用者が意図して変えた（同期で自動のメニューに負けない） */
  persistSession(TODAY);
  if(typeof syncNow === "function") syncNow();
  openEx = null; editEx = null;
  planMemo = null; resetProg();
  todayMsg = "「" + kit.name + "」を今日のメニューにしました";
  render();
  window.scrollTo(0, 0);
}

/* 今日タブの欄。セットの名前のボタンを押すと今日のメニューになる */
function kitCard(){
  const list = kitList();
  const rows = list.map(k => {
    const names = kitRows(k).map(it => itemNameOf(it.ex));
    return `<div class="kitrow">
      <button class="kitgo" data-act="kitapply" data-k="${esc(k.id)}">${esc(k.name)}<span>${esc(names.join("・") || "種目がありません")}</span></button>
      <button class="kitedit" data-act="kitedit" data-k="${esc(k.id)}">編集</button></div>`;
  }).join("");
  return `<h3 class="sec">種目セット</h3>
    <div class="card kits">
      ${list.length ? `<p class="lastline" style="margin-top:0">押すと、そのセットを今日のメニューにします。</p>${rows}`
                    : `<p class="lastline" style="margin-top:0">よくやる種目の組み合わせを取っておくと、押すだけで今日のメニューにできます。</p>`}
      <div class="rowbtns">
        ${list.length < KITS_MAX ? `<button data-act="kitnew">種目を選んで作る</button><button data-act="kitfromtoday">今のメニューから作る</button>` : ""}
      </div>
    </div>`;
}

/* セットを作る・直すシート。種目は押した順に並ぶ */
function openKitSheet(kit){
  const isNew = !kitList().some(k => k.id === kit.id);
  let name = kit.name, picked = kitRows(kit).map(it => ({ex: it.ex, label: it.label || ""})), sure = false;
  const groups = {};
  EX.filter(e => !e.base).forEach(e => { const p = groupOf(patternOf(e.id)); (groups[p] = groups[p] || []).push(e); });
  const draw = () => {
    const at = id => picked.findIndex(x => x.ex === id);
    const body = groupOrder().filter(p => groups[p] && groups[p].length).map(p =>
      `<h4 class="pickhead">${esc(PATTERN_HEAD[p] || p)}</h4><div class="sorechips">${groups[p].map(e => {
        const i = at(e.id);
        return `<button class="sorechip${i >= 0 ? " on" : ""}" data-kx="${e.id}" aria-pressed="${i >= 0}">${i >= 0 ? (i + 1) + ". " : ""}${esc(e.name)}</button>`;
      }).join("")}</div>`).join("");
    sheetInner.innerHTML = `<h4>${isNew ? "種目セットを作る" : "種目セットを直す"}</h4>
      <div class="fld"><label for="kitname">名前</label><input type="text" id="kitname" maxlength="${KIT_NAME_MAX}" value="${esc(name)}"></div>
      <p class="lastline">選んだ種目（${picked.length}）: ${picked.length ? esc(picked.map(x => itemNameOf(x.ex)).join("・")) : "まだありません"}</p>
      <div class="rowbtns"><button data-kitsave="1"${picked.length ? "" : " disabled"}>保存</button><button data-close="1">閉じる</button></div>
      ${body}
      <div class="rowbtns">${isNew ? "" : `<button data-kitdel="1">${sure ? "本当に消す" : "この種目セットを消す"}</button>`}<button data-close="1">閉じる</button></div>`;
    const nm = sheetInner.querySelector("#kitname");
    nm.oninput = () => { name = nm.value; };
    sheetInner.querySelectorAll("[data-kx]").forEach(b => b.onclick = () => {
      const id = b.dataset.kx, i = at(id), y = b.getBoundingClientRect().top;
      if(i >= 0) picked.splice(i, 1);
      else if(picked.length < KIT_ITEMS_MAX) picked.push({ex: id, label: pickRowFor(id).label || ""});
      else{ setStatus("1つのセットに入れられるのは" + KIT_ITEMS_MAX + "種目までです"); return; }
      const top = sheetInner.scrollTop;
      draw();
      /* 押したボタンが同じ位置に残るように（続けて選べるように） */
      sheetInner.scrollTop = top;
      const b2 = sheetInner.querySelector('[data-kx="' + id + '"]');
      if(b2) sheetInner.scrollTop += b2.getBoundingClientRect().top - y;
    });
    sheetInner.querySelectorAll("[data-close]").forEach(b => b.onclick = () => sheet.classList.remove("on"));
    const sv = sheetInner.querySelector("[data-kitsave]");
    sv.onclick = () => {
      if(!picked.length) return;
      const nmv = (name || "").trim().slice(0, KIT_NAME_MAX) || kitDefaultName();
      const list = kitList().slice(), i = list.findIndex(k => k.id === kit.id);
      const out = {id: kit.id, name: nmv, items: picked.slice()};
      if(i >= 0) list[i] = out; else list.push(out);
      setKits(list);
      sheet.classList.remove("on");
      todayMsg = "「" + nmv + "」を保存しました";
      render();
    };
    const del = sheetInner.querySelector("[data-kitdel]");
    if(del) del.onclick = () => {
      if(!sure){ sure = true; const top = sheetInner.scrollTop; draw(); sheetInner.scrollTop = top; return; }
      setKits(kitList().filter(k => k.id !== kit.id));
      sheet.classList.remove("on");
      todayMsg = "「" + kit.name + "」を消しました";
      render();
    };
  };
  draw();
  sheetInner.scrollTop = 0;
  sheet.classList.add("on");
}
function kitDefaultName(){
  const names = new Set(kitList().map(k => k.name));
  /* 「セット1」だと記録のセット（1/3 など）と紛らわしいので、「メニュー」と呼ぶ */
  let n = 1; while(names.has("メニュー" + n)) n++;
  return "メニュー" + n;
}
ACTIONS.kitapply = el => applyKit(el.dataset.k);
ACTIONS.kitedit = el => { const k = kitList().find(x => x.id === el.dataset.k); if(k) openKitSheet(k); else render(); };
ACTIONS.kitnew = () => openKitSheet({id: kitNewId(), name: kitDefaultName(), items: []});
ACTIONS.kitfromtoday = () => {
  const items = todayItems().filter(it => !it.skip).slice(0, KIT_ITEMS_MAX).map(it => ({ex: it.ex, label: it.label || ""}));
  openKitSheet({id: kitNewId(), name: kitDefaultName(), items});
};
