/* 休憩タイマーと合図の予約の検証 */
(async () => {
  const r = {};
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.6);
  PREF.set("sound", true);

  /* 既定（音楽を止めない）: 記録の時点で、休憩の長さぶん先に合図を予約する */
  PREF.set("sure", false);
  startRest(90, "テスト");
  r.webaudio = {nodes: chimeNodes.length, delay: +(chimeAt - AC.currentTime).toFixed(2), ok: near(chimeAt - AC.currentTime, 90), acState: AC.state};
  T.click("#timerPlus");
  r.plus30 = {left: restLeftSec(), delay: +(chimeAt - AC.currentTime).toFixed(2), ok: near(chimeAt - AC.currentTime, 120) && near(restLeftSec(), 120, 1)};

  /* 画面から離れていて、戻ったときにはもう終わっていた → すぐ知らせて、合図を今に鳴らし直す */
  restEnd = Date.now() - 1500;
  document.dispatchEvent(new Event("visibilitychange"));
  r.caughtUp = {stopped: restIv === null, shown: document.getElementById("timerT").textContent, delayNow: +(chimeAt - AC.currentTime).toFixed(2), ok: restIv === null && near(chimeAt - AC.currentTime, 0)};
  stopRest();
  r.stopped = {nodes: chimeNodes.length, visible: document.getElementById("timer").classList.contains("on")};

  /* 画面から離れて戻ったあとは、次に合図を予約するボタン（ここでは +30秒）を押したときに音声を作り直し、新しい音声で予約し直す。
     画面に触れただけでは作り直さない（鳴るはずだった合図を止めないため） */
  startRest(90, "テスト");
  const oldAC = AC;
  const seen = s => { Object.defineProperty(document, "visibilityState", {configurable: true, get: () => s}); document.dispatchEvent(new Event("visibilitychange")); };
  seen("hidden"); seen("visible");
  delete document.visibilityState;
  const stale = acStale;
  document.dispatchEvent(new Event("pointerdown"));
  const kept = AC === oldAC && chimeNodes.length > 0;
  T.click("#timerPlus");
  r.renewed = {stale, kept, fresh: AC !== oldAC, oldState: oldAC.state, nodes: chimeNodes.length, delay: chimeAt === null ? null : +(chimeAt - AC.currentTime).toFixed(2),
               ok: stale && kept && !acStale && AC !== oldAC && oldAC.state === "closed" && chimeNodes.length > 0 && chimeAt !== null && near(chimeAt - AC.currentTime, 120, 1)};
  /* 離れていないときは、押しても作り直さない */
  const sameAC = AC;
  T.click("#timerPlus");
  r.renewed.ok = r.renewed.ok && AC === sameAC;
  stopRest();

  /* 休憩が終わる前に次の記録で新しい休憩が始まっても、前の休憩の片付けで止められない */
  startRest(2, "1回目");
  restEnd = Date.now() - 10; tickRest();
  startRest(60, "2回目");
  await T.wait(4300);
  r.overlap = {running: restIv !== null, visible: document.getElementById("timer").classList.contains("on")};
  stopRest();

  /* 確実に鳴らす方式: 無音＋合図の音声データ */
  const buf = await chimeWav(2).arrayBuffer(), v = new DataView(buf);
  const sample = sec => v.getInt16(44 + Math.round(sec * 8000) * 2, true);
  let peakBefore = 0, peakAfter = 0;
  for(let t = 0; t < 1.99; t += 0.001) peakBefore = Math.max(peakBefore, Math.abs(sample(t)));
  for(let t = 2.0; t < 2.0 + CHIME_LEN - 0.01; t += 0.001) peakAfter = Math.max(peakAfter, Math.abs(sample(t)));
  /* 合図の前は、音の出口を起こしておく小さな音だけ（peakBefore は0より大きく、合図の1/50より小さい）。合図は大きさの半分ほど */
  r.wav = {riff: String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), rate: v.getUint32(24, true),
           bytes: buf.byteLength, expect: 44 + Math.round((2 + CHIME_LEN) * 8000) * 2, peakBefore, peakAfter};
  /* 再生できる状態か（読み込めて長さが合うか） */
  const url = URL.createObjectURL(chimeWav(3));
  const a = new Audio(url);
  r.wavDuration = await new Promise(res => { a.onloadedmetadata = () => res(+a.duration.toFixed(2)); a.onerror = () => res("error"); setTimeout(() => res("timeout"), 4000); });
  URL.revokeObjectURL(url);

  /* 確実に鳴らす方式で再生を断られたとき（ヘッドレスは自動再生不可）は Web Audio に切り替わる */
  PREF.set("sure", true);
  startRest(30, "テスト");
  await T.wait(300);
  r.sureFallback = {audio: !!restAudio, nodes: chimeNodes.length, delay: chimeAt === null ? null : +(chimeAt - AC.currentTime).toFixed(2)};
  stopRest();
  PREF.set("sure", false);

  window.__result = r;
  window.__ready = true;
})();
