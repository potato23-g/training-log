/* 現行（改修前）の DIA を、動作中の中間フレーム込みで一覧にする */
(() => {
  stopAnim();
  const ids = Object.keys(DIA);
  const ts = [0, 0.15, 0.35, 0.5, 0.7, 0.85, 1];
  let html = '<table style="border-collapse:collapse;font:12px sans-serif;background:#fff;color:#123">';
  html += '<tr><th></th>' + ts.map(t => `<th style="padding:2px">t=${t}</th>`).join('') + '</tr>';
  for (const id of ids) {
    const d = DIA[id];
    html += `<tr><td style="padding:2px 8px;white-space:nowrap">${id}<br><small>${d.mode}</small></td>`;
    html += ts.map(t => {
      const svg = figSVG(framePose(d, t), d, false).replace('<svg ', '<svg width="150" height="171" ');
      return `<td style="border:1px solid #ddd;padding:0">${svg}</td>`;
    }).join('');
    html += '</tr>';
  }
  html += '</table>';
  document.body.innerHTML = '<div id="sheet" style="display:inline-block;padding:6px;background:#fff">' + html + '</div>';
  document.body.style.background = '#fff';
  window.__ready = true;
})();
