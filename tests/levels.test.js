'use strict';
// Spielt die Kernstellen jedes Levels mit einfachen "Bots" durch.
// Aufruf: node tests/levels.test.js
const assert = require('assert');
const { load, Driver } = require('./harness');
const FF = load();

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const jump = (extra = {}) => Object.assign({ jumpP: 1, jumpHold: 1, up: 1 }, extra);
const hold = (extra = {}) => Object.assign({ jumpHold: 1, up: 1 }, extra);

// Pendeln, bis der Spieler auf der anderen Seite steht.
function swingAcross(d, who, other, wallX, topY, secs) {
  for (let t = 0; t < secs; t += 1 / 60) {
    const p = d.p(who);
    const cx = p.x + 8, cy = p.y + 13;
    let c = p.vx >= 0 ? { right: 1 } : { left: 1 };
    if (cx > wallX - 90 && p.vx > -40 && cy > topY - 20) c = { right: 1, up: 1 };
    const cs = [other, other];
    cs[who] = c;
    d.run(1 / 60, cs[0], cs[1]);
    if (p.grounded && p.x > wallX) return true;
    if (d.g.state !== 'play') return false;
  }
  return false;
}

function climbTether(d, who, other, wallX, secs) {
  const a = [other, other];
  a[who] = jump();
  d.run(0.05, a[0], a[1]);
  a[who] = hold({ right: 1 });
  return d.until((g) => g.players[who].grounded && g.players[who].x > wallX, secs, a[0], a[1]);
}

test('Laufen und Sprunghöhe', () => {
  const d = new Driver(FF, 0, 'coop');
  d.run(0.3);
  d.run(0.05, jump());
  let top = 1e9;
  for (let i = 0; i < 50; i++) { d.run(1 / 60, hold()); top = Math.min(top, d.p(0).y + d.p(0).h); }
  assert(top < 600 - 75 && top > 600 - 95, 'Sprunghöhe ' + (600 - top));
});

test('Lasso und Klettern auf die Mauer (Level 1)', () => {
  const d = new Driver(FF, 0, 'coop');
  d.put(0, 1215, 600); d.put(1, 1180, 600); d.run(0.2);
  d.run(0.05, { lassoP: 1 });
  assert(d.p(0).lasso, 'Lasso hängt');
  d.run(0.05, jump());
  assert(d.until((g) => g.players[0].grounded && g.players[0].y + 26 <= 461, 6, hold()), d.info(0));
});

test('Über das Wasser schwingen (Level 1)', () => {
  const d = new Driver(FF, 0, 'coop');
  d.put(0, 1745, 460); d.put(1, 1700, 460); d.run(0.2);
  d.run(0.03, { lassoP: 1 });
  let ok = false;
  for (let t = 0; t < 6 && !ok; t += 1 / 60) {
    const p = d.p(0);
    // über dem anderen Ufer loslassen
    d.run(1 / 60, p.lasso && !p.grounded && p.x > 1985 && p.vy > -60 ? { right: 1, lassoP: 1 } : { right: 1 });
    ok = p.x > 1995 && p.grounded;
  }
  assert(ok, d.info(0));
  assert.strictEqual(d.g.state, 'play');
});

for (const [lvl, nearX, nearY, wallX, topY] of [[1, 800, 450, 1020, 705], [4, 1800, 500, 2020, 740]]) {
  test(`Am Faden des Partners hinüber und hochklettern (Level ${lvl + 1})`, () => {
    const d = new Driver(FF, lvl, 'coop');
    d.put(0, nearX - 10, nearY); d.put(1, nearX - 40, nearY); d.run(0.2);
    d.run(0.5, { grip: 1 }, { right: 1 });
    assert(swingAcross(d, 1, { grip: 1 }, wallX, topY, 20), 'Blau kommt hinüber: ' + d.info(1));
    d.run(0.3, { grip: 1 }, { right: 1 });
    d.run(2.5, { right: 1 }, { grip: 1 });
    assert.strictEqual(d.g.state, 'play', 'Rot überlebt den Sturz');
    assert(climbTether(d, 0, { grip: 1 }, wallX, 10), 'Rot klettert hoch: ' + d.info(0));
  });
}

test('Ohne Festhalten wird der Partner mitgerissen', () => {
  const d = new Driver(FF, 1, 'coop');
  d.put(0, 790, 450); d.put(1, 760, 450); d.run(0.2);
  d.run(3.0, {}, { right: 1 });
  assert(d.p(0).y + d.p(0).h > 800, 'Rot liegt unten im Steinbruch: ' + d.info(0));
});

