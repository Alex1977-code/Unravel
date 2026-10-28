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

function chainCtl(g, p, edge = 600, upX = 1140) {
  const c = { right: 1 };
  if (!p.lasso && !p.grounded && p.vy > -100 && g.lassoTarget(p)) c.lassoP = 1;
  if (!p.lasso && p.grounded && p.x + 8 > edge - 15 && p.x < edge) c.lassoP = 1;
  if (p.lasso && !p.grounded) {
    const next = g.lassoTarget(p, p.anchor);
    if (next && p.vx > 120 && p.x + 8 > p.anchor.x + 50) c.lassoP = 1;
  }
  if (p.lasso && p.x + 8 > upX) c.up = 1;
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

// ------------------------------------------------------------ Bausteine, für die neuen Welten wiederverwendet
function swingPool(lvl, startX, poolEnd, ground) {
  const d = new Driver(FF, lvl, 'coop');
  d.put(0, startX, ground); d.put(1, startX - 45, ground); d.run(0.2);
  d.run(0.03, { lassoP: 1 });
  assert(d.p(0).lasso, 'Lasso hängt');
  let ok = false;
  for (let t = 0; t < 6 && !ok; t += 1 / 60) {
    const p = d.p(0);
    d.run(1 / 60, p.lasso && !p.grounded && p.x > poolEnd - 5 && p.vy > -60 ? { right: 1, lassoP: 1 } : { right: 1 });
    ok = p.x > poolEnd + 5 && p.grounded;
  }
  assert(ok, d.info(0));
  assert.strictEqual(d.g.state, 'play');
}

function lassoWall(lvl, wallX, ground, top) {
  const d = new Driver(FF, lvl, 'coop');
  d.put(0, wallX - 25, ground); d.put(1, wallX - 60, ground); d.run(0.2);
  d.run(0.05, { lassoP: 1 });
  assert(d.p(0).lasso, 'Lasso hängt');
  d.run(0.05, jump());
  assert(d.until((g) => g.players[0].grounded && g.players[0].y + 26 <= top + 1, 6, hold()), d.info(0));
}

function floatCrate(lvl, ci, ledgeEnd, ground, farX) {
  const d = new Driver(FF, lvl, 'coop');
  const c = d.g.world.crates[ci];
  d.put(0, c.x - 30, ground); d.put(1, c.x - 60, ground); d.run(0.2);
  d.until(() => c.x >= ledgeEnd, 8, { right: 1 }, { right: 1 });
  d.run(1.0);
  assert(c.floating, 'Kiste schwimmt');
  d.until((g) => g.players.every((p) => p.grounded && Math.abs(p.y + p.h - c.y) < 2), 3, { right: 1 }, { right: 1 });
  d.run(0.1);
  d.until(() => c.x > farX - 60, 15);
  d.run(1.2, { right: 1 }, { right: 1 });
  assert.strictEqual(d.g.state, 'play');
  assert(d.p(0).x > farX && d.p(1).x > farX, 'beide am Ufer: ' + d.info(0) + ' ' + d.info(1));
}

function tetherSwing(lvl, nearX, nearY, wallX, topY) {
  const d = new Driver(FF, lvl, 'coop');
  d.put(0, nearX - 10, nearY); d.put(1, nearX - 40, nearY); d.run(0.2);
  d.run(0.5, { grip: 1 }, { right: 1 });
  assert(swingAcross(d, 1, { grip: 1 }, wallX, topY, 20), 'Blau kommt hinüber: ' + d.info(1));
  d.run(0.3, { grip: 1 }, { right: 1 });
  d.run(2.5, { right: 1 }, { grip: 1 });
  assert.strictEqual(d.g.state, 'play', 'Rot überlebt den Sturz');
  assert(climbTether(d, 0, { grip: 1 }, wallX, 10), 'Rot klettert hoch: ' + d.info(0));
}

function chain(lvl, mode, edge, upX, farX) {
  const d = new Driver(FF, lvl, mode);
  d.put(0, edge - 10, d.g.L.spawn[1] === undefined ? 0 : groundAt(d, edge - 10));
  if (mode === 'solo') { d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; } else d.put(1, edge - 150, groundAt(d, edge - 150));
  d.run(0.2);
  let ok = false;
  for (let t = 0; t < 14 && !ok; t += 1 / 60) {
    const a = chainCtl(d.g, d.p(0), edge, upX);
    const b = mode === 'solo' || t < 1.2 ? {} : chainCtl(d.g, d.p(1), edge, upX);
    if (d.p(0).grounded && d.p(0).x > farX + 10) { a.right = 0; a.lassoP = d.p(0).lasso ? 1 : 0; }
    d.run(1 / 60, a, b);
    assert.strictEqual(d.g.state, 'play', 'niemand fällt ins Wasser');
    ok = d.p(0).grounded && d.p(0).x > farX && (mode === 'solo' || (d.p(1).grounded && d.p(1).x > farX));
  }
  assert(ok, d.info(0) + ' | ' + d.info(1));
}

// Höhe des Bodens unter x (oberste feste Fläche)
function groundAt(d, x) {
  let best = 1e9;
  for (const s of d.g.world.solids) if (x > s.x && x < s.x + s.w && s.y < best && s.y > -500) best = s.y;
  return best;
}

function trampHook(lvl, dx, dy) {
  const d = new Driver(FF, lvl, 'coop');
  d.put(0, 2695 + dx, 740 + dy); d.put(1, 2660 + dx, 740 + dy); d.run(0.2);
  d.run(0.03, { lassoP: 1 });
  d.until((g) => g.players[0].x + 8 > 2835 + dx, 3, { right: 1 });
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
  assert(d.until((g) => g.players[0].grounded && g.players[0].y + 26 <= 541 + dy, 6, { up: 1, right: 1 }), d.info(0));
}

// Läuft nach rechts und springt über Krabben, wenn eine knapp vor einem ist.
function crabRun(lvl, x0, ground, xEnd) {
  const d = new Driver(FF, lvl, 'solo');
  d.put(0, x0, ground); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  for (let t = 0; t < 20; t += 1 / 60) {
    const p = d.p(0), cx = p.x + 8;
    let c = { right: 1 };
    for (const cr of d.g.world.critters) {
      const b = FF.critterBox(cr, d.g.time);
      const gap = b.x - (p.x + p.w);
      // Läuft die Krabbe mit, knapp hinter ihr abspringen; kommt sie entgegen, früher
      if (p.grounded && (b.dir > 0 ? gap > 3 && gap < 18 : gap > 10 && gap < 70)) c = jump({ right: 1 });
    }
    if (!p.grounded) c = hold({ right: 1 });
    d.run(1 / 60, c);
    assert.strictEqual(d.g.state, 'play', 'von einer Krabbe erwischt: ' + d.info(0));
    if (cx > xEnd) return;
  }
  assert.fail('nicht angekommen: ' + d.info(0));
}

const L = (id) => FF.LEVELS.findIndex((l) => l.id === id);

test('Beerenmoor: über den Tümpel schwingen, Kiste treibt, Lasso an die Mauer', () => {
  swingPool(L('moor'), 685, 930, 600);
  floatCrate(L('moor'), 0, 1500, 600, 1950);
  lassoWall(L('moor'), 2500, 620, 480);
});

test('Küstenwind: über Krabben springen, Lasso-Kette, am Faden abseilen, Mauer', () => {
  crabRun(L('kueste'), 150, 500, 860);
  crabRun(L('kueste'), 1540, 500, 2080);
  chain(L('kueste'), 'coop', 900, 1440, 1490);
  chain(L('kueste'), 'solo', 900, 1440, 1490);
  tetherSwing(L('kueste'), 2100, 500, 2320, 755);
  lassoWall(L('kueste'), 3000, 755, 615);
});

test('Krabben und Fledermäuse sind gefährlich', () => {
  let d = new Driver(FF, L('kueste'), 'solo');
  d.put(0, 580, 500); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y;
  assert(d.until((g) => g.state === 'dying', 20), 'Krabbe erwischt den, der stehen bleibt');
  d = new Driver(FF, L('kuerbisnacht'), 'solo');
  d.put(0, 150, 520); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  // Unter den Fledermäusen durchlaufen geht
  assert(!d.until((g) => g.state !== 'play' || g.players[0].x > 880, 12, { right: 1 }) || d.g.state === 'play', 'unten durch ist sicher');
  assert(d.p(0).x > 880, d.info(0));
  // Unter einer Fledermaus springen nicht
  d = new Driver(FF, L('kuerbisnacht'), 'solo');
  const bat = d.g.world.critters[0];
  d.put(0, 550, 520); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.1);
  let died = false;
  for (let t = 0; t < 20 && !died; t += 1 / 60) {
    const b = FF.critterBox(bat, d.g.time), p = d.p(0);
    d.run(1 / 60, p.grounded && Math.abs(b.cx - (p.x + 8)) < 30 ? jump() : hold());
    died = d.g.state === 'dying';
  }
  assert(died, 'Sprung in die Fledermaus');
});

