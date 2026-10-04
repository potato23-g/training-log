/* ============================================================
   人体図
   ============================================================ */
/* タップして部位を選べる（からだタブの）図にだけ、読み上げ・キーボード操作のための
   role・tabindex・aria-label を足す（C15）。外側の <svg role="img"> のままだと、支援技術は
   中身をひとつの画像として読み、子のrole="button"は読み上げに出てこないので、
   svg側もrole="group"に替える。クリックの結び直しは events.js の wire() 側で行う */
function addRgA11y(svg){
  return svg.replace(' role="img"', ' role="group"')
    .replace(/<(\w+) class="rg" data-m="(\w+)"/g,
      (full, tag, m) => `<${tag} class="rg" data-m="${m}" role="button" tabindex="0" aria-label="${MUSCLES[m] || ""}"`);
}
function figFront(){ return `
<svg class="fig" viewBox="0 0 200 378" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="正面の筋肉図">
 <g class="nt">
  <ellipse cx="100" cy="28" rx="18" ry="21"/>
  <rect x="91" y="45" width="18" height="14" rx="5"/>
  <path d="M78,170 L122,170 L118,191 L82,191 Z"/>
  <ellipse cx="46" cy="208" rx="8" ry="10"/><ellipse cx="154" cy="208" rx="8" ry="10"/>
  <ellipse cx="88" cy="284" rx="12" ry="9"/><ellipse cx="112" cy="284" rx="12" ry="9"/>
  <rect x="80" y="290" width="17" height="62" rx="8"/><rect x="103" y="290" width="17" height="62" rx="8"/>
  <path d="M80,352 L97,352 L97,366 L74,366 Z"/><path d="M120,352 L103,352 L103,366 L126,366 Z"/>
 </g>
 <path class="rg" data-m="traps" d="M80,62 L100,56 L120,62 L113,76 L87,76 Z"/>
 <path class="rg" data-m="sidedelt" d="M62,75 A16,15 0 0,0 62,105 Z"/>
 <path class="rg" data-m="frontdelt" d="M62,75 A16,15 0 0,1 62,105 Z"/>
 <path class="rg" data-m="sidedelt" d="M138,75 A16,15 0 0,1 138,105 Z"/>
 <path class="rg" data-m="frontdelt" d="M138,75 A16,15 0 0,0 138,105 Z"/>
 <rect class="rg" data-m="chest" x="77" y="74" width="22" height="36" rx="9"/>
 <rect class="rg" data-m="chest" x="101" y="74" width="22" height="36" rx="9"/>
 <ellipse class="rg" data-m="biceps" cx="53" cy="124" rx="11" ry="25"/>
 <ellipse class="rg" data-m="biceps" cx="147" cy="124" rx="11" ry="25"/>
 <ellipse class="rg" data-m="forearms" cx="46" cy="174" rx="9.5" ry="27"/>
 <ellipse class="rg" data-m="forearms" cx="154" cy="174" rx="9.5" ry="27"/>
 <path class="rg" data-m="obliques" d="M77,110 C71,128 73,148 81,166 L87,164 L87,112 Z"/>
 <path class="rg" data-m="obliques" d="M123,110 C129,128 127,148 119,166 L113,164 L113,112 Z"/>
 <rect class="rg" data-m="abs" x="86" y="112" width="28" height="58" rx="9"/>
 <rect class="rg" data-m="quads" x="76" y="189" width="23" height="89" rx="11"/>
 <rect class="rg" data-m="quads" x="101" y="189" width="23" height="89" rx="11"/>
 <path class="rg" data-m="adductors" d="M98,191 L98,248 L90,236 C88,216 90,199 93,191 Z"/>
 <path class="rg" data-m="adductors" d="M102,191 L102,248 L110,236 C112,216 110,199 107,191 Z"/>
</svg>`; }

