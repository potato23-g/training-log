/* ============================================================
   外から入ってくるデータの確かめと、画面に出すときのエスケープ
   同期（GitHub）・バックアップの取り込み・端末の保存データの読み込みは、どれも sanitizeState() を通す。
   形の合わない値は数にする・捨てる。画面に文字を入れるときは esc() を通す。
   ============================================================ */
/* 画面（innerHTML）に文字を入れるときは必ず通す。属性の値にも使える */
function esc(v){
  return String(v === undefined || v === null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/* 記録の形に合うものだけを残した、新しいオブジェクトを返す（例外は投げない）。
   種目id は英数字と _ だけ。数は Number() で数にし、数にならないものは捨てる */
function sanitizeState(obj){
  var out = { sessions:{} }, src = obj && typeof obj === "object" ? obj : {};
  var exok = function(v){ return typeof v === "string" && /^[A-Za-z0-9_]{1,40}$/.test(v); };
  var num = function(v){ var n = Number(v); return (v === null || v === "" || typeof v === "boolean") ? null : (isFinite(n) ? n : null); };
  var text = function(v, max){ return typeof v === "string" && v.length <= max ? v : undefined; };
  var sessions = src.sessions && typeof src.sessions === "object" && !Array.isArray(src.sessions) ? src.sessions : {};

  Object.keys(sessions).forEach(function(day){
    var s = sessions[day];
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day) || !s || typeof s !== "object") return;
    var x = { date: typeof s.date === "string" ? s.date : day, entries: [] };
    ["note", "routine"].forEach(function(k){ if(typeof s[k] === "string") x[k] = s[k]; });
    ["noteAt", "planAt", "planEdit", "soreAt", "updatedAt"].forEach(function(k){ var n = num(s[k]); if(n !== null) x[k] = n; });
    if(Array.isArray(s.del)) x.del = s.del.filter(function(v){ return typeof v === "string"; });
    /* その日「筋肉痛」と選んだ部位（部位のキーだけ） */
    if(Array.isArray(s.sore)) x.sore = s.sore.filter(function(v){ return typeof v === "string" && /^[a-z]{2,20}$/.test(v); }).slice(0, 20);
    if(s.deload === true) x.deload = true;

    /* 記録: 種目ごとのセット */
    (Array.isArray(s.entries) ? s.entries : []).forEach(function(e){
      if(!e || !exok(e.ex) || !Array.isArray(e.sets)) return;
      var ne = { ex: e.ex, sets: [] };
      e.sets.forEach(function(z){
        if(!z || typeof z !== "object") return;
        var r = num(z.r); if(r === null || r < 0) return;          /* 回数・秒が数でないセットは捨てる */
        var nz = { r: r }, n = num(z.at);
        if(typeof z.id === "string") nz.id = z.id.slice(0, 64);
        nz.at = n === null ? 0 : n;
        n = num(z.w); if(n !== null && n >= 0) nz.w = n;
        n = num(z.rpe); if(n !== null && n >= 0 && n <= 10) nz.rpe = n;
        if(typeof z.label === "string") nz.label = z.label.slice(0, 60);
        n = num(z.target); if(n !== null && n >= 0) nz.target = n;
        ne.sets.push(nz);
      });
      x.entries.push(ne);
    });

    /* その日のメニュー。元に無ければ作らない（無いことにも意味がある: まだ決めていない日） */
    if(Array.isArray(s.plan)){
      x.plan = [];
      s.plan.forEach(function(p){
        if(!p || !exok(p.ex)) return;
        var np = { ex: p.ex }, n;
        if((n = text(p.label, 60)) !== undefined) np.label = n;
        n = num(p.sets); if(n !== null && n >= 1 && n <= 10) np.sets = n;
        n = num(p.r); if(n !== null && n >= 0) np.r = n;
        ["side", "baseFig", "extra", "manual", "skip"].forEach(function(k){ if(p[k] === true) np[k] = true; });
        if((n = text(p.note, 300)) !== undefined) np.note = n;
        n = num(p.lv); if(n !== null && n >= -3 && n <= 3) np.lv = n;
        if(exok(p.mo)) np.mo = p.mo;
        if((n = text(p.tag, 40)) !== undefined) np.tag = n;
        x.plan.push(np);
      });
    }
    out.sessions[day] = x;
  });

  if(typeof readGear === "function") out.gear = readGear(src.gear);
  else if(src.gear && typeof src.gear === "object"){
    var g = { items: [] }, at = num(src.gear.updatedAt);
    if(at !== null) g.updatedAt = at;
    (Array.isArray(src.gear.items) ? src.gear.items : []).forEach(function(i){
      var kg = num(i && i.kg), n = num(i && i.n);
      if(kg !== null && n !== null) g.items.push({ kg: kg, n: n });
    });
    out.gear = g;
  }
  if(Array.isArray(src.program)) out.program = src.program.filter(exok);
  return out;
}
