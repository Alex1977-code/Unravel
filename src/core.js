'use strict';
// Gemeinsamer Namensraum, Konstanten und kleine Hilfsfunktionen.
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const FF = (root.FF = root.FF || {});

  FF.C = {
    DT: 1 / 120,
    G: 1500,
    MAXFALL: 760,
    RUN: 165,
    ACC_G: 1600,
    ACC_A: 800,
    JUMP: 505,
    TRAMP: 1.34,
    PW: 16,
    PH: 26,
    TETHER: 400,
    LASSO_RANGE: 270,
    LASSO_MAX: 340,
    LASSO_MIN: 22,
    CLIMB: 125,
    SWING: 720,
    SWING_MAX: 560,
    KNOT_REACH: 48,
    MERGE: 60,
    PUSH_SPEED: 0.55,
  };

  FF.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  FF.lerp = (a, b, t) => a + (b - a) * t;
  FF.approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  FF.cross = (ax, ay, bx, by) => ax * by - ay * bx;

  const EPS = 1e-4;
  FF.overlap = (a, b) =>
    a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;

  // Schnitt Strecke/Rechteck (Liang-Barsky). Liefert Eintritts-t in [0,1] oder -1.
  FF.segRect = function (x0, y0, x1, y1, r, s) {
    const rx0 = r.x + s, ry0 = r.y + s, rx1 = r.x + r.w - s, ry1 = r.y + r.h - s;
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    const clip = (p, q) => {
      if (p === 0) return q >= 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    if (!clip(-dx, x0 - rx0) || !clip(dx, rx1 - x0) || !clip(-dy, y0 - ry0) || !clip(dy, ry1 - y0)) return -1;
    return t0;
  };

  FF.hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  FF.noise1 = (x, seed) => {
    const i = Math.floor(x), f = x - i;
    const a = FF.hash(i + seed * 1013), b = FF.hash(i + 1 + seed * 1013);
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
  FF.rng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  FF.store = {
    get(key, fallback) {
      try {
        const v = root.localStorage && root.localStorage.getItem('fadenfreunde:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        root.localStorage && root.localStorage.setItem('fadenfreunde:' + key, JSON.stringify(value));
      } catch (e) { /* Speicher nicht verfügbar */ }
    },
  };
})();