test('Kiste auf dem Teich treibt ans andere Ufer (Level 3)', () => {
  const d = new Driver(FF, 2, 'coop');
  const c = d.g.world.crates[1];
  d.put(0, 1300, 480); d.put(1, 1270, 480); d.run(0.2);
  d.until(() => c.x >= 1500, 8, { right: 1 }, { right: 1 });
  d.run(1.0);
  assert(c.floating, 'Kiste schwimmt');
  d.until((g) => g.players.every((p) => p.grounded && Math.abs(p.y + p.h - c.y) < 2), 3, { right: 1 }, { right: 1 });
  d.run(0.1);
  d.until(() => c.x > 1890, 15);
  d.run(1.2, { right: 1 }, { right: 1 });
  assert.strictEqual(d.g.state, 'play');
  assert(d.p(0).x > 1950 && d.p(1).x > 1950, 'beide am Ufer: ' + d.info(0) + ' ' + d.info(1));
});

test('Schwere Kiste braucht zwei (oder huckepack)', () => {
  let d = new Driver(FF, 2, 'coop');
  const h = d.g.world.crates[2], x0 = h.x;
  d.put(0, 2150, 500); d.put(1, 2120, 500); d.run(0.2);
  d.run(1.5, { right: 1 }, {});
  assert.strictEqual(h.x, x0, 'einer allein schafft es nicht');
  assert(d.until(() => h.x + h.w >= 2499, 10, { right: 1 }, { right: 1 }), 'zu zweit bis zur Wand');
  d = new Driver(FF, 2, 'solo');
  const h2 = d.g.world.crates[2], x2 = h2.x;
  d.put(0, 2150, 500); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  d.run(1.5, { right: 1 });
  assert(h2.x > x2 + 50, 'huckepack geht es');
});

test('Von der schweren Kiste auf die Mauer', () => {
  const d = new Driver(FF, 2, 'coop');
  const h = d.g.world.crates[2];
  h.x = 2500 - h.w;
  d.put(0, 2440, 500); d.put(1, 2380, 500); d.run(0.2);
  d.run(0.05, jump({ right: 1 }));
  assert(d.until((g) => g.players[0].grounded && g.players[0].y + 26 <= 361, 3, hold({ right: 1 })), d.info(0));
});

function trampoline(d, x0, x1, ground, wallX, ledgeY) {
  d.put(0, x0 - 10, ground); d.put(1, x0 - 40, ground); d.run(0.2);
  d.run(0.03, { lassoP: 1 });
  assert(d.p(0).lasso, 'Lasso am Pflock');
  d.until((g) => g.players[0].x + 8 > x1 - 5, 3, { right: 1 });
  d.run(0.03, { knotP: 1 });
  assert.strictEqual(d.g.world.bridges.length, 1, 'Knoten gesetzt');
  d.run(0.5, { left: 1 });
  d.run(0.03, jump());
  assert(d.until((g) => g.players[0].grounded && g.players[0].bridge, 3, hold()), 'steht auf dem Faden');
  for (let i = 0; i < 120; i++) {
    const p = d.p(0);
    const c = { right: 1 };
    if (p.grounded && p.bridge && p.x + 8 > x1 - 35) Object.assign(c, jump());
    else if (!p.grounded) Object.assign(c, hold());
    d.run(1 / 60, c);
  }
  return d.p(0).grounded && d.p(0).y + 26 <= ledgeY + 1 && d.p(0).x > wallX;
}

test('Knoten-Trampolin (Level 4, erste Stelle)', () => {
  assert(trampoline(new Driver(FF, 3, 'coop'), 800, 960, 600, 1000, 455));
});
test('Knoten-Trampolin (Level 4, zweite Stelle)', () => {
  assert(trampoline(new Driver(FF, 3, 'coop'), 2060, 2210, 640, 2250, 490));
});

function chainCtl(g, p) {
  const c = { right: 1 };
  if (!p.lasso && !p.grounded && p.vy > -100 && g.lassoTarget(p)) c.lassoP = 1;
  if (!p.lasso && p.grounded && p.x + 8 > 585 && p.x < 600) c.lassoP = 1;
  if (p.lasso && !p.grounded) {
    const next = g.lassoTarget(p, p.anchor);
    if (next && p.vx > 120 && p.x + 8 > p.anchor.x + 50) c.lassoP = 1;
  }
  if (p.lasso && p.x + 8 > 1140) c.up = 1;
  return c;
}

test('Lasso-Kette über den See (Level 5, zu zweit)', () => {
  const d = new Driver(FF, 4, 'coop');
  d.put(0, 590, 500); d.put(1, 450, 500); d.run(0.2);
  let ok = false;
  for (let t = 0; t < 14 && !ok; t += 1 / 60) {
    const a = chainCtl(d.g, d.p(0));
    const b = t < 1.2 ? {} : chainCtl(d.g, d.p(1));
    if (d.p(0).grounded && d.p(0).x > 1200) { a.right = 0; a.lassoP = d.p(0).lasso ? 1 : 0; }
    d.run(1 / 60, a, b);
    assert.strictEqual(d.g.state, 'play', 'niemand fällt ins Wasser');
    ok = d.p(0).grounded && d.p(1).grounded && d.p(0).x > 1190 && d.p(1).x > 1190;
  }
  assert(ok, d.info(0) + ' | ' + d.info(1));
});

