'use strict';
// Touch-Steuerung: frei platzierbarer Joystick links, Aktionsknöpfe rechts.
// Wird lokal genutzt und auch als Handy-Controller für den Fernseher.
(function () {
  const FF = globalThis.FF;

  const BUTTONS = [
    { act: 'swap', label: 'Wechsel', cls: 'tb-small tb-swap', solo: true },
    { act: 'merge', label: 'Huckepack', cls: 'tb-small tb-merge', solo: true },
    { act: 'knot', label: 'Knoten', cls: 'tb-knot' },
    { act: 'grip', label: 'Halten', cls: 'tb-grip', hold: true },
    { act: 'lasso', label: 'Lasso', cls: 'tb-lasso' },
    { act: 'jump', label: 'Sprung', cls: 'tb-jump', hold: true },
  ];

  class TouchPad {
    constructor(root, opts = {}) {
      this.root = root;
      this.state = FF.makePadState();
      this.onChange = opts.onChange || (() => {});
      this.haptic = opts.haptic !== false;
      root.classList.add('touchpad');
      root.innerHTML = `
        <div class="tp-zone" aria-label="Joystick: ziehen zum Laufen, Klettern und Schwingen">
          <div class="tp-base"><div class="tp-knob"></div></div>
        </div>
        <div class="tp-buttons">${BUTTONS.map((b) => `<button type="button" class="tb ${b.cls}" data-act="${b.act}"${b.solo ? ' data-solo="1"' : ''}>${b.label}</button>`).join('')}</div>`;
      this.zone = root.querySelector('.tp-zone');
      this.base = root.querySelector('.tp-base');
      this.knob = root.querySelector('.tp-knob');
      this.stickId = null;
      this.bindStick();
      root.querySelectorAll('.tb').forEach((b) => this.bindButton(b, BUTTONS.find((x) => x.act === b.dataset.act)));
      root.addEventListener('contextmenu', (e) => e.preventDefault());
      this.setSolo(!!opts.solo);
    }

    setSolo(solo) { this.root.querySelectorAll('[data-solo]').forEach((b) => (b.hidden = !solo)); }

    buzz(ms) { if (this.haptic && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* egal */ } } }

    bindStick() {
      const z = this.zone, R = 56;
      let ox = 0, oy = 0;
      const place = (x, y) => {
        const r = z.getBoundingClientRect();
        this.base.style.left = x - r.left + 'px';
        this.base.style.top = y - r.top + 'px';
      };
      const set = (dx, dy) => {
        const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
        this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        const nx = dx / R, ny = dy / R, s = this.state;
        const wasDown = s.down;
        s.left = nx < -0.32 ? 1 : 0;
        s.right = nx > 0.32 ? 1 : 0;
        s.up = ny < -0.5 ? 1 : 0;
        s.down = ny > 0.55 ? 1 : 0;
        if (s.down && !wasDown) s.n.down++;
        this.onChange(s);
      };
      z.addEventListener('pointerdown', (e) => {
        if (this.stickId !== null) return;
        e.preventDefault();
        this.stickId = e.pointerId;
        try { z.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
        ox = e.clientX; oy = e.clientY;
        place(ox, oy);
        this.base.classList.add('on');
        set(0, 0);
      });
      z.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.stickId) return;
        e.preventDefault();
        let dx = e.clientX - ox, dy = e.clientY - oy;
        // Basis wandert mit, wenn man weit zieht: angenehmer auf kleinen Bildschirmen
        const d = Math.hypot(dx, dy);
        if (d > R * 1.6) { ox += (dx / d) * (d - R * 1.6); oy += (dy / d) * (d - R * 1.6); place(ox, oy); dx = e.clientX - ox; dy = e.clientY - oy; }
        set(dx, dy);
      });
      const end = (e) => {
        if (e.pointerId !== this.stickId) return;
        this.stickId = null;
        this.base.classList.remove('on');
        this.base.style.left = ''; this.base.style.top = '';
        set(0, 0);
      };
      z.addEventListener('pointerup', end);
      z.addEventListener('pointercancel', end);
    }

    bindButton(el, def) {
      const down = (e) => {
        e.preventDefault();
        el.classList.add('on');
        const s = this.state;
        if (def.act === 'jump') { s.jump = 1; s.n.jump++; }
        else if (def.act === 'grip') s.grip = 1;
        else s.n[def.act]++;
        this.buzz(def.act === 'lasso' ? 14 : 8);
        this.onChange(s);
      };
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('on');
        if (def.act === 'jump') this.state.jump = 0;
        if (def.act === 'grip') this.state.grip = 0;
        this.onChange(this.state);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', (e) => { if (el.classList.contains('on')) up(e); });
    }

    reset() {
      Object.assign(this.state, { left: 0, right: 0, up: 0, down: 0, jump: 0, grip: 0 });
      this.root.querySelectorAll('.tb.on').forEach((b) => b.classList.remove('on'));
      this.onChange(this.state);
    }
  }

  FF.TouchPad = TouchPad;
})();
