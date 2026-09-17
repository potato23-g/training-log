(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  openEx = "goblet"; session(TODAY).routine = "A"; render(); await wait(120);

  out["手動の休憩ボタンが消えているか"] = !document.querySelector('[data-act="rest"]');
  out["解説ボタンは残っているか"] = !!document.querySelector('[data-act="goref"]');
  out["タイマーは非表示か"] = !document.getElementById("timer").classList.contains("on");

  /* 記録を押す → 自動でカウントダウンが始まる */
  document.getElementById("r_goblet").value = "18";
  document.getElementById("e_goblet").value = "8";
  document.querySelector('[data-act="addset"][data-ex="goblet"]').click();
  await wait(250);

  const timer = document.getElementById("timer");
  out["記録後タイマー起動"] = timer.classList.contains("on");
  out["見出し"] = timer.querySelector(".lb b")?.textContent;
  out["次の内容"] = document.getElementById("timerLb")?.textContent;
  out["残り時間"] = document.getElementById("timerT")?.textContent;
  out["記録されたセット"] = (state.sessions[TODAY].entries.find(e=>e.ex==="goblet")||{}).sets?.length;

  /* +30秒 が効くか */
  const before = document.getElementById("timerT").textContent;
  document.getElementById("timerPlus").click();
  await wait(50);
  out["+30秒で伸びるか"] = before + " → " + document.getElementById("timerT").textContent;

  /* 終了で止まるか */
  document.getElementById("timerStop").click();
  await wait(50);
  out["終了で消えるか"] = !timer.classList.contains("on");

  window.__result = out;
  window.__ready = true;
})();
