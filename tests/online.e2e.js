'use strict';
// Ende-zu-Ende-Test für Online-Spiel und Fernsehmodus mit einem lokalen Vermittlungsserver.
// Einmalig: npm i --no-save peer express playwright
// Aufruf:   node tests/online.e2e.js
const path = require('path');
const http = require('http');
const fs = require('fs');
const assert = require('assert');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const web = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(f).pipe(res);
});

// Winziger MQTT-Vermittler über WebSocket (nur das, was relay.js braucht), als Ersatz für die öffentlichen Server
function miniBroker(port) {
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({ port, host: '127.0.0.1', handleProtocols: () => 'mqtt' });
  const subs = new Map();   // topic -> Set(ws)
  const enc = (type, body) => {
    const len = []; let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    return Buffer.concat([Buffer.from([type, ...len]), body]);
  };
  wss.on('connection', (ws) => {
    let buf = Buffer.alloc(0);
    ws.on('message', (data) => {
      buf = Buffer.concat([buf, data]);
      for (;;) {
        if (buf.length < 2) return;
        let len = 0, mul = 1, j = 1;
        for (;;) { if (j >= buf.length) return; const d = buf[j++]; len += (d & 127) * mul; mul *= 128; if (!(d & 128)) break; }
        if (buf.length < j + len) return;
        const type = buf[0] >> 4, body = buf.subarray(j, j + len);
        buf = buf.subarray(j + len);
        if (type === 1) ws.send(enc(0x20, Buffer.from([0, 0])));
        else if (type === 8) {
          const tl = body.readUInt16BE(2), topic = body.subarray(4, 4 + tl).toString();
          if (!subs.has(topic)) subs.set(topic, new Set());
          subs.get(topic).add(ws);
          ws.send(enc(0x90, Buffer.from([body[0], body[1], 0])));
        } else if (type === 3) {
          const tl = body.readUInt16BE(0), topic = body.subarray(2, 2 + tl).toString();
          for (const o of subs.get(topic) || []) if (o.readyState === 1) o.send(enc(0x30, Buffer.from(body)));
        } else if (type === 12) ws.send(Buffer.from([0xd0, 0]));
        else if (type === 14) ws.close();
      }
    });
    ws.on('close', () => { for (const set of subs.values()) set.delete(ws); });
  });
  return wss;
}

