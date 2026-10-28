'use strict';
// Kollision von Körpern mit der Welt und das Faden-Seil (mit Umwicklung an Kanten).
(function () {
  const FF = globalThis.FF;
  const ov = FF.overlap;

  // Horizontal bewegen. Spieler können dabei Kisten schieben.
  FF.moveX = function (W, b, dx, push) {
    if (!dx) return false;
    const n = Math.ceil(Math.abs(dx) / 4), s = dx / n;
    // Was schon vorher überlappt, wird senkrecht aufgelöst, nicht seitlich.
    let pre = null;
    for (const r of W.solids) if (ov(b, r)) (pre || (pre = [])).push(r);
    for (const c of W.crates) if (c !== b && ov(b, c)) (pre || (pre = [])).push(c);
    let hit = false;
    for (let i = 0; i < n && !hit; i++) {
      b.x += s;
      for (const r of W.solids) {
        if (ov(b, r) && !(pre && pre.includes(r))) { b.x = s > 0 ? r.x - b.w : r.x + r.w; hit = true; }
      }
      for (const c of W.crates) {
        if (c === b || !ov(b, c) || (pre && pre.includes(c))) continue;
        if (push && b.isPlayer) {
          const want = s > 0 ? b.x + b.w - c.x : b.x - (c.x + c.w);
          const dir = Math.sign(s);
          if (c.heavy) {
            c.push[b.id] = { t: W.time, dir, str: b.strength || 1 };
            let str = 0;
            for (const k in c.push) {
              const q = c.push[k];
              if (W.time - q.t < 0.06 && q.dir === dir) str += q.str;
            }
            if (str >= 2) FF.moveX(W, c, want, false);
            else c.strain = 0.25;
          } else {
            FF.moveX(W, c, want, false);
          }
          b.pushT = 0.08;
        }
        if (ov(b, c)) { b.x = s > 0 ? c.x - b.w : c.x + c.w; hit = true; }
      }
    }
    return hit;
  };

  // Krabben laufen am Boden hin und her, Fledermäuse fliegen hin und her und wippen dabei.
  // Die Lage hängt nur von der Spielzeit ab – so sehen Gäste im Online-Spiel dasselbe.
  FF.critterBox = function (c, t) {
    const span = Math.max(1, c.x1 - c.x0), ph = (t * c.speed + c.id * 97) / span;
    const k = ph % 2 < 1 ? ph % 1 : 1 - (ph % 1);
    const dir = ph % 2 < 1 ? 1 : -1;
    if (c.kind === 'bat') {
      const w = 22, h = 12, x = c.x0 + k * span;
      return { x: x - w / 2, y: c.y + Math.sin(t * 3.1 + c.id) * 7 - h / 2, w, h, dir, cx: x };
    }
    const w = 24, h = 13, x = c.x0 + k * span;
    return { x: x - w / 2, y: c.y - h, w, h, dir, cx: x };
  };

  // Durchhängender Faden liegt auf dem Boden auf, statt in ihn einzuschneiden: Verläuft ein Fadenstück über eine
  // Oberseite (beide Enden auf oder über ihr), wird ein Punkt darunter auf die Oberseite gehoben. (Nur Darstellung.)
  FF.ropeRest = function (solids, x, y, ay, by, r) {
    for (const s of solids) {
      if (x > s.x && x < s.x + s.w && y > s.y - r && ay <= s.y + 3 && by <= s.y + 3) y = s.y - r;
    }
    return y;
  };

  FF.bridgeY = function (br, x) {
    const x0 = Math.min(br.ax, br.bx), x1 = Math.max(br.ax, br.bx);
    if (x1 - x0 < 8 || x < x0 + 2 || x > x1 - 2) return null;
    const t = (x - br.ax) / (br.bx - br.ax);
    return br.ay + (br.by - br.ay) * t;
  };

  // Vertikal bewegen. Rückgabe: 1 = gelandet, -1 = Kopf gestoßen, 0 = frei.
  FF.moveY = function (W, b, dy) {
    if (!dy) return 0;
    const n = Math.ceil(Math.abs(dy) / 4), s = dy / n;
    let res = 0;
    for (let i = 0; i < n && !res; i++) {
      const oldBottom = b.y + b.h;
      b.y += s;
      for (const r of W.solids) {
        if (ov(b, r)) {
          if (s > 0) { b.y = r.y - b.h; res = 1; } else { b.y = r.y + r.h; res = -1; }
        }
      }
      for (const c of W.crates) {
        if (c === b || !ov(b, c)) continue;
        if (s > 0) { b.y = c.y - b.h; res = 1; b.standOn = c; } else { b.y = c.y + c.h; res = -1; }
      }
      if (s > 0 && !(b.dropT > 0)) {
        for (const o of W.oneways) {
          if (oldBottom <= o.y + 0.01 && b.y + b.h > o.y && b.x + b.w > o.x && b.x < o.x + o.w) {
            b.y = o.y - b.h; res = 1; b.onOneway = true;
          }
        }
        if (b.isPlayer) {
          const cx = b.x + b.w / 2;
          for (const br of W.bridges) {
            const yl = FF.bridgeY(br, cx);
            if (yl !== null && oldBottom <= yl + 0.5 && b.y + b.h > yl) {
              b.y = yl - b.h; res = 1; b.bridge = br; b.onOneway = true;
            }
          }
        }
      }
    }
    return res;
  };

  FF.collides = function (W, b) {
    for (const r of W.solids) if (ov(b, r)) return true;
    for (const c of W.crates) if (c !== b && ov(b, c)) return true;
    return false;
  };

  // Notfall: Körper aus festen Blöcken herausschieben.
  FF.unstick = function (W, b) {
    if (!FF.collides(W, b)) return false;
    const ox = b.x, oy = b.y;
    for (let d = 1; d <= 40; d += 1) {
      for (const [dx, dy] of [[0, -d], [-d, 0], [d, 0], [0, d]]) {
        b.x = ox + dx; b.y = oy + dy;
        if (!FF.collides(W, b)) return true;
      }
    }
    b.x = ox; b.y = oy;
    return false;
  };

  function blocker(W, ax, ay, bx, by) {
    let best = null, bt = 2;
    for (const r of W.solids) {
      const t = FF.segRect(ax, ay, bx, by, r, 0.6);
      if (t >= 0 && t < bt) { bt = t; best = r; }
    }
    return best;
  }
  FF.blocker = blocker;

  function inTri(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = FF.cross(bx - ax, by - ay, px - ax, py - ay);
    const d2 = FF.cross(cx - bx, cy - by, px - bx, py - by);
    const d3 = FF.cross(ax - cx, ay - cy, px - cx, py - cy);
    const e = 1e-6;
    const neg = d1 < -e || d2 < -e || d3 < -e;
    const pos = d1 > e || d2 > e || d3 > e;
    return !(neg && pos);
  }

  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  // Welche Ecke von r hat das Seil (q -> bewegtes Ende a0..a1) zuerst berührt?
  function pickCorner(r, qx, qy, a0x, a0y, a1x, a1y) {
    const o = 2.5;
    const cs = [
      [r.x - o, r.y - o], [r.x + r.w + o, r.y - o],
      [r.x + r.w + o, r.y + r.h + o], [r.x - o, r.y + r.h + o],
    ];
    let best = null, score = Infinity;
    const a0 = Math.atan2(a0y - qy, a0x - qx);
    for (const [cx, cy] of cs) {
      if (Math.hypot(cx - qx, cy - qy) < 1) continue;
      if (!inTri(cx, cy, qx, qy, a0x, a0y, a1x, a1y)) continue;
      const d = angDiff(Math.atan2(cy - qy, cx - qx), a0);
      if (d < score) { score = d; best = [cx, cy]; }
    }
    if (!best) {
      for (const [cx, cy] of cs) {
        if (Math.hypot(cx - qx, cy - qy) < 1) continue;
        let sc = Math.hypot(a1x - cx, a1y - cy) + Math.hypot(cx - qx, cy - qy);
        if (FF.segRect(a1x, a1y, cx, cy, r, 0.6) >= 0) sc += 1e4;
        if (FF.segRect(cx, cy, qx, qy, r, 0.6) >= 0) sc += 1e4;
        if (sc < score) { score = sc; best = [cx, cy]; }
      }
    }
    return best && { x: best[0], y: best[1], s: 1 };
  }

  // Ein Seil zwischen zwei Enden. Ein Ende ist {body} oder ein fester Punkt {x, y}.
  // Das Seil gibt nach, solange es kürzer als len ist, und spannt sich darüber.
  class Rope {
    constructor(W, a, b, len, full, kind) {
      this.a = a; this.b = b;
      this.len = len; this.full = full; this.kind = kind;
      this.pts = [];
      this.taut = false;
      this.pa = this.pos(a); this.pb = this.pos(b);
      this.total = Math.hypot(this.pb[0] - this.pa[0], this.pb[1] - this.pa[1]);
    }
    pos(e) {
      if (e.body) { const b = e.body; return [b.x + b.w / 2, b.y + b.h * 0.5]; }
      return [e.x, e.y];
    }
    w(e) { return e.body ? e.body.im : 0; }
    reset() {
      this.pts.length = 0;
      this.pa = this.pos(this.a); this.pb = this.pos(this.b);
      this.len = this.full;
      this.total = this.length();
      this.taut = false;
    }
    inner() {
      const P = this.pts;
      let s = 0;
      for (let i = 1; i < P.length; i++) s += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
      return s;
    }
    length() {
      const A = this.pos(this.a), B = this.pos(this.b), P = this.pts, n = P.length;
      if (!n) return Math.hypot(B[0] - A[0], B[1] - A[1]);
      return Math.hypot(P[0].x - A[0], P[0].y - A[1]) + this.inner() + Math.hypot(B[0] - P[n - 1].x, B[1] - P[n - 1].y);
    }
    // Nächster Punkt des Seils, von einem Ende aus gesehen.
    next(end) {
      const P = this.pts;
      if (end === this.a) return P.length ? [P[0].x, P[0].y] : this.pos(this.b);
      return P.length ? [P[P.length - 1].x, P[P.length - 1].y] : this.pos(this.a);
    }
    wrap(W) {
      const [ax, ay] = this.pos(this.a), [bx, by] = this.pos(this.b);
      const P = this.pts;
      for (let k = 0; k < 4; k++) {
        const q = P.length ? P[0] : { x: bx, y: by };
        const r = blocker(W, ax, ay, q.x, q.y);
        if (!r) break;
        const c = pickCorner(r, q.x, q.y, this.pa[0], this.pa[1], ax, ay);
        if (!c || Math.hypot(c.x - ax, c.y - ay) < 0.5 || Math.hypot(c.x - q.x, c.y - q.y) < 1 || P.length > 10) break;
        c.s = Math.sign(FF.cross(c.x - ax, c.y - ay, q.x - c.x, q.y - c.y)) || 1;
        P.unshift(c);
      }
      while (P.length) {
        const w = P[0], q = P[1] || { x: bx, y: by };
        const s = FF.cross(w.x - ax, w.y - ay, q.x - w.x, q.y - w.y);
        if (s * w.s < 0 && !blocker(W, ax, ay, q.x, q.y)) P.shift();
        else break;
      }
      for (let k = 0; k < 4; k++) {
        const q = P.length ? P[P.length - 1] : { x: ax, y: ay };
        const r = blocker(W, q.x, q.y, bx, by);
        if (!r) break;
        const c = pickCorner(r, q.x, q.y, this.pb[0], this.pb[1], bx, by);
        if (!c || Math.hypot(c.x - bx, c.y - by) < 0.5 || Math.hypot(c.x - q.x, c.y - q.y) < 1 || P.length > 10) break;
        c.s = Math.sign(FF.cross(c.x - q.x, c.y - q.y, bx - c.x, by - c.y)) || 1;
        P.push(c);
      }
      while (P.length) {
        const w = P[P.length - 1], q = P[P.length - 2] || { x: ax, y: ay };
        const s = FF.cross(w.x - q.x, w.y - q.y, bx - w.x, by - w.y);
        if (s * w.s < 0 && !blocker(W, q.x, q.y, bx, by)) P.pop();
        else break;
      }
      this.pa = [ax, ay]; this.pb = [bx, by];
    }
    pull(W, body, dx, dy) {
      const ox = body.x, oy = body.y;
      FF.moveX(W, body, dx, false);
      FF.moveY(W, body, dy);
      return Math.hypot(body.x - ox, body.y - oy);
    }
    solve(W) {
      let blockA = false, blockB = false;
      for (let it = 0; it < 3; it++) {
        const A = this.pos(this.a), B = this.pos(this.b), P = this.pts, n = P.length;
        const qa = n ? [P[0].x, P[0].y] : B, qb = n ? [P[n - 1].x, P[n - 1].y] : A;
        const dax = qa[0] - A[0], day = qa[1] - A[1], la = Math.hypot(dax, day);
        const dbx = qb[0] - B[0], dby = qb[1] - B[1], lb = Math.hypot(dbx, dby);
        const total = n ? la + this.inner() + lb : la;
        const ex = total - this.len;
        if (ex <= 0.01) break;
        const wa = blockA ? 0 : this.w(this.a), wb = blockB ? 0 : this.w(this.b), ws = wa + wb;
        if (ws <= 0) break;
        if (wa > 0 && la > 1e-4) {
          const m = Math.min((ex * wa) / ws, 30);
          if (this.pull(W, this.a.body, (dax / la) * m, (day / la) * m) < m * 0.5) blockA = true;
        }
        if (wb > 0 && lb > 1e-4) {
          const m = Math.min((ex * wb) / ws, 30);
          if (this.pull(W, this.b.body, (dbx / lb) * m, (dby / lb) * m) < m * 0.5) blockB = true;
        }
      }
      this.total = this.length();
      this.taut = this.total >= this.len - 0.8;
    }
    // Für die Darstellung: Polylinie vom Ende a zum Ende b.
    points() {
      const out = [this.pos(this.a)];
      for (const p of this.pts) out.push([p.x, p.y]);
      out.push(this.pos(this.b));
      return out;
    }
  }
  FF.Rope = Rope;
})();
