/* からだの図（キャラクターの素体）を描く。tools/make_bodyfig.py が公開版の index.html の中で流す。
   返すもの: front / back それぞれの、シルエットの画像（白・背景は透かす）と部位の形（SVG の path。viewBox の座標）。
   素体: 顔・髪・手・靴・肌はモデルのまま、服の下の胴と手足は骨の位置から楕円体と円柱で作る（モデルには服の下の体が無い）。
   部位の形は解剖図に合わせて、骨の位置と胴の幅（素体の胴だけを描いて測る）から決める。
   座標: モデルの +X が体の左、+Z が前。正面図は体の左が画面の右、背面図は体の左が画面の左 */
(async () => {
  const out = {fail: []};
  try{
    const THREE = await import('./mmd/vendor/three/three.module.js');
    const P = await import('./mmd/player.js');
    const p = await P.create(), rig = p.rig, mesh = rig.mesh, V = (x, y, z) => new THREE.Vector3(x, y, z);
    /* 腕を体の横に下ろし、手のひらを内側へ */
    const hand = sg => c => { const S = sg > 0 ? c.shL : c.shR; return { pos: S.clone().add(V(sg * 1.45, -4.3, 0.15)), pole: V(sg * 0.3, 0, -1), palm: V(-sg, 0, 0.25), fingers: V(sg * 0.1, -1, 0), hand: 'relax' }; };
    rig.pose({ handL: hand(1), handR: hand(-1) });
    mesh.updateMatrixWorld(true);
    const B = n => rig.wp(n);

    /* viewBox: 1 単位 = U。左右は ±XL、上下は Y0〜Y1 */
    const U = 20, XL = 3.4, Y0 = -0.3, Y1 = 20.2, VW = Math.round(2 * XL * U), VH = Math.round((Y1 - Y0) * U), K = 3;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    r.setPixelRatio(1); r.setSize(VW * K, VH * K, false); r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene(), par = mesh.parent; sc.add(mesh);
    const cam = new THREE.OrthographicCamera(-XL, XL, (Y1 - Y0) / 2, -(Y1 - Y0) / 2, -100, 100), CY = (Y0 + Y1) / 2;
    const orig = mesh.material.slice();
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), hid = new THREE.MeshBasicMaterial({ visible: false });

    /* ---- 素体 ---- */
    const torso = new THREE.Group(), arms = new THREE.Group(), legs = new THREE.Group(); sc.add(torso); sc.add(arms); sc.add(legs);
    const ell = (g, c, rx, ry, rz) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), white); m.position.copy(c); m.scale.set(rx, ry, rz); g.add(m); };
    const cap = (g, a, b, ra, rb) => { const d = b.clone().sub(a), L = d.length();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, L, 32), white); m.position.copy(a.clone().add(b).multiplyScalar(0.5));
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); g.add(m); ell(g, a, ra, ra, ra); ell(g, b, rb, rb, rb); };
    const shL = B('左腕'), shR = B('右腕'), sh = (shL.y + shR.y) / 2, hipY = (B('左足').y + B('右足').y) / 2;
    ell(torso, V(0, sh - 1.0, -0.35), 1.5, 1.4, 0.85);         // 胸郭
    ell(torso, V(0, 12.75, -0.2), 1.1, 1.15, 0.72);            // 腹
    ell(torso, V(0, 11.35, -0.12), 1.48, 1.08, 0.9);           // 骨盤
    cap(torso, B('首'), V(0, sh - 0.4, -0.45), 0.42, 0.5);
    for (const s of ['左', '右']) {
      cap(torso, V(0, sh - 0.3, -0.45), B(s + '腕'), 0.45, 0.5);        // 肩
      cap(torso, V(0, sh + 0.5, -0.5), V(B(s + '腕').x * 0.8, sh + 0.1, -0.5), 0.3, 0.3);   // 首から肩への傾斜（僧帽筋）
      cap(arms, B(s + '腕'), B(s + 'ひじ'), 0.48, 0.38); cap(arms, B(s + 'ひじ'), B(s + '手首'), 0.37, 0.27);
      cap(legs, B(s + '足'), B(s + 'ひざ'), 0.85, 0.55); cap(legs, B(s + 'ひざ'), B(s + '足首'), 0.5, 0.31);
      ell(legs, B(s + 'ひざ').clone().lerp(B(s + '足首'), 0.3).add(V(0, 0, -0.12)), 0.56, 1.25, 0.55);   // ふくらはぎ
    }
    const NAKED = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12];
    const shot = (show, parts, back) => {
      mesh.material = orig.map((m, i) => show.includes(i) ? white : hid);
      torso.visible = parts.includes('torso'); arms.visible = parts.includes('arms'); legs.visible = parts.includes('legs');
      cam.position.set(0, CY, back ? -20 : 20); cam.lookAt(0, CY, 0);
      r.render(sc, cam);
      return r.domElement.toDataURL('image/png');
    };
    /* 胴の半幅（素体の胴と脚だけを描いて、行ごとに外側から測る。腕は入れない） */
    const torsoPng = shot([], ['torso', 'legs'], false);
    const im = new Image(); im.src = torsoPng; await im.decode();
    const cv = document.createElement('canvas'); cv.width = VW * K; cv.height = VH * K;
    const g0 = cv.getContext('2d'); g0.drawImage(im, 0, 0);
    const px = g0.getImageData(0, 0, cv.width, cv.height).data;
    const T = y => { const row = Math.round((Y1 - y) * U * K); if (row < 0 || row >= cv.height) return 0;
      const c = cv.width / 2; let x = cv.width - 1;
      for (; x > c; x--) if (px[(row * cv.width + x) * 4 + 3] > 128) break;
      return (x - c) / (U * K); };
    const ed = (y, d) => T(y) + d;

    /* ---- 部位の形 ---- */
    /* 点の列をなめらかな閉じた形にする（Catmull-Rom を 3 次ベジェに）。pts は viewBox の座標 */
    const f1 = v => Math.round(v * 10) / 10;
    const smooth = pts => { const n = pts.length; let d = 'M' + f1(pts[0][0]) + ',' + f1(pts[0][1]);
      for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += 'C' + [c1, c2, p2].map(q => f1(q[0]) + ',' + f1(q[1])).join(' '); }
      return d + 'Z'; };
    const open = pts => 'M' + pts.map(q => f1(q[0]) + ',' + f1(q[1])).join('L');
    const toVB = (back) => ([x, y]) => [((back ? -x : x) + XL) * U, (Y1 - y) * U];
    /* 手足に沿った座標: a→b の割合 u、横へ v（+ は体の外側。単位はその場所の太さ r） */
    const along = (a, b, ra, rb, sg) => (u, v) => { const c = a.clone().lerp(b, u), d = b.clone().sub(a).normalize();
      const n = V(d.y, -d.x, 0).normalize(); if (n.x * sg < 0) n.negate(); const rr = ra + (rb - ra) * u;
      return [c.x + n.x * v * rr, c.y + n.y * v * rr]; };
    const R = { front: [], back: [] }, L = { front: [], back: [] };
    const add = (side, m, pts, sg) => R[side].push([m, pts.map(([x, y]) => [x * (sg || 1), y])]);
    const addAbs = (side, m, pts) => R[side].push([m, pts]);

    for (const [s, sg] of [['左', 1], ['右', -1]]) {
      const Sh = B(s + '腕'), E = B(s + 'ひじ'), Wr = B(s + '手首'), Hp = B(s + '足'), Kn = B(s + 'ひざ'), An = B(s + '足首');
      const sx = Math.abs(Sh.x);
      const arm = along(Sh, E, 0.5, 0.4, sg), fa = along(E, Wr, 0.38, 0.28, sg), th = along(Hp, Kn, 0.88, 0.56, sg), sk = along(Kn, An, 0.52, 0.31, sg);
      const D = arm(0.45, 0.15);                 // 三角筋の付くところ（上腕の半ばより少し上）
      const Dx = D[0] * sg;
      /* 正面 */
      add('front', 'traps', [[0.3, sh + 0.52], [0.5, sh + 0.46], [sx - 0.12, sh + 0.22], [sx - 0.36, sh + 0.04], [0.58, sh + 0.1], [0.32, sh + 0.26]], sg);
      add('front', 'frontdelt', [[sx - 0.3, sh + 0.1], [sx + 0.1, sh + 0.36], [sx + 0.22, sh - 0.2], [Dx, D[1]], [sx - 0.18, sh - 0.65], [sx - 0.42, sh - 0.25]], sg);
      add('front', 'sidedelt', [[sx + 0.24, sh + 0.36], [sx + 0.7, sh + 0.05], [sx + 0.8, sh - 0.6], [Dx + 0.12, D[1] - 0.05], [sx + 0.34, sh - 0.2]], sg);
      add('front', 'chest', [[0.09, sh - 0.22], [0.6, sh - 0.1], [sx - 0.5, sh - 0.25], [sx - 0.32, sh - 0.62], [sx - 0.35, sh - 0.95], [ed(sh - 1.45, -0.2), sh - 1.5], [0.62, sh - 1.82], [0.09, sh - 1.72]], sg);
      add('front', 'biceps', [arm(0.36, -0.1), arm(0.5, 0.75), arm(0.72, 0.85), arm(0.9, 0.35), arm(0.93, -0.3), arm(0.72, -0.85), arm(0.5, -0.8)]);
      add('front', 'forearms', [fa(0.04, 0.2), fa(0.1, 1.15), fa(0.35, 1.2), fa(0.7, 0.75), fa(0.86, 0.3), fa(0.86, -0.4), fa(0.6, -1.0), fa(0.25, -1.1), fa(0.06, -0.6)]);
      /* 腹斜筋: 腹直筋の外側。上は肋骨の下（胸の下の外側）、下は腸骨の上 */
      add('front', 'obliques', [[0.62, sh - 1.98], [ed(sh - 1.7, -0.1), sh - 1.7], [ed(12.7, 0.1), 12.7], [ed(11.9, -0.05), 11.82], [0.95, 11.62], [0.6, 12.0], [0.56, 12.9]], sg);
      /* 大腿四頭筋: 股関節の前から膝の上まで。下の内側は内側広筋のふくらみ */
      add('front', 'quads', [th(0.03, 0.4), th(0.1, 1.15), th(0.5, 1.15), th(0.88, 0.85), th(0.97, 0.3), th(0.97, -0.3), th(0.88, -0.95), th(0.66, -0.7), th(0.4, -0.35), th(0.16, 0.0), th(0.06, 0.15)]);
      /* 内転筋: 恥骨から太ももの内側の半ばまで */
      add('front', 'adductors', [[0.08 * sg, hipY - 0.02], [0.4 * sg, hipY + 0.05], th(0.12, -0.12), th(0.38, -0.48), th(0.62, -0.82), th(0.6, -1.1), th(0.3, -1.15), [0.07 * sg, hipY - 0.7]]);
      /* 背面 */
      add('back', 'reardelt', [[sx - 0.4, sh + 0.12], [sx + 0.1, sh + 0.36], [sx + 0.22, sh - 0.2], [Dx, D[1]], [sx - 0.18, sh - 0.65], [sx - 0.48, sh - 0.25]], sg);
      add('back', 'sidedelt', [[sx + 0.24, sh + 0.36], [sx + 0.7, sh + 0.05], [sx + 0.8, sh - 0.6], [Dx + 0.12, D[1] - 0.05], [sx + 0.34, sh - 0.2]], sg);
      add('back', 'triceps', [arm(0.33, 0.6), arm(0.6, 1.2), arm(0.88, 0.8), arm(0.97, 0.1), arm(0.88, -0.75), arm(0.6, -1.2), arm(0.4, -0.7)]);
      add('back', 'forearms', [fa(0.04, 0.2), fa(0.1, 1.15), fa(0.35, 1.2), fa(0.7, 0.75), fa(0.86, 0.3), fa(0.86, -0.4), fa(0.6, -1.0), fa(0.25, -1.1), fa(0.06, -0.6)]);
      /* 広背筋: わきの下の後ろから、胴の横を通って腸骨の上と腰へ。腰では脊柱起立筋の外側まで */
      add('back', 'lats', [[sx - 0.4, sh - 0.5], [ed(sh - 0.9, -0.05), sh - 0.95], [ed(13.3, 0.05), 13.3], [ed(12.1, 0.05), 12.1], [0.95, 11.75], [0.5, 11.85], [0.46, 12.6], [0.32, 13.45], [0.6, sh - 1.45], [0.95, sh - 1.0]], sg);
      /* 脊柱起立筋: 背骨の両わき。背中の半ばから仙骨まで、腰で太い */
      add('back', 'erectors', [[0.07, 13.95], [0.2, 13.95], [0.36, 12.8], [0.4, 11.8], [0.3, 11.15], [0.07, 11.05]], sg);
      /* 中殿筋: 腸骨の下、お尻の上の外側 */
      add('back', 'gmed', [[0.62, 11.72], [ed(11.62, 0.2), 11.62], [ed(11.0, 0.2), 10.95], [ed(10.95, -0.2), 10.88], [0.72, 11.3]], sg);
      /* 大殿筋: 仙骨から太ももの付け根の外側へ、下はお尻の下のしわ */
      add('back', 'glutes', [[0.07, 11.12], [0.62, 11.22], [ed(10.85, -0.18), 10.8], [ed(10.3, 0.1), 10.25], [ed(9.85, -0.15), 9.7], [0.8, 9.6], [0.38, 9.68], [0.1, 10.0]], sg);
      /* ハムストリング: お尻の下から膝の裏の上まで。下は外側（大腿二頭筋）と内側（半腱様筋・半膜様筋）に分かれる */
      add('back', 'hams', [th(0.24, -0.85), th(0.22, 0.95), th(0.6, 1.05), th(0.86, 0.85), th(0.97, 0.55), th(0.9, 0.1), th(0.97, -0.4), th(0.86, -0.85), th(0.5, -1.0)]);
      /* 下腿三頭筋（腓腹筋）: 膝の裏の下の2つのふくらみ。内側の方が少し下まで */
      add('back', 'calves', [sk(0.03, 0.7), sk(0.22, 1.12), sk(0.45, 0.65), sk(0.64, 0.0), sk(0.52, -0.75), sk(0.28, -1.15), sk(0.03, -0.7), sk(0.06, 0.0)]);
    }
    /* 腹直筋: みぞおちから恥骨まで。上が広く下が細い。腱画の線は別に引く */
    const absW = y => 0.2 + 0.32 * Math.max(0, Math.min(1, (y - hipY) / (sh - 1.85 - hipY)));
    const absTop = sh - 1.82, absBot = hipY + 0.12;
    addAbs('front', 'abs', [[0.5, absTop], [absW(12.6) + 0.04, 12.6], [absW(11.5), 11.5], [0.17, absBot], [-0.17, absBot], [-absW(11.5), 11.5], [-absW(12.6) - 0.04, 12.6], [-0.5, absTop]]);
    L.front.push([[0, absTop + 0.05], [0, 11.25]]);
    for (const y of [13.05, 12.5, 11.95]) L.front.push([[-absW(y) - 0.05, y + 0.04], [0, y - 0.02], [absW(y) + 0.05, y + 0.04]]);
    /* 僧帽筋（背面）: 首の付け根から肩先へ、下は背中の半ば（第12胸椎）まで。左右で1つ */
    const sxa = (Math.abs(shL.x) + Math.abs(shR.x)) / 2;
    addAbs('back', 'traps', [[0.22, sh + 0.72], [0.5, sh + 0.42], [sxa + 0.1, sh + 0.15], [sxa - 0.3, sh - 0.18], [0.62, sh - 0.85], [0.1, 13.05], [-0.1, 13.05], [-0.62, sh - 0.85], [-sxa + 0.3, sh - 0.18], [-sxa - 0.1, sh + 0.15], [-0.5, sh + 0.42], [-0.22, sh + 0.72]]);

    const pack = side => {
      const back = side === 'back', vb = toVB(back);
      return { regions: R[side].map(([m, pts]) => [m, smooth(pts.map(vb))]), lines: L[side].map(pts => open(pts.map(vb))) };
    };
    out.vb = [VW, VH];
    out.front = Object.assign(pack('front'), { png: shot(NAKED, ['torso', 'arms', 'legs'], false) });
    out.back = Object.assign(pack('back'), { png: shot(NAKED, ['torso', 'arms', 'legs'], true) });
    mesh.material = orig; sc.remove(mesh); par.add(mesh);
    r.dispose();
    /* 確かめ用の見本（make_bodyfig.py --preview）: 部位ごとに違う濃さで塗って並べる */
    const WT = { quads: 9, glutes: 8, hams: 5, adductors: 4, calves: 3, abs: 2, erectors: 3, chest: 6, triceps: 3, frontdelt: 3, lats: 7, biceps: 4, traps: 2, reardelt: 1, forearms: 2, obliques: 5, gmed: 6, sidedelt: 0 };
    const col = v => { const k = v > 0 ? 0.22 + 0.78 * Math.min(1, v / 9) : 0, a = [184, 64, 56], b = [219, 220, 212]; return 'rgb(' + a.map((c, i) => Math.round(c * k + b[i] * (1 - k))).join(',') + ')'; };
    const SC = 4, pv = document.createElement('canvas'); pv.width = VW * SC * 2 + 40; pv.height = VH * SC; const G = pv.getContext('2d');
    G.fillStyle = '#f6f6f2'; G.fillRect(0, 0, pv.width, pv.height);
    for (const [i, side] of [[0, 'front'], [1, 'back']]) {
      const o = out[side], id = 'm' + side;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${VW * SC}" height="${VH * SC}" viewBox="0 0 ${VW} ${VH}">
        <defs><mask id="${id}"><image href="${o.png}" width="${VW}" height="${VH}"/></mask></defs>
        <rect width="${VW}" height="${VH}" fill="rgb(219,220,212)" opacity=".55" mask="url(#${id})"/>
        <g mask="url(#${id})">${o.regions.map(([m, d]) => `<path d="${d}" fill="${col(WT[m] || 0)}" stroke="#C4C6BD" stroke-width=".8"/>`).join('')}</g>
        <g fill="none" stroke="#C4C6BD" stroke-width=".8">${o.lines.map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
      const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
      G.drawImage(img, i * (VW * SC + 40), 0);
    }
    out.preview = pv.toDataURL('image/jpeg', 0.9);
  }catch(e){ out.fail.push(String(e && e.stack || e)); }
  window.__result = out; window.__ready = true;
})();
