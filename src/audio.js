'use strict';
// Kleine, synthetisierte Geräusche und eine ruhige Zupfmusik. Startet erst nach einer Eingabe.
(function () {
  const FF = globalThis.FF;

  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: FF.store.get('muted', false),
    nextNote: 0,
    step: 0,

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(c.destination);
      this.musicGain = c.createGain();
      this.musicGain.gain.value = 0.16;
      const delay = c.createDelay(1);
      delay.delayTime.value = 0.36;
      const fb = c.createGain(); fb.gain.value = 0.32;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      this.musicGain.connect(this.master);
      this.musicGain.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(this.master);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },

    setMuted(m) {
      this.muted = m;
      FF.store.set('muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
    },

    tone(freq, dur, type, vol, slide, when) {
      const c = this.ctx, t = (when || c.currentTime);
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    },

    noise(dur, freq, vol, q, sweep) {
      const c = this.ctx, t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
      if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + dur);
    },

    play(name, v = 1) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx;
      switch (name) {
        case 'jump': this.tone(330, 0.14, 'triangle', 0.12 * v, 1.6); break;
        case 'boing': this.tone(180, 0.35, 'sine', 0.22 * v, 2.6); this.tone(270, 0.3, 'triangle', 0.08 * v, 2.2); break;
        case 'land': this.noise(0.09, 300, 0.2 * v, 0.8); break;
        case 'lasso': this.noise(0.18, 900, 0.12, 2, 3); this.tone(520, 0.08, 'triangle', 0.06, 1.3, c.currentTime + 0.12); break;
        case 'release': this.noise(0.1, 1400, 0.06 * v, 2, 0.5); break;
        case 'miss': this.noise(0.2, 700, 0.08, 2, 0.6); break;
        case 'knot': [392, 494, 587].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, 1, c.currentTime + i * 0.06)); break;
        case 'ledge': this.noise(0.08, 500, 0.08, 1.2); break;
        case 'bead': this.tone(1046, 0.25, 'sine', 0.12); this.tone(1568, 0.3, 'sine', 0.07, 1, c.currentTime + 0.07); break;
        case 'checkpoint': [523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.1, 1, c.currentTime + i * 0.09)); break;
        case 'splash': this.noise(0.5, 800, 0.35 * v, 0.6, 0.3); break;
        case 'ouch': this.tone(260, 0.3, 'sawtooth', 0.06, 0.5); this.noise(0.15, 2000, 0.08, 1); break;
        case 'thud': this.noise(0.12, 180, 0.3 * v, 0.7); break;
        case 'merge': this.tone(440, 0.12, 'triangle', 0.08, 1.3); break;
        case 'swap': this.tone(660, 0.1, 'triangle', 0.07, 0.8); break;
        case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.09, 1, c.currentTime + i * 0.12)); break;
        case 'click': this.tone(700, 0.05, 'triangle', 0.05); break;
      }
    },

    // Leise Zupfmusik in D-Dur-Pentatonik.
    music(on) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx;
      if (!on) { this.nextNote = 0; return; }
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.1;
      const scale = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99];
      const bass = [146.83, 110, 123.47, 98];
      while (this.nextNote < c.currentTime + 0.3) {
        const t = this.nextNote, s = this.step++;
        if (s % 8 === 0) this.pluck(bass[Math.floor(s / 8) % 4], t, 0.5, 1.8);
        if (Math.random() < 0.42) this.pluck(scale[Math.floor(Math.random() * scale.length)], t, 0.22, 1.1);
        this.nextNote += 0.42;
      }
    },

    pluck(freq, t, vol, dur) {
      const c = this.ctx;
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o2.type = 'sine';
      o.frequency.value = freq; o2.frequency.value = freq * 2.003;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const g2 = c.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicGain);
      o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    },
  };

  FF.audio = audio;
})();
