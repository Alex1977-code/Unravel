'use strict';
// Klang: nordisch-luftige Musik (Filz-Klavier, Streicher, Stimme, Rahmentrommel) und Naturgeräusche je Level.
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

  // Wie viel Trommel, Stimme und elektronische Ticks je Welt
  const STYLE = {
    garden: { drum: 0, voice: 0.5, tick: 0.25 }, quarry: { drum: 0.45, voice: 0.6, tick: 0 }, pond: { drum: 0, voice: 0.4, tick: 0.35 },
    autumn: { drum: 0.6, voice: 0.5, tick: 0.1 }, dusk: { drum: 0.3, voice: 0.8, tick: 0 }, marsh: { drum: 0.25, voice: 0.6, tick: 0.1 },
    coast: { drum: 0, voice: 0.5, tick: 0.3 }, winter: { drum: 0.2, voice: 0.9, tick: 0 }, scrap: { drum: 0.5, voice: 0.3, tick: 0.6 },
    halloween: { drum: 0.7, voice: 0.7, tick: 0.15 }, lighthouse: { drum: 0.85, voice: 0.6, tick: 0 }, aurora: { drum: 0.3, voice: 1, tick: 0.1 },
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
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.5;
      this.musicBus.connect(this.master);
      this.musicSend = c.createGain(); this.musicSend.gain.value = 0.45;
      this.musicBus.connect(this.musicSend); this.musicSend.connect(this.reverb);
      // Weiter, dunkler Raum für Streicher, Stimme und Glitzern (etwa 6 Sekunden Nachhall)
      this.musicVerb = c.createConvolver();
      const vl = c.sampleRate * 6, vir = c.createBuffer(2, vl, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = vir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < vl; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * Math.pow(1 - i / vl, 3.2) * 1.6; }
      }
      this.musicVerb.buffer = vir;
      this.musicVerbSend = c.createGain(); this.musicVerbSend.gain.value = 0.55;
      this.musicVerbSend.connect(this.musicVerb);
      const mvg = c.createGain(); mvg.gain.value = 0.6;
      this.musicVerb.connect(mvg); mvg.connect(this.master);
      this.musicBus.connect(this.musicVerbSend);
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
      this.step = 0; this.voiceLast = 0;
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

    // ---------------------------------------------------------- Instrumente der Musik
    // Nordisch, luftig, modern: Klavier mit Filzdämpfer, Streicher, eine wortlose Stimme, Rahmentrommel,
    // dazu Glitzern, Bandrauschen und leise elektronische Ticks. Alles erzeugt, nichts aufgenommen.

    // Klavier mit Filz: wenige, leicht verstimmte Teiltöne, die oberen klingen schneller ab; dumpfer Filter,
    // dazu der weiche Anschlag des Hammers und ein leises Klacken der Mechanik.
    piano(midi, t, vol, pan) {
      const c = this.ctx, f = mtof(midi);
      const out = c.createGain(); out.gain.value = vol;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, 700 + f * 2.2); lp.Q.value = 0.4;
      lp.connect(out);
      const amps = [1, 0.42, 0.2, 0.1, 0.05], len = 3.2 + 160 / f;
      amps.forEach((am, k) => {
        const n = k + 1, fk = f * n * Math.sqrt(1 + 0.00035 * n * n);
        if (fk > 9000) return;
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = fk; o.detune.value = (Math.random() - 0.5) * 4;
        const dec = len / Math.pow(n, 0.8);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(am, t + 0.006);
        g.gain.exponentialRampToValueAtTime(am * 0.35, t + 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        o.connect(g); g.connect(lp);
        o.start(t); o.stop(t + dec + 0.05);
      });
      // Hammer auf Filz und Mechanik
      this.noise(0.035, 320, 0.09 * vol * 4, 0.8, 0.6, t, 'lowpass', out);
      if (Math.random() < 0.5) this.noise(0.012, 3800, 0.012, 1, 1, t + 0.005, 'highpass', this.musicBus, pan);
      let last = out;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan || 0; out.connect(p); last = p; }
      last.connect(this.musicBus);
    },

    // Streicher: je Ton zwei leicht verstimmte Sägezähne, weich gefiltert, langsames An- und Abschwellen
    strings(midis, t, dur, vol) {
      const c = this.ctx;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(2.2, dur * 0.45));
      g.gain.setValueAtTime(vol, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.2);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(700, t + dur + 2);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 4.6; lg.gain.value = 3; lfo.connect(lg);
      midis.forEach((m, i) => {
        for (const det of [-7, 6]) {
          const o = c.createOscillator(); o.type = 'sawtooth';
          o.frequency.value = mtof(m); o.detune.value = det + (i - 1) * 2;
          lg.connect(o.detune);
          const pg = c.createGain(); pg.gain.value = 1 / midis.length;
          o.connect(pg); pg.connect(lp);
          o.start(t); o.stop(t + dur + 2.4);
        }
      });
      lp.connect(g); g.connect(this.musicBus); g.connect(this.musicVerbSend);
      lfo.start(t); lfo.stop(t + dur + 2.4);
    },

    // Wortlose, hauchige Stimme: Sägezahn durch drei Vokal-Formanten, Atemrauschen, Vibrato, gleitende Tonwechsel
    voice(midi, t, dur, vol) {
      const c = this.ctx, f = mtof(midi);
      const vow = Math.random() < 0.5 ? [[320, 1], [870, 0.6], [2250, 0.25]] : [[650, 1], [1080, 0.7], [2450, 0.25]];
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.7);
      g.gain.setValueAtTime(vol, t + Math.max(0.8, dur - 0.6));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
      const o = c.createOscillator(); o.type = 'sawtooth';
      const from = this.voiceLast ? mtof(this.voiceLast) : f;
      o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.22);
      this.voiceLast = midi;
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.1; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 1.2);
      lfo.connect(lg); lg.connect(o.frequency);
      const sum = c.createGain(); sum.gain.value = 0.5;
      for (const [ff, amp] of vow) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 9;
        const ag = c.createGain(); ag.gain.value = amp * 3;
        o.connect(bp); bp.connect(ag); ag.connect(sum);
      }
      // Atem
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const nb = c.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 1800; nb.Q.value = 0.8;
      const ng = c.createGain(); ng.gain.value = 0.05;
      n.connect(nb); nb.connect(ng); ng.connect(sum);
      sum.connect(g); g.connect(this.musicBus); g.connect(this.musicVerbSend);
      o.start(t); o.stop(t + dur + 1); lfo.start(t); lfo.stop(t + dur + 1); n.start(t, Math.random()); n.stop(t + dur + 1);
    },

    // Rahmentrommel: tiefer, weicher Schlag mit Fellgeräusch – als Herzschlag gespielt
    frameDrum(t, vol) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(78, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.32);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(this.musicBus); g.connect(this.musicVerbSend);
      o.start(t); o.stop(t + 0.75);
      this.noise(0.09, 700, vol * 0.25, 0.7, 0.5, t, 'lowpass', this.musicBus);
    },

    // Glitzern: hoher, weicher Glockenton weit im Raum
    shimmer(midi, t, vol) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = mtof(midi);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
      let last = g;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); last = p; }
      o.connect(g); last.connect(this.musicVerbSend);
      o.start(t); o.stop(t + 3.6);
    },

    // Tiefer, ruhiger Grundton unter dem Akkord
    sub(midi, t, dur, vol) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = mtof(midi);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.8);
      g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
      o.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.7);
    },

    // ---------------------------------------------------------- Musik
    // Aufbau in Abschnitten zu je 8 Takten: erst nur Klavier, dann Streicher, dann Stimme und Trommel,
    // dann ein ruhiger Teil mit Streichern und Stimme. Zwei Klavier-Schleifen verschiedener Länge (7 und 5 Achtel)
    // laufen gegeneinander, so wiederholt sich das Muster lange nicht.
    music(on) {
      if (!this.ctx || this.muted || !on) return;
      const c = this.ctx, M = this.mood, ST = STYLE[this.moodName] || STYLE.garden;
      const eighth = 60 / M.bpm / 2;
      if (this.nextNote < c.currentTime) this.nextNote = c.currentTime + 0.1;
      if (!this.hiss) {
        // feines Bandrauschen als moderner Hintergrund
        const h = c.createBufferSource(); h.buffer = this.noiseBuf; h.loop = true;
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
        const hg = c.createGain(); hg.gain.value = 0.012;
        h.connect(hp); hp.connect(hg); hg.connect(this.musicBus); h.start();
        this.hiss = hg;
      }
      const sc = M.scale;
      const deg = (d) => M.root + sc[((d % 7) + 7) % 7] + Math.floor(d / 7) * 12;
      while (this.nextNote < c.currentTime + 0.4) {
        const t = this.nextNote, s = this.step++;
        const bar = Math.floor(s / 8), pos = s % 8;
        const section = Math.floor(bar / 8) % 4;           // 0 Klavier, 1 + Streicher, 2 voll, 3 ruhig
        const chordStart = bar % 2 === 0 && pos === 0;
        const chord = M.prog[Math.floor(bar / 2) % M.prog.length];
        const tones = [deg(chord), deg(chord + 2), deg(chord + 4)];
        const human = () => Math.random() * 0.018;   // leicht unregelmäßig wie von Hand gespielt
        // Klavier: Schleife A (7 Achtel) in der Mitte, Schleife B (5 Achtel) hoch und spärlich
        if (section !== 3 || pos % 2 === 0) {
          const A = [0, 2, 4, 7, 4, 2, 9];
          const a = A[s % 7];
          if (Math.random() < 0.88) this.piano(deg(chord + a) + 12, t + human(), 0.07 + Math.random() * 0.03, -0.15);
          const B = [4, null, 9, null, 11];
          const bnote = B[s % 5];
          if (section >= 1 && bnote !== null && Math.random() < 0.6) this.piano(deg(chord + bnote) + 24, t + human(), 0.04 + Math.random() * 0.02, 0.3);
        }
        if (chordStart) {
          this.piano(tones[0] - 12, t, 0.08, -0.25);
          if (section >= 1) this.sub(tones[0] - 24, t, eighth * 16, 0.05 * M.drone + 0.03);
          if (section >= 1) this.strings([tones[0], tones[1] + 12, tones[2]], t, eighth * 16, 0.035 + 0.02 * M.drone);
        }
        // Stimme: lange Töne über den Akkorden, schrittweise geführt
        if ((section === 2 || section === 3) && chordStart && Math.random() < 0.35 + M.fiddle * 0.6) {
          let m = this.voiceLast || tones[2] + 12;
          const target = tones[Math.floor(Math.random() * 3)] + 12;
          if (Math.abs(target - m) > 5) m += Math.sign(target - m) * (Math.random() < 0.5 ? 2 : 3); else m = target;
          m = Math.max(M.root + 7, Math.min(M.root + 24, m));
          this.voice(m, t + eighth, eighth * 12, 0.045 * (0.6 + ST.voice * 0.6));
        }
        // Herzschlag der Rahmentrommel im vollen Teil
        if (ST.drum && section === 2 && pos === 0) { this.frameDrum(t, 0.42 * ST.drum); this.frameDrum(t + 0.32, 0.26 * ST.drum); }
        if (ST.drum > 0.5 && section === 1 && pos === 0 && bar % 2 === 1) this.frameDrum(t, 0.25 * ST.drum);
        // leise elektronische Ticks
        if (ST.tick && section >= 1 && section <= 2) {
          if (Math.random() < ST.tick * 0.5) this.noise(0.01, 7000, 0.02, 1, 1, t, 'highpass', this.musicBus, Math.random() - 0.5);
          if (Math.random() < ST.tick * 0.3) this.noise(0.008, 9000, 0.014, 1, 1, t + eighth / 2, 'highpass', this.musicBus, Math.random() - 0.5);
        }
        // Glitzern hoch oben
        if (Math.random() < 0.05 + (section === 3 ? 0.05 : 0)) this.shimmer(deg(chord + [0, 2, 4, 6][Math.floor(Math.random() * 4)]) + 36, t, 0.025);
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
        case 'win': [62, 66, 69, 74, 78, 81].forEach((m, i) => this.piano(m, t + i * 0.13, 0.12, (i - 2.5) * 0.15)); this.voice(74, t + 0.5, 2.2, 0.06); break;
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
