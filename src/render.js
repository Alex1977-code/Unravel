'use strict';
// Darstellung auf dem Canvas: Hintergrund, Welt, Figuren, Faden, Effekte.
(function () {
  const FF = globalThis.FF;
  const TAU = Math.PI * 2;

  FF.COLORS = ['#d4462f', '#3a73c9'];
  FF.COLORS_DARK = ['#8f2a1c', '#21477f'];
  FF.COLORS_LIGHT = ['#f08a6e', '#7fa9ea'];

  const THEMES = {
    garden: {
      sky: ['#86b6cf', '#cfe0d6', '#f2dcb0'], sun: [0.78, 0.2, 'rgba(255,240,200,'], far: '#9fb7ab', mid: '#6f9068', near: '#42613d',
      earth: '#47352a', earth2: '#2c211a', stone: '#5c4838', grass: '#8bb04d', grass2: '#62873a', flower: ['#f3e3a0', '#f2a7b5', '#ffffff'],
      water: ['#5b9bab', '#24505e'], tree: 'round', amb: 'pollen', fog: 'rgba(242,232,206,0.22)',
    },
    quarry: {
      sky: ['#6f879b', '#a9b8bf', '#d9ddd6'], sun: [0.22, 0.16, 'rgba(250,248,236,'], far: '#8996a0', mid: '#66737c', near: '#454f56',
      earth: '#5d5a54', earth2: '#3a3835', stone: '#77736b', grass: '#98a564', grass2: '#6f7c45', flower: ['#e8e6d8'],
      water: ['#5f8a96', '#2b4a55'], tree: 'pine', amb: 'mist', fog: 'rgba(220,226,226,0.28)',
    },
    pond: {
      sky: ['#e3955c', '#f0c58c', '#f7e6bd'], sun: [0.62, 0.34, 'rgba(255,236,180,'], far: '#c79b72', mid: '#8c7d4f', near: '#5b5b34',
      earth: '#46331f', earth2: '#2b1f14', stone: '#5e4a33', grass: '#a6ab4b', grass2: '#7d8233', flower: ['#f7dc7a', '#ffffff'],
      water: ['#4f8f96', '#1f4a52'], tree: 'birch', amb: 'midges', fog: 'rgba(255,226,180,0.2)',
    },
    autumn: {
      sky: ['#b8603d', '#e39a68', '#f4cf98'], sun: [0.3, 0.28, 'rgba(255,226,170,'], far: '#bf8a6c', mid: '#9a4f2b', near: '#62301e',
      earth: '#3d281d', earth2: '#251810', stone: '#56392a', grass: '#b8863c', grass2: '#8c5e28', flower: ['#e9b44c', '#d4572f'],
      water: ['#4f7680', '#22404a'], tree: 'autumn', amb: 'leaves', fog: 'rgba(250,210,160,0.18)',
    },
    dusk: {
      sky: ['#1d2346', '#4a4566', '#c98066'], sun: [0.72, 0.6, 'rgba(255,205,150,'], far: '#47425f', mid: '#33314b', near: '#211f33',
      earth: '#2b2330', earth2: '#18131c', stone: '#3c3240', grass: '#5f6c4f', grass2: '#414b38', flower: ['#ffe9a8'],
      water: ['#3f5f7d', '#16263a'], tree: 'pine', amb: 'fireflies', fog: 'rgba(180,150,190,0.14)',
    },
  };
  FF.THEMES = THEMES;

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
      this.cv.width = Math.max(320, Math.round(innerWidth * dpr));
      this.cv.height = Math.max(240, Math.round(innerHeight * dpr));
      this.W = this.cv.width; this.H = this.cv.height;
      this.dpr = dpr;
    }

    prepare(g) {
      if (this.level === g.L && this.game === g) return;
      const fresh = this.level !== g.L;
      this.level = g.L; this.game = g;
      this.th = THEMES[g.L.theme];
      if (fresh) {
        const rnd = FF.rng(g.levelIndex * 7919 + 13);
        this.deco = g.world.solids.map((r) => {
          const blades = [], stones = [], flowers = [];
          if (r.w < 2000) {
            for (let x = r.x + 2; x < r.x + r.w - 1; x += 3 + rnd() * 3) {
              blades.push({ x, h: 3 + rnd() * 7, l: (rnd() - 0.5) * 5, c: rnd() < 0.5 });
              if (rnd() < 0.035) flowers.push({ x, h: 6 + rnd() * 6, c: Math.floor(rnd() * 10) });
            }
            const depth = Math.min(r.h, 320);
            const n = Math.floor((r.w * depth) / 1600);
            for (let i = 0; i < n; i++) {
              stones.push({ x: r.x + 4 + rnd() * (r.w - 8), y: r.y + 14 + rnd() * (depth - 18), rx: 2 + rnd() * 6, ry: 1.5 + rnd() * 3.5, a: 0.25 + rnd() * 0.45 });
            }
          }
          return { blades, stones, flowers };
        });
        this.thornDeco = g.world.thorns.map((t) => {
          const out = [];
          for (let i = 0; i < Math.max(3, t.w / 14); i++) {
            const x0 = t.x + rnd() * t.w;
            const pts = [];
            let x = x0, y = t.y + t.h;
            for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 14; y -= t.h * 0.12 + rnd() * 6; pts.push([x, y]); }
            out.push({ x0, pts });
          }
          return out;
        });
        this.amb = [];
        for (let i = 0; i < 46; i++) this.amb.push({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.8, p: rnd() * TAU, s: 0.5 + rnd() });
        this.snap = true;
      }
    }

    // ------------------------------------------------------------- Kamera
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
      th = Math.min(1100, Math.max(th, 430 / aspect));
      const c = this.cam;
      if (this.snap) { c.x = tx; c.y = ty; c.h = th; this.snap = false; }
      const k = 1 - Math.exp(-dt * 5), kh = 1 - Math.exp(-dt * 2);
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.h += (th - c.h) * kh;
      const vw = c.h * aspect;
      c.x = vw >= L.width ? L.width / 2 : FF.clamp(c.x, vw / 2, L.width - vw / 2);
      c.y = FF.clamp(c.y, c.h / 2 - 260, L.height - c.h / 2);
    }

    // ---------------------------------------------------------- Zeichnen
    draw(g, dt, opts = {}) {
      this.t += dt;
      this.prepare(g);
      this.updateCamera(g, dt, opts);
      const ctx = this.ctx, W = this.W, H = this.H, cam = this.cam;
      const sc = H / cam.h;
      this.sc = sc;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawBackground(ctx, g, sc);

      ctx.setTransform(sc, 0, 0, sc, W / 2 - cam.x * sc, H / 2 - cam.y * sc);
      const view = { x0: cam.x - W / 2 / sc - 40, x1: cam.x + W / 2 / sc + 40, y0: cam.y - cam.h / 2 - 40, y1: cam.y + cam.h / 2 + 40 };
      this.view = view;
      const Wd = g.world;

      this.drawAmbient(ctx, g, sc);
      this.drawGoal(ctx, g);
      for (const cp of g.checkpoints) this.drawCheckpoint(ctx, cp);
      for (const s of g.signs) this.drawSignPost(ctx, s);
      Wd.solids.forEach((r, i) => { if (this.vis(r)) this.drawSolid(ctx, r, this.deco[i]); });
      for (const o of Wd.oneways) this.drawPlank(ctx, o);
      Wd.thorns.forEach((t, i) => this.drawThorns(ctx, t, this.thornDeco[i]));
      for (const a of Wd.anchors) this.drawAnchor(ctx, a);
      for (const c of Wd.crates) if (this.vis(c)) this.drawCrate(ctx, c);
      for (const b of Wd.bridges) this.drawBridge(ctx, b, g);
      for (const b of g.beads) this.drawBead(ctx, b);
      this.drawTargets(ctx, g);
      if (g.tetherOn) this.drawTether(ctx, g);
      const order = [...g.players].sort((a, b) => (a.id === g.active) - (b.id === g.active));
      for (const p of order) if (p.lasso || (p.miss && !p.lasso)) this.drawLasso(ctx, p);
      for (const p of order) if (!p.merged) this.drawYarny(ctx, p, g);
      this.drawFx(ctx, g);
      for (const w of Wd.water) if (this.vis(w)) this.drawWater(ctx, w);
      if (!opts.pan) for (const s of g.signs) if (s.show > 0.01) this.drawSignBubble(ctx, s, g);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.drawForeground(ctx, g, sc);
      if (g.mode === 'solo' && !opts.pan) this.drawOffscreen(ctx, g, sc);
      if (g.state === 'dying') {
        const t = g.stateT;
        const a = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.45);
        ctx.fillStyle = `rgba(16,14,22,${Math.min(1, a) * 0.92})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    vis(r) {
      const v = this.view;
      return r.x < v.x1 && r.x + r.w > v.x0 && r.y < v.y1 && r.y + r.h > v.y0;
    }

    // -------------------------------------------------------- Hintergrund
    drawBackground(ctx, g, sc) {
      const th = this.th, W = this.W, H = this.H, cam = this.cam, L = g.L;
      const sk = ctx.createLinearGradient(0, 0, 0, H);
      sk.addColorStop(0, th.sky[0]); sk.addColorStop(0.55, th.sky[1]); sk.addColorStop(1, th.sky[2]);
      ctx.fillStyle = sk; ctx.fillRect(0, 0, W, H);

      const sx = th.sun[0] * W - (cam.x / L.width - 0.5) * W * 0.06, sy = th.sun[1] * H;
      const sr = Math.max(W, H) * 0.42;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, th.sun[2] + '0.95)'); sg.addColorStop(0.07, th.sun[2] + '0.75)');
      sg.addColorStop(0.2, th.sun[2] + '0.25)'); sg.addColorStop(1, th.sun[2] + '0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

      const ground = L.spawn[1];
      const layerY = (worldY, f) => H / 2 + (worldY - cam.y) * sc * f;
      const lx = (sxp, f) => cam.x * f + (sxp - W / 2) / sc;

      // Ferne Hügel
      const seed = g.levelIndex + 1;
      ctx.fillStyle = th.far;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) {
        const X = lx(x, 0.12);
        const y = layerY(ground - 210, 0.12) - (FF.noise1(X * 0.006, seed) * 110 + FF.noise1(X * 0.02, seed + 3) * 26) * sc;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = th.fog; ctx.fillRect(0, 0, W, H);

      // Mittlere Baumreihe
      this.drawTreeRow(ctx, g, sc, 0.32, layerY(ground - 90, 0.32), th.mid, 1, 150);
      ctx.fillStyle = th.fog; ctx.fillRect(0, 0, W, H);
      // Nahe Reihe
      this.drawTreeRow(ctx, g, sc, 0.58, layerY(ground - 10, 0.58), th.near, 2, 210);
    }

    drawTreeRow(ctx, g, sc, f, baseY, color, salt, spacing) {
      const W = this.W, H = this.H, cam = this.cam, th = this.th;
      const s = sc * (0.55 + f * 0.6);
      const X0 = cam.x * f - W / 2 / sc - 200, X1 = cam.x * f + W / 2 / sc + 200;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      // Boden der Reihe
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W + 10; x += 10) {
        const X = cam.x * f + (x - W / 2) / sc;
        ctx.lineTo(x, baseY - FF.noise1(X * 0.01, salt * 9) * 26 * s);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      const k0 = Math.floor(X0 / spacing), k1 = Math.ceil(X1 / spacing);
      for (let k = k0; k <= k1; k++) {
        const r = FF.hash(k * 13.7 + salt * 101);
        if (r < 0.18) continue;
        const X = k * spacing + FF.hash(k * 3.1 + salt) * spacing * 0.7;
        const x = (X - cam.x * f) * sc + W / 2;
        const y = baseY - FF.noise1(X * 0.01, salt * 9) * 26 * s + 6 * s;
        const h = (60 + FF.hash(k * 7.7 + salt) * 90) * s;
        this.drawTree(ctx, x, y, h, th.tree, k + salt * 1000, color);
      }
    }

    drawTree(ctx, x, y, h, kind, seed, color) {
      const r = (n) => FF.hash(seed * 1.37 + n * 17.1);
      ctx.fillStyle = color;
      if (kind === 'pine') {
        const w = h * 0.36;
        ctx.fillRect(x - h * 0.025, y - h * 0.25, h * 0.05, h * 0.25);
        for (let i = 0; i < 4; i++) {
          const yy = y - h * 0.18 - i * h * 0.2, ww = w * (1 - i * 0.2);
          ctx.beginPath(); ctx.moveTo(x - ww, yy); ctx.lineTo(x, yy - h * 0.34); ctx.lineTo(x + ww, yy); ctx.closePath(); ctx.fill();
        }
      } else if (kind === 'birch') {
        ctx.fillRect(x - h * 0.02, y - h * 0.75, h * 0.04, h * 0.75);
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.ellipse(x + (r(i) - 0.5) * h * 0.4, y - h * (0.7 + r(i + 9) * 0.3), h * 0.16, h * 0.22, 0, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(x - h * 0.04, y); ctx.lineTo(x - h * 0.02, y - h * 0.55); ctx.lineTo(x + h * 0.02, y - h * 0.55); ctx.lineTo(x + h * 0.04, y);
        ctx.fill();
        const n = kind === 'autumn' ? 6 : 5;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(x + (r(i) - 0.5) * h * 0.55, y - h * (0.55 + r(i + 4) * 0.4), h * (0.16 + r(i + 7) * 0.12), 0, TAU);
          ctx.fill();
        }
      }
    }

    drawForeground(ctx, g, sc) {
      const W = this.W, H = this.H;
      const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78);
      v.addColorStop(0, 'rgba(10,8,14,0)');
      v.addColorStop(1, 'rgba(10,8,14,0.42)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }

    // ------------------------------------------------------------ Gelände
    drawSolid(ctx, r, d) {
      const th = this.th;
      const v = this.view;
      const y1 = Math.min(r.y + r.h, v.y1 + 20);
      const gr = ctx.createLinearGradient(0, r.y, 0, r.y + 260);
      gr.addColorStop(0, th.earth); gr.addColorStop(1, th.earth2);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(r.x, r.y, r.w, y1 - r.y, [5, 5, 0, 0]) : ctx.rect(r.x, r.y, r.w, y1 - r.y);
      ctx.fill();
      ctx.fillStyle = th.stone;
      for (const s of d.stones) {
        if (s.y > v.y1 || s.y < v.y0) continue;
        ctx.globalAlpha = s.a;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Seitenkanten etwas dunkler
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(r.x, r.y + 4, 3, y1 - r.y - 4);
      ctx.fillRect(r.x + r.w - 3, r.y + 4, 3, y1 - r.y - 4);
      // Grasnarbe
      if (r.y > v.y0 - 20 && r.y < v.y1 + 20 && r.w < 2000) {
        ctx.fillStyle = th.grass2;
        ctx.beginPath();
        ctx.moveTo(r.x - 1, r.y);
        for (let x = r.x; x <= r.x + r.w; x += 9) ctx.lineTo(Math.min(x, r.x + r.w + 1), r.y + 5 + Math.sin(x * 0.7) * 1.6);
        ctx.lineTo(r.x + r.w + 1, r.y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = th.grass;
        ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, 3);
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        const sway = Math.sin(this.t * 1.6) * 1.2;
        ctx.strokeStyle = th.grass; ctx.beginPath();
        for (const b of d.blades) if (b.c) { ctx.moveTo(b.x, r.y + 1); ctx.lineTo(b.x + b.l + sway, r.y - b.h); }
        ctx.stroke();
        ctx.strokeStyle = th.grass2; ctx.beginPath();
        for (const b of d.blades) if (!b.c) { ctx.moveTo(b.x, r.y + 1); ctx.lineTo(b.x + b.l + sway * 0.8, r.y - b.h * 0.8); }
        ctx.stroke();
        for (const f of d.flowers) {
          ctx.strokeStyle = th.grass2; ctx.beginPath(); ctx.moveTo(f.x, r.y); ctx.lineTo(f.x + sway, r.y - f.h); ctx.stroke();
          ctx.fillStyle = th.flower[f.c % th.flower.length];
          ctx.beginPath(); ctx.arc(f.x + sway, r.y - f.h, 2.1, 0, TAU); ctx.fill();
        }
      }
    }

    drawPlank(ctx, o) {
      ctx.fillStyle = '#7a5434';
      ctx.fillRect(o.x, o.y, o.w, 7);
      ctx.fillStyle = '#9b6f45';
      ctx.fillRect(o.x, o.y, o.w, 2);
      ctx.fillStyle = '#3b2716';
      ctx.fillRect(o.x + 6, o.y + 7, 4, 10); ctx.fillRect(o.x + o.w - 10, o.y + 7, 4, 10);
      ctx.beginPath(); ctx.arc(o.x + 4, o.y + 4, 1.1, 0, TAU); ctx.arc(o.x + o.w - 4, o.y + 4, 1.1, 0, TAU); ctx.fill();
    }

    drawThorns(ctx, t, deco) {
      ctx.fillStyle = '#2a1916';
      ctx.fillRect(t.x, t.y + t.h * 0.55, t.w, t.h * 0.45);
      ctx.strokeStyle = '#3a211b';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (const s of deco) {
        ctx.beginPath(); ctx.moveTo(s.x0, t.y + t.h);
        for (const [x, y] of s.pts) ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#5a2a22';
      for (const s of deco) {
        for (let i = 0; i < s.pts.length; i++) {
          const [x, y] = s.pts[i];
          const d = i % 2 ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(x - 1.5, y); ctx.lineTo(x + d * 6, y - 3); ctx.lineTo(x + 1.5, y + 1); ctx.fill();
        }
      }
      ctx.fillStyle = '#9b2f3a';
      for (const s of deco) { const [x, y] = s.pts[s.pts.length - 1]; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill(); }
    }

    drawAnchor(ctx, a) {
      if (a.post) {
        ctx.fillStyle = '#6b4a2c';
        ctx.fillRect(a.x - 3.5, a.y - 2, 7, 22);
        ctx.fillStyle = '#8c6440';
        ctx.fillRect(a.x - 3.5, a.y - 2, 2.5, 22);
        ctx.fillStyle = '#4b321d';
        ctx.beginPath(); ctx.ellipse(a.x, a.y - 2, 4.6, 2.2, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#c9b48a'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(a.x, a.y + 3, 4.2, 1.6, 0, 0, TAU); ctx.stroke();
      } else {
        ctx.strokeStyle = '#4a3322'; ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(a.x - 44, a.y - 10); ctx.quadraticCurveTo(a.x - 16, a.y - 4, a.x + 14, a.y - 9); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x - 20, a.y - 7); ctx.lineTo(a.x - 28, a.y - 20); ctx.stroke();
        ctx.fillStyle = this.th.grass2;
        for (const [dx, dy, r] of [[-38, -14, 6], [-28, -22, 5], [10, -13, 5], [-46, -8, 4]]) {
          ctx.beginPath(); ctx.ellipse(a.x + dx, a.y + dy, r, r * 0.6, -0.4, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = '#3b2a1c'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 7); ctx.lineTo(a.x, a.y - 3); ctx.stroke();
        ctx.strokeStyle = '#c8a86a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(a.x, a.y + 1, 4, 0, TAU); ctx.stroke();
      }
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

    drawCrate(ctx, c) {
      const strain = c.strain > 0 ? Math.sin(this.t * 60) * 0.8 : 0;
      const x = c.x + strain, y = c.y;
      ctx.fillStyle = c.heavy ? '#6d5038' : '#94683f';
      ctx.fillRect(x, y, c.w, c.h);
      ctx.strokeStyle = c.heavy ? '#3f2c1d' : '#5c3d22';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, c.w - 3, c.h - 3);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) { ctx.moveTo(x + 3, y + (c.h * i) / 4); ctx.lineTo(x + c.w - 3, y + (c.h * i) / 4); }
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + c.w - 4, y + c.h - 4); ctx.stroke();
      if (c.heavy) {
        ctx.fillStyle = '#9aa0a3';
        for (const [dx, dy] of [[0, 0], [c.w - 9, 0], [0, c.h - 9], [c.w - 9, c.h - 9]]) ctx.fillRect(x + dx, y + dy, 9, 9);
        ctx.fillStyle = '#5c6366';
        for (const [dx, dy] of [[4, 4], [c.w - 5, 4], [4, c.h - 5], [c.w - 5, c.h - 5]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.3, 0, TAU); ctx.fill(); }
      }
      if (c.floating) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x - 3, y + c.h * 0.45 - 1 + Math.sin(this.t * 3) * 1, c.w + 6, 2);
      }
    }

    drawBridge(ctx, b, g) {
      let load = null;
      for (const p of g.players) if (!p.merged && p.bridge === b && p.grounded) load = p.x + p.w / 2;
      const mx = (b.ax + b.bx) / 2, my = (b.ay + b.by) / 2;
      const sag = (load !== null ? 4 : 0) + Math.sin(this.t * 34) * b.wob * 7;
      const cx = load !== null ? load : mx;
      const cy = (load !== null ? FF.bridgeY(b, load) : my) + sag * 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = FF.COLORS_DARK[b.owner];
      ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.quadraticCurveTo(cx, cy, b.bx, b.by); ctx.stroke();
      ctx.strokeStyle = FF.COLORS[b.owner];
      ctx.lineWidth = 2.6;
      ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.quadraticCurveTo(cx, cy, b.bx, b.by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = FF.COLORS[b.owner];
      for (const [x, y] of [[b.ax, b.ay], [b.bx, b.by]]) { ctx.beginPath(); ctx.arc(x, y, 3.6, 0, TAU); ctx.fill(); }
    }

    drawBead(ctx, b) {
      if (b.got && b.t > 0.6) return;
      const bob = Math.sin(this.t * 2.4 + b.x * 0.05) * 3;
      const a = b.got ? 1 - b.t / 0.6 : 1;
      const y = b.y + bob - (b.got ? b.t * 40 : 0);
      ctx.globalAlpha = a;
      const gl = ctx.createRadialGradient(b.x, y, 0, b.x, y, 16);
      gl.addColorStop(0, 'rgba(255,236,170,0.75)'); gl.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(b.x, y, 16, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f4c95d';
      ctx.beginPath(); ctx.arc(b.x, y, 5.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c4862c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, y, 3, 0.4, 2.6); ctx.stroke();
      ctx.fillStyle = '#fff8dc';
      ctx.beginPath(); ctx.arc(b.x - 1.6, y - 1.8, 1.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawCheckpoint(ctx, cp) {
      const x = cp.x, y = cp.y;
      ctx.fillStyle = '#4d3522';
      ctx.fillRect(x - 2, y - 44, 4, 44);
      ctx.fillRect(x - 2, y - 44, 12, 3);
      ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 8, y - 41); ctx.lineTo(x + 8, y - 36); ctx.stroke();
      const lx = x + 8, ly = y - 28;
      if (cp.on) {
        const f = 0.85 + Math.sin(this.t * 9) * 0.08 + Math.sin(this.t * 23) * 0.05;
        const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 46 * f);
        gl.addColorStop(0, 'rgba(255,200,110,0.55)'); gl.addColorStop(1, 'rgba(255,200,110,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, ly, 46 * f, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = cp.on ? '#ffd27a' : '#a99f8e';
      ctx.fillRect(lx - 5, ly - 7, 10, 13);
      ctx.strokeStyle = '#2e2014'; ctx.lineWidth = 1.6;
      ctx.strokeRect(lx - 5, ly - 7, 10, 13);
      ctx.beginPath(); ctx.moveTo(lx, ly - 7); ctx.lineTo(lx, ly + 6); ctx.stroke();
    }

    drawGoal(ctx, g) {
      const x = g.goal.x, y = g.goal.y;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
      const won = g.state === 'won' ? Math.min(1, g.stateT) : 0;
      const R = 70 + pulse * 10 + won * 120;
      const gl = ctx.createRadialGradient(x, y - 26, 0, x, y - 26, R);
      gl.addColorStop(0, `rgba(255,226,160,${0.55 + won * 0.4})`); gl.addColorStop(1, 'rgba(255,226,160,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y - 26, R, 0, TAU); ctx.fill();
      // Großes Knäuel als Zuhause
      const r = 24;
      ctx.fillStyle = '#e9d6b2';
      ctx.beginPath(); ctx.arc(x, y - r, r, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y - r, r, 0, TAU); ctx.clip();
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = i % 2 ? FF.COLORS[0] : FF.COLORS[1];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        const a = i * 0.7 + this.t * 0.15;
        ctx.ellipse(x, y - r, r * 1.05, r * (0.25 + (i % 3) * 0.18), a, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = '#7d5a3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y - r, r, 0, TAU); ctx.stroke();
      // loser Faden
      ctx.strokeStyle = FF.COLORS[0]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - 6); ctx.bezierCurveTo(x + 40, y + 2, x + 46, y - 2, x + 60, y); ctx.stroke();
    }

    drawSignPost(ctx, s) {
      const x = s.x, y = s.y;
      ctx.fillStyle = '#5b3f27';
      ctx.fillRect(x - 2.5, y - 30, 5, 30);
      ctx.fillStyle = '#8a6440';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 16, y - 42, 32, 18, 3) : ctx.rect(x - 16, y - 42, 32, 18); ctx.fill();
      ctx.strokeStyle = '#4a321e'; ctx.lineWidth = 1.5; ctx.stroke();
      // Knäuel-Symbol
      ctx.fillStyle = '#e9d6b2';
      ctx.beginPath(); ctx.arc(x, y - 33, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = FF.COLORS[0]; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y - 33, 5, 2, 0.6, 0, TAU); ctx.stroke();
      ctx.strokeStyle = FF.COLORS[1];
      ctx.beginPath(); ctx.ellipse(x, y - 33, 5, 2, -0.6, 0, TAU); ctx.stroke();
    }

    // Text mit {taste}-Platzhaltern als Tastenkappen.
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
      const x = FF.clamp(s.x - w / 2, this.view.x0 + 50, this.view.x1 - 50 - w), y = s.y - 128 - h - (1 - a) * 8;
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
      ctx.beginPath(); ctx.moveTo(s.x, y + h + 8); ctx.lineTo(s.x, s.y - 44); ctx.stroke(); ctx.setLineDash([]);
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

    drawWater(ctx, w) {
      const th = this.th, t = this.t;
      const v = this.view;
      const x0 = Math.max(w.x, v.x0), x1 = Math.min(w.x + w.w, v.x1);
      const yb = Math.min(w.y + w.h, v.y1);
      const gr = ctx.createLinearGradient(0, w.y, 0, w.y + 200);
      gr.addColorStop(0, th.water[0]); gr.addColorStop(1, th.water[1]);
      ctx.fillStyle = gr;
      ctx.globalAlpha = 0.86;
      ctx.beginPath();
      ctx.moveTo(x0, yb);
      for (let x = x0; x <= x1 + 0.1; x += 6) ctx.lineTo(Math.min(x, x1), w.y + Math.sin(x * 0.045 + t * 2.2) * 1.6 + Math.sin(x * 0.11 - t * 1.3) * 0.8);
      ctx.lineTo(x1, yb); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 0.1; x += 6) {
        const y = w.y + Math.sin(x * 0.045 + t * 2.2) * 1.6 + Math.sin(x * 0.11 - t * 1.3) * 0.8;
        x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(Math.min(x, x1), y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 6; i++) {
        const sx = w.x + ((i * 97 + t * (w.flow || 8)) % w.w);
        if (sx < x0 || sx > x1) continue;
        ctx.fillRect(sx, w.y + 10 + (i % 3) * 14, 18, 1.5);
      }
    }

    // ------------------------------------------------------------- Faden
    yarnPath(ctx, pts, slack, sagK) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const L = Math.hypot(bx - ax, by - ay);
        const share = total > 0 ? (slack * L) / total : 0;
        const sag = Math.sqrt(Math.max(0, share) * Math.max(L, 1)) * sagK;
        ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by);
      }
    }

    drawTether(ctx, g) {
      const T = g.tether;
      const pts = T.points();
      const slack = Math.max(0, T.len - T.total);
      const [a, b] = [pts[0], pts[pts.length - 1]];
      const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      gr.addColorStop(0, FF.COLORS[0]); gr.addColorStop(1, FF.COLORS[1]);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(20,14,18,0.35)';
      ctx.lineWidth = 3.4;
      this.yarnPath(ctx, pts, Math.min(slack, 260), 0.75);
      ctx.stroke();
      ctx.strokeStyle = gr;
      ctx.lineWidth = 2;
      this.yarnPath(ctx, pts, Math.min(slack, 260), 0.75);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 4]);
      this.yarnPath(ctx, pts, Math.min(slack, 260), 0.75);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLasso(ctx, p) {
      const cx = p.x + p.w / 2, cy = p.y + p.h * 0.5;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (p.lasso) {
        const pts = p.lasso.points();
        const k = Math.min(1, p.throwT / 0.12);
        if (k < 1) {
          const a = pts[0], b = pts[pts.length - 1];
          const ex = a[0] + (b[0] - a[0]) * k, ey = a[1] + (b[1] - a[1]) * k - Math.sin(k * Math.PI) * 20;
          ctx.strokeStyle = FF.COLORS[p.id]; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + ex) / 2, Math.min(a[1], ey) - 10, ex, ey); ctx.stroke();
          return;
        }
        const slack = Math.max(0, p.lasso.len - p.lasso.total);
        ctx.strokeStyle = FF.COLORS_DARK[p.id]; ctx.lineWidth = 3.2;
        this.yarnPath(ctx, pts, Math.min(slack, 200), 0.7); ctx.stroke();
        ctx.strokeStyle = FF.COLORS[p.id]; ctx.lineWidth = 1.9;
        this.yarnPath(ctx, pts, Math.min(slack, 200), 0.7); ctx.stroke();
        const e = pts[pts.length - 1];
        ctx.beginPath(); ctx.arc(e[0], e[1] + 1, 4.6, 0, TAU); ctx.stroke();
      } else if (p.miss) {
        const k = p.miss.t / 0.35;
        const ex = cx + p.miss.dir * (40 + k * 60), ey = cy - 50 + k * k * 90;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = FF.COLORS[p.id]; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + p.miss.dir * 30, cy - 60, ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ------------------------------------------------------------ Figuren
    drawYarny(ctx, p, g) {
      const id = p.id, col = FF.COLORS[id], dark = FF.COLORS_DARK[id], light = FF.COLORS_LIGHT[id];
      const cx = p.x + p.w / 2, by = p.y + p.h;
      const f = p.face;
      const moving = p.grounded && Math.abs(p.vx) > 12;
      const hanging = !p.grounded && (p.lasso || p.onTether);
      const sw = moving ? Math.sin(p.walk * 1.9) : 0;
      const land = p.landT > 0 ? p.landT / 0.18 : 0;
      const squash = land * 3;
      const lean = p.grounded ? FF.clamp(p.vx / 165, -1, 1) * 0.12 : FF.clamp(p.vx / 400, -1, 1) * 0.25;
      const pass = g.players.find((q) => q.merged && q.carrier === p.id);
      const crouch = p.grip ? 4 : 0;

      ctx.save();
      ctx.translate(cx, by);
      ctx.rotate(lean);
      // heller Saum, damit die Figuren vor dunklem Hintergrund lesbar bleiben
      ctx.shadowColor = 'rgba(255,244,222,0.55)';
      ctx.shadowBlur = 5 * this.sc;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      if (p.ledge) ctx.translate(0, -2);
      const hipY = -10 + squash * 0.5 + crouch * 0.5, shY = -18 + squash + crouch;
      // Beine
      ctx.strokeStyle = dark; ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (!p.grounded && !p.ledge) {
        const k = hanging ? 0.5 : 1;
        ctx.moveTo(-1.5, hipY); ctx.lineTo(-3 - f * 2 * k, -2 + (hanging ? 3 : -2));
        ctx.moveTo(1.5, hipY); ctx.lineTo(3 + f * 3 * k, -3 + (hanging ? 4 : -4));
      } else if (p.grip) {
        ctx.moveTo(-1.5, hipY); ctx.lineTo(-6, 0); ctx.moveTo(1.5, hipY); ctx.lineTo(6, 0);
      } else {
        ctx.moveTo(-1, hipY); ctx.lineTo(-1 + sw * 6, -sw * sw * 1.5 + (sw > 0 ? -Math.abs(sw) * 1.2 : 0));
        ctx.moveTo(1, hipY); ctx.lineTo(1 - sw * 6, -sw * sw * 1.5 + (sw < 0 ? -Math.abs(sw) * 1.2 : 0));
      }
      ctx.stroke();

      // Körper: gewickelte Wolle
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, (hipY + shY) / 2 - 1, 5.6, (hipY - shY) / 2 + 3, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, (hipY + shY) / 2 - 1, 5.6, (hipY - shY) / 2 + 3, 0, 0, TAU); ctx.clip();
      ctx.strokeStyle = dark; ctx.lineWidth = 0.9;
      for (let i = -3; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(-7, shY + i * 3); ctx.lineTo(7, shY + i * 3 - 4); ctx.stroke(); }
      ctx.strokeStyle = light; ctx.lineWidth = 0.6;
      for (let i = -3; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(-7, shY + i * 3 + 1.3); ctx.lineTo(7, shY + i * 3 - 2.7); ctx.stroke(); }
      ctx.restore();

      // Arme
      ctx.strokeStyle = dark; ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (hanging || p.ledge || (p.climbing && !p.grounded)) {
        const cl = Math.sin(this.t * 14) * (p.climbing ? 2 : 0);
        ctx.moveTo(-2, shY + 1); ctx.lineTo(-2 + f * 1, shY - 9 + cl);
        ctx.moveTo(2, shY + 1); ctx.lineTo(2 + f * 2, shY - 9 - cl);
      } else if (p.pushT > 0) {
        ctx.moveTo(0, shY + 2); ctx.lineTo(f * 9, shY + 3);
        ctx.moveTo(0, shY + 4); ctx.lineTo(f * 9, shY + 6);
      } else if (p.grip) {
        ctx.moveTo(-2, shY + 2); ctx.lineTo(-7, -1); ctx.moveTo(2, shY + 2); ctx.lineTo(7, -1);
      } else if (p.throwT < 0.2) {
        ctx.moveTo(0, shY + 2); ctx.lineTo(f * 6, shY - 8);
        ctx.moveTo(0, shY + 2); ctx.lineTo(-f * 4, shY + 8);
      } else {
        ctx.moveTo(-1.5, shY + 2); ctx.lineTo(-3 - sw * 4, shY + 9);
        ctx.moveTo(1.5, shY + 2); ctx.lineTo(3 + sw * 4, shY + 9);
      }
      ctx.stroke();

      // Huckepack-Partner
      if (pass) {
        ctx.save();
        ctx.translate(-f * 6, shY - 2);
        ctx.scale(0.72, 0.72);
        this.miniYarny(ctx, pass.id, -f);
        ctx.restore();
      }

      // Kopf
      const hy = shY - 7 + (moving ? Math.abs(sw) * -0.8 : 0);
      ctx.fillStyle = col;
      ctx.shadowBlur = 5 * this.sc;
      ctx.beginPath(); ctx.arc(f * 0.5, hy, 6.4, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.save();
      ctx.beginPath(); ctx.arc(f * 0.5, hy, 6.4, 0, TAU); ctx.clip();
      ctx.strokeStyle = dark; ctx.lineWidth = 0.9;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(f * 0.5, hy + i * 3, 8, 2.2, 0.35 * f, 0, Math.PI); ctx.stroke(); }
      ctx.restore();
      // loser Faden auf dem Kopf
      ctx.strokeStyle = col; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-f * 2, hy - 6); ctx.quadraticCurveTo(-f * 7, hy - 13 + Math.sin(this.t * 3 + id) * 1.5, -f * 10, hy - 9); ctx.stroke();
      // Augen
      const blink = p.blink < 0 ? 0.15 : 1;
      ctx.fillStyle = '#fbf4e6';
      ctx.beginPath(); ctx.ellipse(f * 3.2, hy - 0.5, 2.1, 2.5 * blink, 0, 0, TAU); ctx.ellipse(f * -0.9, hy - 0.5, 1.8, 2.3 * blink, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d1418';
      ctx.beginPath(); ctx.arc(f * 3.8, hy - 0.2, 0.95 * blink, 0, TAU); ctx.arc(f * -0.4, hy - 0.2, 0.85 * blink, 0, TAU); ctx.fill();
      ctx.restore();

      // aktive Figur im Solospiel markieren
      if (g.mode === 'solo' && g.active === id && !g.players[1 - id].merged) {
        ctx.fillStyle = light;
        ctx.globalAlpha = 0.8 + Math.sin(this.t * 5) * 0.2;
        ctx.beginPath(); ctx.moveTo(cx - 4, p.y - 18); ctx.lineTo(cx + 4, p.y - 18); ctx.lineTo(cx, p.y - 13); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.grip) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - 9, by + 1); ctx.lineTo(cx - 5, by - 2); ctx.moveTo(cx + 9, by + 1); ctx.lineTo(cx + 5, by - 2); ctx.stroke();
      }
    }

    miniYarny(ctx, id, f) {
      const col = FF.COLORS[id], dark = FF.COLORS_DARK[id];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -4, 5, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(f * 0.5, -14, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(0, -4 + i * 3, 6, 1.8, 0.4, 0, Math.PI); ctx.stroke(); }
      ctx.fillStyle = '#fbf4e6';
      ctx.beginPath(); ctx.arc(f * 3, -14.5, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1d1418';
      ctx.beginPath(); ctx.arc(f * 3.5, -14.3, 0.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f * 2, -8); ctx.lineTo(f * 8, -4); ctx.stroke();
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

    // ------------------------------------------------------------ Effekte
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
        if (kind === 'fireflies') {
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
  }

  FF.Renderer = Renderer;
})();