test('Lasso-Kette über den See (Level 5, allein huckepack)', () => {
  const d = new Driver(FF, 4, 'solo');
  d.put(0, 590, 500); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  let ok = false;
  for (let t = 0; t < 10 && !ok; t += 1 / 60) {
    d.run(1 / 60, chainCtl(d.g, d.p(0)));
    ok = d.p(0).grounded && d.p(0).x > 1190;
  }
  assert(ok && d.g.state === 'play', d.info(0));
});

test('Trampolin und hoher Haken (Level 5)', () => {
  const d = new Driver(FF, 4, 'coop');
  d.put(0, 2695, 740); d.put(1, 2660, 740); d.run(0.2);
  d.run(0.03, { lassoP: 1 });
  d.until((g) => g.players[0].x + 8 > 2835, 3, { right: 1 });
  d.run(0.03, { knotP: 1 });
  d.run(0.4, { left: 1 });
  d.run(0.03, jump());
  d.run(0.8, hold());
  assert(d.until((g) => g.players[0].grounded && g.players[0].bridge, 3), 'steht auf dem Faden');
  d.run(0.15, { left: 1 });
  d.run(0.03, jump({ right: 1 }));
  d.until((g) => g.players[0].vy > -20, 1, hold({ right: 1 }));
  const target = d.g.lassoTarget(d.p(0));
  assert(target && !target.post, 'hoher Haken in Reichweite');
  d.run(0.03, { lassoP: 1, up: 1 });
  assert(d.until((g) => g.players[0].grounded && g.players[0].y + 26 <= 541, 6, { up: 1, right: 1 }), d.info(0));
  // Ohne Trampolin reicht es nicht:
  const e = new Driver(FF, 4, 'coop');
  e.put(0, 2880, 740); e.put(1, 2850, 740); e.run(0.2);
  e.run(0.03, jump());
  e.until((g) => g.players[0].vy > -20, 1, hold());
  const t2 = e.g.lassoTarget(e.p(0));
  assert(!t2 || t2.post, 'normaler Sprung erreicht den Haken nicht');
});

test('Allein: absetzen, schwingen, wechseln, nachklettern', () => {
  const d = new Driver(FF, 1, 'solo');
  d.put(0, 785, 450); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  d.run(0.03, { mergeP: 1 }); d.run(0.2);
  assert(!d.p(1).merged && d.p(1).grip, 'Blau abgesetzt und hält fest');
  d.run(0.4, { right: 1 });
  assert(swingAcross(d, 0, {}, 1020, 705, 20), d.info(0));
  d.run(0.3, { right: 1 });
  d.run(0.03, { swapP: 1 });
  assert.strictEqual(d.g.active, 1);
  d.run(2.0, { right: 1 });
  d.run(0.03, jump());
  assert(d.until((g) => g.players[1].grounded && g.players[1].x > 1020, 8, hold({ right: 1 })), d.info(1));
  d.until((g) => Math.abs(g.players[0].x - g.players[1].x) < 30, 3, { right: 1 });
  d.run(0.03, { mergeP: 1 });
  assert(d.p(0).merged, 'wieder huckepack');
});

test('Ziel nur zu zweit', () => {
  for (let i = 0; i < FF.LEVELS.length; i++) {
    const d = new Driver(FF, i, 'coop');
    const g = d.g;
    d.put(0, g.goal.x, g.goal.y);
    d.put(1, g.goal.x - 130, g.goal.y);
    d.run(0.2);
    assert.strictEqual(g.state, 'play', 'einer allein reicht nicht');
    d.put(1, g.goal.x + 10, g.goal.y);
    d.run(0.2);
    assert.strictEqual(g.state, 'won', 'Level ' + (i + 1) + ' gewonnen');
  }
});

test('Kein Spawn, Zwischenstand oder Funke steckt in einer Wand', () => {
  for (const L of FF.LEVELS) {
    const solids = L.solids.map(([x, y, w, h]) => ({ x, y, w, h }));
    const inside = (x, y) => solids.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
    const pts = [L.spawn, ...L.checkpoints, ...L.beads, L.goal].map(([x, y], i) => [x, i === 0 || i <= L.checkpoints.length || i === L.beads.length + L.checkpoints.length + 1 ? y - 5 : y]);
    for (const [x, y] of pts) assert(!inside(x, y), `${L.name}: Punkt ${x},${y} in der Wand`);
    for (const [x, y] of L.anchors) assert(!inside(x, y), `${L.name}: Haken ${x},${y} in der Wand`);
  }
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('  ✓ ' + t.name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + t.name + '\n      ' + e.message);
  }
}
console.log(failed ? `\n${failed} von ${tests.length} Tests fehlgeschlagen` : `\nAlle ${tests.length} Tests bestanden`);
process.exitCode = failed ? 1 : 0;