test('Winterpass: über Eisschollen, Trampolin, glatter Weg, Mauer', () => {
  const d = new Driver(FF, L('winterpass'), 'solo');
  d.put(0, 650, 600); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  const edges = [700, 940, 1200, 1440];
  for (let t = 0; t < 15; t += 1 / 60) {
    const p = d.p(0), right = p.x + p.w;
    let c = { right: 1 };
    if (p.grounded && edges.some((e) => right > e - 10 && right < e + 4)) c = jump({ right: 1 });
    else if (!p.grounded) c = hold({ right: 1 });
    d.run(1 / 60, c);
    assert.strictEqual(d.g.state, 'play', 'ins Eiswasser gefallen: ' + d.info(0));
    if (p.grounded && p.x > 1520) break;
  }
  assert(d.p(0).x > 1520, d.info(0));
  assert(trampoline(new Driver(FF, L('winterpass'), 'coop'), 1800, 1960, 600, 2000, 455));
  // Eis: nach dem Loslassen rutscht man deutlich weiter als auf Erde
  const slide = (x, y) => { const e = new Driver(FF, L('winterpass'), 'coop'); e.put(0, x, y); e.put(1, x - 30, y); e.run(1.2, { right: 1 }); const x0 = e.p(0).x; e.run(1.5); return e.p(0).x - x0; };
  assert(slide(2100, 455) > 3 * slide(1550, 600) + 20, 'Eis ist glatt');
  lassoWall(L('winterpass'), 2700, 455, 315);
});

