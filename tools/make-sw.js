'use strict';
// Trägt Version und Dateiliste in den Service Worker der fertigen Seite ein.
// node tools/make-sw.js <seitenordner> <version>
const fs = require('fs');
const path = require('path');

const [dir, version] = process.argv.slice(2);
const files = ['./'];
const walk = (d) => {
  for (const f of fs.readdirSync(path.join(dir, d)).sort()) {
    const rel = d ? d + '/' + f : f;
    if (fs.statSync(path.join(dir, rel)).isDirectory()) walk(rel);
    else if (!['sw.js', 'version.json'].includes(rel)) files.push(rel);
  }
};
walk('');
// Die Schrift-Stylesheet-Adresse aus der Seite gleich mit ablegen
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const font = html.match(/href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/);
if (font) files.push(font[1].replace(/&amp;/g, '&'));

const swPath = path.join(dir, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
sw = sw.replace("const VERSION = 'dev';", `const VERSION = ${JSON.stringify(version)};`)
  .replace('const FILES = [];', `const FILES = ${JSON.stringify(files)};`);
fs.writeFileSync(swPath, sw);
console.log(`sw.js: ${files.length} Dateien, Version ${version}`);
