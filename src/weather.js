'use strict';
// Wetter: Sonne, Regen, Sturm, Schnee. Rein optisch und klanglich, die Spielphysik bleibt gleich.
// „Automatisch“ wählt je Level ein passendes Wetter. Übergänge werden weich überblendet.
(function () {
  const FF = globalThis.FF;

  // Kenngrößen je Wetter (0..1, wind und licht auch darüber)
  //  rain: Regenmenge, snow: Schneefall, cover: Schneedecke, wet: Nässe, wind: Windstärke,
  //  cloud: Bewölkung, light: Sonnenlicht, fog: Dunst-Faktor, bolt: Blitze
  const W = {
    sun: { rain: 0, snow: 0, cover: 0, wet: 0, wind: 0.35, cloud: 0, light: 1.15, fog: 0.8, bolt: 0 },
    rain: { rain: 0.6, snow: 0, cover: 0, wet: 1, wind: 0.6, cloud: 0.75, light: 0.55, fog: 1.45, bolt: 0 },
    storm: { rain: 1, snow: 0, cover: 0, wet: 1, wind: 1.6, cloud: 1, light: 0.38, fog: 1.7, bolt: 1 },
    snow: { rain: 0, snow: 1, cover: 1, wet: 0, wind: 0.4, cloud: 0.6, light: 0.8, fog: 1.6, bolt: 0 },
    // Klarer Frost: Schneedecke, nur vereinzelte Flocken, freier Himmel (für das Polarlicht)
    frost: { rain: 0, snow: 0.18, cover: 1, wet: 0, wind: 0.25, cloud: 0, light: 0.9, fog: 1.1, bolt: 0 },
  };
  const AUTO = {
    garden: 'sun', quarry: 'rain', pond: 'sun', autumn: 'storm', dusk: 'snow',
    marsh: 'rain', coast: 'sun', winter: 'snow', scrap: 'sun', halloween: 'sun', lighthouse: 'storm', aurora: 'frost',
  };
  const NAMES = { auto: 'Automatisch', sun: 'Sonne', rain: 'Regen', storm: 'Sturm', snow: 'Schnee', frost: 'Frost' };
  FF.WEATHER_ORDER = ['auto', 'sun', 'rain', 'storm', 'snow'];
  FF.WEATHER_NAMES = NAMES;
  FF.weatherOf = (theme, pref) => (pref && pref !== 'auto' && W[pref] ? pref : AUTO[theme] || 'sun');

  // Pollen, Mücken und Glühwürmchen fliegen nicht bei Regen oder Schnee; fallendes Laub schon bei Sturm
  FF.ambientOk = (amb, v) => (amb === 'leaves' ? v.snow < 0.3 : v.rain < 0.3 && v.snow < 0.3);

  // Weich überblendeter Zustand, von beiden Renderern genutzt
  class WeatherState {
    constructor() {
      this.name = null;
      this.v = Object.assign({}, W.sun);
      this.boltT = 99; this.nextBolt = 4; this.bolt = 0; this.boltSeed = 0;
    }
    update(name, dt, snap) {
      const tgt = W[name] || W.sun;
      const k = snap || this.name === null ? 1 : 1 - Math.exp(-dt * 0.9);
      for (const key in tgt) this.v[key] += (tgt[key] - this.v[key]) * k;
      this.name = name;
      // Blitz: kurzes doppeltes Aufflackern, Donner kommt verzögert
      this.boltT += dt;
      this.nextBolt -= dt;
      if (this.v.bolt > 0.5 && this.nextBolt <= 0) {
        this.nextBolt = 5 + Math.random() * 9;
        this.boltT = 0; this.boltSeed = Math.random();
        if (FF.audio && FF.audio.thunder) FF.audio.thunder(0.25 + Math.random() * 1.2);
      }
      const t = this.boltT;
      this.bolt = t < 0.08 ? 1 : t < 0.16 ? 0.25 : t < 0.26 ? 0.85 : Math.max(0, 0.85 - (t - 0.26) * 3);
      return this.v;
    }
  }
  FF.WeatherState = WeatherState;

  // Blitz im Himmel (Bildschirmkoordinaten), für beide Renderer
  FF.drawBolt = function (ctx, W_, H_, ws) {
    if (ws.bolt <= 0.02) return;
    const a = ws.bolt;
    ctx.fillStyle = `rgba(220,230,255,${a * 0.22})`;
    ctx.fillRect(0, 0, W_, H_);
    if (ws.boltT > 0.3) return;
    const rnd = FF.rng(Math.floor(ws.boltSeed * 1e6));
    let x = W_ * (0.2 + rnd() * 0.6), y = 0;
    ctx.save();
    ctx.strokeStyle = `rgba(240,245,255,${a})`;
    ctx.shadowColor = 'rgba(170,190,255,0.9)'; ctx.shadowBlur = 18;
    ctx.lineWidth = Math.max(1.5, H_ / 400); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    const end = H_ * (0.35 + rnd() * 0.2);
    while (y < end) {
      x += (rnd() - 0.5) * H_ * 0.06; y += H_ * (0.02 + rnd() * 0.04);
      ctx.lineTo(x, y);
      if (rnd() < 0.15) { ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * H_ * 0.1, y + H_ * 0.06); ctx.moveTo(x, y); }
    }
    ctx.stroke();
    ctx.restore();
  };

  // Einfache Regen-/Schneedarstellung für die 2D-Grafik (Bildschirmraum)
  FF.Weather2D = class {
    constructor() { this.p = []; }
    draw(ctx, W_, H_, v, dt, t) {
      const want = Math.round((v.rain * 520 + v.snow * 320) * (W_ * H_) / (1280 * 720));
      while (this.p.length < want) this.p.push({ x: Math.random() * W_, y: Math.random() * H_, z: 0.4 + Math.random() * 0.6, s: Math.random() });
      if (this.p.length > want) this.p.length = want;
      if (!this.p.length) return;
      const u = H_ / 720;
      ctx.save();
      if (v.rain > 0.02) {
        ctx.strokeStyle = `rgba(200,215,235,${0.35 * Math.min(1, v.rain * 1.5)})`;
        ctx.lineWidth = Math.max(1, u);
        ctx.beginPath();
        const vx = 120 + v.wind * 260, vy = 1300;
        for (const p of this.p) {
          p.x += vx * p.z * dt * u; p.y += vy * p.z * dt * u;
          if (p.y > H_) { p.y -= H_ + 20; p.x = Math.random() * W_; }
          if (p.x > W_) p.x -= W_;
          const l = 16 * p.z * u;
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - vx / vy * l, p.y - l);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(245,248,255,0.85)';
        for (const p of this.p) {
          p.y += (40 + 50 * p.z) * dt * u;
          p.x += (Math.sin(t * 0.8 + p.s * 30) * 22 + v.wind * 40) * p.z * dt * u;
          if (p.y > H_) { p.y -= H_ + 10; p.x = Math.random() * W_; }
          if (p.x > W_) p.x -= W_;
          if (p.x < 0) p.x += W_;
          ctx.globalAlpha = 0.5 + p.z * 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, (1 + p.z * 2.2) * u, 0, 6.283); ctx.fill();
        }
      }
      ctx.restore();
    }
  };
})();
