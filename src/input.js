'use strict';
// Eingabe: Tastatur (eine oder zwei Personen), Gamepads und Touch-Knöpfe.
(function () {
  const FF = globalThis.FF;

  const KEYS = {
    p1: {
      left: ['KeyA', 'TouchLeft'], right: ['KeyD', 'TouchRight'], up: ['KeyW', 'TouchUp'], down: ['KeyS', 'TouchDown'],
      lasso: ['KeyQ', 'TouchLasso'], grip: ['KeyE', 'TouchGrip'], knot: ['KeyR', 'TouchKnot'],
    },
    p2: {
      left: ['KeyJ', 'ArrowLeft'], right: ['KeyL', 'ArrowRight'], up: ['KeyI', 'ArrowUp'], down: ['KeyK', 'ArrowDown'],
      lasso: ['KeyU', 'Numpad1', 'ShiftRight'], grip: ['KeyO', 'Numpad2', 'ControlRight'], knot: ['KeyP', 'Numpad3', 'NumpadEnter'],
    },
    solo: {
      left: ['KeyA', 'ArrowLeft', 'TouchLeft'], right: ['KeyD', 'ArrowRight', 'TouchRight'],
      up: ['KeyW', 'ArrowUp', 'Space', 'TouchUp'], down: ['KeyS', 'ArrowDown', 'TouchDown'],
      lasso: ['KeyQ', 'KeyJ', 'TouchLasso'], grip: ['KeyE', 'KeyK', 'TouchGrip'], knot: ['KeyR', 'KeyL', 'TouchKnot'],
      swap: ['Tab', 'TouchSwap'], merge: ['KeyF', 'TouchMerge'],
    },
  };
  FF.KEYS = KEYS;

  const LABELS = {
    kb: {
      solo: { move: 'A D', up: 'W', updown: 'W S', lasso: 'Q', grip: 'E', knot: 'R', swap: 'Tab', merge: 'F' },
      coop: { move: 'A D/J L', up: 'W/I', updown: 'W S/I K', lasso: 'Q/U', grip: 'E/O', knot: 'R/P', swap: '', merge: '' },
    },
    pad: { move: '◀ ▶', up: 'A', updown: '▲ ▼', lasso: 'X', grip: 'RB', knot: 'B', swap: 'Y', merge: 'LB' },
    touch: { move: '◀ ▶', up: '▲', updown: '▲ ▼', lasso: 'Lasso', grip: 'Halten', knot: 'Knoten', swap: 'Wechsel', merge: 'Huckepack' },
  };

  const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftRight', 'ControlRight']);

  class Input {
    constructor() {
      this.down = new Set();
      this.hit = new Set();
      this.padPrev = {};
      this.pads = [];
      this.device = 'kb';
      this.captureGame = false;
      addEventListener('keydown', (e) => {
        if (this.captureGame && PREVENT.has(e.code)) e.preventDefault();
        if (!this.down.has(e.code)) this.hit.add(e.code);
        this.down.add(e.code);
        this.device = 'kb';
      });
      addEventListener('keyup', (e) => this.down.delete(e.code));
      addEventListener('blur', () => this.down.clear());
    }

    press(code) { if (!this.down.has(code)) this.hit.add(code); this.down.add(code); this.device = 'touch'; }
    release(code) { this.down.delete(code); }

    poll() {
      let list = [];
      try { list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; } catch (e) { list = []; }
      this.pads = list.map((gp) => {
        const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const cur = {
          left: ax < -0.4 || b(14), right: ax > 0.4 || b(15), up: ay < -0.55 || b(12), down: ay > 0.55 || b(13),
          a: b(0), b: b(1), x: b(2), y: b(3), lb: b(4), rb: b(5) || b(7), lt: b(6), start: b(9), select: b(8),
        };
        const prev = this.padPrev[gp.index] || {};
        const edge = {};
        let any = false;
        for (const k in cur) { edge[k] = cur[k] && !prev[k]; if (edge[k]) any = true; }
        if (any) this.device = 'pad';
        this.padPrev[gp.index] = cur;
        return { cur, edge, index: gp.index };
      });
    }

    k(codes) { for (const c of codes) if (this.down.has(c)) return 1; return 0; }
    e(codes) { for (const c of codes) if (this.hit.has(c)) return 1; return 0; }

    addKeys(c, m) {
      c.left |= this.k(m.left); c.right |= this.k(m.right); c.up |= this.k(m.up); c.down |= this.k(m.down);
      c.grip |= this.k(m.grip); c.jumpHold |= this.k(m.up);
      c.jumpP |= this.e(m.up); c.lassoP |= this.e(m.lasso); c.knotP |= this.e(m.knot); c.downP |= this.e(m.down);
      if (m.swap) c.swapP |= this.e(m.swap);
      if (m.merge) c.mergeP |= this.e(m.merge);
    }

    addPad(c, p) {
      const u = p.cur, e = p.edge;
      c.left |= u.left; c.right |= u.right; c.up |= u.up; c.down |= u.down;
      c.grip |= u.rb || u.lt; c.jumpHold |= u.a || u.up;
      c.jumpP |= e.a; c.jumpBtnP |= e.a; c.lassoP |= e.x; c.knotP |= e.b; c.downP |= e.down;
      c.swapP |= e.y; c.mergeP |= e.lb;
    }

    controls(mode) {
      const out = [FF.makeCtl(), FF.makeCtl()];
      for (const c of out) for (const k in c) c[k] = 0;
      if (mode === 'solo') {
        this.addKeys(out[0], KEYS.solo);
        for (const p of this.pads) this.addPad(out[0], p);
      } else {
        this.addKeys(out[0], KEYS.p1);
        this.addKeys(out[1], KEYS.p2);
        if (this.pads.length >= 2) { this.addPad(out[0], this.pads[0]); this.addPad(out[1], this.pads[1]); }
        else if (this.pads.length === 1) this.addPad(out[1], this.pads[0]);
      }
      return out;
    }

    global() {
      const g = { pause: this.e(['Escape']), mute: this.e(['KeyM']), up: 0, down: 0, ok: 0, back: 0 };
      for (const p of this.pads) {
        g.pause |= p.edge.start; g.up |= p.edge.up; g.down |= p.edge.down; g.ok |= p.edge.a; g.back |= p.edge.b;
      }
      g.up |= this.e(['ArrowUp']); g.down |= this.e(['ArrowDown']);
      return g;
    }

    labels(mode) {
      if (this.device === 'pad') return LABELS.pad;
      if (this.device === 'touch') return LABELS.touch;
      return LABELS.kb[mode] || LABELS.kb.solo;
    }

    endFrame() { this.hit.clear(); }
  }

  FF.Input = Input;
})();
