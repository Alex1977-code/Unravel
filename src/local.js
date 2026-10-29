'use strict';
// Zu zweit ohne Internet im selben WLAN (oder über den Hotspot eines Handys): Die Geräte tauschen ihre
// Verbindungsdaten per QR-Code aus statt über einen Server. Der Gastgeber zeigt ein Angebot, der Gast scannt es und
// zeigt eine Antwort, die der Gastgeber scannt. Danach läuft eine direkte WebRTC-Verbindung im lokalen Netz.
// Die Verbindungsbeschreibung (SDP) wird auf das Nötigste verkürzt, damit der QR-Code klein und gut lesbar bleibt.
(function () {
  const FF = globalThis.FF;

  // ------------------------------------------------------------ SDP kurz und wieder lang
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, '');
  const unb64 = (s) => Array.from(atob(s), (c) => c.charCodeAt(0));

  function pack(sdp, kind) {
    const get = (k) => { const m = sdp.match(new RegExp('^a=' + k + ':(.*)$', 'm')); return m ? m[1].trim() : ''; };
    const [alg, hex] = get('fingerprint').split(' ');
    const fp = alg === 'sha-256' ? b64(hex.split(':').map((h) => parseInt(h, 16))) : alg + ' ' + hex;
    const cands = [];
    for (const m of sdp.matchAll(/^a=candidate:\S+ 1 udp (\d+) (\S+) (\d+) typ (\w+)/gim)) cands.push([m[1], m[2], m[3], m[4]].join(','));
    return ['V1', kind, get('ice-ufrag'), get('ice-pwd'), fp, cands.join(';')].join('~');
  }

  function unpack(text) {
    const s = String(text || '').trim();
    const i = s.indexOf('V1~');
    const parts = (i >= 0 ? decodeURIComponent(s.slice(i)) : '').split('~');
    if (parts.length < 6 || !['o', 'a'].includes(parts[1])) throw new Error('Das ist kein Verstrickt-Code.');
    const [, kind, ufrag, pwd, fp, cands] = parts;
    const fingerprint = fp.includes(' ') ? fp : 'sha-256 ' + unb64(fp).map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
    const lines = [
      'v=0', 'o=- ' + Date.now() + ' 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    ];
    cands.split(';').filter(Boolean).forEach((c, n) => {
      const [prio, addr, port, typ] = c.split(',');
      lines.push(`a=candidate:${n + 1} 1 udp ${prio} ${addr} ${port} typ ${typ}`);
    });
    lines.push('a=ice-ufrag:' + ufrag, 'a=ice-pwd:' + pwd, 'a=ice-options:trickle', 'a=fingerprint:' + fingerprint,
      'a=setup:' + (kind === 'o' ? 'actpass' : 'active'), 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144');
    return { kind, sdp: lines.join('\r\n') + '\r\n' };
  }
  FF.packSdp = pack; FF.unpackSdp = unpack;

  // ------------------------------------------------------------ Verbindung wie bei PeerJS (send, close, on)
  class DCConn {
    constructor(link) {
      this.link = link; this.dc = link.dc; this.ev = {};
      this.peer = 'local-' + Math.random().toString(36).slice(2, 10);
      this.dc.onmessage = (e) => { try { this.emit('data', JSON.parse(e.data)); } catch (err) { /* kaputt */ } };
      this.dc.onclose = () => this.end();
      link.pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(link.pc.connectionState)) this.end(); });
    }
    get open() { return this.dc.readyState === 'open'; }
    on(n, fn) { (this.ev[n] = this.ev[n] || []).push(fn); return this; }
    emit(n, v) { for (const fn of this.ev[n] || []) fn(v); }
    send(m) { if (this.open) this.dc.send(JSON.stringify(m)); }
    end() { if (this.ended) return; this.ended = true; this.emit('close'); }
    close() { try { this.dc.close(); this.link.pc.close(); } catch (e) { /* egal */ } this.end(); }
  }

  class LocalLink {
    constructor() {
      // Keine STUN-Server: im lokalen Netz reichen die eigenen Adressen, und ohne Internet wäre das Warten umsonst
      this.pc = new RTCPeerConnection({ iceServers: [] });
      this.dc = this.pc.createDataChannel('verstrickt', { negotiated: true, id: 0, ordered: true });
    }
    gather() {
      const pc = this.pc;
      return new Promise((res) => {
        if (pc.iceGatheringState === 'complete') return res();
        const t = setTimeout(res, 2500);
        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
      });
    }
    async offer() {
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gather();
      return pack(this.pc.localDescription.sdp, 'o');
    }
    async answer(text) {
      const d = unpack(text);
      if (d.kind !== 'o') throw new Error('Das ist der Code des Mitspielers. Scanne den Code auf dem Gerät des Gastgebers.');
      await this.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.gather();
      return pack(this.pc.localDescription.sdp, 'a');
    }
    async finish(text) {
      const d = unpack(text);
      if (d.kind !== 'a') throw new Error('Das ist der Code des Gastgebers. Scanne den Code auf dem Gerät des Mitspielers.');
      await this.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
      return this.opened();
    }
    opened(ms = 20000) {
      return new Promise((resolve, reject) => {
        if (this.dc.readyState === 'open') return resolve(new DCConn(this));
        const fail = () => { clearTimeout(t); reject(new Error('Keine Verbindung. Seid ihr im selben WLAN oder Hotspot?')); };
        const t = setTimeout(fail, ms);
        this.dc.addEventListener('open', () => { clearTimeout(t); resolve(new DCConn(this)); });
        this.pc.addEventListener('connectionstatechange', () => { if (this.pc.connectionState === 'failed') fail(); });
      });
    }
    close() { try { this.pc.close(); } catch (e) { /* egal */ } }
  }
  FF.LocalLink = LocalLink;

  // Kamera kurz freigeben lassen: Erst dann verraten Browser die echte Adresse im WLAN statt eines Decknamens,
  // was die Verbindung in manchen Netzen erst möglich macht.
  FF.cameraPermission = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
      return true;
    } catch (e) { return false; }
  };

  // ------------------------------------------------------------ QR-Code mit der Kamera lesen
  // Mit BarcodeDetector, wo es ihn gibt (Android), sonst mit jsQR (iPhone).
  FF.scanQR = function (hint) {
    const box = document.getElementById('scan'), video = document.getElementById('scan-video');
    document.getElementById('scan-msg').textContent = hint || 'Halte die Kamera auf den QR-Code.';
    box.hidden = false;
    let stream = null, stop = false, timer = 0;
    const end = () => { stop = true; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; box.hidden = true; };
    return new Promise((resolve, reject) => {
      document.getElementById('scan-cancel').onclick = () => { end(); reject(new Error('Scannen abgebrochen.')); };
      (async () => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Dieses Gerät kann hier keine Kamera nutzen.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true;
        await video.play();
        let detector = null;
        try { if (globalThis.BarcodeDetector) detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
        if (!detector && !globalThis.jsQR) await FF.loadScript('vendor/jsqr.min.js');
        const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
        const tick = async () => {
          if (stop) return;
          let text = null;
          if (video.videoWidth) {
            try {
              if (detector) { const r = await detector.detect(video); if (r.length) text = r[0].rawValue; }
              else {
                const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
                cv.width = Math.round(video.videoWidth * k); cv.height = Math.round(video.videoHeight * k);
                ctx.drawImage(video, 0, 0, cv.width, cv.height);
                const img = ctx.getImageData(0, 0, cv.width, cv.height);
                const r = globalThis.jsQR(img.data, cv.width, cv.height, { inversionAttempts: 'dontInvert' });
                if (r) text = r.data;
              }
            } catch (e) { /* nächstes Bild */ }
          }
          if (text && text.includes('V1~')) { end(); resolve(text); return; }
          timer = setTimeout(tick, 120);
        };
        tick();
      })().catch((e) => { end(); reject(new Error(e && e.name === 'NotAllowedError' ? 'Ohne Kamera geht es nicht – bitte den Zugriff erlauben.' : (e.message || 'Kamera nicht verfügbar.'))); });
    });
  };
})();
