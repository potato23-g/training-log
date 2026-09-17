(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  session(TODAY).routine = "A";

  /* 2本のとき: ルーチン注記はそのまま */
  setGear({unit:5, count:2, adjustable:false, max:5});
  out["2本_goblet注記"] = noteForGear("下ろす3秒。2つ担げば10kgになる");
  out["2本_split注記"] = noteForGear("ベッドに後ろ足を乗せる。両手に1つずつ持つ");

  /* 1本のとき: 2本前提の一文が落ちる */
  setGear({count:1});
  out["1本_goblet注記"] = noteForGear("下ろす3秒。2つ担げば10kgになる");
  out["1本_split注記"] = noteForGear("ベッドに後ろ足を乗せる。両手に1つずつ持つ");

  /* 可変12kgのとき: 5kg/10kg 表記が追従 */
  setGear({unit:12, count:2, adjustable:true, max:24});
  out["12kg_注記"] = noteForGear("下ろす3秒。2つ担げば10kgになる");
  out["12kg_ng文"] = gearText("浅い。深さが足りないと5kgではほぼ刺激にならない。");
  out["12kg_回数表記が壊れていないか"] = gearText("3セット × 10〜15回");

  setGear(Object.assign({}, GEAR_DEFAULT));
  window.__result = out;
  window.__ready = true;
})();
