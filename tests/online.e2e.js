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

(async () => {
  await new Promise((r) => web.listen(8790, '127.0.0.1', r));
  const app = express();
  const ps = app.listen(9010, '127.0.0.1');
  app.use('/', ExpressPeerServer(ps, { path: '/' }));
  // Getestet werden Netz und Steuerung; die 3D-Grafik bleibt aus (render=off), ohne Grafikkarte wäre sie zu langsam
  const q = 'peerhost=127.0.0.1&peerport=9010&peerpath=/&render=off';
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
  } finally {
    await b.close(); web.close(); ps.close();
  }
  if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
  console.log('\nOnline-Tests bestanden');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
