'use strict';
// Prozedurale, kachelbare Texturen für den 3D-Look: Fels, Moos, Rinde, Holz, Wolle, Wasser, Laub.
// Jede Textur bekommt eine passende Normal-Map, damit Licht über die Oberflächen streicht.
(function () {
  const FF = globalThis.FF;

  // Kachelbares Werte-Rauschen: Gitterwerte wiederholen sich mit Periode p.
  function tileNoise(seed) {
    const rnd = FF.rng(seed), N = 256, g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    return (x, y, p) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = ((xi % p) + p) % p, x1 = (x0 + 1) % p, y0 = ((yi % p) + p) % p, y1 = (y0 + 1) % p;
      const a = g[y0 * N + x0], b = g[y0 * N + x1], c = g[y1 * N + x0], d = g[y1 * N + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function fbm(n, x, y, p, oct) {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let o = 0; o < oct; o++) { s += a * n(x * f, y * f, p * f); t += a; a *= 0.5; f *= 2; }
    return s / t;
  }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  // Farbe + Höhe je Pixel erzeugen, daraus Farbtextur und Normal-Map bauen.
  function gen(size, fn, strength) {
    const THREE = globalThis.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    const H = new Float32Array(size * size);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const r = fn(i / size, j / size);
        const k = (j * size + i) * 4;
        img.data[k] = r[0]; img.data[k + 1] = r[1]; img.data[k + 2] = r[2]; img.data[k + 3] = 255;
        H[j * size + i] = r[3];
      }
    }
    x.putImageData(img, 0, 0);
    const nc = document.createElement('canvas');
    nc.width = nc.height = size;
    const nx = nc.getContext('2d');
    const ni = nx.createImageData(size, size);
    const at = (i, j) => H[((j + size) % size) * size + ((i + size) % size)];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const dx = (at(i - 1, j) - at(i + 1, j)) * strength, dy = (at(i, j + 1) - at(i, j - 1)) * strength;
        const l = Math.hypot(dx, dy, 1);
        const k = (j * size + i) * 4;
        ni.data[k] = (dx / l * 0.5 + 0.5) * 255; ni.data[k + 1] = (dy / l * 0.5 + 0.5) * 255; ni.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[k + 3] = 255;
      }
    }
    nx.putImageData(ni, 0, 0);
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const normal = new THREE.CanvasTexture(nc);
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    return { map, normal };
  }

  const cache = {};
  FF.textures = function (themeName, big = true) {
    const key = themeName + (big ? ':hi' : ':lo');
    if (cache[key]) return cache[key];
    const R = big ? 512 : 256, R2 = big ? 256 : 128;
    const th = FF.THEMES[themeName];
    const n1 = tileNoise(11), n2 = tileNoise(23), n3 = tileNoise(37), n4 = tileNoise(51);
    const earth = hex(th.earth), earth2 = hex(th.earth2), stone = hex(th.stone), moss = hex(th.moss), moss2 = hex(th.moss2), grass = hex(th.grass);
    const t = {};

    // Felswand: Schichten, Risse, etwas Moos in Vertiefungen
    // Erde mit eingebetteten Steinen: Zellen-Muster für Steine, Rauschen für Erde und Risse
    const cells = [];
    { const r = FF.rng(77); for (let i = 0; i < 26; i++) cells.push([r(), r(), 0.018 + Math.pow(r(), 2) * 0.05, r()]); }
    const stoneAt = (u, v) => {
      let best = 0, tone = 0;
      const wob = (fbm(n2, u * 12, v * 12, 12, 3) - 0.5) * 0.9;
      for (const [cx, cy, rad, tn] of cells) {
        let dx = Math.abs(u - cx), dy = Math.abs(v - cy);
        dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx * (1 + tn * 0.6), dy * (1.6 - tn * 0.5)) / rad + wob;
        if (d < 1) { const k = Math.sqrt(1 - d * d); if (k > best) { best = k; tone = tn; } }
      }
      return [best, tone];
    };
    t.rock = gen(R, (u, v) => {
      const h = fbm(n1, u * 6, v * 6, 6, 5);
      const strata = 0.5 + 0.5 * Math.sin((v * 8 + fbm(n2, u * 4, v * 4, 4, 3) * 1.6) * Math.PI * 2);
      const cr = 1 - sstep(0, 0.02, Math.abs(fbm(n3, u * 4, v * 4, 4, 4) - 0.5));
      const [st, tone] = stoneAt(u, v);
      const sd = fbm(n4, u * 24, v * 24, 24, 2);
      let c = mix(earth2, earth, sstep(0.2, 0.75, h * 0.8 + strata * 0.2));
      c = mul(c, 0.85 + sd * 0.3);
      c = mul(c, 1 - cr * 0.35);
      const sc = mul(mix(earth, stone, 0.35 + tone * 0.3), 0.55 + sd * 0.3 + st * 0.25);
      c = mix(c, sc, sstep(0.0, 0.3, st));
      // feine Wurzelfasern
      const rootL = 1 - sstep(0, 0.012, Math.abs(fbm(n1, u * 3 + 5, v * 9, 3, 4) - 0.52));
      c = mix(c, mul(earth, 1.35), rootL * 0.5 * (1 - st));
      c = mix(c, moss2, sstep(0.45, 0.2, h) * (1 - st) * 0.3);
      const height = h * 0.45 + strata * 0.12 - cr * 0.15 + st * 0.5 + sd * 0.1 + rootL * 0.12;
      return [c[0], c[1], c[2], height];
    }, 7);

    // Moos- und Grasboden oben auf den Blöcken
    t.top = gen(R2, (u, v) => {
      const h = fbm(n2, u * 8, v * 8, 8, 5);
      const patch = fbm(n4, u * 3, v * 3, 3, 3);
      let c = mix(moss2, moss, sstep(0.3, 0.75, h));
      c = mix(c, grass, sstep(0.6, 0.85, fbm(n1, u * 16, v * 16, 16, 2)) * 0.5);
      c = mix(c, earth, sstep(0.62, 0.75, patch) * 0.7);
      return [c[0], c[1], c[2], h];
    }, 3);

    // Rinde
    const barkA = th.tree === 'birch' ? [214, 208, 196] : mul(earth, 1.4), barkB = th.tree === 'birch' ? [60, 55, 52] : earth2;
    t.bark = gen(R2, (u, v) => {
      const h = fbm(n3, u * 4, v * 24, 4, 4);
      const groove = sstep(0.35, 0.55, fbm(n1, u * 12, v * 3, 12, 3));
      let c = mix(barkB, barkA, th.tree === 'birch' ? sstep(0.3, 0.45, h) : 0.35 + groove * 0.5);
      return [c[0], c[1], c[2], groove * 0.6 + h * 0.4];
    }, 4);

    // Holzbretter (Kisten, Schilder, Pflöcke)
    const woodA = [150, 104, 64], woodB = [92, 60, 34];
    t.wood = gen(R2, (u, v) => {
      const plank = Math.floor(v * 4);
      const fv = v * 4 - plank;
      const grain = 0.5 + 0.5 * Math.sin((u * 30 + fbm(n2, u * 4, v * 16 + plank * 3, 4, 4) * 8 + plank * 7) * Math.PI);
      const gap = sstep(0.06, 0.0, Math.min(fv, 1 - fv));
      let c = mix(woodB, woodA, 0.3 + grain * 0.5);
      c = mul(c, 1 - gap * 0.7);
      return [c[0], c[1], c[2], grain * 0.4 + (1 - gap) * 0.6];
    }, 3);

    // Wolle: feine, schräg laufende Fasern (wird mit der Spielerfarbe eingefärbt)
    t.yarn = gen(128, (u, v) => {
      const f = fbm(n4, u * 8, v * 8, 8, 3);
      const s = 0.5 + 0.5 * Math.sin(((u + v) * 16 + f * 2.5) * Math.PI * 2);
      const fuzz = fbm(n1, u * 32, v * 32, 32, 2);
      const k = 160 + s * 80 + fuzz * 15;
      return [k, k, k, s * 0.8 + fuzz * 0.2];
    }, 2.5);

    // Wasserwellen (nur Normal-Map wird genutzt)
    t.water = gen(R2, (u, v) => {
      const h = fbm(n2, u * 6, v * 6, 6, 4) * 0.7 + fbm(n3, u * 14, v * 14, 14, 2) * 0.3;
      return [128, 128, 255, h];
    }, 2.2);

    t.leaves = leafCard(th);
    t.glow = glowSprite();
    cache[key] = t;
    return t;
  };

  // Blattbüschel mit Transparenz für Baumkronen und Vordergrund
  function leafCard(th) {
    const THREE = globalThis.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const rnd = FF.rng(7);
    const pal = th.tree === 'autumn' ? ['#c4652c', '#e0943a', '#a8421f', '#d9b24a'] : th.tree === 'pine' ? ['#24361f', '#2f4527', '#1c2a19'] : ['#4f6e2e', '#6d8c3a', '#3e5a25', '#86a04a'];
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 92;
      const px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
      x.save();
      x.translate(px, py);
      x.rotate(a + (rnd() - 0.5) * 1.2);
      const L = th.tree === 'pine' ? 30 + rnd() * 20 : 20 + rnd() * 16, W = th.tree === 'pine' ? 3 : L * 0.45;
      const gr = x.createLinearGradient(-L, 0, L, 0);
      const col = pal[Math.floor(rnd() * pal.length)];
      gr.addColorStop(0, col); gr.addColorStop(1, '#' + col.slice(1).replace(/../g, (h) => Math.min(255, parseInt(h, 16) + 30).toString(16).padStart(2, '0')));
      x.fillStyle = gr;
      x.beginPath(); x.ellipse(0, 0, L, W, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(-L, 0); x.lineTo(L, 0); x.stroke();
      x.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function glowSprite() {
    const THREE = globalThis.THREE;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
})();
