'use strict';
// Umweg über einen öffentlichen Nachrichtenvermittler (MQTT über sichere WebSockets), wenn zwei Geräte keine direkte
// WebRTC-Verbindung bekommen – etwa im Mobilfunk oder hinter strengen Routern. Läuft über Port 443-ähnliche
// WSS-Verbindungen, die fast jedes Netz erlaubt. Hier steckt ein kleiner MQTT-3.1.1-Client (nur QoS 0) und eine
// Verbindung, die sich nach außen wie eine PeerJS-Datenverbindung verhält (send, close, on('data'|'close'|'error')).
(function () {
  const FF = globalThis.FF;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const TOPIC = 'verstrickt-v1/';

  FF.relayBrokers = () => {
    const q = new URLSearchParams(location.search).get('relay');
    if (q) return q.split(',');
    return ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  };

  const u16 = (n) => [(n >> 8) & 255, n & 255];
  const mstr = (s) => { const b = enc.encode(s); return [...u16(b.length), ...b]; };
  function packet(type, body) {
    const len = [];
    let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = type; out.set(len, 1); out.set(body, 1 + len.length);
    return out;
  }

  class Mqtt {
    constructor(url) { this.url = url; this.buf = new Uint8Array(0); this.subs = new Map(); this.pid = 1; this.onMessage = null; this.onClose = null; }
    connect(timeout = 7000) {
      return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { reject(e); return; }
        this.ws = ws;
        ws.binaryType = 'arraybuffer';
        let ok = false;
        const t = setTimeout(() => { if (!ok) { this.close(); reject(new Error('Zeitüberschreitung')); } }, timeout);
        ws.onopen = () => {
          const id = 'vs' + Math.random().toString(36).slice(2, 12);
          ws.send(packet(0x10, new Uint8Array([...mstr('MQTT'), 4, 0x02, ...u16(30), ...mstr(id)])));
        };
        ws.onmessage = (e) => this.feed(new Uint8Array(e.data), () => { ok = true; clearTimeout(t); resolve(this); });
        ws.onerror = () => { if (!ok) { clearTimeout(t); reject(new Error('Keine Verbindung zu ' + this.url)); } };
        ws.onclose = () => {
          clearInterval(this.ping);
          if (!ok) { clearTimeout(t); reject(new Error('Verbindung geschlossen')); return; }
          if (!this.closed && this.onClose) this.onClose();
        };
        this.ping = setInterval(() => { if (ws.readyState === 1) ws.send(new Uint8Array([0xc0, 0])); }, 15000);
      });
    }
    feed(chunk, onConnack) {
      const b = new Uint8Array(this.buf.length + chunk.length);
      b.set(this.buf); b.set(chunk, this.buf.length);
      let i = 0;
      while (b.length - i >= 2) {
        let len = 0, mul = 1, j = i + 1;
        for (;;) {
          if (j >= b.length) { this.buf = b.slice(i); return; }
          const d = b[j++]; len += (d & 127) * mul; mul *= 128;
          if (!(d & 128)) break;
        }
        if (b.length < j + len) break;
        const type = b[i] >> 4, flags = b[i] & 15, body = b.subarray(j, j + len);
        if (type === 2) { if (body[1] === 0) onConnack(); else this.close(); }
        else if (type === 9) { const id = (body[0] << 8) | body[1]; const r = this.subs.get(id); if (r) { this.subs.delete(id); r(); } }
        else if (type === 3) {
          const tl = (body[0] << 8) | body[1];
          const topic = dec.decode(body.subarray(2, 2 + tl));
          const off = 2 + tl + (((flags >> 1) & 3) ? 2 : 0);
          if (this.onMessage) { try { this.onMessage(topic, dec.decode(body.subarray(off))); } catch (e) { /* kaputte Nachricht */ } }
        }
        i = j + len;
      }
      this.buf = b.slice(i);
    }
    sub(topic) {
      return new Promise((resolve) => {
        const id = this.pid++ & 0xffff || 1;
        this.subs.set(id, resolve);
        this.raw(packet(0x82, new Uint8Array([...u16(id), ...mstr(topic), 0])));
        setTimeout(resolve, 4000);
      });
    }
    pub(topic, text) {
      const t = mstr(topic), p = enc.encode(text);
      const body = new Uint8Array(t.length + p.length);
      body.set(t); body.set(p, t.length);
      this.raw(packet(0x30, body));
    }
    raw(bytes) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(bytes); } catch (e) { /* weg */ } }
    get open() { return !!this.ws && this.ws.readyState === 1 && !this.closed; }
    close() {
      this.closed = true; clearInterval(this.ping);
      try { if (this.ws && this.ws.readyState === 1) this.ws.send(new Uint8Array([0xe0, 0])); } catch (e) { /* egal */ }
      try { this.ws && this.ws.close(); } catch (e) { /* egal */ }
    }
  }
  FF.Mqtt = Mqtt;

  // Erster Vermittler, der antwortet
  async function anyBroker() {
    const urls = FF.relayBrokers();
    return new Promise((resolve, reject) => {
      let left = urls.length, won = null;
      for (const u of urls) {
        new Mqtt(u).connect().then((m) => { if (won) m.close(); else { won = m; resolve(m); } })
          .catch(() => { if (--left === 0 && !won) reject(new Error('Kein Vermittler erreichbar')); });
      }
    });
  }

  // Kleiner Ereignis-Verteiler wie bei PeerJS
  class Conn {
    constructor() { this.ev = {}; this.open = true; }
    on(name, fn) { (this.ev[name] = this.ev[name] || []).push(fn); return this; }
    emit(name, v) { for (const fn of this.ev[name] || []) fn(v); }
  }

  // Gast-Seite: Verbindung zum Raum über den Vermittler
  class GuestRelay extends Conn {
    constructor(mq, code) {
      super();
      this.mq = mq; this.gid = Math.random().toString(36).slice(2, 12);
      this.peer = 'relay-' + this.gid;
      this.hostTopic = TOPIC + code + '/h';
      this.myTopic = TOPIC + code + '/g/' + this.gid;
      mq.onMessage = (topic, text) => { if (topic === this.myTopic && this.open) this.emit('data', JSON.parse(text)); };
      mq.onClose = () => { if (this.open) { this.open = false; this.emit('close'); } };
    }
    static async connect(code) {
      const mq = await anyBroker();
      const c = new GuestRelay(mq, code);
      await mq.sub(c.myTopic);
      return c;
    }
    send(m) { if (this.open) this.mq.pub(this.hostTopic, JSON.stringify({ f: this.gid, m })); }
    close() {
      if (!this.open) return;
      this.send({ t: 'leave' });
      this.open = false;
      setTimeout(() => this.mq.close(), 100);
      this.emit('close');
    }
  }

  // Gastgeber-Seite: eine Verbindung je Gast, alle über denselben Vermittler
  class HostConn extends Conn {
    constructor(relay, mq, gid) { super(); this.relay = relay; this.mq = mq; this.gid = gid; this.peer = 'relay-' + gid; this.topic = relay.base + '/g/' + gid; this.lastSt = 0; }
    send(m) {
      if (!this.open) return;
      // Zustandsbilder höchstens 20-mal je Sekunde; Töne, Effekte und Hinweise ausgelassener Bilder werden mitgenommen
      if (m.t === 'st') {
        if (this.pend) {
          const merged = Object.assign({}, m);
          for (const k of ['fx', 'sfx', 'ts']) if (this.pend[k]) merged[k] = this.pend[k].concat(m[k] || []);
          m = merged;
        }
        this.pend = m;
        if (!this.timer) {
          const wait = Math.max(0, this.lastSt + 50 - performance.now());
          this.timer = setTimeout(() => {
            this.timer = 0; this.lastSt = performance.now();
            const p = this.pend; this.pend = null;
            if (p && this.open) this.mq.pub(this.topic, JSON.stringify(p));
          }, wait);
        }
        return;
      }
      this.mq.pub(this.topic, JSON.stringify(m));
    }
    close() { if (!this.open) return; this.open = false; this.relay.conns.delete(this.gid); this.emit('close'); }
  }

  class HostRelay {
    constructor(code, onConn) { this.base = TOPIC + code; this.onConn = onConn; this.conns = new Map(); this.mqs = []; }
    // Bei allen erreichbaren Vermittlern lauschen; Gäste nehmen den ersten, der bei ihnen antwortet
    start() {
      for (const u of FF.relayBrokers()) this.listen(u);
    }
    listen(url) {
      if (this.closed) return;
      const mq = new Mqtt(url);
      mq.connect().then(async () => {
        if (this.closed) return mq.close();
        this.mqs.push(mq);
        mq.onMessage = (topic, text) => {
          if (topic !== this.base + '/h') return;
          const { f, m } = JSON.parse(text);
          if (!f || !m) return;
          let c = this.conns.get(f);
          if (!c) {
            if (m.t !== 'hello') return;
            c = new HostConn(this, mq, f);
            this.conns.set(f, c);
            this.onConn(c);
          }
          if (m.t === 'leave') { c.close(); return; }
          c.emit('data', m);
        };
        mq.onClose = () => {
          this.mqs = this.mqs.filter((x) => x !== mq);
          for (const c of [...this.conns.values()]) if (c.mq === mq) c.close();
          setTimeout(() => this.listen(url), 3000);
        };
        await mq.sub(this.base + '/h');
      }).catch(() => { if (!this.closed) setTimeout(() => this.listen(url), 20000); });
    }
    close() {
      this.closed = true;
      for (const c of [...this.conns.values()]) c.close();
      for (const mq of this.mqs) mq.close();
      this.mqs = [];
    }
  }

  FF.GuestRelay = GuestRelay;
  FF.HostRelay = HostRelay;
})();
