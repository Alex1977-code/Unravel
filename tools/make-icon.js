'use strict';
// Zeichnet das App-Icon (rotes und blaues Wollknäuel mit Augen, verbunden durch einen Faden) als 1024er PNG.
// node tools/make-icon.js icon-1024.png   – danach auf 512/192/180 verkleinern (icons/).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const data = await p.evaluate(() => {
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Hintergrund: dämmriger Wald, warmes Licht oben rechts, Lichtpunkte
    let g = x.createRadialGradient(N * 0.5, N * 0.45, 0, N * 0.5, N * 0.5, N * 0.75);
    g.addColorStop(0, '#34453a'); g.addColorStop(1, '#0b110f');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    g = x.createRadialGradient(N * 0.78, N * 0.18, 0, N * 0.78, N * 0.18, N * 0.55);
    g.addColorStop(0, 'rgba(255,214,150,0.55)'); g.addColorStop(1, 'rgba(255,214,150,0)');
    x.fillStyle = g; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 18; i++) {
      const px = rnd() * N, py = rnd() * N * 0.7, r = N * (0.01 + rnd() * 0.03);
      g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,230,170,${0.15 + rnd() * 0.25})`); g.addColorStop(1, 'rgba(255,230,170,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    // Wollknäuel
    const ball = (cx, cy, R, light, base, dark) => {
      // Schatten
      x.save(); x.globalAlpha = 0.45; x.fillStyle = '#000';
      x.beginPath(); x.ellipse(cx + R * 0.1, cy + R * 1.02, R * 0.85, R * 0.16, 0, 0, 7); x.filter = `blur(${R * 0.08}px)`; x.fill(); x.restore();
      g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, light); g.addColorStop(0.55, base); g.addColorStop(1, dark);
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
      // gewickelte Garnbänder: mehrere Lagen paralleler Fäden um die Kugel, jede Lage in eigener Richtung
      for (let band = 0; band < 7; band++) {
        const a = rnd() * Math.PI, n = 9;
        for (let k = 0; k < n; k++) {
          const off = (k / (n - 1) - 0.5) * 0.9;
          x.save(); x.translate(cx, cy); x.rotate(a);
          x.lineWidth = R * 0.05;
          x.strokeStyle = k % 2 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.16)';
          x.beginPath(); x.ellipse(0, off * R, R * Math.sqrt(1 - off * off), R * 0.32 * Math.sqrt(1 - off * off), 0, 0, Math.PI); x.stroke();
          x.lineWidth = R * 0.012; x.strokeStyle = 'rgba(0,0,0,0.25)';
          x.beginPath(); x.ellipse(0, off * R + R * 0.026, R * Math.sqrt(1 - off * off), R * 0.32 * Math.sqrt(1 - off * off), 0, 0, Math.PI); x.stroke();
          x.restore();
        }
      }
      // Kugelschattierung noch einmal darüber
      g = x.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
      g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      x.fillStyle = g; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.restore();
      // Flaum am Rand und Lichtkante
      x.strokeStyle = light; x.lineWidth = R * 0.01;
      for (let i = 0; i < 70; i++) {
        const a = rnd() * 7, r0 = R * 0.97, l = R * (0.02 + rnd() * 0.035);
        x.globalAlpha = 0.22; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        x.lineTo(cx + Math.cos(a + 0.08) * (r0 + l), cy + Math.sin(a + 0.08) * (r0 + l)); x.stroke();
      }
      x.globalAlpha = 1;
      // Gegenlicht als weicher Saum innen an der Kugel
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
      x.strokeStyle = 'rgba(255,220,170,0.28)'; x.lineWidth = R * 0.1; x.filter = `blur(${R * 0.04}px)`;
      x.beginPath(); x.arc(cx, cy, R, -1.3, 0.3); x.stroke();
      x.restore();
    };
    const eyes = (cx, cy, R, look) => {
      for (const [dx, s] of [[-0.3, 1], [0.22, 0.9]]) {
        const ex = cx + dx * R, ey = cy - R * 0.05;
        x.fillStyle = '#fbf4e6'; x.beginPath(); x.ellipse(ex, ey, R * 0.17 * s, R * 0.21 * s, 0, 0, 7); x.fill();
        x.fillStyle = '#1b1216'; x.beginPath(); x.arc(ex + look * R * 0.05, ey + R * 0.03, R * 0.085 * s, 0, 7); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(ex + look * R * 0.05 - R * 0.03, ey - R * 0.02, R * 0.03 * s, 0, 7); x.fill();
      }
    };
    // Faden vom roten zum blauen Knäuel, mit Schleife
    const thread = () => {
      const pts = [[N * 0.5, N * 0.69], [N * 0.53, N * 0.84], [N * 0.62, N * 0.84], [N * 0.66, N * 0.75]];
      g = x.createLinearGradient(N * 0.45, 0, N * 0.68, 0);
      g.addColorStop(0, '#d4462f'); g.addColorStop(1, '#3a73c9');
      x.lineCap = 'round'; x.lineJoin = 'round';
      const path = () => { x.beginPath(); x.moveTo(...pts[0]); x.bezierCurveTo(...pts[1], ...pts[2], ...pts[3]); };
      x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = N * 0.026; path(); x.stroke();
      x.strokeStyle = g; x.lineWidth = N * 0.019; path(); x.stroke();
      x.setLineDash([N * 0.012, N * 0.016]); x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = N * 0.008; path(); x.stroke();
      x.setLineDash([]);
    };
    thread();
    ball(N * 0.7, N * 0.66, N * 0.12, '#8fb6f4', '#3a73c9', '#162c55');
    eyes(N * 0.7, N * 0.66, N * 0.12, -1);
    ball(N * 0.43, N * 0.45, N * 0.25, '#f39276', '#d4462f', '#5e1a10');
    eyes(N * 0.45, N * 0.45, N * 0.25, 1);
    // Fadenlocke oben auf dem Kopf
    x.strokeStyle = '#d4462f'; x.lineWidth = N * 0.016; x.lineCap = 'round';
    x.beginPath(); x.moveTo(N * 0.4, N * 0.215); x.bezierCurveTo(N * 0.36, N * 0.12, N * 0.27, N * 0.13, N * 0.29, N * 0.19); x.bezierCurveTo(N * 0.3, N * 0.23, N * 0.35, N * 0.2, N * 0.33, N * 0.17); x.stroke();
    return c.toDataURL('image/png');
  });
  require('fs').writeFileSync(process.argv[2], Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
