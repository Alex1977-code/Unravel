'use strict';
// Farbwelten der Level, Kamera und die 2D-Überlagerung über der 3D-Grafik.
(function () {
  const FF = globalThis.FF;
  const TAU = Math.PI * 2;

  FF.COLORS = ['#d4462f', '#3a73c9'];
  FF.COLORS_DARK = ['#8f2a1c', '#21477f'];
  FF.COLORS_LIGHT = ['#f08a6e', '#7fa9ea'];

  // Stimmungen: Himmel, Sonne/Mond, Licht (r,g,b), Dunst, Ferne, Boden, Wasser, Baumart, Teilchen in der Luft.
  const THEMES = {
    garden: {
      sky: ['#9fb8bf', '#d9d6bf', '#f3dcae'], sun: [0.8, 0.18], light: '255,232,176', haze: '226,222,198',
      far: '#a8b5a6', far2: '#8fa190', near: '#2c3f2a',
      earth: '#33261d', earth2: '#140e0a', stone: '#6d5b49', moss: '#87a046', moss2: '#3f5524', grass: '#9cb257',
      water: ['#a9c3bd', '#3f6f72', '#132a2e'],
      tree: 'round', amb: 'pollen', rays: 0.9,
    },
    quarry: {
      sky: ['#7e8f99', '#b4bdbd', '#d8d6cb'], sun: [0.24, 0.14], light: '236,240,236', haze: '204,210,208',
      far: '#9aa4a4', far2: '#7f8a8b', near: '#262e30',
      earth: '#3e3c38', earth2: '#141413', stone: '#85817a', moss: '#8d9a5c', moss2: '#4c5733', grass: '#a2ad6e',
      water: ['#9fb2b4', '#3d5a60', '#141f23'],
      tree: 'pine', amb: 'mist', rays: 0.35,
    },
    pond: {
      sky: ['#c9875a', '#ebb87c', '#f8e1aa'], sun: [0.6, 0.36], light: '255,206,128', haze: '244,206,150',
      far: '#c49a6c', far2: '#a6825a', near: '#2c2a17',
      earth: '#34251a', earth2: '#120c07', stone: '#76604a', moss: '#a8a64a', moss2: '#5c5a25', grass: '#c0b65a',
      water: ['#e3bf86', '#3f6a68', '#10272a'],
      tree: 'birch', amb: 'midges', rays: 1,
    },
    autumn: {
      sky: ['#9c5233', '#d98654', '#f1c38a'], sun: [0.3, 0.26], light: '255,196,128', haze: '236,176,128',
      far: '#b9805f', far2: '#9e6448', near: '#3a190f',
      earth: '#30201a', earth2: '#110a07', stone: '#6e5240', moss: '#a8803a', moss2: '#5c3e1b', grass: '#c99a4a',
      water: ['#d29b6f', '#3d5a5c', '#10201f'],
      tree: 'autumn', amb: 'leaves', rays: 0.8,
    },
    dusk: {
      sky: ['#121735', '#3a3758', '#c4705a'], sun: [0.72, 0.62], light: '255,186,130', haze: '150,120,150',
      far: '#423d5a', far2: '#332f49', near: '#100f1a',
      earth: '#1f1922', earth2: '#09070b', stone: '#4a3f4b', moss: '#56643f', moss2: '#2c3524', grass: '#6e7a52',
      water: ['#8a6e7e', '#253852', '#0a1220'],
      tree: 'pine', amb: 'fireflies', rays: 0.45,
    },
    marsh: {
      sky: ['#8fa39a', '#c9cdb2', '#e6dcb4'], sun: [0.7, 0.22], light: '246,226,180', haze: '200,206,180',
      far: '#93a08a', far2: '#7a8a72', near: '#253222',
      earth: '#2a2218', earth2: '#100c08', stone: '#625a48', moss: '#7e8f3e', moss2: '#3c4a22', grass: '#93a24e',
      water: ['#9db09a', '#36584e', '#0e2420'],
      tree: 'round', amb: 'midges', rays: 0.6,
    },
    coast: {
      sky: ['#6fa5c9', '#bcd7e3', '#f1e6cc'], sun: [0.75, 0.2], light: '255,240,210', haze: '214,228,232',
      far: '#9cb7c4', far2: '#7fa0ad', near: '#26332f',
      earth: '#5b4a36', earth2: '#1c160e', stone: '#9a8f7c', moss: '#b8b27a', moss2: '#6d6a40', grass: '#c2bd7c',
      water: ['#9cc6d2', '#2f6a80', '#0d2a36'], sea: true,
      tree: 'pine', amb: 'mist', rays: 0.7,
    },
    winter: {
      sky: ['#8aa3bf', '#c9d6e2', '#eef0ec'], sun: [0.3, 0.28], light: '240,244,255', haze: '220,228,238',
      far: '#b4c2d0', far2: '#9aacbd', near: '#2a3440',
      earth: '#3b3936', earth2: '#151515', stone: '#8c8e92', moss: '#9aa4a8', moss2: '#5a6670', grass: '#b5bdb2',
      water: ['#bcd2e0', '#4f7590', '#152636'],
      tree: 'pine', amb: 'mist', rays: 0.4,
    },
    scrap: {
      sky: ['#8a8072', '#c6b496', '#e9d2a6'], sun: [0.62, 0.3], light: '255,214,160', haze: '214,196,168',
      far: '#a59680', far2: '#8a7c68', near: '#2c241c',
      earth: '#3a2c22', earth2: '#130e0a', stone: '#7a6a58', moss: '#8d8a4c', moss2: '#4d4a28', grass: '#a39a5a',
      water: ['#a8a080', '#4a5a4c', '#141c18'],
      tree: 'round', amb: 'mist', rays: 0.7,
    },
    halloween: {
      sky: ['#0d0a1f', '#2e1d45', '#c0582c'], sun: [0.72, 0.22], light: '200,210,255', haze: '96,70,110', moon: true,
      far: '#2c2440', far2: '#211a32', near: '#0b0910',
      earth: '#1d1517', earth2: '#08060a', stone: '#4a4450', moss: '#4a5536', moss2: '#252c1c', grass: '#5a5f3c',
      water: ['#5a4a70', '#1c2238', '#080a14'],
      tree: 'dead', amb: 'wisps', rays: 0.2,
    },
    lighthouse: {
      sky: ['#141c2c', '#2c3a50', '#5a6474'], sun: [0.2, 0.3], light: '220,230,255', haze: '80,94,110', sea: true,
      far: '#2e3a48', far2: '#232d3a', near: '#0c1117',
      earth: '#2a2622', earth2: '#0c0a09', stone: '#5a5c60', moss: '#50604a', moss2: '#283024', grass: '#6a7458',
      water: ['#5a7080', '#1c3444', '#08141c'],
      tree: 'pine', amb: 'mist', rays: 0.3,
    },
    aurora: {
      sky: ['#06101e', '#173248', '#3c6a6a'], sun: [0.65, 0.2], light: '200,240,230', haze: '60,90,100', moon: true, aurora: true,
      far: '#1e3442', far2: '#162836', near: '#081016',
      earth: '#24262c', earth2: '#0a0a0e', stone: '#5c6470', moss: '#5a7a70', moss2: '#2a3c38', grass: '#8aa49a',
      water: ['#4a7a8a', '#163848', '#06121a'],
      tree: 'pine', amb: 'fireflies', rays: 0.15,
    },
  };
  FF.THEMES = THEMES;

  // Wie viel Wolle hat eine Figur gerade abgerollt? Ihre Hälfte des gemeinsamen Fadens, ihr Lasso und die
  // Knoten-Fäden, die sie geknüpft hat. Daraus folgt, wie dick sie noch ist (1 = voll, bis 0.38 = fast nur Gerüst).
  // Weich nachgeführt, damit die Figur sichtbar ab- und wieder aufwickelt.
  FF.yarnFill = function (g, p, dt) {
    let used = 0;
    if (g.tetherOn) used += g.tether.total / 2;
    if (p.lasso) used += p.lasso.total;
    for (const b of g.world.bridges) if (b.owner === p.id) used += Math.hypot(b.bx - b.ax, b.by - b.ay);
    const target = 1 - FF.clamp((used - 20) / 540, 0, 1) * 0.62;
    if (p._fill === undefined) p._fill = target;
    p._fill += (target - p._fill) * Math.min(1, (dt || 0) * 5);
    p._spin = (p._spin || 0) + (used - (p._used === undefined ? used : p._used)) * 0.05;
    p._used = used;
    return p._fill;
  };

  // Kamera und 2D-Überlagerung für die 3D-Grafik: Hinweistafeln, Lasso-Ziele, Funken, Teilchen in der Luft,
  // Pfeil zur Figur außerhalb des Bildes. Die Welt selbst zeichnet render3d.js.
  class Renderer {
    constructor(cv) {
      this.cv = cv;
      this.ctx = cv.getContext('2d');
      this.cam = { x: 0, y: 0, h: 560 };
      this.t = 0;
      this.level = null;
      this.keyLabels = null;
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
      const v = FF.viewSize(this.cv);
      this.cv.width = Math.max(320, Math.round(v.w * dpr));
      this.cv.height = Math.max(240, Math.round(v.h * dpr));
      this.cssW = v.w; this.cssH = v.h;
      this.W = this.cv.width; this.H = this.cv.height;
      this.dpr = dpr;
    }

    prepare(g) {
      if (this.level === g.L && this.game === g) return;
      const fresh = this.level !== g.L;
      this.level = g.L; this.game = g;
      this.th = THEMES[g.L.theme];
      if (!fresh) return;
      const rnd = FF.rng(g.levelIndex * 7919 + 13);
      this.amb = [];
      for (let i = 0; i < 46; i++) this.amb.push({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.8, p: rnd() * TAU, s: 0.5 + rnd() });
      this.snap = true;
    }

    updateCamera(g, dt, opts) {
      const P = g.players, L = g.L;
      const aspect = this.W / this.H;
      let tx, ty, th = 520;
      if (opts && opts.pan) {
        const span = L.width - 600;
        tx = 300 + (Math.sin(this.t * 0.05) * 0.5 + 0.5) * span;
        ty = L.spawn[1] - 140;
        th = 620;
      } else if (g.mode === 'solo') {
        const a = P[g.active];
        tx = a.x + a.w / 2 + FF.clamp(a.vx, -300, 300) * 0.15;
        ty = a.y + a.h / 2 - 24;
      } else {
        const vis = P.filter((p) => !p.merged);
        const xs = vis.map((p) => p.x + p.w / 2), ys = vis.map((p) => p.y + p.h / 2);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        tx = (x0 + x1) / 2; ty = (y0 + y1) / 2 - 30;
        th = FF.clamp(Math.max((x1 - x0 + 260) / aspect, y1 - y0 + 280), 540, 860);
      }
      // Kleine Bildschirme etwas näher heranholen, damit die Figuren gut sichtbar bleiben.
      if (!(opts && opts.pan) && this.H / this.dpr < 520) th *= 0.82;
      th *= this.zoom || 1;
      th = Math.min(1100, Math.max(th, 430 / aspect));
      const c = this.cam;
      if (this.snap) { c.x = tx; c.y = ty; c.h = th; this.snap = false; }
      const k = 1 - Math.exp(-dt * 5), kh = 1 - Math.exp(-dt * 2);
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.h += (th - c.h) * kh;
      const vw = c.h * aspect;
      c.x = vw >= L.width ? L.width / 2 : FF.clamp(c.x, vw / 2, L.width - vw / 2);
      c.y = FF.clamp(c.y, c.h / 2 - 260, L.height - c.h / 2);
    }

    layoutLine(ctx, line, labels) {
      const parts = [];
      const re = /\{(\w+)\}/g;
      let last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) parts.push({ t: line.slice(last, m.index) });
        // "A D/J L": Leerzeichen trennen Tasten, "/" trennt die beiden Spieler.
        const lab = labels[m[1]] || m[1];
        lab.split('/').forEach((grp, gi) => {
          if (gi) parts.push({ t: ' / ' });
          for (const k of grp.split(' ')) if (k) parts.push({ key: k });
        });
        last = re.lastIndex;
      }
      if (last < line.length) parts.push({ t: line.slice(last) });
      let w = 0;
      for (const p of parts) {
        if (p.key) { ctx.font = '800 9px Nunito, system-ui, sans-serif'; p.w = Math.max(15, ctx.measureText(p.key).width + 8) + 3; }
        else { ctx.font = '600 12px Nunito, system-ui, sans-serif'; p.w = ctx.measureText(p.t).width; }
        w += p.w;
      }
      return { parts, w };
    }

    drawSignBubble(ctx, s, g) {
      const tx = FF.SIGNS[s.key];
      if (!tx) return;
      const text = tx[g.mode] || tx.all || '';
      const labels = (this.keyLabels && this.keyLabels(g.mode)) || {};
      const lines = text.split('\n').map((l) => this.layoutLine(ctx, l, labels));
      const w = Math.max(...lines.map((l) => l.w)) + 22, lh = 17, h = lines.length * lh + 14;
      const a = s.show;
      // Im Bild halten: links/rechts mit Abstand zum Rand, oben unterhalb der Anzeige-Leiste
      const px = (this.dpr || 1) / (this.sc || 1);
      const top = this.cam.y - this.cam.h / 2 + 64 * px;
      const x = FF.clamp(s.x - w / 2, this.view.x0 + 50, this.view.x1 - 50 - w);
      const y = Math.max(top, s.y - 128 - h) - (1 - a) * 8;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(28,24,30,0.86)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 7) : ctx.rect(x, y, w, h); ctx.fill();
      ctx.strokeStyle = 'rgba(240,230,210,0.45)'; ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 5) : ctx.rect(x + 3, y + 3, w - 6, h - 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(28,24,30,0.86)';
      ctx.beginPath(); ctx.moveTo(s.x - 6, y + h); ctx.lineTo(s.x, y + h + 7); ctx.lineTo(s.x + 6, y + h); ctx.fill();
      ctx.strokeStyle = 'rgba(28,24,30,0.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
      if (s.y - 44 > y + h + 8) { ctx.beginPath(); ctx.moveTo(s.x, y + h + 8); ctx.lineTo(s.x, s.y - 44); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.textBaseline = 'middle';
      lines.forEach((l, i) => {
        let cx = x + (w - l.w) / 2;
        const cy = y + 7 + lh * i + lh / 2;
        for (const p of l.parts) {
          if (p.key) {
            const kw = p.w - 3;
            ctx.fillStyle = '#efe4cc';
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx, cy - 7.5, kw, 15, 3) : ctx.rect(cx, cy - 7.5, kw, 15); ctx.fill();
            ctx.fillStyle = '#b9aa8c'; ctx.fillRect(cx + 1, cy + 5.5, kw - 2, 2);
            ctx.fillStyle = '#2a2026';
            ctx.font = '800 9px Nunito, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.key, cx + kw / 2, cy);
            ctx.textAlign = 'left';
          } else {
            ctx.fillStyle = '#f3eadb';
            ctx.font = '600 12px Nunito, system-ui, sans-serif';
            ctx.fillText(p.t, cx, cy + 0.5);
          }
          cx += p.w;
        }
      });
      ctx.globalAlpha = 1;
    }

    drawTargets(ctx, g) {
      for (const p of g.players) {
        if (p.merged || p.lasso) continue;
        if (g.mode === 'solo' && p.id !== g.active) continue;
        const a = g.lassoTarget(p);
        if (!a) continue;
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
        ctx.strokeStyle = FF.COLORS_LIGHT[p.id];
        ctx.globalAlpha = 0.45 + pulse * 0.45;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -this.t * 18;
        ctx.beginPath(); ctx.arc(a.x, a.y + (a.post ? 0 : 1), 11 + pulse * 3 + p.id * 4, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    drawOffscreen(ctx, g, sc) {
      const o = g.players[1 - g.active];
      if (o.merged) return;
      const W = this.W, H = this.H, cam = this.cam;
      const sx = (o.x + o.w / 2 - cam.x) * sc + W / 2, sy = (o.y + o.h / 2 - cam.y) * sc + H / 2;
      const m = 34 * this.dpr;
      if (sx > m && sx < W - m && sy > m && sy < H - m) return;
      const x = FF.clamp(sx, m, W - m), y = FF.clamp(sy, m, H - m);
      const a = Math.atan2(sy - y, sx - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(20,16,22,0.6)';
      ctx.beginPath(); ctx.arc(0, 0, 15 * this.dpr, 0, TAU); ctx.fill();
      ctx.fillStyle = FF.COLORS[o.id];
      ctx.beginPath(); ctx.arc(0, 0, 8 * this.dpr, 0, TAU); ctx.fill();
      ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(19 * this.dpr, 0); ctx.lineTo(11 * this.dpr, -6 * this.dpr); ctx.lineTo(11 * this.dpr, 6 * this.dpr); ctx.fill();
      ctx.restore();
    }

    drawFx(ctx, g) {
      for (const e of g.fx) {
        const k = e.t / e.life;
        if (e.kind === 'drop') {
          const x = e.x + e.vx * e.t, y = e.y + e.vy * e.t + 450 * e.t * e.t;
          ctx.fillStyle = `rgba(220,240,250,${1 - k})`;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
        } else if (e.kind === 'dust') {
          const x = e.x + e.vx * e.t, y = e.y + e.vy * e.t;
          ctx.fillStyle = `rgba(220,205,180,${0.5 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(x, y - 2, 2 + k * 4, 0, TAU); ctx.fill();
        } else if (e.kind === 'spark') {
          const x = e.x + e.vx * e.t, y = e.y + e.vy * e.t;
          ctx.fillStyle = `rgba(255,230,150,${1 - k})`;
          ctx.beginPath(); ctx.arc(x, y, 2 * (1 - k) + 0.5, 0, TAU); ctx.fill();
        }
      }
    }

    drawAmbient(ctx, g, sc) {
      const kind = this.th.amb, cam = this.cam, t = this.t;
      const vw = cam.h * (this.W / this.H), vh = cam.h;
      for (const a of this.amb) {
        let x, y;
        if (kind === 'leaves') {
          x = cam.x - vw / 2 + ((a.x * vw * 1.3 + t * 26 * a.s + Math.sin(t * a.s + a.p) * 30 - cam.x * 0.3) % (vw * 1.3) + vw * 1.3) % (vw * 1.3) - vw * 0.15;
          y = cam.y - vh / 2 + ((a.y * vh + t * 34 * a.s) % vh);
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 * a.s + a.p);
          ctx.fillStyle = a.s > 1 ? '#d9822f' : '#b6492a';
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.ellipse(0, 0, 3.5 * a.z + 1, 1.8 * a.z + 0.6, 0, 0, TAU); ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1;
          continue;
        }
        x = cam.x - vw / 2 + ((a.x * vw + Math.sin(t * 0.4 * a.s + a.p) * 30 - cam.x * 0.15 * a.z) % vw + vw) % vw;
        y = cam.y - vh / 2 + ((a.y * vh + Math.cos(t * 0.3 * a.s + a.p) * 20 - (kind === 'pollen' ? t * 6 * a.s : 0)) % vh + vh) % vh;
        if (kind === 'wisps') {
          const on = 0.5 + 0.5 * Math.sin(t * 1.1 * a.s + a.p * 3);
          const c = a.p > 3 ? '255,150,60' : '140,255,170';
          const gl = ctx.createRadialGradient(x, y, 0, x, y, 14);
          gl.addColorStop(0, `rgba(${c},${0.75 * on})`); gl.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 14, 0, TAU); ctx.fill();
        } else if (kind === 'fireflies') {
          const on = Math.max(0, Math.sin(t * 1.4 * a.s + a.p * 3));
          const gl = ctx.createRadialGradient(x, y, 0, x, y, 9);
          gl.addColorStop(0, `rgba(255,236,140,${0.8 * on})`); gl.addColorStop(1, 'rgba(255,236,140,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        } else if (kind === 'mist') {
          ctx.fillStyle = 'rgba(235,240,240,0.05)';
          ctx.beginPath(); ctx.ellipse(x, y, 60 * a.z, 14 * a.z, 0, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = kind === 'midges' ? 'rgba(40,30,20,0.55)' : 'rgba(255,250,225,0.7)';
          ctx.beginPath(); ctx.arc(x, y, kind === 'midges' ? 0.9 : 1.3 * a.z, 0, TAU); ctx.fill();
        }
      }
    }

    // Fehlwurf: Das Lasso fliegt kurz ins Leere und fällt herunter
    drawLasso(ctx, p) {
      if (!p.miss) return;
      const cx = p.x + p.w / 2, cy = p.y + p.h * 0.5;
      const k = p.miss.t / 0.35;
      const ex = cx + p.miss.dir * (40 + k * 60), ey = cy - 50 + k * k * 90;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = FF.COLORS[p.id]; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + p.miss.dir * 30, cy - 60, ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  FF.Renderer = Renderer;
})();
