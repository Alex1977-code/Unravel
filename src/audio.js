'use strict';
// Klang: nordisch-folkige Musik (gezupfte Gitarre, Fidel, Bordun) und Naturgeräusche je Level.
// Alles wird im Browser erzeugt, es gibt keine Audiodateien. Startet erst nach einer Eingabe.
(function () {
  const FF = globalThis.FF;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Tonart, Tempo und Akkordfolge (Stufen der Skala) je Stimmung.
  const MOODS = {
    garden: { root: 50, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 86, prog: [0, 3, 0, 6], fiddle: 0.55, drone: 0, amb: ['wind', 'birds'] },
    quarry: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 70, prog: [0, 5, 2, 6], fiddle: 0.4, drone: 0.5, amb: ['wind', 'wind2', 'crows'] },
    pond: { root: 43, scale: [0, 2, 4, 5, 7, 9, 11], bpm: 90, prog: [0, 4, 5, 3], fiddle: 0.45, drone: 0, amb: ['water', 'birds', 'frogs'] },
    autumn: { root: 52, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 78, prog: [0, 3, 0, 6], fiddle: 0.6, drone: 0.3, amb: ['wind', 'leaves', 'birds'] },
    dusk: { root: 50, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 64, prog: [0, 5, 2, 6], fiddle: 0.7, drone: 0.6, amb: ['wind', 'crickets', 'owl'] },
    marsh: { root: 48, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 74, prog: [0, 6, 3, 4], fiddle: 0.5, drone: 0.4, amb: ['water', 'frogs', 'birds'] },
    coast: { root: 50, scale: [0, 2, 4, 5, 7, 9, 10], bpm: 88, prog: [0, 6, 3, 0], fiddle: 0.45, drone: 0.2, amb: ['waves', 'gulls', 'wind'] },
    winter: { root: 45, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 66, prog: [0, 5, 3, 6], fiddle: 0.6, drone: 0.5, amb: ['wind', 'wind2'] },
    scrap: { root: 46, scale: [0, 1, 3, 5, 7, 8, 10], bpm: 72, prog: [0, 1, 5, 0], fiddle: 0.4, drone: 0.5, amb: ['wind', 'crows', 'clank'] },
    halloween: { root: 45, scale: [0, 2, 3, 5, 7, 8, 11], bpm: 70, prog: [0, 5, 4, 0], fiddle: 0.75, drone: 0.65, amb: ['wind', 'owl', 'crickets', 'creak'] },
    lighthouse: { root: 43, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 68, prog: [0, 5, 6, 4], fiddle: 0.6, drone: 0.55, amb: ['waves', 'wind', 'wind2'] },
    aurora: { root: 52, scale: [0, 2, 4, 6, 7, 9, 11], bpm: 60, prog: [0, 4, 5, 3], fiddle: 0.65, drone: 0.5, amb: ['wind', 'bells'] },
  };

  const audio = {
    ctx: null,
    muted: FF.store.get('muted', false),
    mood: MOODS.garden,
    moodName: 'garden',
    step: 0,
    nextNote: 0,
    pluckCache: new Map(),
    ambT: {},

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      const c = this.ctx;
      this.out = c.createDynamicsCompressor();
      this.out.threshold.value = -16; this.out.ratio.value = 3;
      this.out.connect(c.destination);
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.out);
      // Hall aus abklingendem Rauschen
      this.reverb = c.createConvolver();
      const len = c.sampleRate * 2.8, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      this.reverb.buffer = ir;
      this.revGain = c.createGain(); this.revGain.gain.value = 0.55;
      this.reverb.connect(this.revGain); this.revGain.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.master);
      this.musicSend = c.createGain(); this.musicSend.gain.value = 0.5;
      this.musicBus.connect(this.musicSend); this.musicSend.connect(this.reverb);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.gain.value = 0.5;
      this.ambBus.connect(this.master);
      const ambSend = c.createGain(); ambSend.gain.value = 0.3;
      this.ambBus.connect(ambSend); ambSend.connect(this.reverb);
      this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startBeds();
      this.setMood(this.moodName, true);
    },

    setMuted(m) {
      this.muted = m;
      FF.store.set('muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    },

    // Dauerhafte Geräuschteppiche (Wind, Wasser, Schwung-Rauschen), deren Lautstärke wir steuern.
    startBeds() {
      const c = this.ctx;
      const bed = (type, freq, q) => {
        const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(this.ambBus);
        s.start();
        return { f, g };
      };
      this.wind = bed('bandpass', 380, 0.6);
      this.wind2 = bed('lowpass', 180, 0.4);
      this.water = bed('lowpass', 520, 0.7);
      this.rainHi = bed('highpass', 2600, 0.4);
      this.rainLo = bed('bandpass', 900, 0.5);
      this.swoosh = bed('bandpass', 900, 0.8);
      this.swoosh.g.disconnect(); this.swoosh.g.connect(this.sfxBus);
    },

    setMood(name, force) {
      if (!MOODS[name]) name = 'garden';
      if (this.moodName === name && !force) return;
      this.moodName = name;
      this.mood = MOODS[name];
      if (!this.ctx) return;
      const t = this.ctx.currentTime, a = this.mood.amb;
      this.wind.g.gain.setTargetAtTime(a.includes('wind') ? 0.22 : 0.06, t, 1.5);
      this.wind2.g.gain.setTargetAtTime(a.includes('wind2') ? 0.5 : 0, t, 1.5);
      this.water.g.gain.setTargetAtTime(a.includes('water') || a.includes('waves') ? 0.32 : 0, t, 1.5);
    },

    // ---------------------------------------------------------- Bausteine
    env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },

    tone(freq, dur, type, vol, slide, when, bus) {
      const c = this.ctx, t = when || c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      this.env(g, t, 0.01, vol, dur);
      o.connect(g); g.connect(bus || this.sfxBus);
      o.start(t); o.stop(t + dur + 0.05);
    },

    noise(dur, freq, vol, q, sweep, when, type, bus, pan) {
      const c = this.ctx, t = when || c.currentTime;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
      if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g);
      let last = g;
      if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); last = p; }
      last.connect(bus || this.sfxBus);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
    },

    // Gezupfte Saite nach Karplus-Strong, einmal pro Tonhöhe berechnet.
    pluckBuffer(freq, bright) {
      const key = Math.round(freq * 10) + (bright ? 'b' : '');
      if (this.pluckCache.has(key)) return this.pluckCache.get(key);
      const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * 2.4);
      const buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0);
      const N = Math.max(2, Math.round(sr / freq)), ring = new Float32Array(N);
      for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
      if (!bright) for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) ring[i] = (ring[i] + ring[(i + 1) % N]) * 0.5;
      const damp = 0.9965 + Math.min(0.003, 60 / freq * 0.002);
      let idx = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const a = ring[idx], b = ring[(idx + 1) % N];
        ring[idx] = (a + b) * 0.5 * damp;
        lp += (a - lp) * 0.5;
        d[i] = lp;
        idx = (idx + 1) % N;
      }
      this.pluckCache.set(key, buf);
      return buf;
    },

    pluck(midi, t, vol, pan) {
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.pluckBuffer(mtof(midi), midi > 70);
      const g = c.createGain(); g.gain.value = vol;
      s.connect(g);
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan || 0; g.connect(p); p.connect(this.musicBus); } else g.connect(this.musicBus);
      s.start(t);
    },

    // Gestrichene Saite: zwei Sägezähne, Formant-Filter, verzögertes Vibrato.
    fiddle(midi, t, dur, vol) {
      const c = this.ctx, f = mtof(midi);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.16);
      g.gain.setValueAtTime(vol, t + Math.max(0.17, dur - 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
      const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1100; pk.gain.value = 5; pk.Q.value = 1.2;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.3; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + 0.45);
      lfo.connect(lg);
      for (const det of [-4, 5]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
        o.detune.value = det;
        lg.connect(o.frequency);
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.4);
      }
      lp.connect(pk); pk.connect(g); g.connect(this.musicBus);
      lfo.start(t); lfo.stop(t + dur + 0.4);
    },

    drone(midi, t, dur, vol) {
      const c = this.ctx;
      for (const m of [midi, midi + 7]) {
        const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = mtof(m);
        lp.type = 'lowpass'; lp.frequency.value = 420;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(lp); lp.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + dur + 0.1);
      }
    },

    // ---------------------------------------------------------- Musik
    music(on) {
      if (!this.ctx || this.muted || !on) return;
      const c = this.ctx, M = this.mood;
      const eighth = 60 / M.bpm / 2;
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.1;
      const sc = M.scale;
      const deg = (d) => M.root + sc[((d % 7) + 7) % 7] + Math.floor(d / 7) * 12;
      while (this.nextNote < c.currentTime + 0.35) {
        const t = this.nextNote, s = this.step++;
        const bar = Math.floor(s / 8), pos = s % 8, phrase = Math.floor(bar / 8);
        const chord = M.prog[bar % M.prog.length];
        const tones = [deg(chord), deg(chord + 2), deg(chord + 4)];
        // Gitarre: Bass auf 1, gebrochene Akkorde dazwischen
        if (pos === 0) this.pluck(tones[0] - 12, t, 0.5, -0.2);
        if (pos === 4 && Math.random() < 0.7) this.pluck(deg(chord + 4) - 12, t, 0.32, -0.2);
        const arp = [null, tones[1], tones[2], tones[0] + 12, tones[1] + 12, tones[2], tones[0] + 12, tones[1]];
        if (arp[pos] && Math.random() < 0.82) this.pluck(arp[pos], t + (Math.random() - 0.5) * 0.012, 0.18 + Math.random() * 0.06, 0.25);
        // Bordun am Anfang jeder Phrase
        if (M.drone && s % 64 === 0) this.drone(M.root - 12, t, eighth * 64, 0.05 * M.drone);
        // Fidel: jede zweite Phrase eine ruhige Melodie, die sich an den Akkordtönen orientiert
        if (phrase % 2 === 1 && Math.random() < M.fiddle) {
          if ((pos === 0 || (pos === 4 && Math.random() < 0.5)) && s >= (this.melRest || 0)) {
            const target = tones[Math.floor(Math.random() * 3)] + 12;
            let m = this.melNote || target;
            const stepDir = Math.sign(target - m) || (Math.random() < 0.5 ? -1 : 1);
            const idx = sc.indexOf(((m - M.root) % 12 + 12) % 12);
            if (idx >= 0 && Math.random() < 0.6) {
              const ni = idx + stepDir, oct = Math.floor(ni / 7);
              m = M.root + Math.floor((m - M.root) / 12) * 12 + sc[((ni % 7) + 7) % 7] + oct * 12;
            } else m = target;
            m = Math.max(M.root + 10, Math.min(M.root + 26, m));
            this.melNote = m;
            const len = pos === 0 ? (Math.random() < 0.5 ? 4 : 8) : 4;
            this.fiddle(m, t, eighth * len * 0.98, 0.07);
            this.melRest = s + len;
          }
        }
        this.nextNote += eighth;
      }
    },

    // Wetter (weich überblendete Werte aus FF.WeatherState)
    setWeather(v) { this.wv = v; },

    // Donner: tiefes, langes Grollen mit Knall am Anfang
    thunder(delay) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (delay || 0);
      this.noise(0.35, 1400, 0.22, 0.6, 0.3, t, 'lowpass', this.ambBus);
      this.noise(3.2, 260, 0.5, 0.7, 0.35, t + 0.05, 'lowpass', this.ambBus);
      this.noise(2.4, 120, 0.4, 0.8, 0.6, t + 0.6, 'lowpass', this.ambBus);
    },

    // ---------------------------------------------------------- Natur
    ambience(dt) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, a = this.mood.amb, t = c.currentTime;
      const wv = this.wv || { rain: 0, snow: 0, wind: 0.35 };
      // Wind atmet langsam, bei Sturm in Böen
      const gust = Math.max(0, Math.sin(t * 0.5) * Math.sin(t * 0.23 + 1));
      const w = (0.16 + Math.sin(t * 0.13) * 0.06 + Math.sin(t * 0.37) * 0.04) * (0.6 + wv.wind * 0.9) + gust * Math.max(0, wv.wind - 0.8) * 0.35;
      if (a.includes('wind') || wv.wind > 0.8) this.wind.g.gain.setTargetAtTime(w, t, 0.5);
      this.wind.f.frequency.setTargetAtTime(320 + Math.sin(t * 0.21) * 120 + gust * wv.wind * 200, t, 0.5);
      this.rainHi.g.gain.setTargetAtTime(wv.rain * 0.3, t, 0.8);
      this.rainLo.g.gain.setTargetAtTime(wv.rain * 0.22, t, 0.8);
      const quiet = wv.rain > 0.3 || wv.snow > 0.5;   // bei Regen und Schnee schweigen die Vögel
      const due = (k, min, max) => {
        if (!(k in this.ambT)) this.ambT[k] = t + min * Math.random();
        if (t < this.ambT[k]) return false;
        this.ambT[k] = t + min + Math.random() * (max - min);
        return true;
      };
      const pan = () => Math.random() * 1.6 - 0.8;
      if (a.includes('birds') && !quiet && due('birds', 2.5, 7)) {
        const base = 2400 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 5), p = pan();
        for (let i = 0; i < n; i++) this.chirp(base * (0.9 + Math.random() * 0.25), t + i * (0.09 + Math.random() * 0.08), p);
      }
      if (a.includes('crows') && due('crows', 8, 18)) { const p = pan(); this.caw(t, p); if (Math.random() < 0.6) this.caw(t + 0.45, p); }
      if (a.includes('frogs') && wv.snow < 0.5 && due('frogs', 3, 8)) { const p = pan(); for (let i = 0; i < 3; i++) this.croak(t + i * 0.32, p); }
      if (a.includes('crickets') && !quiet && due('crickets', 0.6, 1.4)) {
        const p = pan(), f = 4200 + Math.random() * 700;
        for (let i = 0; i < 4; i++) this.tone(f, 0.035, 'sine', 0.012, 1, t + i * 0.055, this.ambBus);
        void p;
      }
      if (a.includes('owl') && due('owl', 14, 30)) { this.tone(380, 0.5, 'sine', 0.05, 0.92, t, this.ambBus); this.tone(360, 0.8, 'sine', 0.05, 0.9, t + 0.7, this.ambBus); }
      if (a.includes('leaves') && due('leaves', 1.5, 4)) this.noise(0.6 + Math.random() * 0.6, 3500, 0.05, 0.5, 0.7, t, 'highpass', this.ambBus, pan());
      if (a.includes('water') && due('lap', 1.2, 3)) this.noise(0.5, 700, 0.08, 0.8, 0.5, t, 'lowpass', this.ambBus, pan());
      // Brandung: Wellen rollen heran und ziehen sich zurück
      if (a.includes('waves')) {
        const sw = 0.5 + 0.5 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1);
        this.water.g.gain.setTargetAtTime(0.12 + sw * 0.42, t, 0.6);
        this.water.f.frequency.setTargetAtTime(380 + sw * 700, t, 0.6);
      }
      if (a.includes('gulls') && !quiet && due('gulls', 4, 11)) {
        const p = pan(), f = 1300 + Math.random() * 400;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f * (1 - i * 0.04), 0.22, 'triangle', 0.03, 0.7, t + i * 0.26, this.ambBus);
        void p;
      }
      if (a.includes('clank') && due('clank', 5, 12)) { const f = 600 + Math.random() * 900; this.tone(f, 0.9, 'sine', 0.025, 0.995, t, this.ambBus); this.tone(f * 2.76, 0.5, 'sine', 0.012, 1, t, this.ambBus); }
      if (a.includes('creak') && due('creakAmb', 6, 14)) { this.tone(110 + Math.random() * 40, 1.2, 'sawtooth', 0.008, 1.6, t, this.ambBus); }
      if (a.includes('bells') && due('bells', 3, 7)) { const f = mtof(this.mood.root + 24 + [0, 4, 7, 11, 14][Math.floor(Math.random() * 5)]); this.bell(f, t, 0.03); }
    },

    chirp(f, t, pan) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.5 : 0.7), t + 0.07);
      this.env(g, t, 0.006, 0.025, 0.09);
      o.connect(g);
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.ambBus); } else g.connect(this.ambBus);
      o.start(t); o.stop(t + 0.12);
    },
    caw(t, pan) { this.noise(0.28, 900, 0.05, 4, 0.8, t, 'bandpass', this.ambBus, pan); this.tone(300, 0.25, 'sawtooth', 0.012, 0.85, t, this.ambBus); },
    croak(t, pan) { this.noise(0.14, 260, 0.08, 6, 1.3, t, 'bandpass', this.ambBus, pan); },

    // Laufende Rückmeldung aus dem Spiel: Schritte, Faden-Knarzen, Schwung-Rauschen.
    update(g, dt) {
      if (!this.ctx || this.muted || !g) return;
      const t = this.ctx.currentTime;
      let swing = 0;
      for (const p of g.players) {
        if (p.merged) continue;
        p._step = p._step || 0;
        if (p.grounded && Math.abs(p.vx) > 40) {
          p._step += (Math.abs(p.vx) * dt) / 34;
          if (p._step > 1) { p._step = 0; this.noise(0.05, 1800 + Math.random() * 1200, 0.05, 0.9, 0.6, t, 'bandpass'); }
        }
        if (p.climbing) {
          p._creak = (p._creak || 0) - dt;
          if (p._creak <= 0) { p._creak = 0.16 + Math.random() * 0.1; this.creak(); }
        }
        if (!p.grounded && (p.lasso || p.onTether)) swing = Math.max(swing, Math.hypot(p.vx, p.vy));
      }
      const k = FF.clamp((swing - 160) / 450, 0, 1);
      this.swoosh.g.gain.setTargetAtTime(k * 0.18, t, 0.08);
      this.swoosh.f.frequency.setTargetAtTime(600 + k * 900, t, 0.1);
      this.ambience(dt);
    },

    creak() {
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'sawtooth';
      const base = 140 + Math.random() * 90;
      o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.4, t + 0.08);
      f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 6;
      this.env(g, t, 0.01, 0.035, 0.11);
      o.connect(f); f.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + 0.14);
    },

    // ---------------------------------------------------------- Effekte
    play(name, v = 1) {
      if (this.onPlay) this.onPlay(name, v);
      if (!this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime;
      switch (name) {
        case 'jump': this.noise(0.16, 700, 0.09 * v, 0.8, 2.2); this.tone(260, 0.1, 'sine', 0.04 * v, 1.5); break;
        case 'boing': this.tone(150, 0.45, 'sine', 0.2 * v, 2.4); this.pluck(62, t, 0.25 * v, 0); break;
        case 'land': this.noise(0.12, 260, 0.22 * v, 0.7, 0.6, t, 'lowpass'); break;
        case 'lasso': this.noise(0.22, 600, 0.13, 1.2, 3); this.pluck(74, t + 0.17, 0.18, 0); break;
        case 'release': this.noise(0.14, 1200, 0.07 * v, 1.5, 0.5); break;
        case 'miss': this.noise(0.25, 700, 0.09, 1.5, 0.6); break;
        case 'knot': [69, 74, 78].forEach((m, i) => this.pluck(m, t + i * 0.07, 0.22, 0)); break;
        case 'ledge': this.noise(0.1, 500, 0.08, 1.2, 0.8, t, 'lowpass'); break;
        case 'bead': this.bell(1568, t, 0.07); this.bell(2349, t + 0.08, 0.045); break;
        case 'checkpoint': [62, 66, 69, 74].forEach((m, i) => this.pluck(m, t + i * 0.09, 0.26, 0)); break;
        case 'splash': this.noise(0.7, 900, 0.4 * v, 0.6, 0.25); this.noise(0.3, 2500, 0.15 * v, 0.5, 0.5, t + 0.05, 'highpass'); break;
        case 'ouch': this.noise(0.25, 2200, 0.12, 1, 0.5); this.tone(220, 0.3, 'triangle', 0.05, 0.6); break;
        case 'thud': this.noise(0.18, 160, 0.35 * v, 0.7, 0.6, t, 'lowpass'); break;
        case 'merge': this.pluck(67, t, 0.2, 0); this.pluck(71, t + 0.06, 0.15, 0); break;
        case 'swap': this.pluck(71, t, 0.18, 0); break;
        case 'win': [62, 66, 69, 74, 78, 81].forEach((m, i) => this.pluck(m, t + i * 0.11, 0.3, 0)); this.fiddle(74, t + 0.5, 1.4, 0.08); break;
        case 'click': this.pluck(79, t, 0.12, 0); break;
      }
    },

    bell(f, t, vol) {
      const c = this.ctx;
      const o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), g = c.createGain();
      o.frequency.value = f; m.frequency.value = f * 2.76; mg.gain.value = f * 0.6;
      m.connect(mg); mg.connect(o.frequency);
      this.env(g, t, 0.004, vol, 1.1);
      o.connect(g); g.connect(this.sfxBus);
      const s = c.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(this.reverb);
      o.start(t); m.start(t); o.stop(t + 1.2); m.stop(t + 1.2);
    },
  };

  FF.audio = audio;
})();
