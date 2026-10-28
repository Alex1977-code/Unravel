'use strict';
// Spiellogik: zwei Wollfiguren, Faden, Lasso, Knoten, Kisten, Gefahren.
(function () {
  const FF = globalThis.FF;
  const C = FF.C;
  const sfx = (name, vol) => FF.audio && FF.audio.play(name, vol);
  const EDGES = ['jumpP', 'jumpBtnP', 'lassoP', 'knotP', 'downP'];
  const AUTO = { grip: 1 };

  FF.makeCtl = () => ({
    left: 0, right: 0, up: 0, down: 0, grip: 0, jumpHold: 0,
    jumpP: 0, jumpBtnP: 0, lassoP: 0, knotP: 0, downP: 0, swapP: 0, mergeP: 0,
  });

  class Game {
    constructor(levelIndex, mode) {
      this.mode = mode;
      this.levelIndex = levelIndex;
      this.load(levelIndex);
    }

    load(i) {
      const L = FF.LEVELS[i];
      this.L = L;
      this.time = 0;
      this.acc = 0;
      this.state = 'play';
      this.stateT = 0;
      this.events = [];
      this.fx = [];
      this.pend = [{}, {}];
      const W = (this.world = {
        time: 0,
        solids: L.solids.map(([x, y, w, h]) => ({ x, y, w, h })),
        oneways: (L.oneways || []).map(([x, y, w]) => ({ x, y, w })),
        water: (L.water || []).map(([x, y, w, h, flow]) => ({ x, y, w, h, flow: flow || 0 })),
        thorns: (L.thorns || []).map(([x, y, w, h]) => ({ x, y, w, h })),
        anchors: (L.anchors || []).map(([x, y, post], id) => ({ x, y, id, post: !!post })),
        crates: (L.crates || []).map(([x, y, s, heavy]) => ({
          x: x - s / 2, y: y - s, w: s, h: s, vx: 0, vy: 0, isCrate: true, heavy: !!heavy, push: {}, strain: 0, floating: false,
        })),
        bridges: [],
      });
      this.beads = (L.beads || []).map(([x, y]) => ({ x, y, got: false, t: 0 }));
      this.checkpoints = (L.checkpoints || []).map(([x, y]) => ({ x, y, on: false }));
      this.signs = (L.signs || []).map(([x, y, key]) => ({ x, y, key, show: 0 }));
      this.goal = { x: L.goal[0], y: L.goal[1] };
      this.spawn = { x: L.spawn[0], y: L.spawn[1] };
      this.players = [this.makePlayer(0), this.makePlayer(1)];
      this.active = 0;
      this.tether = new FF.Rope(W, { body: this.players[0] }, { body: this.players[1] }, C.TETHER, C.TETHER, 'tether');
      this.saveCheckpoint();
      this.placeAt(this.spawn);
    }

    makePlayer(id) {
      return {
        id, isPlayer: true, x: 0, y: 0, w: C.PW, h: C.PH, vx: 0, vy: 0, face: id ? -1 : 1,
        grounded: false, coyote: 0, jumpBuf: 0, jumping: false, lasso: null, anchor: null,
        grip: false, ledge: null, merged: false, carrier: -1, pushT: 0, dropT: 0, bridge: null,
        onOneway: false, standOn: null, onTether: false, im: 1, strength: 1, walk: 0, throwT: 1,
        miss: null, landT: 0, sx: 0, sy: 0, climbing: 0, blink: 2 + id,
      };
    }

    get solo() { return this.mode === 'solo'; }
    get tetherOn() { return !this.players[0].merged && !this.players[1].merged; }

    placeAt(pt) {
      const [a, b] = this.players;
      for (const p of this.players) {
        p.vx = p.vy = 0; p.lasso = null; p.anchor = null; p.ledge = null; p.grip = false;
        p.merged = false; p.carrier = -1; p.jumpBuf = 0; p.coyote = 0; p.bridge = null; p.standOn = null;
        p.y = pt.y - p.h; p.grounded = true;
      }
      a.x = pt.x - 14 - a.w / 2; b.x = pt.x + 14 - b.w / 2;
      a.face = 1; b.face = -1;
      if (this.solo) {
        const act = this.players[this.active], other = this.players[1 - this.active];
        act.x = pt.x - act.w / 2;
        other.merged = true; other.carrier = act.id; other.x = act.x; other.y = act.y;
      }
      this.tether.reset();
    }

    saveCheckpoint() {
      this.cpState = this.world.crates.map((c) => ({ x: c.x, y: c.y }));
    }

    toast(text, who) {
      this.events.push({ type: 'toast', text, who });
    }

    // ---------------------------------------------------------------- Ablauf
    frame(dt, ctls) {
      dt = Math.min(dt, 0.1);
      this.time += dt;
      for (let i = 0; i < 2; i++) for (const k of EDGES) if (ctls[i][k]) this.pend[i][k] = 1;
      this.ctls = ctls;
      for (const e of this.fx) e.t += dt;
      this.fx = this.fx.filter((e) => e.t < e.life);

      if (this.state === 'dying') {
        this.stateT += dt;
        if (this.stateT > 0.9) this.respawn();
        return;
      }
      if (this.state === 'won') { this.stateT += dt; return; }

      if (this.solo) this.soloActions(ctls[0]);

      this.acc += dt;
      let first = true;
      while (this.acc >= C.DT) {
        this.acc -= C.DT;
        this.step(first);
        if (first) this.pend = [{}, {}];
        first = false;
        if (this.state !== 'play') break;
      }
      this.cosmetics(dt);
    }

    ctlFor(p) {
      if (this.solo) {
        if (p.id !== this.active) return AUTO;
        return Object.assign({}, this.ctls[0], this.pend[0]);
      }
      return Object.assign({}, this.ctls[p.id], this.pend[p.id]);
    }

    soloActions(c) {
      const a = this.players[this.active], b = this.players[1 - this.active];
      if (c.mergeP) {
        if (b.merged) this.unmerge(a, b);
        else if (a.ledge || b.ledge) { /* gleich */ }
        else if (Math.hypot(a.x - b.x, a.y - b.y) < C.MERGE) {
          if (b.lasso) b.lasso = null;
          b.merged = true; b.carrier = a.id; b.grip = false;
          sfx('merge');
        } else this.toast('Zu weit weg – geh näher zu deinem Partner.');
      }
      if (c.swapP) {
        if (b.merged) {
          // Wer oben sitzt, wird zum Träger.
          b.merged = false; b.carrier = -1;
          Object.assign(b, { x: a.x, y: a.y, vx: a.vx, vy: a.vy, grounded: a.grounded, face: a.face, bridge: a.bridge });
          if (a.lasso) { b.lasso = a.lasso; b.anchor = a.anchor; b.lasso.a = { body: b }; a.lasso = null; a.anchor = null; }
          a.merged = true; a.carrier = b.id;
        }
        this.active = b.id;
        sfx('swap');
      }
    }

    unmerge(a, b) {
      b.merged = false; b.carrier = -1;
      Object.assign(b, { x: a.x, y: a.y, vx: a.vx * 0.5, vy: a.vy, grounded: a.grounded, face: -a.face, bridge: a.bridge, ledge: null });
      this.tether.reset();
      sfx('merge');
    }

    invMass(p) {
      if (p.merged || p.grip || p.ledge) return 0;
      if (p.grounded) return 0.25;
      return 1;
    }

    step(first) {
      const W = this.world, P = this.players, dt = C.DT;
      W.time = this.time;
      const tetherOn = this.tetherOn;
      for (const p of P) p.strength = !p.merged && P[1 - p.id].merged ? 2 : 1;
      for (const p of P) this.updatePlayer(p, first ? this.ctlFor(p) : this.heldOnly(this.ctlFor(p)));
      for (const c of W.crates) this.updateCrate(c);

      for (const p of P) { p.sx = p.x; p.sy = p.y; p.im = this.invMass(p); }
      for (const p of P) if (p.lasso) p.lasso.wrap(W);
      if (tetherOn) this.tether.wrap(W);
      for (let it = 0; it < 2; it++) {
        for (const p of P) if (p.lasso) p.lasso.solve(W);
        if (tetherOn) this.tether.solve(W);
      }
      for (const p of P) {
        if (p.im <= 0) continue;
        p.vx = FF.clamp(p.vx + (p.x - p.sx) / dt, -900, 900);
        p.vy = FF.clamp(p.vy + (p.y - p.sy) / dt, -900, 900);
      }
      for (const p of P) {
        if (p.merged) {
          const car = P[p.carrier];
          p.x = car.x; p.y = car.y; p.vx = car.vx; p.vy = car.vy; p.grounded = car.grounded; p.face = car.face;
        }
      }
      for (const p of P) if (!p.merged && !p.ledge) FF.unstick(W, p);
      const T = this.tether;
      for (const p of P) p.onTether = tetherOn && T.taut && !p.grounded && p.im > 0 && !p.ledge;
      if (tetherOn) {
        const hanging = P.some((p) => p.onTether && !p.lasso);
        if (!hanging) T.len = Math.min(T.full, T.len + 420 * dt);
      } else T.len = T.full;

      this.checkWorld();
    }

    heldOnly(c) {
      const o = Object.assign({}, c);
      for (const k of EDGES) o[k] = 0;
      return o;
    }

    // ----------------------------------------------------------- Spieler
    updatePlayer(p, c) {
      const W = this.world, dt = C.DT;
      if (p.merged) return;
      p.throwT += dt;
      if (p.ledge) { this.updateLedge(p); return; }

      if (c.lassoP) this.lassoAction(p);
      if (c.knotP) this.tieKnot(p);
      if (c.jumpP) p.jumpBuf = 0.12;
      if (c.jumpBtnP && p.lasso && !p.grounded) { this.releaseLasso(p, true); p.jumpBuf = 0; }

      p.grip = !!c.grip && p.grounded && !p.lasso;
      if (p.grip) {
        p.vx = 0; p.vy = 0;
        if (p.standOn && !W.crates.includes(p.standOn)) p.standOn = null;
        return;
      }

      const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
      if (dir) p.face = dir;
      const hanging = !p.grounded && (p.lasso || p.onTether);
      if (p.grounded) {
        let target = dir * C.RUN;
        if (p.pushT > 0) target *= C.PUSH_SPEED;
        // Wer nicht festhält, wird vom hängenden Partner mitgezogen.
        const other = this.players[1 - p.id];
        const dragged = !dir && this.tetherOn && this.tether.taut && other.onTether;
        p.vx = FF.approach(p.vx, target, C.ACC_G * (dragged ? 0.15 : 1) * dt);
      } else if (hanging) {
        p.vx = FF.clamp(p.vx + dir * C.SWING * dt, -C.SWING_MAX, C.SWING_MAX);
      } else if (!(dir && Math.sign(p.vx) === dir && Math.abs(p.vx) > C.RUN)) {
        p.vx = FF.approach(p.vx, dir * C.RUN, C.ACC_A * dt);
      }

      p.coyote = p.grounded ? 0.09 : p.coyote - dt;
      p.jumpBuf -= dt; p.pushT -= dt; p.dropT -= dt;

      // Durch Planken und Fadenbrücken nach unten fallen lassen.
      if (c.downP && p.grounded && p.onOneway && !p.lasso) {
        p.dropT = 0.25; p.bridge = null; p.grounded = false; p.coyote = 0;
      }
      if (p.jumpBuf > 0 && p.coyote > 0) {
        const tramp = !!p.bridge;
        p.vy = -C.JUMP * (tramp ? C.TRAMP : 1);
        p.jumpBuf = 0; p.coyote = 0; p.grounded = false; p.jumping = true;
        if (tramp) { p.bridge.wob = 1; sfx('boing'); } else sfx('jump');
        p.bridge = null;
      }
      if (p.jumping && !c.jumpHold && p.vy < -200) { p.vy = -200; p.jumping = false; }
      if (p.vy >= 0) p.jumping = false;

      // Klettern am Lasso oder am gemeinsamen Faden.
      p.climbing = 0;
      if (p.lasso) {
        const R = p.lasso;
        if (p.grounded || (p.coyote > 0.04 && !c.up)) {
          // Am Boden rollt der Faden frei ab; ganz ausgerollt löst sich das Lasso.
          R.len = R.full; R.paying = true;
          if (R.total > R.full - 3 && R.taut) this.releaseLasso(p, false);
        } else {
          // Beim Abheben gilt die aktuelle Länge – so beginnt der Schwung dort, wo man absprang.
          if (R.paying) { R.len = FF.clamp(R.total, C.LASSO_MIN, R.full); R.paying = false; }
          if (c.up) { R.len = Math.max(C.LASSO_MIN, Math.min(R.len, R.total) - C.CLIMB * dt); p.climbing = -1; }
          else if (c.down) { R.len = Math.min(R.full, R.len + C.CLIMB * dt); p.climbing = 1; }
        }
      } else if (this.tetherOn && !p.grounded) {
        const R = this.tether;
        const end = R.a.body === p ? R.a : R.b;
        const [nx, ny] = R.next(end);
        const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        const above = ny < cy - 50 && Math.abs(nx - cx) < Math.abs(ny - cy) * 1.3;
        if (c.up && (p.onTether || above)) {
          R.len = Math.max(30, Math.min(R.len, R.total) - C.CLIMB * dt); p.climbing = -1;
        } else if (c.down && p.onTether) {
          R.len = Math.min(R.full, R.len + C.CLIMB * dt); p.climbing = 1;
        }
      }

      p.vy = Math.min(p.vy + C.G * dt, C.MAXFALL);

      // Auf einer schrägen Fadenbrücke bleiben.
      if (p.bridge && p.grounded) {
        const yl = FF.bridgeY(p.bridge, p.x + p.w / 2 + p.vx * dt);
        if (yl === null || !W.bridges.includes(p.bridge)) p.bridge = null;
      }

      const wasGrounded = p.grounded, fallSpeed = p.vy;
      const dx = p.vx * dt;
      const ox = p.x;
      if (FF.moveX(W, p, dx, true)) {
        // Kleine Stufen automatisch nehmen.
        const rest = dx - (p.x - ox);
        if (wasGrounded && Math.abs(rest) > 0.01) {
          const oy = p.y;
          p.y -= 7;
          if (!FF.collides(W, p) && !FF.moveX(W, p, rest, true)) FF.moveY(W, p, 7.5);
          else { p.y = oy; p.vx = 0; }
        } else p.vx = 0;
      }
      if (p.bridge && wasGrounded) {
        const yl = FF.bridgeY(p.bridge, p.x + p.w / 2);
        if (yl !== null && p.y + p.h > yl - 8 && p.y + p.h < yl + 10) p.y = yl - p.h;
      }
      p.grounded = false; p.onOneway = false; p.standOn = null;
      const prevBridge = p.bridge;
      p.bridge = null;
      const ry = FF.moveY(W, p, p.vy * dt);
      if (ry === 1) {
        p.grounded = true;
        if (p.bridge && !wasGrounded && fallSpeed > 330) {
          p.vy = -Math.min(fallSpeed * 0.82, 700);
          p.grounded = false; p.bridge.wob = 1; p.bridge = null;
          sfx('boing', 0.6);
        } else {
          if (!wasGrounded && fallSpeed > 260) {
            p.landT = 0.18; sfx('land', Math.min(1, fallSpeed / 700)); this.dust(p);
            if (fallSpeed > 520) this.events.push({ type: 'fb', who: p.id, s: 0.5, ms: 80 });
          }
          p.vy = 0;
          if (!p.bridge && prevBridge && wasGrounded) p.bridge = null;
        }
      } else if (ry === -1) p.vy = Math.max(p.vy, 0);

      if (p.grounded && Math.abs(p.vx) > 5) p.walk += Math.abs(p.vx) * dt * 0.075;

      if (!p.grounded && p.vy > -260) {
        const sides = [];
        if (dir) sides.push(dir);
        if (hanging && c.up) sides.push(p.face, -p.face);
        for (const s of sides) {
          const L = this.findLedge(p, s);
          if (L) { p.ledge = L; p.vx = p.vy = 0; sfx('ledge'); break; }
        }
      }
    }

    findLedge(p, side) {
      const W = this.world;
      const px0 = side > 0 ? p.x + p.w : p.x - 4, px1 = px0 + 4;
      const test = (r) => {
        if (!(r.x < px1 && r.x + r.w > px0)) return null;
        if (r.y < p.y - 12 || r.y > p.y + p.h * 0.7 || p.y + p.h <= r.y) return null;
        let tx = side > 0 ? r.x + 1 : r.x + r.w - p.w - 1;
        if (r.w < p.w + 2) tx = r.x + (r.w - p.w) / 2;
        const ty = r.y - p.h;
        if (FF.collides(W, { x: tx, y: ty, w: p.w, h: p.h })) return null;
        if (FF.collides(W, { x: p.x, y: ty, w: p.w, h: p.y - ty + 1 })) return null;
        return { x0: p.x, y0: p.y, x1: tx, y1: ty, t: 0 };
      };
      for (const r of W.solids) { const L = test(r); if (L) return L; }
      for (const c of W.crates) { const L = test(c); if (L) return L; }
      return null;
    }

    updateLedge(p) {
      const L = p.ledge;
      L.t += C.DT / 0.22;
      const t = Math.min(1, L.t);
      const ty = Math.min(1, t / 0.6), tx = Math.max(0, (t - 0.45) / 0.55);
      p.y = FF.lerp(L.y0, L.y1, ty * ty * (3 - 2 * ty));
      p.x = FF.lerp(L.x0, L.x1, Math.min(1, tx));
      if (t >= 1) { p.ledge = null; p.grounded = true; p.vx = p.vy = 0; p.coyote = 0.09; }
    }

    // ------------------------------------------------------- Lasso & Knoten
    lassoTarget(p, exclude) {
      const W = this.world;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      let best = null, bs = Infinity;
      for (const a of W.anchors) {
        if (a === exclude) continue;
        const dx = a.x - cx, dy = a.y - cy;
        const d = Math.hypot(dx, dy);
        if (d > C.LASSO_RANGE || d < 6) continue;
        if (FF.blocker(W, cx, cy, a.x, a.y)) continue;
        let s = d;
        if (Math.abs(dx) > 30 && Math.sign(dx) !== p.face) s += 90;
        if (dy > 10) s += p.grounded ? 60 : 150;
        if (exclude && dx * p.face < 10) continue;
        if (s < bs) { bs = s; best = a; }
      }
      return best;
    }

    lassoAction(p) {
      if (p.lasso) {
        const next = !p.grounded && this.lassoTarget(p, p.anchor);
        if (next) this.attachLasso(p, next);
        else this.releaseLasso(p, !p.grounded);
        return;
      }
      const a = this.lassoTarget(p);
      if (!a) { p.miss = { t: 0, dir: p.face }; p.throwT = 0; sfx('miss'); return; }
      this.attachLasso(p, a);
    }

    attachLasso(p, a) {
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const d = Math.hypot(a.x - cx, a.y - cy);
      p.lasso = new FF.Rope(this.world, { body: p }, { x: a.x, y: a.y }, d, C.LASSO_MAX, 'lasso');
      p.lasso.total = d;
      p.anchor = a;
      p.throwT = 0; p.miss = null;
      sfx('lasso');
      this.events.push({ type: 'fb', who: p.id, s: 0.35, ms: 60 });
    }

    releaseLasso(p, boost) {
      p.lasso = null; p.anchor = null;
      if (boost) p.vy = Math.max(-560, Math.min(p.vy, 0) - 170);
      sfx('release', 0.5);
    }

    tieKnot(p) {
      if (!p.lasso) { this.toast('Für einen Knoten erst das Lasso an einen Pflock werfen.', p.id); return; }
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      let best = null, bd = C.KNOT_REACH;
      for (const a of this.world.anchors) {
        if (a === p.anchor) continue;
        const d = Math.hypot(a.x - cx, a.y - cy);
        if (d < bd) { bd = d; best = a; }
      }
      if (!best) { this.toast('Geh mit dem Faden zu einem zweiten Pflock.', p.id); return; }
      const A = p.anchor, B = best;
      const BR = this.world.bridges;
      for (let i = BR.length - 1; i >= 0; i--) {
        const b = BR[i];
        if ((b.a === A && b.b === B) || (b.a === B && b.b === A)) BR.splice(i, 1);
      }
      const l = A.x <= B.x ? [A, B] : [B, A];
      BR.push({ a: l[0], b: l[1], ax: l[0].x, ay: l[0].y, bx: l[1].x, by: l[1].y, wob: 1, owner: p.id });
      if (BR.length > 4) BR.shift();
      p.lasso = null; p.anchor = null;
      sfx('knot');
    }

    // --------------------------------------------------------------- Kisten
    updateCrate(c) {
      const W = this.world, dt = C.DT;
      c.strain = Math.max(0, c.strain - dt);
      const riders = this.players.filter(
        (p) => !p.merged && p.grounded && Math.abs(p.y + p.h - c.y) < 1.5 && p.x + p.w > c.x && p.x < c.x + c.w,
      );
      let wtr = null;
      const mx = c.x + c.w / 2;
      for (const w of W.water) if (mx > w.x && mx < w.x + w.w && c.y + c.h > w.y) { wtr = w; break; }
      if (wtr) {
        const target = wtr.y - c.h * 0.45;
        c.vy += (target - c.y) * 40 * dt;
        c.vy *= 0.92;
        if (riders.length && wtr.flow) c.vx = FF.approach(c.vx, wtr.flow, 80 * dt);
        else c.vx = FF.approach(c.vx, 0, 60 * dt);
        if (!c.floating) { c.floating = true; this.splash(mx, wtr.y, 0.7); sfx('splash', 0.5); }
      } else {
        c.vy = Math.min(c.vy + C.G * dt, C.MAXFALL);
        c.vx = 0;
        c.floating = false;
      }
      const ox = c.x, oy = c.y;
      if (c.vx && FF.moveX(W, c, c.vx * dt, false)) c.vx = 0;
      const r = FF.moveY(W, c, c.vy * dt);
      if (r) { if (r === 1 && c.vy > 300) sfx('thud', 0.6); c.vy = 0; }
      const dx = c.x - ox, dy = c.y - oy;
      for (const p of riders) {
        if (dx) FF.moveX(W, p, dx, false);
        if (dy) p.y = c.y - p.h;
      }
    }

    // ----------------------------------------------------- Welt & Zustände
    checkWorld() {
      const W = this.world;
      for (const p of this.players) {
        if (p.merged) continue;
        const cx = p.x + p.w / 2;
        for (const w of W.water) {
          if (cx > w.x && cx < w.x + w.w && p.y + p.h * 0.7 > w.y + 4 && p.y < w.y + w.h) return this.die(p, 'water', w);
        }
        for (const t of W.thorns) {
          if (FF.overlap({ x: p.x + 3, y: p.y + 4, w: p.w - 6, h: p.h - 6 }, t)) return this.die(p, 'thorns');
        }
        if (p.y > this.L.height + 80) return this.die(p, 'fall');
        const cy = p.y + p.h / 2;
        for (const b of this.beads) {
          if (!b.got && Math.hypot(b.x - cx, b.y - cy) < 20) {
            b.got = true; b.t = 0; sfx('bead');
            this.events.push({ type: 'fb', who: p.id, s: 0.2, ms: 40 });
            this.sparkle(b.x, b.y);
          }
        }
        for (const cp of this.checkpoints) {
          if (!cp.on && Math.abs(cx - cp.x) < 34 && Math.abs(p.y + p.h - cp.y) < 50) {
            cp.on = true;
            this.spawn = { x: cp.x, y: cp.y };
            this.saveCheckpoint();
            sfx('checkpoint');
            this.toast('Zwischenstand gespeichert');
          }
        }
      }
      const g = this.goal;
      const inGoal = (p) => {
        const q = p.merged ? this.players[p.carrier] : p;
        return Math.abs(q.x + q.w / 2 - g.x) < 46 && Math.abs(q.y + q.h - g.y) < 60;
      };
      if (this.players.every(inGoal)) {
        this.state = 'won'; this.stateT = 0;
        sfx('win');
        this.events.push({ type: 'won' });
      } else if (this.players.some(inGoal) && !this.goalHint) {
        this.goalHint = true;
        this.toast(this.solo ? 'Hol deinen Partner nach – ihr müsst beide ins Ziel.' : 'Ihr müsst beide ins Ziel.');
      }
    }

    die(p, why, w) {
      if (this.state !== 'play') return;
      this.state = 'dying'; this.stateT = 0;
      if (why === 'water') { this.splash(p.x + p.w / 2, w.y, 1.4); sfx('splash'); }
      else sfx('ouch');
      this.deadId = p.id; this.deathWhy = why;
      this.events.push({ type: 'fb', who: 0, s: 0.9, ms: 260 }, { type: 'fb', who: 1, s: 0.9, ms: 260 });
    }

    respawn() {
      this.world.crates.forEach((c, i) => {
        const s = this.cpState[i];
        c.x = s.x; c.y = s.y; c.vx = c.vy = 0; c.floating = false;
      });
      this.placeAt(this.spawn);
      this.state = 'play'; this.stateT = 0;
      this.events.push({ type: 'respawn' });
    }

    restartCheckpoint() {
      if (this.state === 'won') return;
      this.state = 'dying'; this.stateT = 0.5;
    }

    beadsGot() { return this.beads.filter((b) => b.got).length; }

    // ---------------------------------------------------------- Effekte
    cosmetics(dt) {
      for (const p of this.players) {
        p.landT = Math.max(0, p.landT - dt);
        p.blink -= dt;
        if (p.blink < -0.12) p.blink = 2 + Math.random() * 3;
        if (p.miss) { p.miss.t += dt; if (p.miss.t > 0.35) p.miss = null; }
      }
      for (const b of this.world.bridges) b.wob = Math.max(0, b.wob - dt * 1.6);
      for (const b of this.beads) b.t += dt;
      for (const s of this.signs) {
        let near = false;
        for (const p of this.players) {
          if (p.merged) continue;
          if (Math.abs(p.x + p.w / 2 - s.x) < 150 && Math.abs(p.y + p.h - s.y) < 120) near = true;
        }
        s.show = FF.clamp(s.show + (near ? dt * 4 : -dt * 3), 0, 1);
      }
    }

    dust(p) {
      for (let i = 0; i < 6; i++) {
        this.fx.push({ kind: 'dust', x: p.x + p.w / 2, y: p.y + p.h, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 30, t: 0, life: 0.5 });
      }
    }
    splash(x, y, k) {
      for (let i = 0; i < 18 * k; i++) {
        this.fx.push({ kind: 'drop', x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 220, vy: -150 - Math.random() * 260 * k, t: 0, life: 0.9 });
      }
    }
    sparkle(x, y) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        this.fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: 0, life: 0.6 });
      }
    }
  }

  FF.Game = Game;
})();
