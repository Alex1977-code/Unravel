'use strict';
// Lädt die Spiellogik ohne Browser, damit Physik und Level automatisch geprüft werden können.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const ctx = { console, Math, JSON, Object, Array, Set, Map };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['core.js', 'physics.js', 'levels.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  }
  return ctx.FF;
}

// Kleiner Treiber: hält Tasten für eine Dauer und lässt die Simulation laufen.
class Driver {
  constructor(FF, level, mode) {
    this.FF = FF;
    this.g = new FF.Game(level, mode);
    this.t = 0;
  }
  run(sec, c0 = {}, c1 = {}) {
    const g = this.g, FF = this.FF;
    const frames = Math.round(sec * 60);
    for (let i = 0; i < frames; i++) {
      const a = Object.assign(FF.makeCtl(), c0), b = Object.assign(FF.makeCtl(), c1);
      if (i > 0) for (const k of ['jumpP', 'jumpBtnP', 'lassoP', 'knotP', 'downP', 'swapP', 'mergeP']) { a[k] = 0; b[k] = 0; }
      g.frame(1 / 60, [a, b]);
      this.t += 1 / 60;
    }
    return this;
  }
  // Läuft, bis cond() wahr ist (oder Zeit abläuft).
  until(cond, max, c0 = {}, c1 = {}) {
    for (let t = 0; t < max; t += 1 / 60) {
      if (cond(this.g)) return true;
      this.run(1 / 60, c0, c1);
    }
    return cond(this.g);
  }
  p(i) { return this.g.players[i]; }
  put(i, x, groundY) {
    const p = this.p(i);
    p.x = x - p.w / 2; p.y = groundY - p.h; p.vx = p.vy = 0; p.grounded = true;
    this.g.tether.reset();
  }
  info(i) {
    const p = this.p(i);
    return `P${i} x=${(p.x + p.w / 2).toFixed(1)} y=${(p.y + p.h).toFixed(1)} vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)} g=${p.grounded} lasso=${!!p.lasso} merged=${p.merged} grip=${p.grip} ledge=${!!p.ledge}`;
  }
}

module.exports = { load, Driver };
