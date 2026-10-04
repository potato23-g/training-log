/* ============================================================
   設定（この端末のみ）
   ============================================================ */
const PREF = {
  get(k,d){ try{ const v=localStorage.getItem("trainlog."+k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem("trainlog."+k, JSON.stringify(v)); }catch(e){} }
};
const PREF_DEFAULT = { sound:true, sure:false, vib:false, notify:false, wake:true };
let CAP = { sound:null, vib:null, notif:null, wake:null };

/* ---- 音 ----
   休憩終わりの合図は「記録」を押した瞬間（＝指で触れている間）に予約しておく。
   スマホは、指で触れていないときに新しく鳴らそうとしても音を出させてくれないことがあるため。
   既定（sure=オフ）: Web Audio。ほかのアプリの音楽と混ざる。iPhoneはマナーモード中だと鳴らない。
   sure=オン: 休憩の長さの無音＋合図の音声を <audio> で流す。マナーモード中・画面ロック中も鳴るが、
             休憩中はほかのアプリの音楽が止まる。 */
/* 合図は「ピッ・ピッ・ピー」。[始まり(秒), 高さ(Hz), 長さ(秒)]。
   以前は1音が0.05秒ほどで消える小さな音で（本物の操作で押して測ると、はっきり鳴っているのは3音を合わせて0.1秒ほど）、
   聞き取りにくかった。1音を長く・大きくし、1オクターブ上の音を重ねた（2026-10-04 本人の指摘「音がうまく鳴っていない」） */
const CHIME = [[0, 784, 0.16], [0.24, 784, 0.16], [0.48, 1046.5, 0.5]];
const CHIME_LEN = 1.05;                       /* 合図全体の長さ（秒） */
const CHIME_GAIN = 0.42, CHIME_OVER = 0.35;   /* 音の大きさ（1が最大）と、重ねる1オクターブ上の音の割合 */
const CHIME_FADE = 0.04;                      /* 1音の終わりを、ぷつっと切らずに消す長さ（秒） */
/* 合図の前に、聞こえないくらい小さな低い音を流しておく長さ（秒）。無音が続くと音の出口（スピーカー・イヤホン）が休み、
   鳴り始めの0.5秒ほどが切れる機器がある。合図は1秒ほどなので、先に起こしておく。
   今すぐ鳴らすとき（「鳴らしてみる」・戻ったときの知らせ）も、CHIME_LEAD_MIN だけ先に流してから鳴らす */
const CHIME_LEAD = 1.2, CHIME_LEAD_MIN = 0.3, CHIME_LEAD_HZ = 40, CHIME_LEAD_GAIN = 0.003;
/* 1音の大きさの移り変わり（0〜1）。t は音の始まりからの秒。Web Audio と WAV の両方がここを使う */
function chimeEnv(t, len){
  if(t < 0 || t >= len + CHIME_FADE) return 0;
  const body = Math.min(1, t / 0.012) * Math.exp(-t / (len * 0.6));
  return t < len ? body : body * (1 - (t - len) / CHIME_FADE);
}
let AC = null, chimeNodes = [], chimeAt = null, acStale = false;
function unlockAudio(){
  try{
    const C = window.AudioContext || window.webkitAudioContext;
    if(!C){ CAP.sound = false; return null; }
    if(!AC || AC.state === "closed") AC = new C();
    if(AC.state !== "running"){                       /* suspended / interrupted（iPhoneで電話などに止められた） */
      const p = AC.resume(); if(p && p.catch) p.catch(()=>{});
    }
    CAP.sound = true;
    return AC;
  }catch(e){ CAP.sound = false; return null; }
}
/* 合図を予約するボタン（記録・+30秒・−30秒・鳴らしてみる）を押したときに、最初に呼ぶ。
   画面から離れていたあとの最初の1回は、音声を作り直す。iPhone では、アプリを切り替えたり画面を消したりしたあと、
   音声が「動いている」と答えるのに鳴らないままになることがあり、作り直すまで直らない。
   新しい音声を鳴らせる状態にできるのはボタンを押した処理の中だけなので、ほかのところでは作り直さない
   （画面を送るだけの操作で作り直すと、鳴るはずだった合図まで止めてしまう）。合図の予約は、このあと呼び出し側がやり直す */
function tapAudio(){
  if(AC && acStale){
    cancelChime();
    try{ const p = AC.close(); if(p && p.catch) p.catch(()=>{}); }catch(e){}
    AC = null;
  }
  acStale = false;
  return unlockAudio();
}
/* どこかに触れたら、止められていた音声を使える状態に戻す */
["pointerdown","touchend","keydown"].forEach(t=>document.addEventListener(t, ()=>{
  if(AC && AC.state !== "running") unlockAudio();
}, {capture:true, passive:true}));

function cancelChime(){
  chimeNodes.forEach(o=>{ try{ o.onended = null; o.stop(0); }catch(e){} try{ o.disconnect(); }catch(e){} });
  chimeNodes = []; chimeAt = null;
}
/* delay 秒後に合図を鳴らす（0なら今すぐ。CHIME_LEAD_MIN だけ先に小さな音を流してから鳴る） */
function scheduleChime(delay){
  cancelChime();
  if(!PREF.get("sound", true)) return;
  const ac = unlockAudio(); if(!ac) return;
  try{
    const now = ac.currentTime, base = now + Math.max(CHIME_LEAD_MIN, delay);
    const osc = (hz, to, from, until) => {
      const o = ac.createOscillator();
      o.type = "sine"; o.frequency.value = hz;
      o.connect(to); o.start(from); o.stop(until);
      chimeNodes.push(o);
    };
    /* 先に流す小さな音（合図が鳴り終わるまで続ける） */
    const lead = ac.createGain();
    lead.gain.value = CHIME_LEAD_GAIN; lead.connect(ac.destination);
    osc(CHIME_LEAD_HZ, lead, Math.max(now, base - CHIME_LEAD), base + CHIME_LEN);
    CHIME.forEach(([t, f, len])=>{
      const s0 = base + t, dur = len + CHIME_FADE, n = Math.ceil(dur * 400) + 1;
      const curve = new Float32Array(n);
      for(let i = 0; i < n - 1; i++) curve[i] = CHIME_GAIN * chimeEnv(i / (n - 1) * dur, len);
      const g = ac.createGain(), over = ac.createGain();
      g.gain.value = 0; g.gain.setValueCurveAtTime(curve, s0, dur);
      over.gain.value = CHIME_OVER;
      over.connect(g); g.connect(ac.destination);
      osc(f, g, s0, s0 + dur + 0.01);
      osc(f * 2, over, s0, s0 + dur + 0.01);
    });
    chimeAt = base;
  }catch(e){ CAP.sound = false; }
}

/* 確実に鳴らす方式: 無音 delay 秒 → 合図 の WAV を作る（8kHz・16bit・モノラル。外部ファイルなし）。
   音の形は Web Audio と同じ（chimeEnv・先に流す小さな音） */
function chimeWav(delay){
  const rate = 8000, pre = Math.round(Math.max(0, delay) * rate), n = pre + Math.round(CHIME_LEN * rate);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for(let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  const wave = new Float32Array(n);
  for(let i = Math.max(0, pre - Math.round(CHIME_LEAD * rate)); i < n; i++) wave[i] = CHIME_LEAD_GAIN * Math.sin(2 * Math.PI * CHIME_LEAD_HZ * i / rate);
  CHIME.forEach(([t, f, len])=>{
    const s0 = pre + Math.round(t * rate), cnt = Math.round((len + CHIME_FADE) * rate);
    for(let i = 0; i < cnt && s0 + i < n; i++){
      const x = 2 * Math.PI * f * i / rate;
      wave[s0 + i] += CHIME_GAIN * chimeEnv(i / rate, len) * (Math.sin(x) + CHIME_OVER * Math.sin(2 * x));
    }
  });
  for(let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(32767 * Math.max(-1, Math.min(1, wave[i]))), true);
  return new Blob([buf], {type:"audio/wav"});
}
let restAudio = null, restAudioUrl = null;
function stopRestAudio(){
  if(restAudio){ try{ restAudio.pause(); }catch(e){} restAudio = null; }
  if(restAudioUrl){ try{ URL.revokeObjectURL(restAudioUrl); }catch(e){} restAudioUrl = null; }
}
function playRestAudio(delay){
  stopRestAudio();
  if(!PREF.get("sound", true)) return true;
  try{
    restAudioUrl = URL.createObjectURL(chimeWav(delay));
    const a = new Audio(restAudioUrl);
    restAudio = a;
    const p = a.play();
    /* 再生を断られたら Web Audio で鳴らす */
    if(p && p.catch) p.catch(()=>{ if(restAudio === a){ stopRestAudio(); scheduleChime(Math.max(0, (restEnd - Date.now()) / 1000)); } });
    return true;
  }catch(e){ stopRestAudio(); return false; }
}
/* 休憩の残りに合わせて合図を予約し直す（記録・+30秒のタップの中で呼ぶ） */
function armChime(){
  const delay = Math.max(0, (restEnd - Date.now()) / 1000);
  if(PREF.get("sure", false)){ cancelChime(); if(!playRestAudio(delay)) scheduleChime(delay); }
  else { stopRestAudio(); scheduleChime(delay); }
}
/* 休憩が終わった時点で、予約した合図が遅れていたら（途中で音声が止められていたら）今鳴らす */
function ensureChimeNow(){
  if(!PREF.get("sound", true)) return;
  if(restAudio){
    const at = restAudio.duration ? Math.max(0, restAudio.duration - CHIME_LEN) : 0;
    if(restAudio.paused || restAudio.currentTime < at - 0.5){
      try{ restAudio.currentTime = at; const p = restAudio.play(); if(p && p.catch) p.catch(()=>scheduleChime(0)); }
      catch(e){ scheduleChime(0); }
    }
    return;
  }
  if(!AC || AC.state !== "running" || chimeAt === null || AC.currentTime < chimeAt - 0.5) scheduleChime(0);
}
/* 設定画面の「鳴らしてみる」 */
function testChime(){
  if(PREF.get("sure", false)){ cancelChime(); if(!playRestAudio(0)) scheduleChime(0); }
  else scheduleChime(0);
}
/* ---- 振動 ---- */
function buzz(){
  if(!PREF.get("vib", false)) return;
  try{ if(navigator.vibrate){ navigator.vibrate([220,90,220,90,320]); CAP.vib = true; } else CAP.vib = false; }
  catch(e){ CAP.vib = false; }
}
/* ---- 端末通知 ---- */
function notifySupported(){ return typeof Notification !== "undefined"; }
function notify(title, body){
  if(!PREF.get("notify", false) || !notifySupported() || Notification.permission !== "granted") return;
  const opts = {body, tag:"trainlog-rest", renotify:true};
  const direct = ()=>{ try{ new Notification(title, opts); CAP.notif = true; }catch(e){ CAP.notif = false; } };
  /* ホーム画面に追加したアプリ（Android など）は new Notification が使えないので、Service Worker 経由で出す */
  try{
    if(navigator.serviceWorker && navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration()
        .then(reg=>{ if(reg && reg.showNotification) return reg.showNotification(title, opts).then(()=>{ CAP.notif = true; }); direct(); })
        .catch(direct);
      return;
    }
  }catch(e){}
  direct();
}
async function askNotify(){
  if(!notifySupported()){ CAP.notif = false; setStatus("この画面では端末の通知が使えません。音と振動でお知らせします"); render(); return; }
  try{
    const r = await Notification.requestPermission();
    const ok = (r === "granted");
    PREF.set("notify", ok); CAP.notif = ok;
    setStatus(ok ? "" : "通知が許可されませんでした。音と振動でお知らせします");
  }catch(e){ CAP.notif = false; PREF.set("notify", false); setStatus("この画面では端末の通知が使えません。音と振動でお知らせします"); }
  render();
}
/* ---- 画面を消さない ---- */
let wakeLock = null;
async function keepAwake(on){
  try{
    if(on && navigator.wakeLock){ wakeLock = await navigator.wakeLock.request("screen"); CAP.wake = true; }
    else if(wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch(e){ CAP.wake = false; wakeLock = null; }
}
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState !== "visible"){ if(AC) acStale = true; return; }   /* 戻ってから合図を予約するときに、音声を作り直す（tapAudio） */
  if(!restIv) return;
  if(PREF.get("wake", true)) keepAwake(true);
  tickRest();                               /* 画面を離れている間に休憩が終わっていたら、ここで知らせる */
});

