(async () => {
  const out = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* 既定（5kg×2）での挙動 */
  openEx = "goblet"; session(TODAY).routine = "A"; render(); await wait(120);
  out["既定_器具行"] = (document.querySelector('.exbody .lastline b') || {}).parentNode
    ? document.querySelector('.exbody').innerText.match(/器具.*/)?.[0] : null;
  out["既定_重量初期値"] = document.getElementById("w_goblet")?.value;
  out["既定_gearWeight_curl(each)"] = gearWeight("curl");
  out["既定_gearWeight_row(single)"] = gearWeight("row");
  out["既定_gearWeight_triext(stack上限1)"] = gearWeight("triext");

  /* 1本に変更 */
  setGear({count: 1}); render(); await wait(120);
  out["1本_gearWeight_curl"] = gearWeight("curl");
  out["1本_器具行_curl"] = gearLine("curl");
  out["1本_重量初期値"] = document.getElementById("w_goblet")?.value;

  /* 可変式 12kg・上限 24kg に変更 */
  setGear({count: 2, unit: 12, adjustable: true, max: 24}); render(); await wait(120);
  out["可変_gearWeight_curl"] = gearWeight("curl");
  out["可変_重量初期値"] = document.getElementById("w_goblet")?.value;
  out["可変_次の一手"] = nextStepText("goblet");
  out["可変_canAddWeight"] = canAddWeight();

  /* 解説タブの見出しが追従するか */
  refEx = "goblet"; tab = "ex"; render(); await wait(150);
  const exHtml = document.getElementById("view").innerText;
  out["解説_軽くなったら見出し"] = exHtml.match(/\d+(\.\d+)?kgが軽くなったら/)?.[0];
  out["解説_重量を上げる案内"] = exHtml.includes("まず重量を上げる");
  out["解説_5kg表記が残っていないか"] = !exHtml.includes("5kg");

  /* 0本のとき */
  setGear({count: 0}); tab = "today"; render(); await wait(120);
  out["0本_器具行"] = gearLine("curl");

  /* 後片付け（既定に戻す） */
  setGear(Object.assign({}, GEAR_DEFAULT));
  window.__result = out;
  window.__ready = true;
})();
