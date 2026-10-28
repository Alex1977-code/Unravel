'use strict';
// Touch-Steuerung im Gamepad-Look: Analogstick links (wandert zum Daumen), Aktionstasten als Raute rechts.
// Wird lokal genutzt und auch als Handy-Controller für den Fernseher.
(function () {
  const FF = globalThis.FF;

  // Symbole (24er-Raster, nur Linien)
  const ICON = {
    jump: '<path d="M12 19V6M6.5 11.5L12 6l5.5 5.5"/><path d="M8 21h8" opacity=".5"/>',
    lasso: '<ellipse cx="13.5" cy="9" rx="6.5" ry="4.5"/><path d="M9.5 12.5c-1.5 2-2.5 4.5-5 7"/>',
    grip: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 5 14.5V12a1.5 1.5 0 0 1 3 0"/>',
    knot: '<path d="M4 12c2.5-5 6-5 8 0s5.5 5 8 0M4 12c2.5 5 6 5 8 0s5.5-5 8 0"/>',
    swap: '<path d="M5 9h13l-3.5-3.5M19 15H6l3.5 3.5"/>',
    merge: '<circle cx="12" cy="6.5" r="2.5"/><circle cx="12" cy="14" r="3.5"/><path d="M8 21c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

  // Wie ein Gamepad: Schultertasten oben, Aktionstasten als Raute (Sprung unten, wie A)
  const BUTTONS = [
    { act: 'swap', label: 'Wechsel', cls: 'tb-shoulder tb-swap', solo: true },
    { act: 'merge', label: 'Huckepack', cls: 'tb-shoulder tb-merge', solo: true },
    { act: 'knot', label: 'Knoten', cls: 'tb-face tb-knot' },
    { act: 'grip', label: 'Halten', cls: 'tb-face tb-grip', hold: true },
    { act: 'lasso', label: 'Lasso', cls: 'tb-face tb-lasso' },
    { act: 'jump', label: 'Sprung', cls: 'tb-face tb-jump', hold: true },
  ];

  class TouchPad {
    constructor(root, opts = {}) {
      this.root = root;
      this.state = FF.makePadState();
      this.onChange = opts.onChange || (() => {});
      this.haptic = opts.haptic !== false;
      root.classList.add('touchpad');
      const btn = (b) => `<button type="button" class="tb ${b.cls}" data-act="${b.act}"${b.solo ? ' data-solo="1"' : ''} aria-label="${b.label}">${svg(b.act)}<span>${b.label}</span></button>`;
      root.innerHTML = `
        <div class="tp-zone" aria-label="Joystick: ziehen zum Laufen, Klettern und Schwingen">
          <div class="tp-base"><i class="tp-arrows"></i><div class="tp-knob"></div></div>
        </div>
        <div class="tp-buttons">
          <div class="tp-shoulders">${BUTTONS.slice(0, 2).map(btn).join('')}</div>
          <div class="tp-face">${BUTTONS.slice(2).map(btn).join('')}</div>
        </div>`;
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
      const z = this.zone;
      let R = 50;   // Weg des Knopfs, passt sich der Größe des Sticks an
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
        R = Math.max(34, this.base.offsetWidth * 0.36);
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