test('Schrottplatz: Kiste als Stufe, schwere Kiste, Bretter hoch, abseilen', () => {
  let d = new Driver(FF, L('schrottplatz'), 'solo');
  const c = d.g.world.crates[0];
  d.put(0, 440, 600); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  assert(d.until(() => c.x + c.w >= 999, 10, { right: 1 }), 'Kiste an der Wand');
  d.run(0.12, { left: 1 });
  let up = false;
  for (let i = 0; i < 4 && !up; i++) {
    d.run(0.03, jump({ right: 1 }));
    d.until((g) => g.players[0].grounded, 2, hold({ right: 1 }));
    up = d.p(0).y + 26 <= 481 && d.p(0).x > 1000;
  }
  assert(up, 'über die Kiste auf die Mauer: ' + d.info(0));

  d = new Driver(FF, L('schrottplatz'), 'coop');
  const h = d.g.world.crates[1];
  d.put(0, 1360, 480); d.put(1, 1330, 480); d.run(0.2);
  d.run(1.0, { right: 1 }, {});
  assert(h.x < 1450 - 32 + 2, 'einer allein schafft die schwere Kiste nicht');
  assert(d.until(() => h.x + h.w >= 1699, 10, { right: 1 }, { right: 1 }), 'zu zweit bis zur Wand');
  d.put(0, 1600, 480); d.put(1, 1560, 480); d.run(0.2);
  let top = false;
  for (let i = 0; i < 4 && !top; i++) {
    d.run(0.03, jump({ right: 1 }));
    d.until((g) => g.players[0].grounded, 2, hold({ right: 1 }));
    top = d.p(0).y + 26 <= 341 && d.p(0).x > 1700;
  }
  assert(top, 'von der Kiste hoch: ' + d.info(0));

  d = new Driver(FF, L('schrottplatz'), 'solo');
  d.put(0, 1880, 340); d.p(1).x = d.p(0).x; d.p(1).y = d.p(0).y; d.run(0.2);
  // Bis kurz vor das Ende der aktuellen Fläche laufen, dann hoch auf die nächste
  for (const [lvlY, minX, jumpAt] of [[280, 1950, 1930], [220, 2090, 2030], [160, 2232, 2170]]) {
    d.until((g) => g.players[0].x + 8 > jumpAt, 3, { right: 1 });
    d.run(0.03, jump({ right: 1 }));
    assert(d.until((g) => g.players[0].grounded && Math.abs(g.players[0].y + 26 - lvlY) < 2 && g.players[0].x + 8 > minX, 3, hold({ right: 1 })), 'Stufe ' + lvlY + ': ' + d.info(0));
  }
  tetherSwing(L('schrottplatz'), 2900, 160, 3120, 415);
});

test('Kürbisnacht: Dornengrube, Trampolin mit hohem Haken, Schwung über Dornen', () => {
  tetherSwing(L('kuerbisnacht'), 900, 520, 1120, 760);
  trampHook(L('kuerbisnacht'), -1000, 20);
  swingPool(L('kuerbisnacht'), 2485, 2730, 560);
});

test('Leuchtturm: Krabben, Lasso-Kette, treibende Kiste, Mauer', () => {
  crabRun(L('leuchtturm'), 150, 500, 770);
  chain(L('leuchtturm'), 'coop', 800, 1340, 1390);
  crabRun(L('leuchtturm'), 1420, 500, 1830);
  floatCrate(L('leuchtturm'), 0, 2000, 500, 2450);
  lassoWall(L('leuchtturm'), 3000, 520, 380);
});

test('Nordlicht: Schwung, Trampolin, Abseilen, Lasso-Kette', () => {
  swingPool(L('nordlicht'), 685, 930, 600);
  assert(trampoline(new Driver(FF, L('nordlicht'), 'coop'), 1300, 1460, 600, 1500, 455));
  tetherSwing(L('nordlicht'), 2200, 455, 2420, 710);
  chain(L('nordlicht'), 'coop', 3100, 3640, 3690);
  chain(L('nordlicht'), 'solo', 3100, 3640, 3690);
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
    for (const [x, y] of L.anchors || []) assert(!inside(x, y), `${L.name}: Haken ${x},${y} in der Wand`);
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
