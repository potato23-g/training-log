/* ヘッダーの「更新」ボタンの動き。
   同じ版なら「最新です」と出るだけ。取りに行けないときは案内を出して元に戻る。
   （新しい版のときは開き直すので、この検証では扱わない） */
(async () => {
  const out = {};
  const btn = document.getElementById("updBtn");
  out.exists = !!btn;
  out.label = btn ? btn.textContent : "";
  out.themeLabel = document.getElementById("themeBtn") ? document.getElementById("themeBtn").textContent : "";
  const status = () => document.getElementById("status").textContent;

  /* 1) すでに最新のとき */
  btn.click();
  await T.wait(700);
  out.sameVersion = {label: btn.textContent, status: status(), disabled: btn.disabled};

  /* 2) 取りに行けないとき */
  await T.wait(2600);
  const realFetch = window.fetch;
  window.fetch = async () => { throw new Error("offline"); };
  btn.click();
  await T.wait(700);
  out.offline = {label: btn.textContent, status: status(), disabled: btn.disabled};
  window.fetch = realFetch;

  /* 3) 少し待てばラベルが「更新」へ戻る */
  await T.wait(2600);
  out.backToNormal = btn.textContent;

  window.__result = out;
  window.__ready = true;
})();
