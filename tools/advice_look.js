(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const today = new Date(TODAY + "T00:00:00");
  const dkey = off => { const d = new Date(today); d.setDate(d.getDate()-off);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const put = (off, ex, sets) => { const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = {date:d, routine:"A", note:"", entries:[]};
    state.sessions[d].entries.push({ex, sets}); };

  state.sessions = {};
  /* ブルガリアン=限界続き、ゴブレット=余裕続き、ヒップスラスト=昨日大量に使った部位 */
  put(8, "split", [{w:10,r:10,rpe:10},{w:10,r:9,rpe:10}]);
  put(4, "split", [{w:10,r:10,rpe:10},{w:10,r:9,rpe:10}]);
  put(8, "goblet", [{w:10,r:14,rpe:5},{w:10,r:14,rpe:5}]);
  put(4, "goblet", [{w:10,r:14,rpe:6},{w:10,r:14,rpe:5}]);
  put(1, "hipthrust", [{w:10,r:15,rpe:8},{w:10,r:15,rpe:8},{w:10,r:15,rpe:8},{w:10,r:15,rpe:8}]);

  session(TODAY).routine = "A"; openEx = null; tab = "today"; render();
  await wait(250);
  window.__ready = true;
})();
