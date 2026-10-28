'use strict';
// Packt Spiel, Stile, Skripte und Bibliotheken in eine einzige HTML-Datei.
// node tools/build.js [ziel.html] [--fragment]
//   --fragment: ohne <html>/<head>/<body>-Gerüst (für Seiten, die das Gerüst selbst liefern)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(root, 'dist', 'fadenfreunde.html'));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const script = (js) => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>`;
const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, f)).toString('base64');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}</style>`);
html = html.replace(/<link rel="manifest"[^>]*>\s*/, '');
html = html.replace('href="icons/icon-192.png"', () => `href="${dataUri('icons/icon-192.png')}"`);
html = html.replace('href="icons/icon-180.png"', () => `href="${dataUri('icons/icon-180.png')}"`);
// Bibliotheken für Online-Spiel und QR-Code direkt mitliefern
const vendor = ['vendor/peerjs.min.js', 'vendor/qrcode.js'].map((f) => script(read(f))).join('\n');
html = html.replace('<script src="src/core.js"></script>', () => vendor + '\n<script src="src/core.js"></script>');
html = html.replace(/<script src="((?:src|vendor)\/[\w.]+)"><\/script>/g, (_, src) => script(read(src)));

if (fragment) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/<meta name="viewport"[^>]*>\s*/, '');
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  html = head.trim() + '\n' + body.trim() + '\n';
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
