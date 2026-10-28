'use strict';
// Darstellung auf dem Canvas: Hintergrund, Welt, Figuren, Faden, Effekte.
(function () {
  const FF = globalThis.FF;
  const TAU = Math.PI * 2;

  FF.COLORS = ['#d4462f', '#3a73c9'];
  FF.COLORS_DARK = ['#8f2a1c', '#21477f'];
  FF.COLORS_LIGHT = ['#f08a6e', '#7fa9ea'];

  // Stimmungen: Licht (r,g,b), Dunst, Gelände, Farbkorrektur oben/unten.
  const THEMES = {
    garden: {
      sky: ['#9fb8bf', '#d9d6bf', '#f3dcae'], sun: [0.8, 0.18], light: '255,232,176', haze: '226,222,198',
      far: '#a8b5a6', far2: '#8fa190', mid: '#5b7353', near: '#2c3f2a', fg: '#0f160e',
      earth: '#33261d', earth2: '#140e0a', stone: '#6d5b49', moss: '#87a046', moss2: '#3f5524', grass: '#9cb257', root: '#2a1c12',
      flower: ['#f3e3a0', '#f4b9c2', '#ffffff'], water: ['#a9c3bd', '#3f6f72', '#132a2e'],
      tree: 'round', amb: 'pollen', grade: ['rgba(255,214,150,0.55)', 'rgba(40,60,70,0.6)'], rays: 0.9, bokeh: 0.8,
    },
    quarry: {
      sky: ['#7e8f99', '#b4bdbd', '#d8d6cb'], sun: [0.24, 0.14], light: '236,240,236', haze: '204,210,208',
      far: '#9aa4a4', far2: '#7f8a8b', mid: '#525e60', near: '#262e30', fg: '#0d1112',
      earth: '#3e3c38', earth2: '#141413', stone: '#85817a', moss: '#8d9a5c', moss2: '#4c5733', grass: '#a2ad6e', root: '#29241e',
      flower: ['#ece9dc'], water: ['#9fb2b4', '#3d5a60', '#141f23'],
      tree: 'pine', amb: 'mist', grade: ['rgba(230,236,240,0.4)', 'rgba(30,40,55,0.65)'], rays: 0.35, bokeh: 0.3,
    },
    pond: {
      sky: ['#c9875a', '#ebb87c', '#f8e1aa'], sun: [0.6, 0.36], light: '255,206,128', haze: '244,206,150',
      far: '#c49a6c', far2: '#a6825a', mid: '#625c34', near: '#2c2a17', fg: '#120f07',
      earth: '#34251a', earth2: '#120c07', stone: '#76604a', moss: '#a8a64a', moss2: '#5c5a25', grass: '#c0b65a', root: '#2b1d11',
      flower: ['#f7dc7a', '#ffffff'], water: ['#e3bf86', '#3f6a68', '#10272a'],
      tree: 'birch', amb: 'midges', grade: ['rgba(255,190,110,0.6)', 'rgba(50,40,60,0.55)'], rays: 1, bokeh: 1,
    },
    autumn: {
      sky: ['#9c5233', '#d98654', '#f1c38a'], sun: [0.3, 0.26], light: '255,196,128', haze: '236,176,128',
      far: '#b9805f', far2: '#9e6448', mid: '#7a361d', near: '#3a190f', fg: '#140805',
      earth: '#30201a', earth2: '#110a07', stone: '#6e5240', moss: '#a8803a', moss2: '#5c3e1b', grass: '#c99a4a', root: '#2a170e',
      flower: ['#e9b44c', '#d4572f'], water: ['#d29b6f', '#3d5a5c', '#10201f'],
      tree: 'autumn', amb: 'leaves', grade: ['rgba(255,180,110,0.55)', 'rgba(60,30,40,0.6)'], rays: 0.8, bokeh: 0.7,
    },
    dusk: {
      sky: ['#121735', '#3a3758', '#c4705a'], sun: [0.72, 0.62], light: '255,186,130', haze: '150,120,150',
      far: '#423d5a', far2: '#332f49', mid: '#221f35', near: '#100f1a', fg: '#05050a',
      earth: '#1f1922', earth2: '#09070b', stone: '#4a3f4b', moss: '#56643f', moss2: '#2c3524', grass: '#6e7a52', root: '#191219',
      flower: ['#ffe9a8'], water: ['#8a6e7e', '#253852', '#0a1220'],
      tree: 'pine', amb: 'fireflies', grade: ['rgba(255,170,120,0.45)', 'rgba(20,24,60,0.7)'], rays: 0.45, bokeh: 0.9,
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

    setQuality(q) { this.quality = q; this.resize(); }

    resize() {
      const dpr = this.quality === 'low' ? 1 : Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
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
      if (!fresh) return;
      const rnd = FF.rng(g.levelIndex * 7919 + 13);
      const S = g.world.solids;
      // Liegt direkt neben dieser Kante ein anderer Block? Dann bleibt sie glatt.
      const covered = (r, side) => S.some((s) => s !== r && s.y < r.y + 12 && s.y + s.h > r.y + 12 &&
        (side < 0 ? s.x < r.x && s.x + s.w >= r.x - 1 : s.x <= r.x + r.w + 1 && s.x + s.w > r.x + r.w));
      this.deco = S.map((r) => {
        const big = r.w < 2000;
        const left = big && r.h > 30 && !covered(r, -1), right = big && r.h > 30 && !covered(r, 1);
        const depth = Math.min(r.h, 700);
        const pts = [];
        const n = Math.max(2, Math.round(r.w / 9));
        for (let i = 0; i <= n; i++) pts.push([r.x + (r.w * i) / n, r.y + (i === 0 || i === n ? 2 : (rnd() - 0.5) * 2.2)]);
        if (right) for (let y = r.y + 8; y < r.y + depth; y += 10 + rnd() * 8) pts.push([r.x + r.w + rnd() * 3.5, y]);
        pts.push([r.x + r.w, r.y + depth], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y + depth]);
        if (left) {
          const lp = [];
          for (let y = r.y + 8; y < r.y + depth; y += 10 + rnd() * 8) lp.push([r.x - rnd() * 3.5, y]);
          pts.push(...lp.reverse());
        }
        const blades = [], flowers = [], clumps = [], stones = [], roots = [];
        if (big) {
          for (let x = r.x + 1; x < r.x + r.w - 1; x += 2.2 + rnd() * 2.6) {
            blades.push({ x, h: 4 + rnd() * 9 + (rnd() < 0.08 ? 8 : 0), l: (rnd() - 0.5) * 6, c: rnd() < 0.55, p: rnd() * TAU });
            if (rnd() < 0.03) flowers.push({ x, h: 7 + rnd() * 8, c: Math.floor(rnd() * 10), p: rnd() * TAU });
          }
          for (let x = r.x + 4; x < r.x + r.w - 4; x += 10 + rnd() * 18) clumps.push({ x, rx: 4 + rnd() * 7, ry: 2 + rnd() * 3 });
          const nS = Math.floor((r.w * Math.min(depth, 360)) / 2600);
          for (let i = 0; i < nS; i++) {
            const y = r.y + 16 + Math.pow(rnd(), 1.4) * (Math.min(depth, 360) - 20);
            stones.push({ x: r.x + 6 + rnd() * (r.w - 12), y, rx: 2.5 + rnd() * 9, ry: 2 + rnd() * 5, a: rnd() * 0.6 - 0.3, k: 0.18 + rnd() * 0.3 });
          }
          for (const [on, x, dir] of [[left, r.x, -1], [right, r.x + r.w, 1]]) {
            if (!on) continue;
            const cnt = 2 + Math.floor(rnd() * 3);
            for (let i = 0; i < cnt; i++) {
              roots.push({ x: x - dir * (2 + rnd() * 14), len: 18 + rnd() * Math.min(70, r.h * 0.5), out: dir * (3 + rnd() * 6), w: 0.8 + rnd() * 1.6, moss: rnd() < 0.5, p: rnd() * TAU });
            }
          }
        }
        return { pts, blades, flowers, clumps, stones, roots, depth, left, right };
      });
      this.thornDeco = g.world.thorns.map((t) => {
        const out = [];
        for (let i = 0; i < Math.max(4, t.w / 10); i++) {
          const x0 = t.x + rnd() * t.w;
          const pts = [];
          let x = x0, y = t.y + t.h;
          for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 16; y -= Math.max(4, t.h * 0.14) + rnd() * 6; pts.push([x, y]); }
          out.push({ x0, pts });
        }
        return out;
      });
      this.amb = [];
      for (let i = 0; i < 46; i++) this.amb.push({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.8, p: rnd() * TAU, s: 0.5 + rnd() });
      this.bokehs = [];
      for (let i = 0; i < 16; i++) this.bokehs.push({ x: rnd(), y: rnd() * 0.8, r: 0.012 + rnd() * 0.03, p: rnd() * TAU, s: 0.3 + rnd() * 0.7 });
      // Vordergrund-Silhouetten (unscharf, vor der Spielebene)
      this.fgEls = [];
      const span = g.L.width * 1.45 + 1600;
      for (let X = -400; X < span; X += 420 + rnd() * 520) {
        const kinds = this.th.tree === 'birch' ? ['reed', 'grass', 'reed'] : this.th.tree === 'pine' ? ['grass', 'fern', 'branch'] : ['grass', 'fern', 'branch', 'grass'];
        this.fgEls.push({ X, kind: kinds[Math.floor(rnd() * kinds.length)], s: 0.7 + rnd() * 0.6, seed: rnd() * 1000 });
      }
      this.pattern = null;
      this.snap = true;
    }

    // Erd-Textur als wiederholtes Muster je Stimmung.
    earthPattern(ctx) {
      if (this.pattern && this.patternTheme === this.th) return this.pattern;
      const th = this.th, N = 160;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const x = c.getContext('2d');
      x.fillStyle = th.earth; x.fillRect(0, 0, N, N);
      const rnd = FF.rng(99);
      for (let i = 0; i < 260; i++) {
        const px = rnd() * N, py = rnd() * N, r = 2 + rnd() * 14;
        x.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.14)' : 'rgba(255,240,220,0.025)';
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
          x.beginPath(); x.ellipse(px + ox, py + oy, r, r * (0.4 + rnd() * 0.4), rnd() * 3, 0, TAU); x.fill();
        }
      }
      for (let i = 0; i < 90; i++) {
        const px = rnd() * N, py = rnd() * N;
        x.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.2})`;
        x.fillRect(px, py, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      this.pattern = ctx.createPattern(c, 'repeat');
      this.patternTheme = th;
      return this.pattern;
    }

    layer(name, div) {
      const w = Math.max(64, Math.round(this.W / div)), h = Math.max(48, Math.round(this.H / div));
      let L = this.layers && this.layers[name];
      if (!L || L.width !== w || L.height !== h) {
        this.layers = this.layers || {};
        L = this.layers[name] = document.createElement('canvas');
        L.width = w; L.height = h;
      }
      return L;
    }

    grainPattern(ctx) {
      if (this.grain) return this.grain;
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const img = x.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      this.grain = ctx.createPattern(c, 'repeat');
      return this.grain;
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
      const ctx = this.ctx, W = this.W, H = this.H, cam = this.cam, th = this.th;
      const sc = H / cam.h;
      this.sc = sc;
      this.sunX = th.sun[0] * W - (cam.x / g.L.width - 0.5) * W * 0.08;
      this.sunY = th.sun[1] * H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      this.drawBackground(ctx, g, sc);

      const world = () => ctx.setTransform(sc, 0, 0, sc, W / 2 - cam.x * sc, H / 2 - cam.y * sc);
      world();
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

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const hi = this.quality !== 'low';
      if (hi) this.drawRays(ctx, 0.5);
      if (hi) this.drawFgLayer(ctx, g, sc);
      if (hi) this.drawBokeh(ctx);
      this.drawGrade(ctx, hi);

      if (!opts.pan) {
        world();
        for (const s of g.signs) if (s.show > 0.01) this.drawSignBubble(ctx, s, g);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (g.mode === 'solo' && !opts.pan) this.drawOffscreen(ctx, g, sc);
      if (g.state === 'dying') {
        const t = g.stateT;
        const a = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.45);
        ctx.fillStyle = `rgba(10,8,14,${Math.min(1, a) * 0.94})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    vis(r) {
      const v = this.view;
      return r.x < v.x1 && r.x + r.w > v.x0 && r.y < v.y1 && r.y + r.h > v.y0;
    }

    // -------------------------------------------------------- Hintergrund
    // Ferne Ebenen werden klein gezeichnet und weichgezeichnet: Tiefenunschärfe wie durch ein Objektiv.
    blurred(src, name, div, px) {
      if (this.quality === 'low') return src;
      const B = this.layer(name, div), b = B.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, B.width, B.height);
      b.filter = `blur(${px}px)`;
      b.drawImage(src, 0, 0);
      b.filter = 'none';
      return B;
    }

    drawBackground(ctx, g, sc) {
      const th = this.th, W = this.W, H = this.H, cam = this.cam, L = g.L;
      const F = this.layer('far', 3), fx = F.getContext('2d');
      fx.setTransform(F.width / W, 0, 0, F.height / H, 0, 0);
      const sk = fx.createLinearGradient(0, 0, 0, H);
      sk.addColorStop(0, th.sky[0]); sk.addColorStop(0.55, th.sky[1]); sk.addColorStop(1, th.sky[2]);
      fx.fillStyle = sk; fx.fillRect(0, 0, W, H);
      const sx = this.sunX, sy = this.sunY, R = Math.max(W, H);
      const sg = fx.createRadialGradient(sx, sy, 0, sx, sy, R * 0.55);
      sg.addColorStop(0, `rgba(${th.light},1)`); sg.addColorStop(0.04, `rgba(${th.light},0.9)`);
      sg.addColorStop(0.16, `rgba(${th.light},0.35)`); sg.addColorStop(1, `rgba(${th.light},0)`);
      fx.fillStyle = sg; fx.fillRect(0, 0, W, H);

      const ground = L.spawn[1];
      const layerY = (worldY, f) => H / 2 + (worldY - cam.y) * sc * f;
      const seed = g.levelIndex + 1;
      const ridge = (f, base, amp, freq, color, s2) => {
        fx.fillStyle = color;
        fx.beginPath(); fx.moveTo(0, H);
        for (let x = 0; x <= W + 12; x += 12) {
          const X = cam.x * f + (x - W / 2) / sc;
          fx.lineTo(x, layerY(base, f) - (FF.noise1(X * freq, s2) * amp + FF.noise1(X * freq * 4, s2 + 5) * amp * 0.2) * sc);
        }
        fx.lineTo(W, H); fx.closePath(); fx.fill();
      };
      const haze = (a0, a1) => {
        const hg = fx.createLinearGradient(0, H * 0.25, 0, H);
        hg.addColorStop(0, `rgba(${th.haze},${a0})`); hg.addColorStop(1, `rgba(${th.haze},${a1})`);
        fx.fillStyle = hg; fx.fillRect(0, 0, W, H);
      };
      ridge(0.06, ground - 230, 150, 0.004, th.far, seed);
      haze(0.15, 0.45);
      ridge(0.13, ground - 170, 100, 0.007, th.far2, seed + 7);
      haze(0.05, 0.35);
      this.drawTreeRow(fx, g, sc, 0.28, layerY(ground - 80, 0.28), th.mid, 1, 120);
      haze(0.12, 0.42);
      ctx.drawImage(this.blurred(F, 'farB', 3, 1.3), 0, 0, W, H);
      this.drawRays(ctx, 1);

      const N = this.layer('near', 2), nx = N.getContext('2d');
      nx.setTransform(1, 0, 0, 1, 0, 0);
      nx.clearRect(0, 0, N.width, N.height);
      nx.setTransform(N.width / W, 0, 0, N.height / H, 0, 0);
      this.drawTreeRow(nx, g, sc, 0.55, layerY(ground - 6, 0.55), th.near, 2, 190);
      ctx.drawImage(this.blurred(N, 'nearB', 2, 0.9), 0, 0, W, H);
      const hg = ctx.createLinearGradient(0, H * 0.4, 0, H);
      hg.addColorStop(0, `rgba(${th.haze},0)`); hg.addColorStop(1, `rgba(${th.haze},0.18)`);
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H);
    }

    drawTreeRow(ctx, g, sc, f, baseY, color, salt, spacing) {
      const W = this.W, H = this.H, cam = this.cam, th = this.th;
      const s = sc * (0.55 + f * 0.7);
      const X0 = cam.x * f - W / 2 / sc - 260, X1 = cam.x * f + W / 2 / sc + 260;
      ctx.fillStyle = color;
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
        if (r < 0.15) continue;
        const X = k * spacing + FF.hash(k * 3.1 + salt) * spacing * 0.7;
        const x = (X - cam.x * f) * sc + W / 2;
        const y = baseY - FF.noise1(X * 0.01, salt * 9) * 26 * s + 6 * s;
        const h = (70 + FF.hash(k * 7.7 + salt) * 120) * s;
        this.drawTree(ctx, x, y, h, th.tree, k + salt * 1000, color);
      }
    }

    drawTree(ctx, x, y, h, kind, seed, color) {
      const r = (n) => FF.hash(seed * 1.37 + n * 17.1);
      ctx.fillStyle = color;
      if (kind === 'pine') {
        const w = h * 0.3;
        ctx.fillRect(x - h * 0.02, y - h * 0.3, h * 0.04, h * 0.3);
        ctx.beginPath();
        ctx.moveTo(x, y - h * 1.05);
        for (let i = 0; i <= 7; i++) {
          const yy = y - h * 1.0 + (i / 7) * h * 0.85, ww = w * (0.15 + (i / 7) * 0.85) * (0.85 + r(i) * 0.3);
          ctx.lineTo(x + ww, yy + h * 0.05); ctx.lineTo(x + ww * 0.45, yy + h * 0.04);
        }
        for (let i = 7; i >= 0; i--) {
          const yy = y - h * 1.0 + (i / 7) * h * 0.85, ww = w * (0.15 + (i / 7) * 0.85) * (0.85 + r(i + 20) * 0.3);
          ctx.lineTo(x - ww * 0.45, yy + h * 0.04); ctx.lineTo(x - ww, yy + h * 0.05);
        }
        ctx.closePath(); ctx.fill();
      } else if (kind === 'birch') {
        ctx.fillRect(x - h * 0.018, y - h * 0.85, h * 0.036, h * 0.85);
        ctx.lineWidth = h * 0.012; ctx.strokeStyle = color;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(x, y - h * (0.4 + i * 0.12)); ctx.lineTo(x + (r(i) - 0.5) * h * 0.5, y - h * (0.6 + i * 0.12)); ctx.stroke();
        }
        for (let i = 0; i < 7; i++) {
          ctx.beginPath();
          ctx.ellipse(x + (r(i) - 0.5) * h * 0.5, y - h * (0.62 + r(i + 9) * 0.4), h * (0.08 + r(i + 3) * 0.08), h * (0.12 + r(i + 5) * 0.08), 0, 0, TAU);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(x - h * 0.05, y); ctx.lineTo(x - h * 0.02, y - h * 0.6); ctx.lineTo(x + h * 0.02, y - h * 0.6); ctx.lineTo(x + h * 0.05, y);
        ctx.fill();
        ctx.lineWidth = h * 0.02; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(x, y - h * 0.45); ctx.lineTo(x - h * 0.2, y - h * 0.7); ctx.moveTo(x, y - h * 0.5); ctx.lineTo(x + h * 0.22, y - h * 0.72); ctx.stroke();
        const n = kind === 'autumn' ? 8 : 7;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(x + (r(i) - 0.5) * h * 0.6, y - h * (0.6 + r(i + 4) * 0.42), h * (0.12 + r(i + 7) * 0.12), 0, TAU);
          ctx.fill();
        }
      }
    }

    // Weiche Lichtbahnen, die schräg durch den Dunst fallen (klein gerendert und stark weichgezeichnet).
    drawRays(ctx, k) {
      const th = this.th;
      if (!th.rays) return;
      const W = this.W, H = this.H, sx = this.sunX, sy = this.sunY;
      const Rl = this.layer('rays', 6), c = Rl.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, Rl.width, Rl.height);
      c.setTransform(Rl.width / W, 0, 0, Rl.height / H, 0, 0);
      const a0 = Math.atan2(H * 1.1 - sy, W * 0.5 - sx);
      const dx = Math.cos(a0), dy = Math.sin(a0), px = -dy, py = dx;
      const len = Math.hypot(W, H) * 1.4, D = Math.max(W, H);
      for (let i = 0; i < 6; i++) {
        const off = (i - 2.5) * D * 0.11 + Math.sin(this.t * 0.05 + i * 1.3) * D * 0.02;
        const wd = D * (0.025 + 0.03 * FF.hash(i * 3.3));
        const al = k * th.rays * (0.16 + 0.1 * Math.sin(this.t * 0.22 + i * 2.1));
        if (al <= 0.003) continue;
        const ox = sx + px * off, oy = sy + py * off;
        const gr = c.createLinearGradient(ox, oy, ox + dx * len, oy + dy * len);
        gr.addColorStop(0, `rgba(${th.light},${al})`); gr.addColorStop(0.55, `rgba(${th.light},${al * 0.45})`); gr.addColorStop(1, `rgba(${th.light},0)`);
        c.fillStyle = gr;
        c.beginPath();
        c.moveTo(ox - px * wd * 0.5, oy - py * wd * 0.5);
        c.lineTo(ox + dx * len - px * wd * 1.6, oy + dy * len - py * wd * 1.6);
        c.lineTo(ox + dx * len + px * wd * 1.6, oy + dy * len + py * wd * 1.6);
        c.lineTo(ox + px * wd * 0.5, oy + py * wd * 0.5);
        c.closePath(); c.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(this.blurred(Rl, 'raysB', 6, 3), 0, 0, W, H);
      ctx.restore();
    }

    // Unscharfe Silhouetten ganz vorne: Gräser, Farne, Schilf, Zweige.
    drawFgLayer(ctx, g, sc) {
      const W = this.W, H = this.H, cam = this.cam, th = this.th;
      const Fg = this.layer('fg', 4), c = Fg.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, Fg.width, Fg.height);
      c.setTransform(Fg.width / W, 0, 0, Fg.height / H, 0, 0);
      c.fillStyle = th.fg; c.strokeStyle = th.fg; c.lineCap = 'round';
      const f = 1.45;
      let any = false;
      for (const el of this.fgEls) {
        const sx = (el.X - cam.x * f) * sc + W / 2;
        if (sx < -320 * sc || sx > W + 320 * sc) continue;
        any = true;
        const s = el.s * sc, r = (n) => FF.hash(el.seed + n * 7.3);
        const sway = Math.sin(this.t * 0.7 + el.seed) * 0.04;
        if (el.kind === 'branch') {
          const y0 = -10 * s;
          c.lineWidth = 9 * s;
          c.beginPath(); c.moveTo(sx - 160 * s, y0); c.quadraticCurveTo(sx - 40 * s, y0 + 30 * s, sx + 90 * s, y0 + 70 * s + sway * 200 * s); c.stroke();
          for (let i = 0; i < 9; i++) {
            const lx = sx - 120 * s + i * 26 * s, ly = y0 + 18 * s + i * 7 * s + Math.sin(this.t + i) * 2 * s;
            c.beginPath(); c.ellipse(lx, ly + 12 * s, 16 * s * (0.6 + r(i)), 7 * s, 0.6 + sway * 4, 0, TAU); c.fill();
          }
          continue;
        }
        const n = el.kind === 'reed' ? 9 : el.kind === 'fern' ? 7 : 20;
        for (let i = 0; i < n; i++) {
          const bx = sx + (r(i) - 0.5) * (el.kind === 'grass' ? 170 : 120) * s;
          const h = (el.kind === 'reed' ? 150 + r(i + 30) * 110 : el.kind === 'fern' ? 70 + r(i + 30) * 60 : 50 + r(i + 30) * 120) * s;
          const lean = ((r(i + 60) - 0.5) * 0.9 + sway) * h;
          if (el.kind === 'fern') {
            c.lineWidth = 3 * s;
            c.beginPath(); c.moveTo(bx, H + 6); c.quadraticCurveTo(bx + lean * 0.3, H - h * 0.7, bx + lean, H - h); c.stroke();
            for (let k = 1; k < 7; k++) {
              const t = k / 7, px = bx + lean * t * t, py = H - h * t;
              c.beginPath(); c.ellipse(px, py, 11 * s * (1 - t * 0.6), 3.5 * s, (lean > 0 ? -0.5 : 0.5), 0, TAU); c.fill();
            }
          } else {
            c.lineWidth = (el.kind === 'reed' ? 3.5 : 4.5) * s;
            c.beginPath(); c.moveTo(bx, H + 6); c.quadraticCurveTo(bx + lean * 0.2, H - h * 0.6, bx + lean, H - h); c.stroke();
            if (el.kind === 'reed' && r(i + 90) < 0.5) { c.beginPath(); c.ellipse(bx + lean * 0.97, H - h * 0.95, 4 * s, 13 * s, lean * 0.002, 0, TAU); c.fill(); }
          }
        }
      }
      if (!any) return;
      ctx.globalAlpha = 0.94;
      ctx.drawImage(this.blurred(Fg, 'fgB', 4, 1.6), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Weiche Lichtkreise wie unscharfe Glanzpunkte im Objektiv (ein vorgezeichnetes Bild, oft wiederverwendet).
    drawBokeh(ctx) {
      const th = this.th;
      if (!th.bokeh) return;
      if (!this.bokehSprite || this.bokehTheme !== th) {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        const gr = x.createRadialGradient(64, 64, 34, 64, 64, 63);
        gr.addColorStop(0, `rgba(${th.light},0.7)`); gr.addColorStop(0.8, `rgba(${th.light},1)`); gr.addColorStop(1, `rgba(${th.light},0)`);
        x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 63, 0, TAU); x.fill();
        this.bokehSprite = c; this.bokehTheme = th;
      }
      const W = this.W, H = this.H, R = Math.min(W, H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of this.bokehs) {
        const x = ((b.x * W * 1.4 + this.t * 6 * b.s - this.cam.x * 0.9 * b.s * this.sc) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2;
        const y = b.y * H + Math.sin(this.t * 0.3 + b.p) * 18;
        const r = b.r * R;
        ctx.globalAlpha = th.bokeh * (0.03 + 0.025 * Math.sin(this.t * 0.5 + b.p));
        ctx.drawImage(this.bokehSprite, x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // Farbkorrektur, Vignette, Filmkorn
    drawGrade(ctx, grain = true) {
      const th = this.th, W = this.W, H = this.H;
      ctx.save();
      if (grain) {
        ctx.globalCompositeOperation = 'soft-light';
        const gr = ctx.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, th.grade[0]); gr.addColorStop(1, th.grade[1]);
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(6,5,10,0)'); v.addColorStop(1, 'rgba(6,5,10,0.55)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      if (!grain) { ctx.restore(); return; }
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = this.grainPattern(ctx);
      ctx.translate(-Math.random() * 128, -Math.random() * 128);
      ctx.fillRect(0, 0, W + 128, H + 128);
      ctx.restore();
    }

    // ------------------------------------------------------------ Gelände
    drawSolid(ctx, r, d) {
      const th = this.th, v = this.view, t = this.t;
      const P = d.pts;
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
      ctx.closePath();
      ctx.fillStyle = this.earthPattern(ctx);
      ctx.fill();
      ctx.save();
      ctx.clip();
      const shadeH = Math.min(d.depth, 240);
      const yEnd = Math.min(r.y + r.h, v.y1 + 20);
      const gr = ctx.createLinearGradient(0, r.y, 0, r.y + shadeH);
      gr.addColorStop(0, `rgba(${th.light},0.12)`); gr.addColorStop(0.06, 'rgba(0,0,0,0)'); gr.addColorStop(1, th.earth2);
      ctx.fillStyle = gr;
      ctx.fillRect(r.x - 6, r.y - 4, r.w + 12, Math.min(yEnd, r.y + shadeH) - r.y + 4);
      if (yEnd > r.y + shadeH) { ctx.fillStyle = th.earth2; ctx.fillRect(r.x - 6, r.y + shadeH - 1, r.w + 12, yEnd - r.y - shadeH + 1); }
      for (const [on, x0, x1] of [[d.left, r.x - 4, r.x + 30], [d.right, r.x + r.w + 4, r.x + r.w - 30]]) {
        if (!on) continue;
        const hg = ctx.createLinearGradient(x0, 0, x1, 0);
        hg.addColorStop(0, 'rgba(0,0,0,0.5)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(Math.min(x0, x1), r.y, 34, yEnd - r.y);
      }
      for (const s of d.stones) {
        if (s.y > v.y1 || s.y < v.y0 || s.x < v.x0 || s.x > v.x1) continue;
        ctx.globalAlpha = s.k;
        ctx.fillStyle = th.stone;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, s.a, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${th.light},0.18)`;
        ctx.beginPath(); ctx.ellipse(s.x - s.rx * 0.15, s.y - s.ry * 0.45, s.rx * 0.6, s.ry * 0.35, s.a, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (!(r.y > v.y0 - 30 && r.y < v.y1 + 30 && r.w < 2000)) return;
      // Moos und Gras auf der Kante
      const nTop = Math.max(2, Math.round(r.w / 9)) + 1;
      const mg = ctx.createLinearGradient(0, r.y - 3, 0, r.y + 11);
      mg.addColorStop(0, th.moss); mg.addColorStop(1, th.moss2);
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.moveTo(P[0][0] - 1, P[0][1] - 1);
      for (let i = 1; i < nTop; i++) ctx.lineTo(P[i][0], P[i][1] - 1.5);
      ctx.lineTo(r.x + r.w + 1, r.y + 2);
      for (let i = nTop - 1; i >= 0; i--) ctx.lineTo(P[i][0], r.y + 7 + Math.sin(P[i][0] * 0.37) * 2.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = th.moss;
      for (const c of d.clumps) { ctx.beginPath(); ctx.ellipse(c.x, r.y, c.rx, c.ry, 0, Math.PI, TAU); ctx.fill(); }
      ctx.strokeStyle = `rgba(${th.light},0.55)`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(P[0][0], P[0][1] - 1.5);
      for (let i = 1; i < nTop; i++) ctx.lineTo(P[i][0], P[i][1] - 1.5);
      ctx.stroke();
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = th.grass;
      ctx.beginPath();
      for (const b of d.blades) {
        if (!b.c || b.x < v.x0 || b.x > v.x1) continue;
        const sw = Math.sin(t * 1.4 + b.p + b.x * 0.01) * 1.6;
        ctx.moveTo(b.x, r.y + 1); ctx.quadraticCurveTo(b.x + b.l * 0.3, r.y - b.h * 0.6, b.x + b.l + sw, r.y - b.h);
      }
      ctx.stroke();
      ctx.strokeStyle = th.moss2;
      ctx.beginPath();
      for (const b of d.blades) {
        if (b.c || b.x < v.x0 || b.x > v.x1) continue;
        const sw = Math.sin(t * 1.4 + b.p + b.x * 0.01) * 1.3;
        ctx.moveTo(b.x, r.y + 1); ctx.quadraticCurveTo(b.x + b.l * 0.3, r.y - b.h * 0.5, b.x + b.l * 0.8 + sw, r.y - b.h * 0.8);
      }
      ctx.stroke();
      for (const f of d.flowers) {
        const sw = Math.sin(t * 1.2 + f.p) * 1.5;
        ctx.strokeStyle = th.moss2; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(f.x, r.y); ctx.lineTo(f.x + sw, r.y - f.h); ctx.stroke();
        ctx.fillStyle = th.flower[f.c % th.flower.length];
        ctx.beginPath(); ctx.arc(f.x + sw, r.y - f.h, 1.9, 0, TAU); ctx.fill();
      }
      // herabhängende Wurzeln und Moosfäden
      for (const rt of d.roots) {
        const sw = Math.sin(t * 0.9 + rt.p) * 1.8;
        ctx.strokeStyle = rt.moss ? th.moss2 : th.root;
        ctx.lineWidth = rt.w;
        ctx.beginPath();
        ctx.moveTo(rt.x, r.y + 2);
        ctx.bezierCurveTo(rt.x + rt.out * 0.8, r.y + rt.len * 0.3, rt.x + rt.out * 1.1 + sw * 0.5, r.y + rt.len * 0.7, rt.x + rt.out + sw, r.y + rt.len);
        ctx.stroke();
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
        ctx.fillStyle = this.th.moss2;
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
      if (x1 <= x0) return;
      const yb = Math.min(w.y + w.h, v.y1);
      const wave = (x) => w.y + Math.sin(x * 0.045 + t * 1.8) * 1.4 + Math.sin(x * 0.11 - t * 1.1) * 0.7;
      const gr = ctx.createLinearGradient(0, w.y, 0, w.y + 220);
      gr.addColorStop(0, th.water[0]); gr.addColorStop(0.12, th.water[1]); gr.addColorStop(1, th.water[2]);
      ctx.fillStyle = gr;
      ctx.globalAlpha = 0.93;
      ctx.beginPath();
      ctx.moveTo(x0, yb);
      for (let x = x0; x <= x1 + 0.1; x += 6) ctx.lineTo(Math.min(x, x1), wave(x));
      ctx.lineTo(x1, yb); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      // Spiegelung des Himmelslichts und Glitzern
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const sx = w.x + ((i * 61.7 + t * (w.flow || 6) + Math.sin(t * 0.6 + i) * 6) % w.w);
        if (sx < x0 || sx > x1) continue;
        const sy = w.y + 4 + (i % 5) * 7;
        const a = 0.1 + 0.12 * Math.max(0, Math.sin(t * 2 + i * 1.3));
        ctx.fillStyle = `rgba(${th.light},${a})`;
        ctx.fillRect(sx, sy, 10 + (i % 3) * 8, 1.2);
      }
      ctx.restore();
      ctx.strokeStyle = `rgba(${th.light},0.6)`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 0.1; x += 6) (x === x0 ? ctx.moveTo(x, wave(x)) : ctx.lineTo(Math.min(x, x1), wave(x)));
      ctx.stroke();
      // dunkle Ränder an den Ufern
      for (const ex of [w.x, w.x + w.w]) {
        if (ex < v.x0 || ex > v.x1) continue;
        const eg = ctx.createLinearGradient(ex, 0, ex + (ex === w.x ? 24 : -24), 0);
        eg.addColorStop(0, 'rgba(0,0,0,0.35)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = eg;
        ctx.fillRect(Math.min(ex, ex + (ex === w.x ? 24 : -24)), w.y, 24, yb - w.y);
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

      // Kontaktschatten am Boden
      if (p.grounded || p.grip) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.ellipse(cx, by + 0.5, 9, 2.4, 0, 0, TAU); ctx.fill();
      }
      // Von welcher Seite kommt das Licht?
      const lit = this.sunX > (cx - this.cam.x) * this.sc + this.W / 2 ? 1 : -1;
      const rim = `rgba(${this.th.light},0.85)`;

      ctx.save();
      ctx.translate(cx, by);
      ctx.rotate(lean);
      // heller Saum, damit die Figuren vor dunklem Hintergrund lesbar bleiben
      ctx.shadowColor = `rgba(${this.th.light},0.5)`;
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
      ctx.strokeStyle = rim; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, (hipY + shY) / 2 - 1, 5.2, (hipY - shY) / 2 + 2.6, 0, lit > 0 ? -1.2 : Math.PI - 1.0, lit > 0 ? 1.0 : Math.PI + 1.2); ctx.stroke();

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
      ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(f * 0.5, hy, 5.9, lit > 0 ? -1.3 : Math.PI - 0.9, lit > 0 ? 0.9 : Math.PI + 1.3); ctx.stroke();
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
