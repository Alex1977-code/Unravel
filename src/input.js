'use strict';
// Eingabe: Tastatur (eine oder zwei Personen), Gamepads (USB/Bluetooth), Touch-Joystick
// und "virtuelle" Controller (Handys im WLAN/Internet).
(function () {
  const FF = globalThis.FF;

  const KEYS = {
    p1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], lasso: ['KeyQ'], grip: ['KeyE'], knot: ['KeyR'] },
    p2: {
      left: ['KeyJ', 'ArrowLeft'], right: ['KeyL', 'ArrowRight'], up: ['KeyI', 'ArrowUp'], down: ['KeyK', 'ArrowDown'],
      lasso: ['KeyU', 'Numpad1', 'ShiftRight'], grip: ['KeyO', 'Numpad2', 'ControlRight'], knot: ['KeyP', 'Numpad3', 'NumpadEnter'],
    },
    solo: {
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp', 'Space'], down: ['KeyS', 'ArrowDown'],
      lasso: ['KeyQ', 'KeyJ'], grip: ['KeyE', 'KeyK'], knot: ['KeyR', 'KeyL'], swap: ['Tab'], merge: ['KeyF'],
    },
  };
  FF.KEYS = KEYS;

  const LABELS = {
    kb: {
      solo: { move: 'A D', up: 'W', updown: 'W S', lasso: 'Q', grip: 'E', knot: 'R', swap: 'Tab', merge: 'F' },
      coop: { move: 'A D/J L', up: 'W/I', updown: 'W S/I K', lasso: 'Q/U', grip: 'E/O', knot: 'R/P', swap: '', merge: '' },
    },
    pad: { move: '◀ ▶', up: 'A', updown: '▲ ▼', lasso: 'X', grip: 'RB', knot: 'B', swap: 'Y', merge: 'LB' },
    touch: { move: 'Stick', up: 'Sprung', updown: 'Stick ▲▼', lasso: 'Lasso', grip: 'Halten', knot: 'Knoten', swap: 'Wechsel', merge: 'Huckepack' },
  };

  const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftRight', 'ControlRight']);
  const PRESS_KEYS = ['jump', 'jumpk', 'lasso', 'knot', 'swap', 'merge', 'down', 'pause'];

  // Zustand eines virtuellen Controllers (Touch oder Handy):
  // gehaltene Richtungen/Tasten + Zähler für Tastendrücke, damit kein Druck verloren geht.
  FF.makePadState = () => ({ left: 0, right: 0, up: 0, down: 0, jump: 0, grip: 0, n: { jump: 0, jumpk: 0, lasso: 0, knot: 0, swap: 0, merge: 0, down: 0, pause: 0 } });

  class Input {
    constructor() {
      this.down = new Set();
      this.hit = new Set();
      this.padPrev = {};
      this.pads = [];
      this.device = 'kb';
      this.captureGame = false;
      this.virtual = {};       // name -> { slot, state }
      this.lastN = {};
      this.padMap = FF.store.get('padmap', {});
      addEventListener('keydown', (e) => {
        if (this.captureGame && PREVENT.has(e.code)) e.preventDefault();
        if (!this.down.has(e.code)) this.hit.add(e.code);
        this.down.add(e.code);
        this.device = 'kb';
      });
      addEventListener('keyup', (e) => this.down.delete(e.code));
      addEventListener('blur', () => this.down.clear());
    }

    padKey(gp) { return gp.index + ':' + (gp.id || '').slice(0, 40); }
    // Zuordnung Gamepad -> Spieler: 'auto', 0 (Rot), 1 (Blau) oder 'off'
    assignment(gp) { const v = this.padMap[this.padKey(gp)]; return v === undefined ? 'auto' : v; }
    setAssignment(gp, v) { this.padMap[this.padKey(gp)] = v; FF.store.set('padmap', this.padMap); }

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
        return { cur, edge, index: gp.index, id: gp.id, gp, any: Object.values(cur).some(Boolean) };
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

    // Kanten aus den Zählern eines virtuellen Controllers ableiten.
    virtualEdges(name, st) {
      const last = this.lastN[name] || (this.lastN[name] = {});
      const e = {};
      for (const k of PRESS_KEYS) { e[k] = (st.n[k] || 0) > (last[k] || 0) ? 1 : 0; last[k] = st.n[k] || 0; }
      return e;
    }

    addVirtual(c, st, e) {
      c.left |= st.left; c.right |= st.right; c.up |= st.up; c.down |= st.down;
      c.grip |= st.grip; c.jumpHold |= st.jump;
      c.jumpP |= e.jump | e.jumpk; c.jumpBtnP |= e.jump; c.lassoP |= e.lasso; c.knotP |= e.knot;
      c.downP |= e.down; c.swapP |= e.swap; c.mergeP |= e.merge;
    }

    setVirtual(name, slot, state) {
      if (!state) { delete this.virtual[name]; delete this.lastN[name]; return; }
      this.virtual[name] = { slot, state };
    }

    // Steuerung für beide Figuren. opts.local = false: keine Tastatur/Gamepads dieses Geräts (Fernseher-Gast).
    controls(mode, opts = {}) {
      const out = [FF.makeCtl(), FF.makeCtl()];
      for (const c of out) for (const k in c) c[k] = 0;
      const local = opts.local !== false;
      this.vEdges = {};
      for (const name in this.virtual) {
        const v = this.virtual[name];
        const e = this.virtualEdges(name, v.state);
        this.vEdges[name] = e;
        const slot = mode === 'solo' ? 0 : v.slot;
        if (slot === 0 || slot === 1) this.addVirtual(out[slot], v.state, e);
      }
      if (!local) return out;
      if (mode === 'solo') {
        this.addKeys(out[0], KEYS.solo);
        for (const p of this.pads) if (this.assignment(p) !== 'off') this.addPad(out[0], p);
      } else {
        if (!opts.noKeysP1) this.addKeys(out[0], KEYS.p1);
        if (!opts.noKeysP2) this.addKeys(out[1], KEYS.p2);
        const auto = this.pads.filter((p) => this.assignment(p) === 'auto');
        for (const p of this.pads) {
          const a = this.assignment(p);
          if (a === 0 || a === 1) this.addPad(out[a], p);
        }
        // Ohne feste Zuordnung: zwei Gamepads -> Rot und Blau, eines -> der freie Platz
        const free = opts.freeSlots || [0, 1];
        if (auto.length >= 2) { this.addPad(out[free[0] ?? 0], auto[0]); this.addPad(out[free[1] ?? 1], auto[1]); }
        else if (auto.length === 1) this.addPad(out[free.length === 1 ? free[0] : 1], auto[0]);
      }
      return out;
    }

    global() {
      const g = { pause: this.e(['Escape']), mute: this.e(['KeyM']), up: 0, down: 0, ok: 0, back: 0 };
      for (const p of this.pads) {
        g.pause |= p.edge.start; g.up |= p.edge.up; g.down |= p.edge.down; g.ok |= p.edge.a; g.back |= p.edge.b;
      }
      for (const name in this.vEdges || {}) g.pause |= this.vEdges[name].pause;
      g.up |= this.e(['ArrowUp']); g.down |= this.e(['ArrowDown']);
      return g;
    }

    labels(mode) {
      if (this.device === 'pad') return LABELS.pad;
      if (this.device === 'touch') return LABELS.touch;
      return LABELS.kb[mode] || LABELS.kb.solo;
    }

    // Rückmeldung per Vibration: Gamepads des Spielers und das Handy selbst.
    rumble(slot, strong, ms) {
      for (const p of this.pads) {
        const a = this.assignment(p);
        if (a === 'off' || (typeof a === 'number' && a !== slot)) continue;
        const act = p.gp && p.gp.vibrationActuator;
        if (act && act.playEffect) {
          try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: Math.min(1, strong + 0.2) }); } catch (e) { /* nicht unterstützt */ }
        }
      }
      if (this.device === 'touch' && navigator.vibrate) { try { navigator.vibrate(Math.round(ms * 0.6)); } catch (e) { /* egal */ } }
    }

    endFrame() { this.hit.clear(); }
  }

  FF.Input = Input;
})();
