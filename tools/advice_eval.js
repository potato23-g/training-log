(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const today = new Date(TODAY + "T00:00:00");
  const dkey = off => { const d = new Date(today); d.setDate(d.getDate()-off);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const put = (off, routine, ex, sets) => {
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = {date:d, routine, note:"", entries:[]};
    state.sessions[d].entries.push({ex, sets});
  };
  const item = id => ({ex:id, sets:3, r:EXMAP[id].r});

  /* --- 1. 器具なし --- */
  state.sessions = {}; setGear({unit:5, count:0, adjustable:false, max:5});
  let a = todayAdvice(item("floorpress"));
  out["1_器具なし"] = a && [a.level, a.short, a.alt, a.text.slice(0,40)];

  /* --- 2. 回復優先（主働筋を昨日たくさん使った） --- */
  state.sessions = {}; setGear({unit:5, count:2});
  put(1, "A", "goblet", [{w:10,r:15,rpe:8},{w:10,r:15,rpe:8},{w:10,r:15,rpe:8}]);
  put(1, "A", "split",  [{w:10,r:10,rpe:8},{w:10,r:10,rpe:8},{w:10,r:10,rpe:8}]);
  a = todayAdvice(item("goblet"));
  out["2_回復優先"] = a && [a.level, a.short, a.text.slice(0,45)];

  /* --- 3. 限界続き → やさしく --- */
  state.sessions = {};
  put(8, "A", "goblet", [{w:10,r:18,rpe:10},{w:10,r:16,rpe:10}]);
  put(4, "A", "goblet", [{w:10,r:18,rpe:10},{w:10,r:15,rpe:9}]);
  a = todayAdvice(item("goblet"));
  out["3_やさしく"] = a && [a.level, a.short, a.text.slice(0,60)];

  /* --- 4. 余裕続き → 強めに（重さ固定） --- */
  state.sessions = {};
  put(8, "A", "goblet", [{w:10,r:12,rpe:5},{w:10,r:12,rpe:5}]);
  put(4, "A", "goblet", [{w:10,r:12,rpe:6},{w:10,r:12,rpe:5}]);
  a = todayAdvice(item("goblet"));
  out["4a_強めに_重さ固定"] = a && [a.level, a.short, a.text.slice(0,60)];

  /* --- 4b. 余裕続き → 可変式なら重量アップを優先 --- */
  setGear({unit:5, count:2, adjustable:true, max:20});
  a = todayAdvice(item("goblet"));
  out["4b_強めに_可変式"] = a && [a.level, a.text.slice(0,60)];
  setGear({unit:5, count:2, adjustable:false, max:5});

  /* --- 5. 同じ種目が4回続く → 変えてもいい --- */
  state.sessions = {};
  [16,12,8,4].forEach(off => put(off, "A", "goblet", [{w:10,r:14,rpe:8},{w:10,r:14,rpe:8}]));
  a = todayAdvice(item("goblet"));
  out["5_変えてもいい"] = a && [a.level, a.short, a.alt, a.text.slice(0,50)];

  /* --- 6. 何もない（普通の状態）--- */
  state.sessions = {};
  put(4, "A", "goblet", [{w:10,r:14,rpe:8},{w:10,r:14,rpe:8}]);
  out["6_調整なし"] = todayAdvice(item("goblet"));

  state.sessions = {}; setGear(Object.assign({}, GEAR_DEFAULT));
  window.__result = out;
  window.__ready = true;
})();
