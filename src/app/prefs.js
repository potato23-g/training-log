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
const CHIME = [[0,784],[0.22,784],[0.44,1046]];
let AC = null, chimeNodes = [], chimeAt = null;
function unlockAudio(){
  try{
    const C = window.AudioContext || window.webkitAudioContext;
    if(!C){ CAP.sound = false; return null; }
    if(!AC) AC = new C();
    if(AC.state !== "running") AC.resume();          /* suspended / interrupted（iPhoneで電話などに止められた） */
    CAP.sound = true;
    return AC;
  }catch(e){ CAP.sound = false; return null; }
}
/* どこかに触れたら、止められていた音声を使える状態に戻す */
["pointerdown","touchend","keydown"].forEach(t=>document.addEventListener(t, ()=>{
  if(AC && AC.state !== "running") unlockAudio();
}, {capture:true, passive:true}));

function cancelChime(){
  chimeNodes.forEach(o=>{ try{ o.onended = null; o.stop(0); }catch(e){} try{ o.disconnect(); }catch(e){} });
  chimeNodes = []; chimeAt = null;
}
/* delay 秒後に合図を鳴らす（0なら今すぐ） */
function scheduleChime(delay){
  cancelChime();
  if(!PREF.get("sound", true)) return;
  const ac = unlockAudio(); if(!ac) return;
  try{
    const base = ac.currentTime + Math.max(0, delay);
    CHIME.forEach(([t,f])=>{
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      const s0 = base + t;
      g.gain.setValueAtTime(0.0001, s0);
      g.gain.exponentialRampToValueAtTime(0.3, s0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.2);
      o.connect(g); g.connect(ac.destination);
      o.start(s0); o.stop(s0 + 0.22);
      chimeNodes.push(o);
    });
    chimeAt = base;
  }catch(e){ CAP.sound = false; }
}

/* 確実に鳴らす方式: 無音 delay 秒 → 合図 の WAV を作る（8kHz・16bit・モノラル。外部ファイルなし） */
function chimeWav(delay){
  const rate = 8000, pre = Math.round(Math.max(0, delay) * rate), n = pre + Math.round(0.9 * rate);
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for(let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 2, true);
  CHIME.forEach(([t,f])=>{
    const s0 = pre + Math.round(t * rate), len = Math.round(0.2 * rate);
    for(let i = 0; i < len && s0 + i < n; i++){
      const env = Math.min(1, i / (0.02 * rate)) * Math.exp(-i / (0.07 * rate));
      v.setInt16(44 + (s0 + i) * 2, Math.round(12000 * env * Math.sin(2 * Math.PI * f * i / rate)), true);
    }
  });
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
    const at = restAudio.duration ? Math.max(0, restAudio.duration - 0.9) : 0;
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
  if(document.visibilityState !== "visible" || !restIv) return;
  if(PREF.get("wake", true)) keepAwake(true);
  tickRest();                               /* 画面を離れている間に休憩が終わっていたら、ここで知らせる */
});