(async () => {
  await new Promise((r) => web.listen(8790, '127.0.0.1', r));
  const app = express();
  const ps = app.listen(9010, '127.0.0.1');
  app.use('/', ExpressPeerServer(ps, { path: '/' }));
  // Getestet werden Netz und Steuerung; die 3D-Grafik bleibt aus (render=off), ohne Grafikkarte wäre sie zu langsam
  const q = 'peerhost=127.0.0.1&peerport=9010&peerpath=/&render=off&relay=ws://127.0.0.1:9020';
  const broker = miniBroker(9020);
  const b = await chromium.launch();
  const errs = [];
  const open = async (url, opts) => { const c = await b.newContext(opts || { viewport: { width: 480, height: 270 } }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); return p; };
  try {
    // Online: Gastgeber + Mitspieler mit eigenem Bildschirm
    const host = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await host.evaluate(() => FF.debug.openRoom(false));
    await host.waitForFunction(() => FF.debug.net && FF.debug.net.host.code, null, { timeout: 15000 });
    const code = await host.evaluate(() => FF.debug.net.host.code);
    const guest = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await guest.evaluate((c) => FF.debug.joinRoom(c, 'player'), code);
    await guest.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 15000 });
    await host.evaluate(() => { FF.debug.setMode('coop'); FF.debug.startLevel(0); });
    await guest.waitForFunction(() => FF.debug.screen === 'play', null, { timeout: 10000 });
    const x0 = await host.evaluate(() => FF.debug.game.players[1].x);
    await guest.keyboard.down('KeyD'); await guest.waitForTimeout(800); await guest.keyboard.up('KeyD');
    const x1 = await host.evaluate(() => FF.debug.game.players[1].x);
    assert(x1 > x0 + 50, 'Gast bewegt Blau');
    await guest.waitForTimeout(300);
    const gv = await guest.evaluate(() => FF.debug.game.players[1].x);
    assert(Math.abs(gv - x1) < 30, 'Gast sieht dieselbe Position');
    console.log('  ✓ Online: Gast steuert Blau, beide sehen dasselbe');

    // Fernseher + Handy-Controller
    const tv = await open(`http://127.0.0.1:8790/index.html?tv=1&code=TT77&${q}`);
    await tv.waitForFunction(() => FF.debug.net && FF.debug.net.host.code === 'TT77', null, { timeout: 15000 });
    const pad = await open(`http://127.0.0.1:8790/index.html?${q}`, { viewport: { width: 400, height: 800 }, hasTouch: true });
    await pad.evaluate(() => FF.debug.joinRoom('TT77', 'pad'));
    await pad.waitForFunction(() => FF.debug.net && FF.debug.net.role === 'pad', null, { timeout: 15000 });
    await pad.tap('#pad-nav [data-nav=ok]'); await tv.waitForTimeout(300);
    await pad.tap('#pad-nav [data-nav=ok]'); await tv.waitForTimeout(500);
    assert.strictEqual(await tv.evaluate(() => FF.debug.screen), 'play', 'Controller startet das Spiel über das Menü');
    console.log('  ✓ Fernseher: Handy bedient Menü und startet das Level');

    // Gastgeber verliert kurz die Vermittlung (App-Wechsel auf dem Handy) – danach findet ein Gast den Raum trotzdem
    const h2 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await h2.evaluate(() => FF.debug.openRoom(false, 'RC22'));
    await h2.waitForFunction(() => FF.debug.net && FF.debug.net.host.code === 'RC22', null, { timeout: 15000 });
    await h2.evaluate(() => FF.debug.net.host.peer.disconnect());
    await h2.waitForFunction(() => !FF.debug.net.host.peer.disconnected, null, { timeout: 10000 });
    const g2 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await g2.evaluate(() => FF.debug.joinRoom('RC22', 'player'));
    await g2.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 20000 });
    console.log('  ✓ Raum meldet sich nach Verbindungsabbruch neu an');

    // Gast gibt den Code ein, bevor der Raum offen ist – er versucht es weiter, bis der Raum da ist
    const g3 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await g3.evaluate(() => { FF.debug.joinRoom('LT33', 'player'); });
    await g3.waitForTimeout(1500);
    const h3 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await h3.evaluate(() => FF.debug.openRoom(false, 'LT33'));
    await g3.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 20000 });
    console.log('  ✓ Gast wartet auf einen Raum, der erst gleich öffnet');

    // Kein direkter Weg (WebRTC blockiert): Gast spielt über den Umweg mit
    const h4 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await h4.evaluate(() => FF.debug.openRoom(false, 'RL44'));
    await h4.waitForFunction(() => FF.debug.net && FF.debug.net.host.code === 'RL44', null, { timeout: 15000 });
    await h4.waitForTimeout(500);
    const g4 = await open(`http://127.0.0.1:8790/index.html?${q}&relayonly=1`);
    await g4.evaluate(() => FF.debug.joinRoom('RL44', 'player'));
    await g4.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 20000 });
    assert.strictEqual(await g4.evaluate(() => FF.debug.net.client.via), 'relay', 'Verbindung über den Umweg');
    await h4.evaluate(() => { FF.debug.setMode('coop'); FF.debug.startLevel(0); });
    await g4.waitForFunction(() => FF.debug.screen === 'play', null, { timeout: 10000 });
    const rx0 = await h4.evaluate(() => FF.debug.game.players[1].x);
    await g4.keyboard.down('KeyD'); await g4.waitForTimeout(800); await g4.keyboard.up('KeyD');
    const rx1 = await h4.evaluate(() => FF.debug.game.players[1].x);
    assert(rx1 > rx0 + 50, 'Gast bewegt Blau über den Umweg');
    await g4.waitForTimeout(400);
    const rgv = await g4.evaluate(() => FF.debug.game.players[1].x);
    assert(Math.abs(rgv - rx1) < 30, 'Gast sieht über den Umweg dieselbe Position');
    console.log('  ✓ Ohne direkten Weg: Gast spielt über den Vermittler mit');

    // Direkter Weg beginnt, kommt aber nie an (wie hinter strengen Routern): automatisch auf den Umweg
    const h5 = await open(`http://127.0.0.1:8790/index.html?${q}`);
    await h5.evaluate(() => FF.debug.openRoom(false, 'IC55'));
    await h5.waitForFunction(() => FF.debug.net && FF.debug.net.host.code === 'IC55', null, { timeout: 15000 });
    const c5 = await b.newContext({ viewport: { width: 480, height: 270 } });
    await c5.addInitScript(() => { RTCPeerConnection.prototype.addIceCandidate = function () { return Promise.resolve(); }; });
    await h5.evaluate(() => { RTCPeerConnection.prototype.addIceCandidate = function () { return Promise.resolve(); }; });
    const g5 = await c5.newPage(); g5.on('pageerror', (e) => errs.push(e.message));
    await g5.goto(`http://127.0.0.1:8790/index.html?${q}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await g5.evaluate(() => FF.debug.joinRoom('IC55', 'player'));
    await g5.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 30000 });
    assert.strictEqual(await g5.evaluate(() => FF.debug.net.client.via), 'relay', 'Wechsel auf den Umweg');
    assert.strictEqual(await h5.evaluate(() => FF.debug.net.host.count), 1, 'Gast nur einmal im Raum');
    console.log('  ✓ Direkter Weg scheitert: automatisch über den Vermittler');

    // Ohne Internet: Angebot und Antwort werden per QR-Code getauscht (hier direkt übergeben), dann Netz aus
    // Kein Server erreichbar (Vermittler und Umweg zeigen ins Leere); die Offline-Simulation des Browsers schaltet
    // auch lokales WebRTC ab und taugt darum nicht
    const nq = 'peerhost=127.0.0.1&peerport=1&peerpath=/&render=off&relay=ws://127.0.0.1:1';
    const lh = await open(`http://127.0.0.1:8790/index.html?${nq}`);
    const lg = await open(`http://127.0.0.1:8790/index.html?${nq}`);
    await lh.evaluate(() => FF.debug.act('local-host'));
    await lh.waitForFunction(() => FF.debug.net && FF.debug.net.offer && document.querySelector('#lobby-qr svg'), null, { timeout: 15000 });
    const offerLink = await lh.evaluate(() => location.origin + location.pathname + '#L=' + FF.debug.net.offer);
    // Der QR-Code des Angebots muss mit jsQR lesbar sein (so liest das iPhone ihn)
    const read = await lh.evaluate(async () => {
      await FF.loadScript('vendor/jsqr.min.js');
      const svg = document.querySelector('#lobby-qr svg');
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
      await img.decode();
      const cv = document.createElement('canvas'); cv.width = cv.height = 400;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 400); ctx.drawImage(img, 20, 20, 360, 360);
      const r = jsQR(ctx.getImageData(0, 0, 400, 400).data, 400, 400);
      return r && r.data;
    });
    assert.strictEqual(read, offerLink, 'QR-Code des Angebots ist lesbar');
    await lg.evaluate((o) => { FF.debug.setLocalOffer(decodeURIComponent(o.split('#L=')[1])); FF.debug.joinLocal('player'); }, offerLink);
    await lg.waitForFunction(() => FF.debug.localAnswer, null, { timeout: 15000 });
    const ans = await lg.evaluate(() => FF.debug.localAnswer);
    await lh.evaluate((a) => FF.debug.net.host.localAnswer(a), ans);
    await lg.waitForFunction(() => FF.debug.net && FF.debug.net.slot === 1, null, { timeout: 20000 });
    await lh.evaluate(() => { FF.debug.setMode('coop'); FF.debug.startLevel(0); });
    await lg.waitForFunction(() => FF.debug.screen === 'play', null, { timeout: 10000 });
    const lx0 = await lh.evaluate(() => FF.debug.game.players[1].x);
    await lg.keyboard.down('KeyD'); await lg.waitForTimeout(800); await lg.keyboard.up('KeyD');
    const lx1 = await lh.evaluate(() => FF.debug.game.players[1].x);
    assert(lx1 > lx0 + 50, 'Gast bewegt Blau ohne Internet');
    console.log(`  ✓ Ohne Internet: QR-Codes tauschen, dann im WLAN spielen (Angebot ${offerLink.split('#L=')[1].length} Zeichen, Antwort ${ans.length})`);

    // Ein Handy, zwei Bluetooth-Controller (z. B. auf den Fernseher gespiegelt): keine Touch-Tasten im Bild
    const ph = await open(`http://127.0.0.1:8790/index.html?${q}`, { viewport: { width: 800, height: 400 }, hasTouch: true, isMobile: true });
    await ph.evaluate(() => {
      const mk = (i) => ({ index: i, id: 'Test-Controller ' + i, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) });
      globalThis.__pads = [mk(0), mk(1)];
      navigator.getGamepads = () => globalThis.__pads;
      FF.debug.setMode('coop'); FF.debug.startLevel(0);
    });
    await ph.waitForFunction(() => FF.debug.screen === 'play', null, { timeout: 10000 });
    await ph.waitForTimeout(600);
    assert(await ph.evaluate(() => document.querySelector('#touch').hidden), 'Zwei Controller: Touch-Tasten ausgeblendet');
    await ph.evaluate(() => { globalThis.__pads = [globalThis.__pads[0]]; });
    await ph.waitForFunction(() => !document.querySelector('#touch').hidden, null, { timeout: 3000 });
    console.log('  ✓ Zwei Bluetooth-Controller am Handy: Touch-Tasten verschwinden, mit einem kommen sie zurück');
  } finally {
    await b.close(); web.close(); ps.close(); broker.close();
  }
  if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
  console.log('\nOnline-Tests bestanden');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
