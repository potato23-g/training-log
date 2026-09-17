/* 見た目確認用の状態を作る。window.__look で場面を選ぶ */
(async () => {
  const r = {};
  const key = n => { const d = new Date(TODAY + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const put = (off, ex, sets) => {
    const d = key(off);
    state.sessions[d] = state.sessions[d] || {date: d, entries: [], note: ""};
    state.sessions[d].entries.push({ex, sets: sets.map((x, i) => Object.assign({id: d + ex + i, at: i}, x))});
  };
  const look = window.__look;

  if(look === "gear"){
    T.reset([{kg:4, n:2}, {kg:9, n:1}]);
    T.scrollTo(".dbrow");
    window.scrollBy(0, -40);
  }
  if(look === "up" || look === "ex"){
    T.reset([{kg:5, n:2}, {kg:8, n:2}]);
    /* 4日前: 今日の最初のダンベル種目を 10kg で余裕を持ってこなした */
    /* 同じ動きの種目が他にない種目で試す（履歴を入れると、重複を外す選び方が変わるため） */
    const first = todayItems().find(it => it.ex === "hipthrust") || todayItems().find(it => EXMAP[it.ex].kind === "w");
    const rr = repRange(first.ex, first);
    put(-4, first.ex, [0,1,2].map(() => ({w: 10, r: rr.hi + 4, rpe: 6})));
    put(-8, first.ex, [0,1,2].map(() => ({w: 10, r: rr.hi + 2, rpe: 7})));
    planMemo = null;
    r.first = first.ex;
    if(look === "up"){
      openEx = first.ex; render();
      T.scrollTo(`.exhead[data-ex="${first.ex}"]`);
    }else{
      refEx = "goblet"; tab = "ex"; render();
      T.scrollTo("h4");
      const cards = T.qa(".card h4").filter(h => /軽くなったら/.test(h.textContent));
      if(cards[0]) T.scrollTo(".splitcols > div:nth-child(2)");
      r.cardText = cards[0] ? cards[0].parentElement.innerText : null;
    }
  }
  if(look === "settings"){
    T.reset([{kg:5, n:2}]);
    const hs = T.qa("h3.sec").filter(h => /休憩おわり/.test(h.textContent));
    if(hs[0]) window.scrollTo(0, hs[0].getBoundingClientRect().top + window.scrollY - 12);
  }
  if(look === "plan"){
    T.reset([{kg:5, n:2}, {kg:8, n:2}]);
    /* 3回とも回数が上限付近・きつさ高め → 切り替え時 */
    [-10, -6, -2].forEach(off => put(off, "rdl", [0,1,2].map(() => ({w: 16, r: 38, rpe: 9}))));
    [-9, -5, -1].forEach(off => put(off, "lateral", [0,1,2].map(() => ({w: 10, r: 12, rpe: 5}))));
    tab = "plan"; render();
  }
  if(look === "desktop"){
    T.reset([{kg:5, n:2}]);
    const first = todayItems()[0];
    await T.recordAll(first.ex);
    editEx = first.ex; render();
  }
  r.text = document.getElementById("view").innerText.slice(0, 1600);
  window.__result = r;
  window.__ready = true;
})();