function figBack(){ return `
<svg class="fig" viewBox="0 0 200 378" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="背面の筋肉図">
 <g class="nt">
  <ellipse cx="100" cy="28" rx="18" ry="21"/>
  <ellipse cx="46" cy="208" rx="8" ry="10"/><ellipse cx="154" cy="208" rx="8" ry="10"/>
  <ellipse cx="88" cy="286" rx="12" ry="9"/><ellipse cx="112" cy="286" rx="12" ry="9"/>
  <path d="M80,352 L97,352 L97,366 L74,366 Z"/><path d="M120,352 L103,352 L103,366 L126,366 Z"/>
 </g>
 <path class="rg" data-m="traps" d="M100,50 L127,66 L117,106 L100,114 L83,106 L73,66 Z"/>
 <path class="rg" data-m="sidedelt" d="M60,76 A15,14 0 0,0 60,104 Z"/>
 <path class="rg" data-m="reardelt" d="M60,76 A15,14 0 0,1 60,104 Z"/>
 <path class="rg" data-m="sidedelt" d="M140,76 A15,14 0 0,1 140,104 Z"/>
 <path class="rg" data-m="reardelt" d="M140,76 A15,14 0 0,0 140,104 Z"/>
 <path class="rg" data-m="lats" d="M79,100 C69,118 72,144 83,166 L98,152 L98,104 Z"/>
 <path class="rg" data-m="lats" d="M121,100 C131,118 128,144 117,166 L102,152 L102,104 Z"/>
 <rect class="rg" data-m="erectors" x="93" y="112" width="14" height="58" rx="6"/>
 <ellipse class="rg" data-m="triceps" cx="53" cy="124" rx="11" ry="25"/>
 <ellipse class="rg" data-m="triceps" cx="147" cy="124" rx="11" ry="25"/>
 <ellipse class="rg" data-m="forearms" cx="46" cy="174" rx="9.5" ry="27"/>
 <ellipse class="rg" data-m="forearms" cx="154" cy="174" rx="9.5" ry="27"/>
 <path class="rg" data-m="gmed" d="M76,197 C70,184 72,171 85,167 L91,167 L91,172 C84,174 79,181 77,191 Z"/>
 <path class="rg" data-m="gmed" d="M124,197 C130,184 128,171 115,167 L109,167 L109,172 C116,174 121,181 123,191 Z"/>
 <path class="rg" data-m="glutes" d="M100,172 L100,213 C91,219 79,212 77,197 C76,182 86,170 100,172 Z"/>
 <path class="rg" data-m="glutes" d="M100,172 L100,213 C109,219 121,212 123,197 C124,182 114,170 100,172 Z"/>
 <rect class="rg" data-m="hams" x="77" y="213" width="22" height="68" rx="10"/>
 <rect class="rg" data-m="hams" x="101" y="213" width="22" height="68" rx="10"/>
 <rect class="rg" data-m="calves" x="80" y="292" width="17" height="60" rx="8"/>
 <rect class="rg" data-m="calves" x="103" y="292" width="17" height="60" rx="8"/>
</svg>`; }

function bothFigs(clickable){
  const c = clickable ? " clickable" : "";
  const front = clickable ? addRgA11y(figFront()) : figFront();
  const back = clickable ? addRgA11y(figBack()) : figBack();
  return `<div class="figs">
    <div class="figwrap">${front.replace('class="fig"','class="fig'+c+'"')}<div class="cap">前面</div></div>
    <div class="figwrap">${back.replace('class="fig"','class="fig'+c+'"')}<div class="cap">背面</div></div>
  </div>`;
}

function paintFigs(root, weights, maxV){
  root.querySelectorAll("svg.fig .rg").forEach(el=>{
    const m = el.getAttribute("data-m");
    const v = weights[m] || 0;
    if(v<=0){ el.style.fill=""; return; }
    const t = maxV>0 ? Math.min(1, v/maxV) : 1;
    el.style.fill = "color-mix(in srgb, var(--muscle) "+Math.round(22+78*t)+"%, var(--neutral-fill))";
  });
}

/* 直近N日間の部位別「有効セット数」 */
function muscleLoad(days){
  const out = {}; Object.keys(MUSCLES).forEach(k=>out[k]=0);
  for(const d of sortedDates()){
    if(daysAgo(d) >= days) continue;
    for(const e of (state.sessions[d].entries||[])){
      const ex = EXMAP[e.ex]; if(!ex) continue;
      const n = e.sets.length;
      ex.p.forEach(m=> out[m] = (out[m]||0) + n);
      (ex.s||[]).forEach(m=> out[m] = (out[m]||0) + n*0.5);
    }
  }
  return out;
}

