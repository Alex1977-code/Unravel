'use strict';
// Zwischensequenzen wie im Film: Breitbild mit Balken, langsame Kamerafahrten über gemalte Ebenen, Körnung,
// Überblendungen. Rückblenden (Nils' Erinnerungen) sind warm und die Menschen darin leuchtende Lichtfiguren;
// die Gegenwart (Maja im Haus) ist ein Scherenschnitt im Lampenlicht. Rot ist immer nur der Faden.
// Alles wird auf eine 2D-Zeichenfläche gemalt (Bühne 1600 x 900), es gibt keine Bild- oder Videodateien.
(function () {
  const FF = globalThis.FF;
  const W = 1600, H = 900, BAR = 112, FLOOR = 690;
  const rad = (d) => d * Math.PI / 180, TAU = Math.PI * 2;
  const mix = (a, b, k) => a + (b - a) * k;
  const ease = (u) => u * u * (3 - 2 * u);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RED = '#c9402f', GREEN = '#6a9a52', DARK = '#15100e', LIGHT = '#fff2d2';

  if (globalThis.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };

  // ------------------------------------------------------------ Malwerkzeug
  const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const poly = (c, pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); };
  const ell = (c, x, y, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); c.fill(); };
  const line = (c, x0, y0, x1, y1, w, col) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const curve = (c, pts, w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) c.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const l = pts[pts.length - 1]; c.lineTo(l[0], l[1]); c.stroke();
  };
  const glow = (c, x, y, r, col, a) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
  };
  const noise = (x, s) => { const v = Math.sin(x * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
  // Hügelkette von links nach rechts
  const hills = (c, y, amp, seed, col, step = 40, bottom = H + 200) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(-400, bottom);
    for (let x = -400; x <= W + 400; x += step) c.lineTo(x, y - (Math.sin(x * 0.004 + seed) * 0.6 + Math.sin(x * 0.011 + seed * 2.3) * 0.3 + Math.sin(x * 0.027 + seed * 5) * 0.1) * amp);
    c.lineTo(W + 400, bottom); c.fill();
  };
  const grass = (c, y, col, t, seed, hgt = 46, step = 9, x0 = -300, x1 = W + 300) => {
    c.strokeStyle = col; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath();
    for (let x = x0, i = 0; x < x1; x += step, i++) {
      const hh = hgt * (0.45 + noise(i, seed)), sw = Math.sin(t * 1.3 + i * 0.4) * 7 + (noise(i, seed + 1) - 0.5) * 14;
      c.moveTo(x, y + 4); c.quadraticCurveTo(x + sw * 0.3, y - hh * 0.6, x + sw, y - hh);
    }
    c.stroke();
  };
  // Schwebeteilchen: Staub im Licht, Schnee, Regen, Laub, Glut
  function motes(S, kind, n, seed, col) {
    const c = S.c, t = S.T;
    c.save();
    if (kind === 'rain') {
      c.strokeStyle = col || 'rgba(190,210,230,0.35)'; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ((noise(i, seed) * 2200 + t * 380 * (0.8 + noise(i, seed + 3) * 0.4)) % 2200) - 300, y = ((noise(i, seed + 1) * 1100 + t * 1500) % 1100) - 100;
        c.moveTo(x, y); c.lineTo(x + 14, y + 52);
      }
      c.stroke();
    } else {
      c.globalCompositeOperation = kind === 'leaf' ? 'source-over' : 'lighter';
      for (let i = 0; i < n; i++) {
        const sp = 0.4 + noise(i, seed + 2) * 0.9;
        let x, y, r;
        if (kind === 'snow') { x = ((noise(i, seed) * 2200 + Math.sin(t * 0.7 + i) * 30 + t * 22) % 2200) - 300; y = ((noise(i, seed + 1) * 1000 + t * 62 * sp) % 1000) - 50; r = 1.6 + noise(i, seed + 4) * 3; }
        else if (kind === 'leaf') { x = ((noise(i, seed) * 2200 + t * 40 * sp + Math.sin(t + i) * 40) % 2200) - 300; y = ((noise(i, seed + 1) * 1000 + t * 46 * sp) % 1000) - 50; r = 4 + noise(i, seed + 4) * 4; }
        else { x = noise(i, seed) * 1700 - 50 + Math.sin(t * 0.3 * sp + i) * 40; y = noise(i, seed + 1) * 800 + 40 + Math.cos(t * 0.25 * sp + i * 2) * 30 - (kind === 'ember' ? (t * 30 * sp) % 300 : 0); r = 1.2 + noise(i, seed + 4) * 2.6; }
        c.globalAlpha = kind === 'leaf' ? 0.85 : (0.25 + 0.55 * noise(i, seed + 5)) * (0.6 + 0.4 * Math.sin(t * 2 * sp + i));
        if (kind === 'leaf') { ell(c, x, y, r, r * 0.5, i % 3 ? '#c8662a' : '#e0a030', t * sp + i); }
        else ell(c, x, y, r, r, col || '#ffe9c0');
      }
    }
    c.restore();
  }
  // Lichtbahnen, z. B. durch ein Fenster oder zwischen Bäumen
  function rays(S, x, y, ang, spread, len, col, a, n = 5) {
    const c = S.c;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n - 0.5, a0 = ang + k * spread, w = spread / n * (0.35 + 0.3 * noise(i, 7));
      const fl = 0.7 + 0.3 * Math.sin(S.T * 0.6 + i * 1.7);
      const g = c.createLinearGradient(x, y, x + Math.cos(a0) * len, y + Math.sin(a0) * len);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = a * fl; c.fillStyle = g; c.beginPath(); c.moveTo(x, y);
      c.lineTo(x + Math.cos(a0 - w) * len, y + Math.sin(a0 - w) * len); c.lineTo(x + Math.cos(a0 + w) * len, y + Math.sin(a0 + w) * len); c.fill();
    }
    c.restore();
  }

  // ------------------------------------------------------------ Menschen
  // Winkel in Grad, gemessen von „gerade nach unten“, positiv in Blickrichtung. l = Bein [Oberschenkel, Unterschenkel], a = Arm.
  const POSES = {
    stand: { l1: [4, 2], l2: [-4, -2], a1: [8, 16], a2: [-6, 6], lean: 0, head: 0 },
    sit: { l1: [84, 4], l2: [78, -2], a1: [26, 72], a2: [16, 62], lean: -4 },
    floor: { l1: [88, 60], l2: [80, 86], a1: [20, 60], a2: [-20, 10], lean: -12 },
    kneel: { l1: [95, 0], l2: [-8, -90], a1: [38, 78], a2: [22, 55], lean: 8 },
    carry: { l1: [5, 2], l2: [-5, -3], a1: [40, 88], a2: [32, 84], lean: -3 },
    reach: { l1: [4, 2], l2: [-6, -3], a1: [150, 168], a2: [-8, 4], lean: 2, head: -10 },
    wave: { l1: [3, 2], l2: [-4, -2], a1: [158, 196], a2: [-6, 6], lean: -2 },
    hold: { l1: [4, 2], l2: [-4, -2], a1: [48, 100], a2: [-6, 8], lean: 2, head: 14 },
    look: { l1: [4, 2], l2: [-4, -2], a1: [60, 150], a2: [50, 146], lean: -2, head: -4 },
    row: { l1: [80, 20], l2: [74, 14], a1: [60, 95], a2: [54, 92], lean: 6 },
    bed: { l1: [88, 88], l2: [86, 90], a1: [50, 95], a2: [44, 92], lean: -32, head: 20 },
  };
  const walk = (u) => { const s = Math.sin(u * TAU), k = Math.cos(u * TAU); return { l1: [24 * s, 24 * s - 26 * Math.max(0, -k)], l2: [-24 * s, -24 * s - 26 * Math.max(0, k)], a1: [-20 * s, -20 * s + 18], a2: [20 * s, 20 * s + 18], lean: 3 }; };

  function person(S, x, y, o = {}) {
    const c = S.c, h = o.h || 300, f = o.face || 1, child = !!o.child;
    const p = Object.assign({}, POSES.stand, typeof o.pose === 'object' ? o.pose : POSES[o.pose || 'stand'], o.p || {});
    const thigh = h * (child ? 0.2 : 0.235), shin = thigh, torso = h * (child ? 0.3 : 0.32), hr = h * (child ? 0.094 : 0.068), neck = h * 0.03, ua = h * 0.165, fa = h * 0.15;
    const leg = (a) => { const k = [Math.sin(rad(a[0])) * thigh * f, Math.cos(rad(a[0])) * thigh]; return { k, ft: [k[0] + Math.sin(rad(a[1])) * shin * f, k[1] + Math.cos(rad(a[1])) * shin] }; };
    const L1 = leg(p.l1), L2 = leg(p.l2);
    const hip = [x, y - Math.max(L1.k[1], L1.ft[1], L2.k[1], L2.ft[1]) - h * 0.02];
    const ln = rad(p.lean || 0), sh = [hip[0] + Math.sin(ln) * torso * f, hip[1] - Math.cos(ln) * torso];
    const ht = ln + rad(p.head || 0), hd = [sh[0] + Math.sin(ht) * (neck + hr) * f, sh[1] - Math.cos(ht) * (neck + hr)];
    const sp = [sh[0], sh[1] + h * 0.035];
    const arm = (a) => { const e = [sp[0] + Math.sin(rad(a[0])) * ua * f, sp[1] + Math.cos(rad(a[0])) * ua]; return { e, hnd: [e[0] + Math.sin(rad(a[1])) * fa * f, e[1] + Math.cos(rad(a[1])) * fa] }; };
    const A1 = arm(p.a1), A2 = arm(p.a2);
    const light = o.style ? o.style === 'light' : S.mem;
    const body = (dx, dy, col) => {
      c.save(); c.translate(dx, dy); c.fillStyle = c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
      const ln2 = (a, b, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
      const limb = (L, w) => {
        const k = [hip[0] + L.k[0], hip[1] + L.k[1]], ft = [hip[0] + L.ft[0], hip[1] + L.ft[1]];
        ln2(hip, k, w); ln2(k, ft, w * 0.8);
        ell(c, ft[0] + f * h * 0.028, ft[1] - h * 0.004, h * 0.046, h * 0.02, col);
      };
      ln2(sp, A2.e, h * 0.05); ln2(A2.e, A2.hnd, h * 0.042);
      limb(L2, h * 0.082);
      // Rumpf, Mantel oder Kleid
      ln2(hip, sh, h * (child ? 0.15 : o.wide ? 0.19 : 0.155));
      if (o.coat) poly(c, [[sh[0] - f * h * 0.07, sh[1]], [sh[0] + f * h * 0.085, sh[1] + h * 0.02], [hip[0] + f * h * 0.11, hip[1] + thigh * 0.55], [hip[0] - f * h * 0.1, hip[1] + thigh * 0.55]], col);
      if (o.skirt) {
        if (p.l1[0] > 55) { ln2(hip, [hip[0] + L1.k[0] * 0.9, hip[1] + L1.k[1] * 0.9 + h * 0.01], h * 0.15); poly(c, [[hip[0] + L1.k[0] * 0.5, hip[1]], [hip[0] + L1.k[0] * 1.02, hip[1] + L1.k[1]], [hip[0] + L1.k[0] * 0.98, hip[1] + L1.k[1] + thigh * 0.5], [hip[0] + L1.k[0] * 0.3, hip[1] + thigh * 0.4]], col); }
        else poly(c, [[hip[0] - f * h * 0.07, hip[1] - torso * 0.3], [hip[0] + f * h * 0.075, hip[1] - torso * 0.3], [hip[0] + f * h * 0.16, hip[1] + thigh * 0.95], [hip[0] - f * h * 0.15, hip[1] + thigh * 0.95]], col);
      }
      limb(L1, h * 0.085);
      ln2(sh, hd, h * 0.05);
      ell(c, hd[0], hd[1], hr * 0.96, hr * 1.04, col);
      poly(c, [[hd[0] + f * hr * 0.8, hd[1] - hr * 0.1], [hd[0] + f * hr * 1.2, hd[1] + hr * 0.22], [hd[0] + f * hr * 0.75, hd[1] + hr * 0.4]], col);   // Nase
      const hair = o.hair;
      if (hair === 'cap') { ell(c, hd[0] - f * hr * 0.05, hd[1] - hr * 0.72, hr * 1.08, hr * 0.5, col); ln2([hd[0] + f * hr * 0.5, hd[1] - hr * 0.5], [hd[0] + f * hr * 1.65, hd[1] - hr * 0.36], hr * 0.24); }
      if (hair === 'bun' || hair === 'pony' || hair === 'braid') ell(c, hd[0] - f * hr * 0.18, hd[1] - hr * 0.2, hr * 1.06, hr * 1.08, col);
      if (hair === 'bun') ell(c, hd[0] - f * hr * 0.9, hd[1] - hr * 0.75, hr * 0.5, hr * 0.5, col);
      if (hair === 'pony') { c.lineWidth = hr * 0.55; c.beginPath(); c.moveTo(hd[0] - f * hr * 0.85, hd[1] - hr * 0.45); c.quadraticCurveTo(hd[0] - f * hr * 2.1, hd[1] + hr * 0.1, hd[0] - f * hr * 1.5, hd[1] + hr * 1.9); c.stroke(); }
      if (hair === 'braid') { for (let i = 0; i < 4; i++) ell(c, hd[0] - f * hr * (1.05 + i * 0.05), hd[1] + hr * (0.5 + i * 0.52), hr * 0.3, hr * 0.34, col); }
      if (hair === 'short') ell(c, hd[0] - f * hr * 0.12, hd[1] - hr * 0.35, hr * 1.02, hr * 0.85, col);
      if (o.beard) ell(c, hd[0] + f * hr * 0.42, hd[1] + hr * 0.85, hr * 0.62, hr * 0.8, col, f * -0.3);
      ln2(sp, A1.e, h * 0.052); ln2(A1.e, A1.hnd, h * 0.044);
      ell(c, A1.hnd[0], A1.hnd[1], h * 0.024, h * 0.024, col);
      c.restore();
    };
    if (light) { glow(c, hip[0], hip[1] - h * 0.18, h * 0.8, '#ffcf80', 0.32); if (!o.col) { body(3.5, 2.5, 'rgba(90,44,6,0.34)'); body(-2, -1, 'rgba(90,44,6,0.2)'); } body(0, 0, o.col || LIGHT); }
    else { if (o.rim !== 0) body((o.rim || -f) * 2.6, -1.4, o.rimCol || S.rim || 'rgba(255,200,140,0.55)'); body(0, 0, o.col || DARK); }
    return { hand: A1.hnd, hand2: A2.hnd, head: hd, sh, hip, knee: [hip[0] + L1.k[0], hip[1] + L1.k[1]], foot: [hip[0] + L1.ft[0], hip[1] + L1.ft[1]], hr, h, f };
  }
  const maja = (S, x, y, o) => person(S, x, y, Object.assign({ h: 300, hair: 'pony', coat: true }, o));
  const majaKid = (S, x, y, o) => person(S, x, y, Object.assign({ h: 160, child: true, hair: 'braid', skirt: true }, o));
  const nils = (S, x, y, o) => person(S, x, y, Object.assign({ h: 322, hair: 'cap', coat: true, wide: true }, o));
  const nilsOld = (S, x, y, o) => person(S, x, y, Object.assign({ h: 300, hair: 'cap', beard: true, coat: true, wide: true }, o));
  const astrid = (S, x, y, o) => person(S, x, y, Object.assign({ h: 288, hair: 'bun', skirt: true }, o));

  // ------------------------------------------------------------ Dinge
  const ink = (S) => (S.mem ? LIGHT : DARK);
  function chair(S, x, y, f = 1, col) {
    const c = S.c; col = col || ink(S);
    rect(c, x - 38, y - 78, 76, 9, col); rect(c, x - 36, y - 78, 7, 78, col); rect(c, x + 29, y - 78, 7, 78, col);
    rect(c, x - f * 36 - (f > 0 ? 0 : 7), y - 190, 7, 118, col); rect(c, x - f * 36 - (f > 0 ? 0 : 7), y - 190, 7, 14, col);
    for (let i = 0; i < 3; i++) rect(c, x - f * 36 - (f > 0 ? 0 : 7), y - 176 + i * 30, 7, 5, col);
  }
  function armchair(S, x, y, f = 1, col) {
    const c = S.c; col = col || ink(S); c.fillStyle = col;
    c.beginPath(); c.roundRect(x - 70, y - 96, 140, 96, 14); c.fill();
    c.beginPath(); c.roundRect(x - f * 78 - (f > 0 ? 0 : 34), y - 250, 34, 250, 16); c.fill();
    c.beginPath(); c.roundRect(x - 78, y - 130, 156, 26, 12); c.fill();
  }
  function table(S, x, y, w = 260, col) { const c = S.c; col = col || ink(S); rect(c, x - w / 2, y - 132, w, 12, col); rect(c, x - w / 2 + 10, y - 132, 9, 132, col); rect(c, x + w / 2 - 19, y - 132, 9, 132, col); }
  function box(S, x, y, w = 110, h = 80, col) { const c = S.c; col = col || ink(S); rect(c, x - w / 2, y - h, w, h, col); poly(c, [[x - w / 2, y - h], [x - w / 2 - 22, y - h - 16], [x - w / 2 + 12, y - h - 4]], col); poly(c, [[x + w / 2, y - h], [x + w / 2 + 24, y - h - 12], [x + w / 2 - 10, y - h - 3]], col); }
  // Standuhr mit Pendel
  function clock(S, x, y, running) {
    const c = S.c, col = ink(S);
    rect(c, x - 44, y - 420, 88, 420, col); poly(c, [[x - 54, y - 420], [x, y - 462], [x + 54, y - 420]], col); rect(c, x - 52, y - 12, 104, 12, col);
    ell(c, x, y - 360, 30, 30, S.mem ? '#b88a4a' : '#e9d8b0');
    const a = S.T * 0.5; line(c, x, y - 360, x + Math.sin(a) * 20, y - 360 - Math.cos(a) * 20, 3, DARK); line(c, x, y - 360, x + Math.sin(a * 12) * 13, y - 360 - Math.cos(a * 12) * 13, 3.4, DARK);
    rect(c, x - 26, y - 300, 52, 230, S.mem ? '#6a4a2a' : '#2a1d16');
    const sw = running ? Math.sin(S.T * 3.1) * 0.24 : 0.02;
    line(c, x, y - 296, x + Math.sin(sw) * 190, y - 296 + Math.cos(sw) * 190, 3, '#d9b46a'); ell(c, x + Math.sin(sw) * 190, y - 296 + Math.cos(sw) * 190, 15, 15, '#e2bd6e');
  }
  // Strickkorb mit rotem Knäuel und halbfertigem Schal
  function basket(S, x, y, s = 1, yarnCol = RED) {
    const c = S.c, col = S.mem ? '#e8cf9a' : '#3a2a1c';
    c.save(); c.translate(x, y); c.scale(s, s);
    poly(c, [[-70, -70], [70, -70], [56, 0], [-56, 0]], col);
    c.strokeStyle = S.mem ? '#b8975a' : '#57402a'; c.lineWidth = 3;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-68 + i * 3, -56 + i * 16); c.quadraticCurveTo(0, -48 + i * 16, 68 - i * 3, -56 + i * 16); c.stroke(); }
    ell(c, -14, -84, 36, 34, yarnCol);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(-14, -84, 34, 12 + i * 4, i * 0.5, 0, TAU); c.stroke(); }
    line(c, 34, -74, 62, -150, 3, '#e6d3a4'); line(c, 44, -72, 26, -152, 3, '#e6d3a4');
    c.restore();
  }
  // Der Schal: gestrickte Reihen mit Mustern; rows = Anzahl, greenAt = Index der grünen Reihe
  function scarf(S, x, y, rows, bw = 46, hgt = 120, greenAt = -1, glowLast = 0) {
    const c = S.c;
    for (let i = 0; i < rows; i++) {
      const col = i === greenAt ? GREEN : i % 2 ? '#b23629' : RED, rx = x + i * bw;
      rect(c, rx, y, bw + 0.5, hgt, col);
      c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1.6; c.beginPath();
      for (let yy = 6; yy < hgt; yy += 10) for (let xx = 4; xx < bw; xx += 9) { c.moveTo(rx + xx - 3, y + yy - 3); c.lineTo(rx + xx, y + yy + 3); c.lineTo(rx + xx + 3, y + yy - 3); }
      c.stroke();
      c.strokeStyle = '#f3e6cc'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath();
      const cx = rx + bw / 2, cy = y + hgt / 2, k = i % 4;
      if (k === 0) { c.moveTo(cx - 14, cy); c.quadraticCurveTo(cx - 7, cy - 12, cx, cy); c.quadraticCurveTo(cx + 7, cy + 12, cx + 14, cy); }
      else if (k === 1) { c.moveTo(cx - 14, cy + 4); c.quadraticCurveTo(cx - 6, cy - 10, cx, cy + 2); c.quadraticCurveTo(cx + 6, cy - 10, cx + 14, cy + 4); }
      else if (k === 2) { for (let a = 0; a < 3; a++) { c.moveTo(cx - Math.cos(a * 1.047) * 13, cy - Math.sin(a * 1.047) * 13); c.lineTo(cx + Math.cos(a * 1.047) * 13, cy + Math.sin(a * 1.047) * 13); } }
      else { c.moveTo(cx, cy + 14); c.lineTo(cx, cy - 4); c.moveTo(cx, cy - 4); c.quadraticCurveTo(cx - 14, cy - 6, cx - 9, cy - 16); c.quadraticCurveTo(cx, cy - 14, cx, cy - 4); }
      c.stroke();
    }
    for (let i = 0; i < 7; i++) line(c, x, y + 8 + i * (hgt - 16) / 6, x - 16 - (i % 3) * 4, y + 8 + i * (hgt - 16) / 6 + (i % 2 ? 4 : -3), 3, RED);
    if (glowLast > 0 && rows > 0) glow(c, x + (rows - 0.5) * bw, y + hgt / 2, 150, '#ffb070', 0.6 * glowLast);
  }
  // Die kleine Garnfigur
  function yarny(S, x, y, s = 1, col = RED, wave = 0) {
    const c = S.c;
    c.save(); c.translate(x, y); c.scale(s, s);
    line(c, -4, -18, -5, 0, 5, col); line(c, 4, -18, 6, 0, 5, col);
    ell(c, 0, -30, 9, 15, col);
    line(c, -6, -36, -15, -24, 4, col); line(c, 6, -36, 15 + wave * 4, -40 - wave * 16, 4, col);
    ell(c, 0, -52, 11, 11, col);
    c.strokeStyle = col; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-2, -62); c.quadraticCurveTo(-12, -78, -18, -66); c.stroke();
    ell(c, 4, -53, 2.6, 3, '#fff6e0'); ell(c, -4, -53, 2.6, 3, '#fff6e0');
    c.restore();
  }
  function lighthouse(S, x, y, h, lit, col) {
    const c = S.c; col = col || ink(S);
    poly(c, [[x - h * 0.11, y], [x - h * 0.07, y - h * 0.78], [x + h * 0.07, y - h * 0.78], [x + h * 0.11, y]], col);
    rect(c, x - h * 0.1, y - h * 0.8, h * 0.2, h * 0.03, col); rect(c, x - h * 0.055, y - h * 0.9, h * 0.11, h * 0.1, col);
    poly(c, [[x - h * 0.07, y - h * 0.9], [x, y - h], [x + h * 0.07, y - h * 0.9]], col);
    if (lit) {
      rect(c, x - h * 0.04, y - h * 0.885, h * 0.08, h * 0.07, '#fff3c0');
      const a = S.T * 0.55, k = Math.cos(a);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const d of [1, -1]) {
        const len = h * 4.5 * Math.abs(k) + h * 0.3, g = c.createLinearGradient(x, 0, x + d * k * len, 0);
        g.addColorStop(0, 'rgba(255,240,190,0.5)'); g.addColorStop(1, 'rgba(255,240,190,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(x, y - h * 0.85); c.lineTo(x + d * k * len, y - h * 0.85 - len * 0.1); c.lineTo(x + d * k * len, y - h * 0.85 + len * 0.1); c.fill();
      }
      c.restore();
      glow(c, x, y - h * 0.85, h * (0.5 + 0.5 * (1 - Math.abs(k))), '#fff0c0', 0.8);
    }
  }
  function cottage(S, x, y, s, lit) {
    const c = S.c, col = ink(S);
    rect(c, x - 90 * s, y - 80 * s, 180 * s, 80 * s, col); poly(c, [[x - 104 * s, y - 80 * s], [x, y - 150 * s], [x + 104 * s, y - 80 * s]], col); rect(c, x + 40 * s, y - 150 * s, 18 * s, 44 * s, col);
    if (lit) { rect(c, x - 60 * s, y - 56 * s, 30 * s, 30 * s, '#ffcf80'); glow(c, x - 45 * s, y - 41 * s, 70 * s, '#ffb860', 0.7); }
  }
  function tree(S, x, y, h, col, bare, seed = 1) {
    const c = S.c;
    poly(c, [[x - h * 0.03, y], [x - h * 0.018, y - h * 0.7], [x + h * 0.018, y - h * 0.7], [x + h * 0.03, y]], col);
    for (let i = 0; i < 5; i++) { const a = -1.57 + (noise(i, seed) - 0.5) * 2, yy = y - h * (0.45 + i * 0.1); line(c, x, yy, x + Math.cos(a) * h * 0.22, yy + Math.sin(a) * h * 0.22, h * 0.012, col); }
    if (!bare) for (let i = 0; i < 6; i++) ell(c, x + (noise(i, seed + 3) - 0.5) * h * 0.4, y - h * (0.62 + noise(i, seed + 4) * 0.34), h * 0.17, h * 0.13, col);
  }
  function boat(S, x, y, s = 1, col) {
    const c = S.c; col = col || ink(S);
    c.fillStyle = col; c.beginPath(); c.moveTo(x - 190 * s, y - 40 * s); c.quadraticCurveTo(x - 150 * s, y + 20 * s, x - 90 * s, y + 20 * s); c.lineTo(x + 110 * s, y + 20 * s); c.quadraticCurveTo(x + 190 * s, y + 10 * s, x + 220 * s, y - 52 * s); c.lineTo(x + 150 * s, y - 32 * s); c.lineTo(x - 150 * s, y - 32 * s); c.fill();
  }
  function birds(S, n, seed, col) {
    const c = S.c; c.strokeStyle = col; c.lineWidth = 2.6; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = ((noise(i, seed) * 1800 + S.T * (14 + i * 3)) % 1900) - 150, y = 150 + noise(i, seed + 1) * 220 + Math.sin(S.T * 0.8 + i) * 12, w = 10 + noise(i, seed + 2) * 9, fl = Math.sin(S.T * 5 + i * 2) * 5;
      c.beginPath(); c.moveTo(x - w, y - fl); c.quadraticCurveTo(x - w * 0.4, y - 7, x, y); c.quadraticCurveTo(x + w * 0.4, y - 7, x + w, y - fl); c.stroke();
    }
  }

  // ------------------------------------------------------------ Kulissen
  // Zimmer: tone = warm | cool | attic | grey; win = [x, y, w, h] Fenster; night = draußen dunkel
  function room(S, o = {}) {
    const c = S.c, T = { warm: ['#3a2519', '#70452a', '#2a1a12', '#ffd49a'], cool: ['#1c2632', '#3c4c5c', '#141b24', '#b8d6f0'], attic: ['#2a2019', '#59402c', '#1c140f', '#cfe0ee'], grey: ['#2a2c2e', '#5a5c5e', '#1a1b1c', '#d8dcdf'], mem: ['#5a3a1c', '#b07a3c', '#4a2e14', '#fff0c8'] }[S.mem ? 'mem' : o.tone || 'warm'];
    S.layer(0.82, () => {
      rect(c, -400, -100, W + 800, FLOOR + 100, lin(c, 0, 0, 0, FLOOR, [T[0], T[1]]));
      c.globalAlpha = 0.06; for (let x = -380; x < W + 400; x += 64) rect(c, x, 0, 3, FLOOR, '#000'); c.globalAlpha = 1;
      rect(c, -400, FLOOR - 62, W + 800, 6, 'rgba(0,0,0,0.25)');
      const w = o.win;
      if (w) {
        const sky = o.night ? ['#0c1424', '#1e2c44'] : o.tone === 'cool' || o.tone === 'grey' ? ['#8aa2b8', '#c8d6e0'] : ['#f6c98a', '#ffe9c0'];
        rect(c, w[0], w[1], w[2], w[3], lin(c, 0, w[1], 0, w[1] + w[3], sky));
        if (o.winDraw) { c.save(); c.beginPath(); c.rect(w[0], w[1], w[2], w[3]); c.clip(); o.winDraw(w); c.restore(); }
        c.strokeStyle = T[2]; c.lineWidth = 12; c.strokeRect(w[0], w[1], w[2], w[3]); rect(c, w[0] + w[2] / 2 - 4, w[1], 8, w[3], T[2]); rect(c, w[0], w[1] + w[3] / 2 - 4, w[2], 8, T[2]);
        rect(c, w[0] - 16, w[1] + w[3], w[2] + 32, 12, T[2]);
        if (!o.night) glow(c, w[0] + w[2] / 2, w[1] + w[3] / 2, w[2] * 1.7, T[3], 0.45);
      }
      for (const f of o.frames || []) { rect(c, f[0], f[1], f[2], f[3], T[2]); rect(c, f[0] + 7, f[1] + 7, f[2] - 14, f[3] - 14, 'rgba(255,230,190,0.16)'); }
    });
    S.layer(1, () => {
      rect(c, -400, FLOOR, W + 800, 400, lin(c, 0, FLOOR, 0, H, [T[2], '#080605']));
      c.globalAlpha = 0.18; for (let i = 0; i < 5; i++) rect(c, -400, FLOOR + 14 + i * i * 9, W + 800, 2, '#000'); c.globalAlpha = 1;
      const w = o.win;
      if (w && !o.night) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.16;
        const dx = o.shaft === undefined ? 260 : o.shaft;
        c.fillStyle = lin(c, w[0], w[1], w[0] + dx, FLOOR + 120, [T[3], 'rgba(0,0,0,0)']);
        c.beginPath(); c.moveTo(w[0], w[1]); c.lineTo(w[0] + w[2], w[1]); c.lineTo(w[0] + w[2] + dx + 160, FLOOR + 150); c.lineTo(w[0] + dx - 60, FLOOR + 150); c.fill();
        c.restore();
      }
    });
  }
  const SKIES = {
    dusk: ['#141c38', '#4a4268', '#c8786a', '#f2b47a'], day: ['#6fa6d6', '#b9d8ea', '#eef0dc', '#f6ecd0'], storm: ['#080c14', '#161f2c', '#2a3848', '#3c4a58'],
    dawn: ['#2c3a5e', '#a87a8a', '#f2b08a', '#ffe6b4'], night: ['#050912', '#0c1628', '#182a40', '#24384c'], gold: ['#6a3c1c', '#c47a34', '#f0b45c', '#ffe2a0'],
    grey: ['#5c6064', '#8a8e90', '#b4b6b6', '#c8c8c6'], spring: ['#78b4e0', '#bfe0f0', '#f4f2da', '#fff6d8'],
  };
  function sky(S, kind, sun) {
    const c = S.c, k = SKIES[S.mem ? (kind === 'night' || kind === 'storm' ? kind : 'gold') : kind] || SKIES.dusk;
    S.layer(0.04, () => {
      rect(c, -400, -200, W + 800, H + 400, lin(c, 0, 0, 0, 640, k));
      if (sun) { glow(c, sun[0], sun[1], sun[2] || 420, sun[3] || '#ffe2a8', 0.9); ell(c, sun[0], sun[1], 34, 34, sun[4] || '#fff4d0'); }
    });
  }
  // Küste: Meer bis zum Horizont, Klippe mit Leuchtturm, vorne Düne mit Gras
  function coast(S, o = {}) {
    const c = S.c, kind = o.time || 'dusk', hor = 520, dark = S.mem ? '#7a4a1e' : kind === 'day' || kind === 'spring' ? '#3a4a3c' : '#0e1218';
    sky(S, kind, o.sun);
    if (o.stars) S.layer(0.05, () => { for (let i = 0; i < 70; i++) ell(c, noise(i, 3) * W, noise(i, 4) * 420, 1.4, 1.4, `rgba(255,255,255,${0.3 + 0.5 * noise(i, 5)})`); });
    S.layer(0.12, () => {
      const sea = S.mem ? ['#c48a44', '#6a3e1a'] : { day: ['#6aa0b8', '#2c5a70'], spring: ['#72aac4', '#2c6078'], storm: ['#1c2a36', '#080c12'], night: ['#12202e', '#04080e'], dawn: ['#b08a8a', '#3a4660'], grey: ['#8a9094', '#4a4e52'] }[kind] || ['#7a5a70', '#1c2238'];
      rect(c, -400, hor, W + 800, 500, lin(c, 0, hor, 0, H, sea));
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22;
      for (let i = 0; i < 26; i++) { const y = hor + 6 + i * i * 0.5 + (i % 3) * 3, x = noise(i, 2) * 1700 + Math.sin(S.T * 0.5 + i) * 30; rect(c, x - 60, y, 90 + noise(i, 6) * 160, 1.6 + i * 0.08, '#ffffff'); }
      c.restore();
      if (kind === 'storm') { c.fillStyle = '#0c141c'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-400, H); for (let x = -400; x <= W + 400; x += 30) c.lineTo(x, hor + 60 + k * 70 + Math.sin(x * 0.012 + S.T * (1.6 - k * 0.3) + k * 2) * (18 + k * 12)); c.lineTo(W + 400, H); c.globalAlpha = 0.5 + k * 0.2; c.fill(); } c.globalAlpha = 1; }
    });
    if (o.lh) S.layer(0.3, () => {
      const [x, h, lit] = o.lh;
      c.fillStyle = dark; c.beginPath(); c.moveTo(x - h * 1.6, hor + 30); c.quadraticCurveTo(x - h * 0.7, hor - h * 0.5, x - h * 0.2, hor - h * 0.42); c.lineTo(x + h * 0.5, hor - h * 0.4); c.quadraticCurveTo(x + h * 0.9, hor - h * 0.1, x + h * 1.3, hor + 30); c.fill();
      lighthouse(S, x, hor - h * 0.4, h, lit, dark);
      if (o.house) cottage(S, x + o.house, hor - h * 0.4 + 4, h / 260, o.houseLit);
    });
    if (o.dune !== false) {
      S.layer(0.75, () => hills(c, 650, 34, 2, S.mem ? '#8a5522' : kind === 'day' || kind === 'spring' ? '#6a7a4a' : '#141a1c'));
      S.layer(1, () => { hills(c, FLOOR + 6, 16, 5, S.mem ? '#6a3e16' : kind === 'day' || kind === 'spring' ? '#4c5c36' : '#0a0e10'); grass(c, FLOOR, S.mem ? '#b8803a' : kind === 'day' || kind === 'spring' ? '#7a8c4c' : '#1c2422', S.T, 3); });
    }
  }
  function forest(S, o = {}) {
    const c = S.c, au = o.autumn, base = S.mem ? ['#7a4a1c', '#e0a04a', '#ffe0a0'] : au ? ['#3a2014', '#a85a2a', '#f0b060'] : ['#16261c', '#4a6a44', '#cfe0a8'];
    S.layer(0.05, () => { rect(c, -400, -200, W + 800, H + 400, lin(c, 0, 0, 0, H, base)); glow(c, o.sun || 1100, 260, 520, '#fff0c0', 0.8); });
    for (const [d, n, col, hh] of [[0.3, 9, S.mem ? '#b87a34' : au ? '#7a4424' : '#2c4634', 620], [0.6, 6, S.mem ? '#8a5522' : au ? '#4a2a18' : '#1a2c22', 760]]) {
      S.layer(d, () => { for (let i = 0; i < n; i++) tree(S, -200 + i * (2000 / n) + noise(i, d * 10) * 120, FLOOR + 10, hh * (0.8 + noise(i, d * 20) * 0.4), col, o.bare, i + d * 10); hills(c, FLOOR - 10, 14, d * 9, col); });
    }
    S.layer(0.6, () => rays(S, o.sun || 1100, 120, 1.9, 1.1, 900, '#ffe6b0', 0.12, 6));
    S.layer(1, () => { hills(c, FLOOR + 6, 12, 4, S.mem ? '#5a3412' : au ? '#2a160c' : '#0e1812'); grass(c, FLOOR, S.mem ? '#a8702c' : au ? '#6a3c1c' : '#22382a', S.T, 8, 34, 11); });
  }
  function moor(S) {
    const c = S.c;
    sky(S, 'dusk', [520, 500, 460, '#ffc070']);
    S.layer(0.2, () => { hills(c, 540, 10, 3, S.mem ? '#9a6228' : '#2a2a34'); for (let i = 0; i < 12; i++) tree(S, -200 + i * 170 + noise(i, 2) * 80, 540, 60 + noise(i, 3) * 50, S.mem ? '#9a6228' : '#2a2a34', i % 3 === 0, i); });
    S.layer(0.45, () => { rect(c, -400, 560, W + 800, 400, lin(c, 0, 560, 0, H, S.mem ? ['#b87a34', '#6a3e16'] : ['#4a3c44', '#14121a'])); c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25; for (let i = 0; i < 7; i++) ell(c, noise(i, 5) * 1700, 590 + i * 14, 140 + noise(i, 6) * 160, 6, '#ffd9a0'); c.restore(); });
    S.layer(0.7, () => { c.globalAlpha = 0.35; for (let i = 0; i < 5; i++) ell(c, ((noise(i, 8) * 2000 + S.T * 12) % 2200) - 200, 610 + i * 12, 360, 22, '#f0d8c0'); c.globalAlpha = 1; });
    S.layer(1, () => {
      hills(c, FLOOR + 6, 10, 6, S.mem ? '#5a3412' : '#0e0c10'); grass(c, FLOOR, S.mem ? '#b07a34' : '#2a2422', S.T, 4, 56, 12);
      for (let i = 0; i < 40; i++) { const x = -200 + i * 52 + noise(i, 9) * 30, hh = 40 + noise(i, 10) * 30, sw = Math.sin(S.T * 1.2 + i) * 4; ell(c, x + sw, FLOOR - hh, 5, 6, S.mem ? '#fff4d8' : '#e8e0d0'); }
    });
  }
  function fjord(S, o = {}) {
    const c = S.c;
    sky(S, o.night ? 'night' : 'dawn', o.night ? null : [1150, 470, 380, '#ffd0a0']);
    if (o.aurora) S.layer(0.06, () => {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) for (let x = -100; x < W + 100; x += 14) {
        const y = 150 + k * 60 + Math.sin(x * 0.006 + S.T * 0.3 + k * 2) * 50, hh = 130 + Math.sin(x * 0.02 + S.T * 0.7 + k) * 50;
        c.globalAlpha = 0.05 + 0.04 * Math.sin(x * 0.013 + S.T + k); c.fillStyle = lin(c, 0, y, 0, y + hh, ['#7dffc0', 'rgba(60,160,200,0)']); c.fillRect(x, y, 15, hh);
      }
      c.restore();
      for (let i = 0; i < 80; i++) ell(c, noise(i, 3) * W, noise(i, 4) * 440, 1.3, 1.3, `rgba(255,255,255,${0.3 + 0.5 * noise(i, 5)})`);
    });
    const m1 = S.mem ? '#a86c2c' : o.night ? '#14202e' : '#5a5a78', m2 = S.mem ? '#7a4a1e' : o.night ? '#0c1420' : '#3a3c58';
    S.layer(0.15, () => { c.fillStyle = m1; c.beginPath(); c.moveTo(-400, 560); for (let x = -400; x <= W + 400; x += 70) c.lineTo(x, 560 - 120 - noise(x, 2) * 190 * (0.5 + 0.5 * Math.sin(x * 0.004))); c.lineTo(W + 400, 560); c.fill(); });
    S.layer(0.3, () => { c.fillStyle = m2; c.beginPath(); c.moveTo(-400, 580); for (let x = -400; x <= W + 400; x += 90) c.lineTo(x, 580 - 40 - noise(x, 7) * 150); c.lineTo(W + 400, 580); c.fill(); });
    S.layer(0.6, () => rect(c, -400, 570, W + 800, 400, lin(c, 0, 570, 0, H, S.mem ? ['#f2c880', '#b07a38'] : o.night ? ['#2a4458', '#0e1824'] : ['#d8dcec', '#7a84a8'])));
    S.layer(1, () => { rect(c, -400, FLOOR, W + 800, 300, lin(c, 0, FLOOR, 0, H, S.mem ? ['#e6b468', '#9a6428'] : o.night ? ['#3a5468', '#101c28'] : ['#eef0f8', '#8a92b0'])); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(noise(i, 11) * 1600, FLOOR + 10 + i * 9); c.lineTo(noise(i, 11) * 1600 + 120 + noise(i, 12) * 200, FLOOR + 14 + i * 9); c.stroke(); } });
  }
  function snowNight(S, o = {}) {
    const c = S.c;
    sky(S, 'night');
    S.layer(0.06, () => { for (let i = 0; i < 80; i++) ell(c, noise(i, 3) * W, noise(i, 4) * 440, 1.3, 1.3, `rgba(255,255,255,${0.3 + 0.5 * noise(i, 5)})`); });
    S.layer(0.3, () => { hills(c, 560, 50, 3, S.mem ? '#6a4420' : '#16222e'); for (let i = 0; i < 8; i++) tree(S, -100 + i * 250 + noise(i, 2) * 90, 560, 150 + noise(i, 3) * 80, S.mem ? '#6a4420' : '#101a24', false, i); });
    if (o.house) S.layer(0.7, () => { const [x, s] = o.house; c.save(); const k = S.mem; S.mem = false; cottage(S, x, FLOOR - 20, s, true); S.mem = k; c.restore(); rect(c, x + 14 * s, FLOOR - 20 - 62 * s, 34 * s, 62 * s, '#3a2414'); });
    S.layer(1, () => hills(c, FLOOR + 4, 14, 5, S.mem ? '#e8c890' : '#c8d4e4'));
  }
  function town(S) {
    const c = S.c;
    sky(S, 'grey');
    S.layer(0.2, () => { for (let i = 0; i < 14; i++) { const x = -260 + i * 150, hh = 180 + noise(i, 2) * 200; rect(c, x, 600 - hh, 136, hh + 100, '#4a4e52'); for (let k = 0; k < 6; k++) if (noise(i * 7 + k, 3) > 0.55) rect(c, x + 18 + (k % 3) * 38, 600 - hh + 26 + Math.floor(k / 3) * 56, 20, 28, 'rgba(240,226,190,0.5)'); } });
    S.layer(0.5, () => { for (let i = 0; i < 9; i++) { const x = -260 + i * 240, hh = 260 + noise(i, 5) * 170; rect(c, x, 640 - hh, 220, hh + 100, '#2e3134'); for (let k = 0; k < 8; k++) if (noise(i * 9 + k, 6) > 0.5) rect(c, x + 24 + (k % 4) * 48, 640 - hh + 30 + Math.floor(k / 4) * 70, 26, 36, 'rgba(244,230,196,0.55)'); } });
    S.layer(1, () => { rect(c, -400, FLOOR, W + 800, 300, lin(c, 0, FLOOR, 0, H, ['#3a3c3e', '#141516'])); c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.12; for (let i = 0; i < 6; i++) ell(c, 200 + i * 260, FLOOR + 40 + (i % 2) * 30, 110, 9, '#e8ecf0'); c.restore(); });
  }

  // ------------------------------------------------------------ Die Szenen
  // Jede Einstellung: d = Dauer in Sekunden, mem = Rückblende, cam = [x, y, zoom] Anfang und Ende, cap = Untertitel, draw(S)
  const shot = (d, cap, draw, o = {}) => Object.assign({ d, cap, draw }, o);
  const M = { mem: true };
  const C = (x0, y0, z0, x1, y1, z1) => ({ cam: [x0, y0, z0, x1, y1, z1] });
  const hall = (S, o = {}) => {
    const left = o.win && o.win[0] < 700;
    return room(S, Object.assign({ tone: 'warm', win: [1120, 250, 210, 250], frames: left ? [[1180, 300, 90, 120], [1310, 330, 70, 90]] : [[300, 300, 90, 120], [430, 330, 70, 90]] }, o));
  };

  const SCENES = {
    intro: [
      shot(7, 'Nach vielen Jahren kehrt Maja in das Leuchtturmhäuschen ihres Vaters zurück.', (S) => {
        coast(S, { time: 'dusk', sun: [300, 505, 420, '#ffb070'], lh: [1180, 250, false], house: -210, houseLit: false, stars: true });
        S.layer(0.5, () => birds(S, 5, 4, 'rgba(20,20,30,0.7)'));
        S.layer(1, () => { const m = maja(S, mix(260, 520, S.u), FLOOR + 4, { pose: walk(S.T * 0.9), h: 250 }); box(S, m.hand[0] + 6, m.hand[1] + 46, 54, 40); });
      }, C(700, 450, 1.0, 900, 440, 1.12)),
      shot(7, 'Nils lebt im Pflegeheim und erkennt kaum noch jemanden. Das Haus soll ausgeräumt und verkauft werden.', (S) => {
        hall(S, { tone: 'cool', frames: [[300, 300, 90, 120], [430, 330, 70, 90], [620, 280, 110, 80]] });
        S.layer(1, () => {
          clock(S, 880, FLOOR, false); box(S, 320, FLOOR, 150, 110); box(S, 400, FLOOR - 110, 110, 80); box(S, 1340, FLOOR, 130, 96);
          const m = maja(S, 640, FLOOR, { pose: 'carry', p: { head: 12 } }); box(S, m.hand[0] + 34, m.hand[1] + 30, 96, 70);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 3));
      }, C(760, 450, 1.02, 840, 450, 1.1)),
      shot(7, 'Im Flur steht Astrids Strickkorb. Der rote Schal für Nils ist nie fertig geworden.', (S) => {
        hall(S, { win: [1080, 120, 300, 360], shaft: -520 });
        S.layer(1, () => { table(S, 300, FLOOR, 240); basket(S, 820, FLOOR, 2.1); scarf(S, 930, FLOOR - 150, 3, 50, 120); });
        S.layer(1.2, () => { rays(S, 1230, 300, 2.5, 0.5, 900, '#ffe2a8', 0.16, 4); motes(S, 'dust', 60, 5); });
      }, C(900, 520, 1.25, 860, 540, 1.42)),
      shot(8, 'Aus dem Knäuel erwacht etwas Kleines.', (S) => {
        hall(S, { win: [1080, 120, 300, 360], shaft: -520 });
        S.layer(1, () => {
          basket(S, 820, FLOOR, 2.1); scarf(S, 930, FLOOR - 150, 3, 50, 120);
          const k = ease(clamp((S.u - 0.25) / 0.45, 0, 1));
          yarny(S, 770 - k * 40, FLOOR - 196 - k * 20 + Math.sin(S.T * 6) * (1 - k) * 3, 1.5 * k + 0.01, RED, Math.max(0, Math.sin((S.u - 0.75) * 30)) * (S.u > 0.75 ? 1 : 0));
          glow(S.c, 780, FLOOR - 230, 200, '#ff9a60', 0.5 * k);
        });
        S.layer(1.2, () => { rays(S, 1230, 300, 2.5, 0.5, 900, '#ffe2a8', 0.16, 4); motes(S, 'dust', 60, 5); });
      }, C(860, 540, 1.42, 800, 520, 1.75)),
    ],

    garten: [
      shot(8, 'Der Kompass. Nils zeigt der kleinen Maja, wie die Nadel immer nach Norden findet.', (S) => {
        coast(S, { time: 'day', sun: [1100, 300, 520], lh: [300, 200, false] });
        S.layer(1, () => {
          const n = nils(S, 760, FLOOR, { pose: 'kneel', p: { a1: [52, 96], head: 10 } });
          const k = majaKid(S, 930, FLOOR, { face: -1, pose: 'hold', p: { a1: [40, 80], head: 22 } });
          ell(S.c, n.hand[0] + 16, n.hand[1] - 6, 20, 20, '#f0c060'); glow(S.c, n.hand[0] + 16, n.hand[1] - 6, 130, '#fff0b0', 0.9);
          void k;
        });
        S.layer(1.3, () => motes(S, 'dust', 50, 2));
      }, Object.assign({}, M, C(900, 470, 1.15, 840, 480, 1.38))),
      shot(8, 'Die Uhr im Flur steht seit Jahren. Jetzt tickt sie wieder – und obenauf liegt ein roter Faden.', (S) => {
        hall(S);
        S.layer(1, () => {
          clock(S, 900, FLOOR, true);
          curve(S.c, [[866, FLOOR - 464], [884, FLOOR - 474], [900, FLOOR - 462], [926, FLOOR - 470]], 4, RED); glow(S.c, 896, FLOOR - 466, 70, '#ff8050', 0.5);
          const m = maja(S, 560, FLOOR, { pose: 'carry', p: { head: -16 } }); box(S, m.hand[0] + 34, m.hand[1] + 30, 96, 70);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 3));
      }, C(700, 460, 1.05, 820, 400, 1.3)),
    ],

    steinbruch: [
      shot(8, 'Das Taschenmesser. Geduldig zeigt Nils einem schüchternen Jungen, wie man ein Ruder schnitzt.', (S) => {
        forest(S, { sun: 1250 });
        S.layer(1, () => {
          rect(S.c, 640, FLOOR - 84, 190, 84, LIGHT);
          const n = nils(S, 770, FLOOR, { pose: 'sit', p: { a1: [40, 96], a2: [30, 80], head: 14 } });
          line(S.c, n.hand[0] - 60, n.hand[1] + 30, n.hand[0] + 210, n.hand[1] - 40, 9, LIGHT);
          person(S, 1010, FLOOR, { h: 205, child: true, hair: 'short', face: -1, p: { a1: [10, 30], head: 14 } });
          person(S, 250, FLOOR, { h: 230, hair: 'pony', skirt: true, col: 'rgba(255,240,205,0.5)' });
        });
        S.layer(1.3, () => motes(S, 'dust', 40, 6));
      }, Object.assign({}, M, C(760, 470, 1.08, 860, 480, 1.3))),
      shot(7, 'Einer der wenigen Tage, an denen ihr Vater einfach da war. Maja hatte ihn fast vergessen.', (S) => {
        hall(S, { win: [240, 240, 220, 260], shaft: 300 });
        S.layer(1, () => {
          table(S, 900, FLOOR, 300); chair(S, 760, FLOOR, 1);
          const m = maja(S, 770, FLOOR, { pose: 'sit', p: { a1: [44, 104], head: 18 } });
          line(S.c, m.hand[0], m.hand[1], m.hand[0] + 34, m.hand[1] - 14, 7, '#7c2c22'); line(S.c, m.hand[0] + 34, m.hand[1] - 14, m.hand[0] + 62, m.hand[1] - 30, 4, '#d8dde2');
          glow(S.c, m.hand[0] + 40, m.hand[1] - 16, 90, '#ffd9a0', 0.35);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 7));
      }, C(860, 470, 1.15, 880, 440, 1.4)),
    ],

    teich: [
      shot(9, 'Nils und Astrid, lange vor allem. Sie strickt, er rudert, beide lachen.', (S) => {
        sky(S, 'gold', [1000, 430, 520]);
        S.layer(0.2, () => hills(S.c, 520, 60, 4, '#a86c2c'));
        S.layer(0.5, () => { rect(S.c, -400, 520, W + 800, 500, lin(S.c, 0, 520, 0, H, ['#ffd890', '#8a5220'])); S.c.save(); S.c.globalCompositeOperation = 'lighter'; S.c.globalAlpha = 0.3; for (let i = 0; i < 20; i++) rect(S.c, 820 + (noise(i, 3) - 0.5) * 300 * (1 + i * 0.1), 530 + i * 16, 60 + noise(i, 4) * 120, 3, '#fff6d0'); S.c.restore(); });
        S.layer(1, () => {
          const bx = 800 + Math.sin(S.T * 0.5) * 10, by = 680 + Math.sin(S.T * 1.1) * 4;
          const st = Math.sin(S.T * 1.6);
          const n = nils(S, bx + 60, by - 26, { pose: 'row', face: -1, p: { lean: 6 + st * 10, a1: [60 + st * 16, 95 + st * 10] } });
          const a = astrid(S, bx - 90, by - 26, { pose: 'sit', p: { a1: [36, 100], a2: [30, 92], head: 12 } });
          line(S.c, n.hand[0], n.hand[1], n.hand[0] - 150 + st * 40, by + 34, 7, LIGHT);
          ell(S.c, a.hand[0] + 12, a.hand[1] + 6, 15, 14, RED); curve(S.c, [[a.hand[0] + 12, a.hand[1] + 6], [a.hand[0] + 40, a.hand[1] + 40], [bx - 20, by - 20]], 3, RED);
          boat(S, bx, by, 1);
          S.c.globalAlpha = 0.25; boat(S, bx, by + 70, 1, '#5a3412'); S.c.globalAlpha = 1;
        });
        S.layer(1.2, () => motes(S, 'dust', 40, 9));
      }, Object.assign({}, M, C(760, 480, 1.05, 820, 500, 1.28))),
      shot(7, '„N + A“, ins Ruderblatt geschnitzt. Maja fährt mit dem Finger die Buchstaben nach.', (S) => {
        hall(S, { tone: 'cool', win: [200, 200, 240, 300], shaft: 340 });
        S.layer(1, () => {
          line(S.c, 1010, FLOOR, 1090, 380, 16, '#2a1d16'); S.c.save(); S.c.translate(1100, 330); S.c.rotate(0.2); S.c.fillStyle = '#2a1d16'; S.c.beginPath(); S.c.ellipse(0, -40, 40, 100, 0, 0, TAU); S.c.fill(); S.c.fillStyle = 'rgba(255,224,176,0.9)'; S.c.font = 'italic 700 24px Georgia, serif'; S.c.textAlign = 'center'; S.c.rotate(-Math.PI / 2); S.c.fillText('N + A', 40, 8); S.c.restore();
          maja(S, 920, FLOOR, { pose: 'reach', p: { a1: [112, 128], head: -12 } });
          glow(S.c, 1100, 300, 170, '#ffd9a0', 0.35);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 4));
      }, C(900, 470, 1.1, 1010, 420, 1.5)),
    ],

    herbstwald: [
      shot(8, 'Ein Holzvogel für Maja. Dann ruft das Signalhorn vom Leuchtturm – und Nils muss los.', (S) => {
        forest(S, { autumn: true, sun: 420 });
        S.layer(1, () => {
          rect(S.c, 700, FLOOR - 84, 170, 84, LIGHT);
          const up = ease(clamp((S.u - 0.55) / 0.2, 0, 1));
          const n = nils(S, 810, FLOOR, { pose: 'sit', p: { a1: [44, 100], a2: [34, 86], head: mix(16, -22, up) } });
          ell(S.c, n.hand[0] + 16, n.hand[1] - 8, 20, 12, LIGHT); poly(S.c, [[n.hand[0] + 34, n.hand[1] - 10], [n.hand[0] + 48, n.hand[1] - 6], [n.hand[0] + 34, n.hand[1] - 2]], LIGHT);
          if (up > 0) { S.c.save(); S.c.globalAlpha = up * (0.5 + 0.5 * Math.sin(S.T * 8)); for (let i = 1; i < 4; i++) { S.c.strokeStyle = '#fff2c8'; S.c.lineWidth = 3; S.c.beginPath(); S.c.arc(1500, 240, 40 * i + (S.T * 60) % 40, 2.4, 3.9); S.c.stroke(); } S.c.restore(); }
        });
        S.layer(1.2, () => motes(S, 'leaf', 26, 3));
      }, Object.assign({}, M, C(780, 480, 1.12, 900, 460, 1.3))),
      shot(8, 'Maja nimmt das Messer und schnitzt eine Feder zu Ende. Ungeschickt, aber sorgfältig.', (S) => {
        hall(S, { win: [1150, 230, 220, 260] });
        S.layer(1, () => {
          table(S, 800, FLOOR, 320); chair(S, 640, FLOOR, 1);
          const w = Math.sin(S.T * 5) * 4;
          const m = maja(S, 650, FLOOR, { pose: 'sit', p: { a1: [46, 100 + w], a2: [40, 92], head: 20 } });
          ell(S.c, 800, FLOOR - 152, 32, 20, '#c9a877'); ell(S.c, 828, FLOOR - 170, 13, 13, '#c9a877'); poly(S.c, [[838, FLOOR - 172], [856, FLOOR - 168], [838, FLOOR - 164]], '#c9a877'); rect(S.c, 776, FLOOR - 140, 50, 10, '#8a6a44');
          line(S.c, m.hand[0], m.hand[1], m.hand[0] + 26, m.hand[1] + 6, 4, '#d8dde2');
          for (let i = 0; i < 5; i++) ell(S.c, 740 + i * 22, FLOOR - 136, 6, 2, '#e2c79c', i);
          glow(S.c, 800, FLOOR - 160, 150, '#ffd9a0', 0.3);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 8));
      }, C(760, 470, 1.2, 790, 450, 1.5)),
    ],

    heimweg: [
      shot(8, 'Das Foto: ein junger Mann auf der Galerie seines Leuchtturms. Stolz.', (S) => {
        sky(S, 'gold', [420, 380, 600]);
        S.layer(0.1, () => { rect(S.c, -400, 620, W + 800, 400, lin(S.c, 0, 620, 0, H, ['#e8b060', '#8a5220'])); birds(S, 6, 2, 'rgba(255,240,200,0.8)'); });
        S.layer(1, () => {
          const c = S.c, col = '#6a3e16';
          poly(c, [[820, H + 100], [860, 560], [1340, 560], [1380, H + 100]], col); rect(c, 760, 540, 680, 26, col);
          for (let i = 0; i < 12; i++) rect(c, 770 + i * 60, 440, 6, 100, col); rect(c, 760, 436, 680, 8, col);
          rect(c, 900, 150, 400, 290, col); poly(c, [[880, 150], [1100, 20], [1320, 150]], col);
          rect(c, 940, 190, 320, 220, '#fff0c0'); for (let i = 1; i < 4; i++) rect(c, 940 + i * 80 - 3, 190, 6, 220, col); glow(c, 1100, 300, 420, '#fff0c0', 0.7);
          nils(S, 800, 540, { pose: 'wave', face: -1, h: 250 });
        });
        S.layer(1.2, () => motes(S, 'dust', 50, 6));
      }, Object.assign({}, M, C(1000, 420, 1.0, 900, 400, 1.25))),
      shot(8, 'Auf dem Dachboden findet Maja das Foto. Sie setzt sich auf eine Truhe und bleibt lange.', (S) => {
        room(S, { tone: 'attic', win: [980, 150, 200, 200], shaft: -300 });
        S.layer(0.9, () => { poly(S.c, [[-400, -100], [700, -100], [-400, 620]], '#120c09'); poly(S.c, [[W + 400, -100], [1300, -100], [W + 400, 500]], '#120c09'); });
        S.layer(1, () => {
          rect(S.c, 560, FLOOR - 84, 230, 84, DARK); rect(S.c, 552, FLOOR - 96, 246, 16, DARK); box(S, 1300, FLOOR, 140, 100); box(S, 250, FLOOR, 120, 90);
          const m = maja(S, 670, FLOOR - 20, { pose: 'sit', p: { a1: [40, 110], head: 22 } });
          S.c.save(); S.c.translate(m.hand[0] + 16, m.hand[1] - 20); S.c.rotate(-0.25); rect(S.c, -18, -24, 36, 48, '#e9d8b0'); rect(S.c, -4, -6, 8, 22, '#8a6a44'); S.c.restore();
          glow(S.c, m.hand[0] + 16, m.hand[1] - 20, 110, '#ffe2b0', 0.4);
        });
        S.layer(1.2, () => { motes(S, 'rain', 30, 4, 'rgba(200,220,240,0.15)'); motes(S, 'dust', 40, 3, '#cfe0ee'); });
      }, C(780, 440, 1.05, 720, 470, 1.35)),
    ],

    moor: [
      shot(8, 'Moltebeeren. Maja isst mehr, als sie sammelt. Nils tut, als merke er es nicht.', (S) => {
        moor(S);
        S.layer(1, () => {
          const eat = Math.max(0, Math.sin(S.T * 1.4));
          const n = nils(S, 700, FLOOR, { pose: 'kneel', p: { a1: [30, 40], head: 10 } });
          const k = majaKid(S, 940, FLOOR, { face: -1, p: { a1: [mix(30, 110, eat), mix(60, 172, eat)] } });
          poly(S.c, [[790, FLOOR - 44], [850, FLOOR - 44], [842, FLOOR], [798, FLOOR]], LIGHT); S.c.strokeStyle = LIGHT; S.c.lineWidth = 3; S.c.beginPath(); S.c.arc(820, FLOOR - 44, 30, Math.PI, 0); S.c.stroke();
          for (let i = 0; i < 6; i++) ell(S.c, 800 + i * 8, FLOOR - 48 - (i % 2) * 5, 5, 5, '#f09a30');
          ell(S.c, k.hand[0], k.hand[1], 5, 5, '#f09a30'); void n;
        });
        S.layer(1.2, () => motes(S, 'dust', 40, 5));
      }, Object.assign({}, M, C(760, 480, 1.12, 860, 490, 1.36))),
      shot(7, 'Astrids Rezeptbuch mit Majas Kinderzeichnung kommt nicht in den Karton.', (S) => {
        hall(S, { win: [220, 230, 230, 270], shaft: 320 });
        S.layer(1, () => {
          table(S, 900, FLOOR, 340); box(S, 1260, FLOOR, 150, 110);
          const put = ease(clamp((S.u - 0.3) / 0.4, 0, 1));
          const m = maja(S, 700, FLOOR, { pose: 'hold', p: { a1: [mix(70, 52, put), mix(110, 96, put)], head: 16 } });
          const bx = mix(m.hand[0] + 20, 900, put), by = mix(m.hand[1] - 10, FLOOR - 146, put);
          rect(S.c, bx - 44, by - 8, 88, 16, '#6a2a22'); rect(S.c, bx - 40, by - 12, 80, 5, '#efe4c8'); glow(S.c, bx, by, 120, '#ffd9a0', 0.3 * put);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 6));
      }, C(820, 470, 1.12, 880, 450, 1.38)),
    ],

    kueste: [
      shot(8, 'Die Flaschenpost: ein Brief mit gemaltem Herz, ins Meer geworfen. Richtung Leuchtturm.', (S) => {
        coast(S, { time: 'day', sun: [1250, 330, 520], lh: [1250, 230, false], dune: false });
        S.layer(1, () => {
          const c = S.c, col = '#6a3e16';
          rect(c, -400, FLOOR - 6, 1150, 22, col); for (let i = 0; i < 9; i++) rect(c, -340 + i * 130, FLOOR, 16, 300, col);
          const th = clamp((S.u - 0.3) / 0.12, 0, 1);
          majaKid(S, 640, FLOOR - 6, { p: { a1: [mix(190, 70, th), mix(200, 80, th)], lean: mix(-8, 12, th) }, h: 180 });
          if (S.u > 0.36) { const k = clamp((S.u - 0.36) / 0.4, 0, 1), bx = 700 + k * 420, by = FLOOR - 190 - Math.sin(k * Math.PI) * 190 + k * 260; c.save(); c.translate(bx, by); c.rotate(k * 9); rect(c, -7, -18, 14, 32, '#d8f0e0'); rect(c, -3, -28, 6, 12, '#d8f0e0'); c.restore(); glow(c, bx, by, 50, '#ffffff', 0.5); }
          rect(c, -400, FLOOR + 40, W + 800, 300, lin(c, 0, FLOOR + 40, 0, H, ['#c48a44', '#6a3e1a']));
        });
        S.layer(0.5, () => birds(S, 5, 8, 'rgba(255,244,214,0.8)'));
      }, Object.assign({}, M, C(760, 470, 1.05, 900, 450, 1.25))),
      shot(8, 'In Nils’ Schreibtisch: alle ihre Briefe. Geöffnet, glattgestrichen, mit Bindfaden gebündelt.', (S) => {
        hall(S, { tone: 'cool', win: [1150, 220, 230, 280], winDraw: (w) => { rect(S.c, w[0], w[1] + w[3] * 0.62, w[2], w[3], '#5a7a90'); } });
        S.layer(1, () => {
          rect(S.c, 760, FLOOR - 150, 320, 16, DARK); rect(S.c, 780, FLOOR - 134, 280, 134, DARK); rect(S.c, 800, FLOOR - 118, 110, 44, '#241a14');
          const m = maja(S, 620, FLOOR, { pose: 'hold', p: { a1: [56, 104], a2: [48, 98], head: 20 } });
          for (let i = 0; i < 5; i++) rect(S.c, m.hand[0] - 6, m.hand[1] - 26 + i * 6, 62, 5, i % 2 ? '#efe4c8' : '#e2d4b0');
          line(S.c, m.hand[0] + 24, m.hand[1] - 30, m.hand[0] + 24, m.hand[1] + 6, 3, '#8a6a44'); glow(S.c, m.hand[0] + 24, m.hand[1] - 10, 110, '#ffe9c0', 0.35);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 9, '#cfe0ee'));
      }, C(760, 470, 1.1, 700, 450, 1.45)),
    ],

    winterpass: [
      shot(8, 'Der Schlittschuh. Maja fällt, Nils lacht und hebt sie auf.', (S) => {
        fjord(S);
        S.layer(1, () => {
          const up = ease(clamp((S.u - 0.35) / 0.35, 0, 1));
          const n = nils(S, 740, FLOOR, { p: { lean: mix(34, 6, up), a1: [mix(50, 30, up), mix(40, 70, up)], head: 10 } });
          majaKid(S, 900, FLOOR, { face: -1, pose: mix(0, 1, up) > 0.5 ? 'stand' : 'floor', p: { a1: [mix(120, 60, up), mix(150, 110, up)] } });
          void n;
        });
        S.layer(1.2, () => motes(S, 'snow', 50, 4, '#fff6dc'));
      }, Object.assign({}, M, C(780, 480, 1.1, 860, 500, 1.34))),
      shot(7, 'Im Karton mit den Wintersachen liegt ein einzelner grüner Kinderhandschuh. Der zweite fehlt.', (S) => {
        hall(S, { tone: 'cool', win: [1180, 240, 200, 240], night: true });
        S.layer(1, () => {
          box(S, 900, FLOOR, 190, 130);
          const m = maja(S, 700, FLOOR, { pose: 'kneel', p: { a1: [60, 120], head: 16 } });
          ell(S.c, m.hand[0] + 6, m.hand[1] - 22, 15, 20, GREEN); ell(S.c, m.hand[0] - 8, m.hand[1] - 16, 6, 10, GREEN, 0.6); rect(S.c, m.hand[0] - 6, m.hand[1] - 6, 24, 10, '#4c7a3c');
          glow(S.c, m.hand[0] + 6, m.hand[1] - 20, 120, '#c8ffb0', 0.3); glow(S.c, 420, 300, 420, '#ffc880', 0.35);
        });
        S.layer(1.25, () => motes(S, 'dust', 30, 2));
      }, C(800, 480, 1.15, 760, 470, 1.5)),
    ],

    schrottplatz: [
      shot(8, 'Die Schiffsglocke. Für jedes Schiff, das er nicht retten konnte, eine Kerbe. Er berührt jede.', (S) => {
        coast(S, { time: 'dawn', sun: [400, 480, 420], dune: false });
        S.layer(0.5, () => { const c = S.c, col = '#8a5522'; poly(c, [[200, 640], [330, 420], [560, 470], [660, 640]], col); line(c, 420, 440, 400, 200, 12, col); poly(c, [[1150, 640], [1260, 500], [1520, 520], [1560, 640]], col); line(c, 1380, 510, 1420, 300, 9, col); });
        S.layer(1, () => {
          const c = S.c;
          hills(c, FLOOR + 6, 10, 3, '#6a3e16');
          rect(c, 960, FLOOR - 330, 16, 330, LIGHT); rect(c, 880, FLOOR - 330, 96, 14, LIGHT);
          const sw = Math.sin(S.T * 1.2) * 0.05;
          c.save(); c.translate(900, FLOOR - 316); c.rotate(sw); c.fillStyle = '#f0c060'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.quadraticCurveTo(22, 60, 46, 96); c.lineTo(-46, 96); c.quadraticCurveTo(-22, 60, -10, 0); c.fill(); ell(c, 0, 104, 9, 9, '#f0c060');
          for (let i = 0; i < 5; i++) rect(c, -30 + i * 14, 78, 3, 14, '#6a3e16'); c.restore();
          nilsOld(S, 700, FLOOR, { pose: 'reach', p: { a1: [100, 118], head: -6, lean: 6 } });
          glow(c, 900, FLOOR - 250, 170, '#fff0b0', 0.6);
        });
      }, Object.assign({}, M, C(760, 470, 1.08, 860, 440, 1.36))),
      shot(8, 'Ein alter Zeitungsausschnitt: ein gesunkener Kutter, ein eingekreister Name. Nils’ Vater blieb auf See.', (S) => {
        hall(S, { tone: 'cool', win: [220, 230, 230, 270], shaft: 320 });
        S.layer(1, () => {
          table(S, 980, FLOOR, 300); chair(S, 820, FLOOR, 1);
          const m = maja(S, 830, FLOOR, { pose: 'sit', p: { a1: [50, 112], a2: [44, 104], head: 20 } });
          S.c.save(); S.c.translate(m.hand[0] + 26, m.hand[1] - 26); S.c.rotate(-0.12); rect(S.c, -34, -40, 68, 80, '#e6dcc0'); for (let i = 0; i < 7; i++) rect(S.c, -26, -30 + i * 9, 52 - (i % 3) * 10, 3, 'rgba(60,50,40,0.5)'); S.c.strokeStyle = RED; S.c.lineWidth = 2.5; S.c.beginPath(); S.c.ellipse(-4, 6, 22, 8, 0, 0, TAU); S.c.stroke(); S.c.restore();
          glow(S.c, m.hand[0] + 26, m.hand[1] - 26, 120, '#ffe9c0', 0.3);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 3, '#cfe0ee'));
      }, C(880, 470, 1.15, 880, 440, 1.5)),
    ],

    kuerbisnacht: [
      shot(8, 'Ein Handschuh ging im Dunkeln verloren. Sie haben lange gesucht.', (S) => {
        sky(S, 'night');
        S.layer(0.1, () => { ell(S.c, 1250, 210, 70, 70, '#ffe9b0'); glow(S.c, 1250, 210, 380, '#ffd890', 0.6); });
        S.layer(0.4, () => { for (let i = 0; i < 8; i++) tree(S, -150 + i * 260 + noise(i, 2) * 80, FLOOR, 520 + noise(i, 3) * 160, '#5a3814', true, i); });
        S.layer(1, () => {
          hills(S.c, FLOOR + 6, 12, 4, '#3a2410'); grass(S.c, FLOOR, '#8a5a24', S.T, 5, 38, 12);
          const n = nils(S, 620, FLOOR, { p: { a1: [70, 96], lean: 6, head: 16 } });
          rect(S.c, n.hand[0] - 9, n.hand[1], 18, 28, '#ffd070'); glow(S.c, n.hand[0], n.hand[1] + 14, 260, '#ffb850', 0.9);
          majaKid(S, 860, FLOOR, { pose: walk(S.T * 0.5), p: { head: 24, lean: 16 } });
          for (const x of [300, 1180]) { ell(S.c, x, FLOOR - 26, 40, 30, '#e88a30'); rect(S.c, x - 4, FLOOR - 62, 8, 12, '#6a4a1c'); glow(S.c, x, FLOOR - 26, 110, '#ff9a40', 0.5 + 0.2 * Math.sin(S.T * 7 + x)); }
          ell(S.c, 1090, FLOOR - 10, 13, 9, GREEN);
        });
      }, Object.assign({}, M, C(760, 470, 1.05, 900, 500, 1.3))),
      shot(8, 'Maja legt ihn zum Schal über die Stuhllehne. Zwischen den roten Reihen ist jetzt eine grüne.', (S) => {
        hall(S, { win: [240, 230, 220, 270], shaft: 320 });
        S.layer(1, () => {
          chair(S, 1000, FLOOR, 1);
          S.c.save(); S.c.translate(966, FLOOR - 12); S.c.rotate(-Math.PI / 2); scarf(S, 0, -27, 10, 18.5, 54, 9, clamp((S.u - 0.5) * 3, 0, 1)); S.c.restore();
          const put = ease(clamp((S.u - 0.15) / 0.35, 0, 1));
          const m = maja(S, 800, FLOOR, { pose: 'hold', p: { a1: [mix(50, 88, put), mix(96, 100, put)], head: 12 } });
          ell(S.c, m.hand[0] + 12, m.hand[1] - 8, 13, 17, GREEN);
        });
        S.layer(1.25, () => motes(S, 'dust', 40, 5));
      }, C(860, 470, 1.12, 930, 430, 1.5)),
    ],

    leuchtturm: [
      shot(8, 'Sturmnacht. Nils hält das Licht am Brennen, und ein Kutter kommt sicher heim.', (S) => {
        coast(S, { time: 'storm', lh: [1150, 320, true], dune: false });
        S.layer(0.5, () => { const bx = mix(200, 620, S.u), by = 610 + Math.sin(S.T * 1.7) * 18; S.c.save(); S.c.translate(bx, by); S.c.rotate(Math.sin(S.T * 1.7 + 1) * 0.12); boat(S, 0, 0, 0.5, '#0a0e14'); rect(S.c, -6, -90, 6, 70, '#0a0e14'); rect(S.c, -30, -50, 44, 26, '#0a0e14'); rect(S.c, -22, -44, 10, 10, '#ffd070'); S.c.restore(); glow(S.c, bx - 10, by - 40, 60, '#ffc060', 0.6); });
        S.layer(1.2, () => { motes(S, 'rain', 160, 2); if (Math.sin(S.T * 2.3) > 0.985) rect(S.c, -400, -200, W + 800, H + 400, 'rgba(220,230,255,0.35)'); });
      }, Object.assign({}, M, C(700, 450, 1.0, 900, 430, 1.22))),
      shot(7, 'Zur selben Zeit wartet Maja. Es ist ihr zehnter Geburtstag.', (S) => {
        room(S, { win: [1100, 220, 240, 290], night: true, winDraw: (w) => { S.c.save(); S.c.globalAlpha = 0.5; motes(S, 'rain', 60, 6); S.c.restore(); void w; } });
        S.layer(1, () => {
          table(S, 800, FLOOR, 380, LIGHT); chair(S, 590, FLOOR, 1, LIGHT); chair(S, 1010, FLOOR, -1, 'rgba(255,242,210,0.45)');
          majaKid(S, 600, FLOOR - 36, { pose: 'sit', skirt: true, p: { a1: [30, 96], head: 26, lean: 10 }, h: 190 });
          const burn = 1 - S.u * 0.6;
          rect(S.c, 740, FLOOR - 172, 120, 40, LIGHT);
          for (let i = 0; i < 5; i++) { const x = 756 + i * 22; rect(S.c, x, FLOOR - 172 - 26 * burn, 5, 26 * burn, '#ffe9c0'); ell(S.c, x + 2.5, FLOOR - 178 - 26 * burn, 4, 7 + Math.sin(S.T * 12 + i) * 1.5, '#ffb040'); }
          glow(S.c, 800, FLOOR - 200, 260, '#ffc060', 0.7);
        });
      }, Object.assign({}, M, C(820, 470, 1.12, 780, 470, 1.4))),
      shot(9, 'Ein Dankesbrief der Fischerfamilie. Das Datum kennt sie. Maja weint – nicht verbittert, sondern erleichtert.', (S) => {
        room(S, { tone: 'cool', win: [1120, 200, 240, 300], night: true, winDraw: () => { S.c.save(); S.c.globalAlpha = 0.6; motes(S, 'rain', 60, 6); S.c.restore(); if (Math.sin(S.T * 1.9) > 0.98) rect(S.c, 0, 0, W, H, 'rgba(210,225,255,0.5)'); } });
        S.layer(1, () => {
          box(S, 380, FLOOR, 140, 100);
          const m = maja(S, 700, FLOOR, { pose: 'floor', face: 1, p: { a1: [50, 120], lean: -14, head: 24 } });
          S.c.save(); S.c.translate(m.hand[0] + 14, m.hand[1] - 22); S.c.rotate(-0.2); rect(S.c, -22, -30, 44, 60, '#efe4c8'); for (let i = 0; i < 6; i++) rect(S.c, -15, -22 + i * 8, 30 - (i % 2) * 8, 2.4, 'rgba(60,50,40,0.5)'); S.c.restore();
          glow(S.c, 480, 330, 480, '#ffc880', 0.4); glow(S.c, m.hand[0] + 14, m.hand[1] - 22, 110, '#ffe9c0', 0.35);
        });
        S.layer(1.25, () => motes(S, 'dust', 30, 7));
      }, C(780, 500, 1.1, 740, 520, 1.42)),
    ],

    nordlicht: [
      shot(8, 'Nachts baut Nils im Schein der Lampe einen Schlitten für Majas Geburtstag.', (S) => {
        snowNight(S); fjordAurora(S);
        S.layer(1, () => {
          const hm = Math.max(0, Math.sin(S.T * 4));
          const n = nils(S, 680, FLOOR, { pose: 'kneel', p: { a1: [mix(100, 50, hm), mix(150, 80, hm)], head: 14 } });
          sled(S, 900, FLOOR, 1, LIGHT);
          line(S.c, n.hand[0], n.hand[1], n.hand[0] + 4, n.hand[1] - 34, 6, LIGHT); rect(S.c, n.hand[0] - 12, n.hand[1] - 46, 34, 16, LIGHT);
          rect(S.c, 520, FLOOR - 40, 22, 40, '#ffd070'); glow(S.c, 531, FLOOR - 24, 300, '#ffb850', 0.9);
        });
        S.layer(1.2, () => motes(S, 'snow', 60, 3));
      }, Object.assign({}, M, C(760, 480, 1.08, 840, 500, 1.34))),
      shot(8, 'Am Morgen ist er auf See. Der Schlitten steht mit Schleife vor der Tür.', (S) => {
        snowNight(S, { house: [1040, 2.3] });
        S.layer(0.7, () => { rect(S.c, 1040 + 14 * 2.3, FLOOR - 20 - 62 * 2.3, 34 * 2.3, 62 * 2.3, '#ffcf80'); glow(S.c, 1100, FLOOR - 90, 260, '#ffb860', 0.7); const k = S.mem; S.mem = false; majaKid(S, 1110, FLOOR - 18, { face: -1, col: '#2a1a10', rim: 0, p: { a1: [60, 120] }, h: 130 }); S.mem = k; });
        S.layer(1, () => { sled(S, 700, FLOOR, 1.15, LIGHT); for (const d of [-1, 1]) ell(S.c, 700 + d * 14, FLOOR - 62, 13, 9, RED, d * 0.5); ell(S.c, 700, FLOOR - 62, 6, 6, '#a82c20'); glow(S.c, 700, FLOOR - 50, 160, '#ffd9a0', 0.4); });
        S.layer(1.2, () => motes(S, 'snow', 60, 5));
      }, Object.assign({}, M, C(900, 480, 1.05, 780, 500, 1.32))),
      shot(7, 'Er war nicht da. Aber der Schlitten war es.', (S) => {
        hall(S, { win: [1140, 230, 220, 270], night: true });
        S.layer(1, () => {
          armchair(S, 760, FLOOR, 1);
          const m = maja(S, 770, FLOOR - 30, { pose: 'sit', p: { a1: [44, 108], head: 22 } });
          S.c.save(); S.c.translate(m.hand[0] + 18, m.hand[1] - 22); S.c.rotate(-0.2); rect(S.c, -22, -18, 44, 36, '#e9d8b0'); line(S.c, -12, 8, 12, 8, 3, '#6a4a2a'); ell(S.c, 0, -2, 5, 6, '#6a4a2a'); S.c.restore();
          glow(S.c, 520, 330, 460, '#ffc880', 0.5); glow(S.c, m.hand[0] + 18, m.hand[1] - 22, 110, '#ffe9c0', 0.4);
        });
        S.layer(1.25, () => motes(S, 'dust', 30, 8));
      }, C(800, 470, 1.15, 800, 440, 1.5)),
    ],

    vergessen: [
      shot(9, 'Astrid strickt bis zuletzt. Sie kommt nicht bis zum Ende. Nils legt die Nadeln in den Korb und schließt den Deckel.', (S) => {
        room(S, { win: [1100, 200, 230, 300] });
        S.layer(1, () => {
          const c = S.c;
          rect(c, 500, FLOOR - 110, 520, 26, LIGHT); rect(c, 500, FLOOR - 84, 18, 84, LIGHT); rect(c, 1002, FLOOR - 84, 18, 84, LIGHT); rect(c, 486, FLOOR - 250, 22, 250, LIGHT); ell(c, 570, FLOOR - 140, 60, 34, LIGHT);
          const kn = Math.sin(S.T * 3) * 6;
          const a = astrid(S, 640, FLOOR - 112, { pose: 'bed', skirt: false, p: { a1: [50, 95 + kn], a2: [44, 92 - kn] } });
          line(c, a.hand[0], a.hand[1], a.hand[0] + 46, a.hand[1] - 30, 3, '#e6d3a4'); line(c, a.hand2[0], a.hand2[1], a.hand2[0] + 50, a.hand2[1] - 22, 3, '#e6d3a4');
          rect(c, a.hand[0] + 6, a.hand[1] - 4, 60, 30, RED); curve(c, [[a.hand[0] + 60, a.hand[1] + 20], [900, FLOOR - 60], [960, FLOOR - 20]], 3, RED); ell(c, 966, FLOOR - 18, 18, 17, RED);
          poly(c, [[640, FLOOR - 112], [1010, FLOOR - 112], [1010, FLOOR - 150], [800, FLOOR - 160]], 'rgba(255,242,210,0.75)');
          chair(S, 1140, FLOOR, -1); nilsOld(S, 1130, FLOOR, { pose: 'sit', face: -1, p: { a1: [60, 96], head: 14, lean: 8 } });
        });
        S.layer(1.25, () => motes(S, 'dust', 50, 2));
      }, Object.assign({}, M, C(860, 470, 1.08, 800, 480, 1.34))),
      shot(8, 'Maja steht an der Haltestelle, den fertigen Schal in der Tasche. Diesmal steigt sie ein.', (S) => {
        town(S);
        S.layer(0.1, () => { const a = S.T * 0.5; S.c.save(); S.c.globalCompositeOperation = 'lighter'; S.c.globalAlpha = 0.25 + 0.2 * Math.max(0, Math.sin(a)); S.c.fillStyle = lin(S.c, 0, 0, W, 0, ['rgba(255,240,200,0)', 'rgba(255,240,200,0.8)']); S.c.beginPath(); S.c.moveTo(W + 300, 180); S.c.lineTo(-300, 120 + Math.sin(a) * 160); S.c.lineTo(-300, 200 + Math.sin(a) * 160); S.c.fill(); S.c.restore(); });
        S.layer(1, () => {
          const c = S.c; rect(c, 540, FLOOR - 330, 10, 330, DARK); rect(c, 520, FLOOR - 340, 70, 50, DARK); c.fillStyle = '#e8e4d8'; c.font = '700 34px sans-serif'; c.textAlign = 'center'; c.fillText('H', 555, FLOOR - 302);
          const bx = mix(2100, 900, ease(clamp(S.u / 0.6, 0, 1)));
          c.fillStyle = '#1c1e20'; c.beginPath(); c.roundRect(bx, FLOOR - 250, 620, 230, 26); c.fill(); for (let i = 0; i < 5; i++) rect(c, bx + 40 + i * 112, FLOOR - 220, 92, 80, 'rgba(250,236,200,0.75)'); ell(c, bx + 120, FLOOR - 18, 34, 34, '#0c0d0e'); ell(c, bx + 500, FLOOR - 18, 34, 34, '#0c0d0e'); glow(c, bx + 20, FLOOR - 70, 160, '#fff0c0', 0.5);
          const m = maja(S, 700, FLOOR, { pose: 'stand', rimCol: 'rgba(230,236,244,0.5)' }); rect(c, m.hand[0] - 20, m.hand[1], 44, 52, '#2a2420'); rect(c, m.hand[0] - 10, m.hand[1] - 6, 24, 10, RED); glow(c, m.hand[0], m.hand[1], 70, '#ff7040', 0.5);
        });
        S.layer(1.2, () => motes(S, 'rain', 150, 5));
      }, Object.assign({ grey: 0.85 }, C(760, 470, 1.0, 720, 480, 1.22))),
      shot(8, 'Nils schaut sie an. Leer. Fremd.', (S) => nursing(S, 0), Object.assign({ grey: 0.8 }, C(860, 470, 1.1, 900, 440, 1.35))),
      shot(9, 'Sie legt ihm den Schal um. Seine Finger tasten über die Reihen: Wellen, Möwen, Eiskristalle, Birkenblätter.', (S) => {
        room(S, { tone: 'grey', night: true });
        S.layer(1, () => {
          const n = Math.floor(clamp(S.u * 1.5, 0, 1) * 13);
          scarf(S, 180, 330, 13, 96, 250, 9, 0);
          const hx = 180 + clamp(S.u * 1.25, 0, 1) * 13 * 96, hy = 520 + Math.sin(S.T * 3) * 8;
          const hc = '#231a14';
          for (let i = 0; i < 4; i++) line(S.c, hx - 42 + i * 28, hy + 130, hx - 54 + i * 34, hy + [26, -6, 0, 30][i] + Math.sin(S.T * 3 + i) * 5, 24, hc);
          line(S.c, hx - 60, hy + 170, hx - 112, hy + 96, 26, hc); ell(S.c, hx, hy + 176, 66, 78, hc); rect(S.c, hx - 62, hy + 230, 124, 300, hc);
          glow(S.c, hx, hy, 220, '#ffb070', 0.5); void n;
        });
      }, Object.assign({ grey: 0.45 }, C(500, 450, 1.25, 1100, 450, 1.25))),
      shot(11, 'An der letzten Masche hält er inne und beginnt zu summen. Astrids Lied. Sein Blick wird klar. „Maja.“', (S) => nursing(S, 1), Object.assign({ near: 1, greyTo: [0.8, 0] }, C(900, 440, 1.35, 900, 430, 1.6))),
      shot(9, 'Frühling. Das Schild „Zu verkaufen“ ist abgenommen.', (S) => {
        coast(S, { time: 'spring', sun: [300, 260, 520], lh: [1250, 240, false], dune: true });
        S.layer(0.5, () => birds(S, 6, 3, 'rgba(40,50,60,0.6)'));
        S.layer(1, () => {
          const c = S.c;
          rect(c, 560, FLOOR - 300, 520, 300, '#efe6d2'); poly(c, [[520, FLOOR - 300], [820, FLOOR - 470], [1120, FLOOR - 300]], '#8a3c2c'); rect(c, 780, FLOOR - 170, 90, 170, '#5a3a24'); rect(c, 620, FLOOR - 220, 100, 100, '#bfe0f0'); rect(c, 596, FLOOR - 224, 22, 108, '#3f7a54'); rect(c, 722, FLOOR - 224, 22, 108, '#3f7a54'); rect(c, 930, FLOOR - 220, 100, 100, '#bfe0f0'); rect(c, 906, FLOOR - 224, 22, 108, '#3f7a54');
          for (let i = 0; i < 3; i++) rect(c, 760 - i * 14, FLOOR - 22 - i * 22 + 44, 130 + i * 28, 22, '#b8ad98');
          const br = Math.sin(S.T * 2.2) * 14;
          const m = maja(S, 1090, FLOOR, { face: -1, pose: 'reach', col: '#3a4a5c', rim: 0, p: { a1: [118 + br, 132 + br] } }); rect(c, m.hand[0] - 20, m.hand[1] - 6, 22, 9, '#3f7a54');
          const b = person(S, 770, FLOOR - 4, { h: 190, child: true, hair: 'short', pose: 'sit', col: '#4a3a30', rim: 0, p: { a1: [40, 100 + Math.sin(S.T * 5) * 5], head: 20 } }); ell(c, b.hand[0] + 12, b.hand[1] - 4, 14, 9, '#c9a877');
          for (let i = 0; i < 26; i++) ell(c, 80 + noise(i, 2) * 1500, FLOOR - 6 - noise(i, 3) * 14, 5, 5, ['#f4c542', '#ffffff', '#f09ab8'][i % 3]);
        });
        S.layer(1.2, () => motes(S, 'dust', 40, 4));
      }, C(700, 450, 1.0, 820, 470, 1.2)),
      shot(9, 'Im Strickkorb liegt neues Garn. Maja hat einen grünen Schal begonnen.', (S) => {
        hall(S, { win: [1080, 120, 300, 360], shaft: -520 });
        S.layer(1, () => {
          basket(S, 820, FLOOR, 2.1, GREEN);
          const k = ease(clamp((S.u - 0.4) / 0.3, 0, 1));
          yarny(S, 770 - k * 30, FLOOR - 196 - k * 20, 1.4 * k + 0.01, GREEN, S.u > 0.75 ? Math.max(0, Math.sin((S.u - 0.75) * 34)) : 0);
          glow(S.c, 780, FLOOR - 230, 180, '#b8ff90', 0.4 * k);
        });
        S.layer(1.2, () => { rays(S, 1230, 300, 2.5, 0.5, 900, '#ffe2a8', 0.16, 4); motes(S, 'dust', 60, 5); });
      }, C(860, 540, 1.42, 800, 520, 1.75)),
    ],
  };

  function fjordAurora(S) {
    const c = S.c;
    S.layer(0.06, () => {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) for (let x = -100; x < W + 100; x += 14) {
        const y = 130 + k * 60 + Math.sin(x * 0.006 + S.T * 0.3 + k * 2) * 50, hh = 130 + Math.sin(x * 0.02 + S.T * 0.7 + k) * 50;
        c.globalAlpha = 0.06 + 0.04 * Math.sin(x * 0.013 + S.T + k); c.fillStyle = lin(c, 0, y, 0, y + hh, ['#7dffc0', 'rgba(60,160,200,0)']); c.fillRect(x, y, 15, hh);
      }
      c.restore();
    });
  }
  function sled(S, x, y, s, col) {
    const c = S.c;
    for (const dz of [0, 10]) { rect(c, x - 90 * s + dz, y - 8 * s - dz * 0.6, 180 * s, 7 * s, col); c.strokeStyle = col; c.lineWidth = 7 * s; c.beginPath(); c.arc(x + 90 * s + dz, y - 30 * s - dz * 0.6, 24 * s, -0.4, Math.PI / 2); c.stroke(); }
    for (const dx of [-56, 50]) rect(c, x + dx * s, y - 40 * s, 7 * s, 34 * s, col);
    rect(c, x - 80 * s, y - 50 * s, 160 * s, 10 * s, col);
  }
  // Zimmer im Pflegeheim: k = 0 grau und fremd, 1 = die Farbe kehrt zurück
  function nursing(S, k) {
    const c = S.c, warm = k ? ease(clamp((S.u - 0.3) / 0.4, 0, 1)) : 0;
    room(S, { tone: k ? 'warm' : 'grey', win: [1180, 170, 260, 330], night: true, frames: [[320, 260, 80, 100], [430, 300, 70, 86], [520, 250, 90, 110]], winDraw: (w) => {
      const a = S.T * 0.7, on = Math.max(0, Math.sin(a)); rect(c, w[0], w[1] + w[3] * 0.7, w[2], w[3], '#0a0e14');
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = on * 0.8; c.fillStyle = lin(c, w[0], 0, w[0] + w[2], 0, ['rgba(255,240,200,0.9)', 'rgba(255,240,200,0)']); c.fillRect(w[0], w[1], w[2], w[3]); c.restore();
    } });
    S.layer(1, () => {
      const beam = Math.max(0, Math.sin(S.T * 0.7));
      rays(S, 1310, 330, 2.75, 0.5, 900, '#ffe9b8', 0.1 + 0.2 * beam + 0.2 * warm, 4);
      armchair(S, 1000, FLOOR, -1);
      const lean = k ? ease(clamp((S.u - 0.45) / 0.3, 0, 1)) : 0;
      const n = nilsOld(S, 990, FLOOR - 30, { pose: 'sit', face: -1, hair: 'none', p: { lean: -6 + lean * 14, head: 8 + lean * 6, a1: [30, mix(70, 110, lean)] } });
      const m = maja(S, 760, FLOOR, { pose: 'kneel', p: { lean: 8 + lean * 12, a1: [mix(60, 96, lean), mix(100, 120, lean)], head: -8 } });
      if (k) {
        // der Schal um Nils' Schultern
        curve(c, [[n.sh[0] + 26, n.sh[1] - 4], [n.sh[0] - 4, n.sh[1] - 22], [n.sh[0] - 34, n.sh[1] + 4], [n.sh[0] - 30, n.sh[1] + 70], [n.sh[0] - 40, n.sh[1] + 130]], 26, RED);
        curve(c, [[n.sh[0] - 30, n.sh[1] + 30], [n.sh[0] - 32, n.sh[1] + 80]], 4, '#f3e6cc');
        glow(c, n.sh[0] - 36, n.sh[1] + 128, 60 + warm * 60, '#ff9a60', 0.5 + 0.4 * warm);
        if (S.u > 0.86) yarny(S, n.sh[0] - 40, n.sh[1] + 150, 0.5, RED, Math.max(0, Math.sin((S.u - 0.86) * 60)));
        glow(c, (n.head[0] + m.head[0]) / 2, n.head[1], 260, '#ffd9a0', 0.5 * warm);
      }
    });
    S.layer(1.25, () => motes(S, 'dust', 40, 6, k ? '#ffe9c0' : '#d8dcdf'));
  }

  // ------------------------------------------------------------ Abspielen
  let grain = null;
  function grainTile() {
    if (grain) return grain;
    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const x = grain.getContext('2d'), d = x.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
    x.putImageData(d, 0, 0);
    return grain;
  }

  const Cine = {
    active: null,
    has: (id) => !!SCENES[id],
    ids: () => Object.keys(SCENES),
    shots: (id) => (SCENES[id] || []).length,
    play(canvas, id, opts = {}) {
      this.active = { canvas, id, list: SCENES[id], i: 0, t: 0, T: 0, opts, done: false };
      return this.active;
    },
    stop() { this.active = null; if (FF.audio) FF.audio.cineNear = 0; },
    // Zur nächsten Einstellung (oder zum Ende); die erste Sekunde ist gesperrt, damit ein Sprung-Tastendruck nichts überspringt
    next() { const a = this.active; if (!a || a.T < 1) return; a.t = a.list[a.i].d; },
    skip() { const a = this.active; if (!a || a.T < 1) return; a.i = a.list.length - 1; a.t = a.list[a.i].d; },
    frame(dt) {
      const a = this.active;
      if (!a) return;
      a.t += dt; a.T += dt;
      if (a.t >= a.list[a.i].d) {
        if (a.i >= a.list.length - 1) { const end = a.opts.onEnd; this.stop(); if (end) end(); return; }
        a.i++; a.t = 0;
      }
      this.render(a.canvas, a.id, a.i, a.t / a.list[a.i].d, a.T);
    },
    // Ein Bild einer Einstellung malen (u = 0..1 innerhalb der Einstellung)
    render(canvas, id, i, u, T) {
      const sh = SCENES[id][i], c = canvas.getContext('2d');
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const cw = Math.max(2, Math.round(canvas.clientWidth * dpr)), ch = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      // Das Filmbild (Breitbild-Streifen der Bühne) so groß wie möglich, darunter bleibt Platz für den Untertitel
      const capH = Math.max(ch * 0.16, 52 * dpr), band = H - 2 * BAR;
      const k = Math.min(cw / W, (ch - capH) / band), ox = (cw - W * k) / 2, oy = Math.max(0, (ch - capH - band * k) / 2) - BAR * k;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000'; c.fillRect(0, 0, cw, ch);
      c.save(); c.beginPath(); c.rect(ox, oy + BAR * k, W * k, (H - 2 * BAR) * k); c.clip();
      const cam = sh.cam || [800, 450, 1.03, 800, 450, 1.1], e = ease(u);
      const cx = mix(cam[0], cam[3], e), cy = mix(cam[1], cam[4], e), cz = mix(cam[2], cam[5], e);
      const t = u * sh.d;
      const S = { c, u, t, T: (T === undefined ? t : T) + i * 7.3, mem: !!sh.mem, rim: sh.mem ? null : 'rgba(255,200,140,0.5)',
        layer(depth, fn) {
          const z = 1 + (cz - 1) * depth;
          c.save(); c.setTransform(k * z, 0, 0, k * z, ox + (W / 2 - (W / 2 + (cx - W / 2) * depth) * z) * k, oy + (H / 2 - (H / 2 + (cy - H / 2) * depth) * z) * k);
          fn(); c.restore();
        } };
      sh.draw(S);
      c.setTransform(k, 0, 0, k, ox, oy);
      // Farbstimmung: Rückblenden warm und an den Rändern überstrahlt, Gegenwart mit dunkler Vignette, „Vergessen“ entsättigt
      const grey = sh.greyTo ? mix(sh.greyTo[0], sh.greyTo[1], ease(clamp((u - 0.3) / 0.4, 0, 1))) : sh.grey || 0;
      if (grey > 0) { c.globalCompositeOperation = 'saturation'; c.globalAlpha = grey; c.fillStyle = '#808080'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
      if (sh.mem) {
        c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(255,170,80,0.35)'; c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 950); g.addColorStop(0, 'rgba(255,220,160,0)'); g.addColorStop(1, 'rgba(255,214,150,0.34)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
        c.globalAlpha = 0.03 + 0.03 * Math.sin(S.T * 23) * Math.sin(S.T * 7.1); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
      const v = c.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1000); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, sh.mem ? 'rgba(40,16,0,0.45)' : 'rgba(0,0,0,0.72)');
      c.fillStyle = v; c.fillRect(0, 0, W, H);
      // Filmkorn
      c.globalCompositeOperation = 'overlay'; c.globalAlpha = sh.mem ? 0.9 : 0.6;
      const gt = grainTile(), gx = Math.floor(Math.random() * 256), gy = Math.floor(Math.random() * 256);
      for (let y = -gy; y < H; y += 256) for (let x = -gx; x < W; x += 256) c.drawImage(gt, x, y);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      // Auf- und Abblenden; Rückblenden beginnen mit einem hellen Aufleuchten
      const fin = clamp(t / 0.9, 0, 1), fout = clamp((sh.d - t) / 0.7, 0, 1);
      if (fin < 1) { c.fillStyle = sh.mem ? `rgba(255,236,200,${1 - fin})` : `rgba(0,0,0,${1 - fin})`; c.fillRect(0, 0, W, H); }
      if (fout < 1) { c.fillStyle = `rgba(0,0,0,${1 - fout})`; c.fillRect(0, 0, W, H); }
      c.restore();
      // Untertitel im unteren Balken
      c.setTransform(k, 0, 0, k, ox, oy);
      const ca = clamp((t - 0.7) / 0.8, 0, 1) * clamp((sh.d - t - 0.3) / 0.6, 0, 1);
      if (sh.cap && ca > 0 && !(this.active && this.active.opts.noCaptions)) {
        c.globalAlpha = ca; c.fillStyle = '#efe6d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
        let size = 31; c.font = `italic 500 ${size}px Fraunces, Georgia, serif`;
        const words = sh.cap.split(' '), lines = [''];
        for (const w of words) { const cur = lines[lines.length - 1]; if (c.measureText(cur + ' ' + w).width > 1340 && cur) lines.push(w); else lines[lines.length - 1] = cur ? cur + ' ' + w : w; }
        if (lines.length > 2) { size = 26; c.font = `italic 500 ${size}px Fraunces, Georgia, serif`; }
        const cy0 = H - BAR + capH / k / 2;
        lines.slice(0, 3).forEach((l, n) => c.fillText(l, W / 2, cy0 + (n - (Math.min(3, lines.length) - 1) / 2) * (size + 6) - 2));
        c.globalAlpha = 1;
      }
      if (FF.audio) FF.audio.cineNear = sh.near !== undefined ? sh.near : sh.mem ? 0.75 : 0;
    },
  };
  FF.Cine = Cine;
})();
