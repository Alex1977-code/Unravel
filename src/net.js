'use strict';
// Mehrspieler über Internet und WLAN (WebRTC, Peer-to-Peer über PeerJS).
// Der Gastgeber berechnet das Spiel; Gäste schicken nur ihre Eingaben und bekommen Zustandsbilder zurück.
(function () {
  const FF = globalThis.FF;
  const PREFIX = 'fadenfreunde-v1-';
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r1 = (v) => Math.round(v * 10) / 10;

  FF.randomCode = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  FF.cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = globalThis.FF_VERSION ? src + '?v=' + globalThis.FF_VERSION : src;
      s.dataset.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('Konnte ' + src + ' nicht laden'));
      document.head.appendChild(s);
    });
  }
  FF.loadScript = loadScript;

  async function ensurePeer() {
    if (!globalThis.Peer) await loadScript('vendor/peerjs.min.js');
    if (!globalThis.Peer) throw new Error('PeerJS fehlt');
  }

  function peerOptions() {
    const q = new URLSearchParams(location.search);
    const o = {
      debug: 0,
      // STUN findet den direkten Weg; die TURN-Server von PeerJS leiten weiter, wenn es keinen gibt
      // (Mobilfunk, verschiedene Netze, strenge Router). Ohne sie bleibt die Verbindung oft bei „Verbinde“ hängen.
      config: {
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
          { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
        ],
        sdpSemantics: 'unified-plan',
      },
    };
    if (q.get('peerhost')) {
      o.host = q.get('peerhost');
      o.port = +(q.get('peerport') || 9000);
      o.path = q.get('peerpath') || '/';
      o.secure = q.get('peersecure') === '1';
    }
    return o;
  }

  const ERRORS = {
    'peer-unavailable': 'Kein Raum mit diesem Code gefunden.',
    network: 'Keine Verbindung zum Vermittlungsserver. Bist du online?',
    'server-error': 'Der Vermittlungsserver antwortet nicht.',
    'browser-incompatible': 'Dieser Browser kann kein WebRTC.',
    'socket-error': 'Verbindung zum Vermittlungsserver unterbrochen.',
  };
  const errText = (e) => ERRORS[e && e.type] || (e && e.message) || 'Unbekannter Fehler';

  // -------------------------------------------------------------- Gastgeber
  class Host {
    constructor(h) {
      this.h = h;           // { assignSlot(role), onJoin(info), onLeave(info), onInput(info, state), onNav(info, key), onError(text) }
      this.clients = new Map();
    }
    async open(code, tries = 0) {
      await ensurePeer();
      code = code || FF.randomCode();
      return new Promise((resolve, reject) => {
        const peer = new globalThis.Peer(PREFIX + code, peerOptions());
        let opened = false;
        peer.on('open', () => {
          opened = true; this.peer = peer; this.code = code;
          // Zusätzlich über den Vermittler erreichbar, für Gäste ohne direkten Weg
          if (FF.HostRelay) { this.relay = new FF.HostRelay(code, (c) => this.accept(c)); this.relay.start(); }
          // Wer länger nichts schickt, gilt als getrennt (geschlossene Tabs merkt WebRTC sonst erst spät).
          this.watch = setInterval(() => {
            const now = performance.now();
            for (const c of [...this.clients.values()]) if (now - c.seen > 6000) { try { c.conn.close(); } catch (e) { /* egal */ } this.drop(c); }
            this.revive();
          }, 2000);
          resolve(code);
        });
        this.bind(peer);
        peer.on('error', (e) => {
          if (!opened) {
            peer.destroy();
            if (e.type === 'unavailable-id' && tries < 4) this.open(null, tries + 1).then(resolve, reject);
            else reject(new Error(errText(e)));
          }
        });
      });
    }
    bind(peer) {
      peer.on('connection', (c) => this.accept(c));
      peer.on('disconnected', () => this.revive());
      peer.on('error', (e) => {
        if (peer !== this.peer) return;
        if (e.type === 'unavailable-id') this.reopen();
        else if (['network', 'socket-error', 'socket-closed', 'server-error'].includes(e.type)) setTimeout(() => this.revive(), 2000);
      });
      if (!this.onWake) {
        // iOS legt die Seite beim App-Wechsel schlafen (z. B. um den Code zu verschicken); danach meldet sich der Raum neu an
        this.onWake = () => { if (!document.hidden) this.revive(true); };
        document.addEventListener('visibilitychange', this.onWake);
        globalThis.addEventListener('online', this.onWake);
        globalThis.addEventListener('pageshow', this.onWake);
      }
    }
    // Verbindung zum Vermittlungsserver wiederherstellen, damit neue Mitspieler den Raum finden
    revive(force) {
      const peer = this.peer;
      if (!peer || this.closed) return;
      if (peer.destroyed) return this.reopen();
      const sock = peer.socket && peer.socket._socket;
      const dead = peer.disconnected || (force && sock && sock.readyState !== 1);
      if (!dead) return;
      const now = performance.now();
      if (now - (this.revT || 0) < 1500) return;
      this.revT = now;
      try { if (!peer.disconnected) peer.disconnect(); peer.reconnect(); } catch (e) { this.reopen(); }
    }
    // Neu anmelden unter demselben Code; bestehende Verbindungen zu Mitspielern bleiben
    reopen() {
      if (this.closed || this.reopening) return;
      this.reopening = true;
      const old = this.peer;
      setTimeout(() => {
        this.reopening = false;
        if (this.closed) return;
        const peer = new globalThis.Peer(PREFIX + this.code, peerOptions());
        peer.on('open', () => {
          if (this.closed) return peer.destroy();
          if (old && old !== peer) { try { old.disconnect(); } catch (e) { /* egal */ } }
          this.peer = peer;
        });
        peer.on('error', (e) => { if (e.type === 'unavailable-id') { peer.destroy(); this.reopen(); } });
        this.bind(peer);
      }, 3000);
    }
    accept(conn) {
      const info = { conn, id: conn.peer, role: null, slot: null, name: '', seen: performance.now() };
      conn.on('data', (m) => { info.seen = performance.now(); this.onData(info, m); });
      conn.on('close', () => this.drop(info));
      conn.on('error', () => this.drop(info));
    }
    onData(info, m) {
      if (!m || typeof m !== 'object') return;
      switch (m.t) {
        case 'hello': {
          if (this.clients.has(info.id)) { this.send(info, { t: 'welcome', slot: info.slot, role: info.role }); break; }
          info.role = m.role === 'pad' ? 'pad' : 'player';
          info.name = String(m.name || '').slice(0, 20);
          info.slot = this.h.assignSlot(info);
          if (info.slot === null) { this.send(info, { t: 'full' }); setTimeout(() => info.conn.close(), 300); return; }
          this.clients.set(info.id, info);
          this.send(info, { t: 'welcome', slot: info.slot, role: info.role });
          this.h.onJoin(info);
          break;
        }
        case 'in': if (info.slot !== null) this.h.onInput(info, m.s); break;
        case 'nav': this.h.onNav && this.h.onNav(info, m.k); break;
        case 'ping': this.send(info, { t: 'pong', at: m.at }); break;
      }
    }
    drop(info) {
      if (!this.clients.has(info.id)) return;
      this.clients.delete(info.id);
      this.h.onLeave(info);
    }
    send(info, msg) { try { if (info.conn.open) info.conn.send(msg); } catch (e) { /* Verbindung weg */ } }
    broadcast(msg, role) { for (const c of this.clients.values()) if (!role || c.role === role) this.send(c, msg); }
    get count() { return this.clients.size; }
    close() {
      this.closed = true;
      clearInterval(this.watch);
      if (this.onWake) {
        document.removeEventListener('visibilitychange', this.onWake);
        globalThis.removeEventListener('online', this.onWake);
        globalThis.removeEventListener('pageshow', this.onWake);
      }
      try { this.peer && this.peer.destroy(); } catch (e) { /* egal */ }
      if (this.relay) this.relay.close();
      this.clients.clear();
    }
  }

  // -------------------------------------------------------------- Gast / Controller
  class Client {
    constructor(h) { this.h = h; } // { onMessage(m), onClose(), onError(text), onStatus(text) }
    // Zuerst direkt (WebRTC). Klappt das nicht schnell, parallel der Umweg über den Vermittler (relay.js).
    // Die Begrüßung geht nur über den Weg, der zuerst offen ist; der andere wird geschlossen.
    async join(code, role, name) {
      const status = (t) => this.h.onStatus && this.h.onStatus(t);
      status('Lade …');
      await ensurePeer();
      code = FF.cleanCode(code);
      const relayOnly = new URLSearchParams(location.search).get('relayonly') === '1';
      return new Promise((resolve, reject) => {
        let done = false, tries = 0, found = false, hello = null, retry = 0, relayT = 0, relayStarted = false, helloT = 0;
        const conns = new Set();
        const fail = (t) => {
          if (done) return;
          done = true; clearTimeout(timer); clearTimeout(retry); clearTimeout(relayT); clearInterval(helloT);
          for (const c of conns) { try { c.close(); } catch (e) { /* egal */ } }
          try { peer && peer.destroy(); } catch (e) { /* egal */ }
          reject(new Error(t));
        };
        this.cancel = () => fail('Abgebrochen.');
        const timer = setTimeout(() => fail(found
          ? 'Raum gefunden, aber keine Verbindung möglich. Prüft, ob beide online sind, und versucht es nochmal.'
          : 'Der Raum antwortet nicht. Stimmt der Code und ist der Raum beim Gastgeber noch offen?'), 45000);

        // Gemeinsame Behandlung für beide Wege
        const wire = (conn, sendHello) => {
          conns.add(conn);
          conn.on('data', (m) => {
            if (done) { if (conn === this.conn) { if (m && m.t === 'pong') this.rtt = performance.now() - m.at; else this.h.onMessage(m); } return; }
            if (conn !== hello) return;
            if (m && m.t === 'welcome') {
              done = true; clearTimeout(timer); clearTimeout(retry); clearTimeout(relayT); clearInterval(helloT);
              this.conn = conn; this.via = conn instanceof FF.GuestRelay ? 'relay' : 'direct';
              for (const c of conns) if (c !== conn) { try { c.close(); } catch (e) { /* egal */ } }
              if (this.via === 'relay') { try { peer && peer.destroy(); } catch (e) { /* egal */ } }
              resolve(m);
            } else if (m && m.t === 'full') fail('Der Raum ist schon voll.');
          });
          conn.on('close', () => { conns.delete(conn); if (done && conn === this.conn) this.h.onClose(); });
          if (sendHello) sendHello();
        };
        const greet = (conn) => {
          if (hello || done) { if (conn !== hello) { try { conn.close(); } catch (e) { /* egal */ } } return; }
          hello = conn;
          found = true;
          status('Verbunden, warte auf den Gastgeber …');
          conn.send({ t: 'hello', role, name });
          // Über den Vermittler kann die erste Nachricht verloren gehen, wenn der Raum gerade erst lauscht
          if (conn instanceof FF.GuestRelay) helloT = setInterval(() => { if (!done) conn.send({ t: 'hello', role, name }); }, 3000);
        };

        const startRelay = () => {
          if (relayStarted || done || hello) return;
          relayStarted = true;
          status('Direkter Weg klappt nicht – verbinde über den Umweg …');
          FF.GuestRelay.connect(code).then((rc) => {
            if (done || hello) { rc.close(); return; }
            wire(rc, () => greet(rc));
          }).catch(() => { if (!done && !hello) status('Umweg nicht erreichbar, versuche weiter direkt …'); });
        };

        let peer = null;
        if (relayOnly) { startRelay(); return; }
        status('Verbinde mit dem Vermittlungsserver …');
        peer = new globalThis.Peer(undefined, peerOptions());
        this.peer = peer;
        peer.on('error', (e) => {
          if (done) { if (this.via === 'direct') this.h.onError && this.h.onError(errText(e)); return; }
          // Raum (noch) nicht da, z. B. weil der Gastgeber gerade die App gewechselt hat: nochmal versuchen
          if (e.type === 'peer-unavailable' && tries < 5) { clearTimeout(retry); retry = setTimeout(attempt, 2500); status('Suche den Raum ' + code + ' …'); return; }
          // Vermittlungsserver nicht erreichbar: der Umweg kann trotzdem gehen
          if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { startRelay(); return; }
          if (!relayStarted) fail(errText(e));
        });
        peer.on('disconnected', () => { if (!done) { try { peer.reconnect(); } catch (e) { /* egal */ } } });
        const attempt = () => {
          if (done || hello) return;
          tries++;
          const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
          status(`Verbinde mit Raum ${code} …`);
          wire(conn);
          conn.on('open', () => greet(conn));
          setTimeout(() => {
            const pc = conn.peerConnection;
            if (pc) pc.addEventListener('iceconnectionstatechange', () => {
              if (done || hello) return;
              const st = pc.iceConnectionState;
              if (st === 'checking') { found = true; status('Raum gefunden, baue die Verbindung auf …'); clearTimeout(relayT); relayT = setTimeout(startRelay, 5000); }
              if (st === 'failed' || st === 'disconnected') startRelay();
            });
          }, 0);
        };
        peer.on('open', () => { attempt(); relayT = setTimeout(startRelay, 9000); });
      });
    }
    send(m) { try { if (this.conn && this.conn.open) this.conn.send(m); } catch (e) { /* egal */ } }
    ping() { this.send({ t: 'ping', at: performance.now() }); }
    close() {
      if (this.cancel) this.cancel();
      try { if (this.conn) this.conn.close(); } catch (e) { /* egal */ }
      try { this.peer && this.peer.destroy(); } catch (e) { /* egal */ }
    }
  }

  // -------------------------------------------------------------- Zustandsbilder
  const flat = (pts) => { const o = []; for (const p of pts) o.push(r1(p.x), r1(p.y)); return o; };
  const unflat = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push({ x: a[i], y: a[i + 1], s: 1 }); return o; };

  // Vom Gastgeber: Spiel-Ereignisse (Effekte, Töne, Hinweise) mitschneiden, um sie zu verschicken.
  FF.recordGame = function (g) {
    g.netFx = [];
    for (const k of ['dust', 'splash', 'sparkle']) {
      const orig = g[k].bind(g);
      g[k] = (...args) => {
        const a = k === 'dust' ? [{ x: args[0].x, y: args[0].y, w: args[0].w, h: args[0].h }] : args.map((v) => (typeof v === 'number' ? r1(v) : v));
        g.netFx.push([k, ...a]);
        orig(...args);
      };
    }
  };

  FF.snapshot = function (g, sfx, toasts) {
    const P = g.players.map((p) => [
      r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), p.face,
      (p.grounded ? 1 : 0) | (p.grip ? 2 : 0) | (p.merged ? 4 : 0) | (p.onTether ? 8 : 0) | (p.ledge ? 16 : 0) | (p.pushT > 0 ? 32 : 0),
      r1(p.walk), r1(Math.min(p.throwT, 9)), r1(p.landT), p.climbing, p.carrier, p.miss ? r1(p.miss.t) : -1, p.miss ? p.miss.dir : 0,
    ]);
    const L = g.players.map((p) => (p.lasso ? [p.anchor ? p.anchor.id : -1, r1(p.lasso.len), r1(p.lasso.total), flat(p.lasso.pts)] : 0));
    const T = g.tether;
    const s = {
      t: 'st', lv: g.levelIndex, mode: g.mode, act: g.active, st: g.state, stT: r1(g.stateT), tm: Math.round(g.time * 100) / 100,
      P, L, T: [r1(T.len), r1(T.total), flat(T.pts)],
      cr: g.world.crates.map((c) => [r1(c.x), r1(c.y), c.floating ? 1 : 0, r1(c.strain)]),
      br: g.world.bridges.map((b) => [b.a.id, b.b.id, r1(b.wob), b.owner]),
      bd: g.beads.map((b) => (b.got ? 1 : 0)).join(''),
      cp: g.checkpoints.map((c) => (c.on ? 1 : 0)).join(''),
    };
    if (g.netFx && g.netFx.length) { s.fx = g.netFx; g.netFx = []; }
    if (sfx && sfx.length) s.sfx = sfx;
    if (toasts && toasts.length) s.ts = toasts;
    return s;
  };

  // Beim Gast: Zustandsbild auf das eigene (nicht simulierte) Spiel übertragen.
  FF.applySnapshot = function (g, s) {
    const W = g.world;
    g.active = s.act; g.state = s.st; g.stateT = s.stT;
    if (s.tm !== undefined && Math.abs(g.time - s.tm) > 0.25) g.time = s.tm;   // Uhr für Krabben und Fledermäuse
    s.P.forEach((a, i) => {
      const p = g.players[i];
      const jump = p.tx === undefined || Math.hypot(a[0] - p.x, a[1] - p.y) > 90;
      p.tx = a[0]; p.ty = a[1];
      if (jump) { p.x = a[0]; p.y = a[1]; }
      p.vx = a[2]; p.vy = a[3]; p.face = a[4];
      const f = a[5];
      p.grounded = !!(f & 1); p.grip = !!(f & 2); p.merged = !!(f & 4); p.onTether = !!(f & 8);
      p.ledge = f & 16 ? p.ledge || {} : null; p.pushT = f & 32 ? 0.05 : 0;
      p.walk = a[6]; p.throwT = a[7]; p.landT = a[8]; p.climbing = a[9]; p.carrier = a[10];
      p.miss = a[11] >= 0 ? { t: a[11], dir: a[12] } : null;
      const l = s.L[i];
      if (l) {
        const an = W.anchors[l[0]];
        if (!p.lasso || p.anchor !== an) {
          p.lasso = new FF.Rope(W, { body: p }, { x: an ? an.x : p.x, y: an ? an.y : p.y }, l[1], l[1], 'lasso');
          p.anchor = an;
        }
        p.lasso.len = l[1]; p.lasso.total = l[2]; p.lasso.pts = unflat(l[3]);
      } else { p.lasso = null; p.anchor = null; }
    });
    g.tether.len = s.T[0]; g.tether.total = s.T[1]; g.tether.pts = unflat(s.T[2]);
    s.cr.forEach((a, i) => {
      const c = W.crates[i];
      if (!c) return;
      const jump = c.tx === undefined || Math.hypot(a[0] - c.x, a[1] - c.y) > 90;
      c.tx = a[0]; c.ty = a[1];
      if (jump) { c.x = a[0]; c.y = a[1]; }
      c.floating = !!a[2]; c.strain = a[3];
    });
    const key = s.br.map((b) => b[0] + '-' + b[1]).join(',');
    if (key !== g.bridgeKey) {
      g.bridgeKey = key;
      W.bridges = s.br.map(([a, b, wob, owner]) => {
        const A = W.anchors[a], B = W.anchors[b];
        return { a: A, b: B, ax: A.x, ay: A.y, bx: B.x, by: B.y, wob, owner };
      });
    } else s.br.forEach((b, i) => { W.bridges[i].wob = Math.max(W.bridges[i].wob, b[2]); });
    for (let i = 0; i < g.beads.length; i++) {
      const got = s.bd[i] === '1';
      if (got && !g.beads[i].got) g.beads[i].t = 0;
      g.beads[i].got = got;
    }
    g.checkpoints.forEach((c, i) => (c.on = s.cp[i] === '1'));
    if (s.fx) for (const [k, ...args] of s.fx) if (g[k]) g[k](...args);
  };

  // Weiche Bewegung zwischen den Zustandsbildern (sie kommen ~30-mal pro Sekunde).
  FF.smoothView = function (g, dt) {
    const k = 1 - Math.exp(-dt * 22);
    for (const p of g.players) if (p.tx !== undefined) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    for (const c of g.world.crates) if (c.tx !== undefined) { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; }
  };

  // Eingaben dieses Geräts in einen übertragbaren Controller-Zustand umwandeln.
  FF.ctlToPad = function (c, st) {
    st.left = c.left; st.right = c.right; st.up = c.up; st.down = c.down; st.grip = c.grip; st.jump = c.jumpHold;
    if (c.jumpBtnP) st.n.jump++; else if (c.jumpP) st.n.jumpk = (st.n.jumpk || 0) + 1;
    if (c.lassoP) st.n.lasso++;
    if (c.knotP) st.n.knot++;
    if (c.downP) st.n.down++;
    if (c.swapP) st.n.swap++;
    if (c.mergeP) st.n.merge++;
    return st;
  };

  FF.NetHost = Host;
  FF.NetClient = Client;
})();
