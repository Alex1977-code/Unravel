'use strict';
// Feine 3D-Details, die die Welt lebendig machen (ergänzt Renderer3D):
//  - Erinnerungsstück am Ziel: ein Gegenstand aus Nils' Leben mit glimmendem Fadenrest (siehe story.js)
//  - Figuren: setzen sich im Leerlauf hin und schauen sich um; frieren, zittern und hauchen bei Kälte;
//    werden im Regen dunkler und tropfen; hinterlassen Fußspuren im Schnee
//  - Tiere: Möwen und Vögel am Himmel, Schmetterlinge über dem Gras, springende Fische, eine neugierige Robbe
// Alles ist reine Darstellung und ändert nichts an der Spielphysik.
(function () {
  const FF = globalThis.FF, P = FF.Renderer3D && FF.Renderer3D.prototype;
  if (!P) return;
  const ZP = 3;
  const col = (h) => new globalThis.THREE.Color(h);
  const lerp = (a, b, k) => a + (b - a) * k;

  // ------------------------------------------------------------ Erinnerungsstücke
  // Jede Funktion baut den Gegenstand um den Ursprung (Boden bei y = 0, Kamera schaut von +z) und nennt die Stelle des Knotens.
  const MEM = {
    compass(R, T, M) {
      const g = new T.Group(), c = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(20, 20, 7, 40), M.brass); body.rotation.x = Math.PI / 2;
      const face = new T.Mesh(new T.CircleGeometry(17.4, 40), M.paper); face.position.z = 3.6;
      const ring = new T.Mesh(new T.TorusGeometry(18.6, 1.7, 8, 40), M.brass); ring.position.z = 3.6;
      const needle = new T.Group();
      const nr = new T.Mesh(new T.ConeGeometry(2, 14, 4), M.red); nr.position.y = 7;
      const nw = new T.Mesh(new T.ConeGeometry(2, 14, 4), M.steel); nw.position.y = -7; nw.rotation.z = Math.PI;
      needle.add(nr, nw); needle.position.z = 4.6; needle.scale.z = 0.3; needle.rotation.z = 0.55;
      const pin = new T.Mesh(new T.SphereGeometry(1.6, 10, 8), M.brass); pin.position.z = 5;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, tick = new T.Mesh(new T.BoxGeometry(i % 4 ? 0.6 : 1.1, i % 4 ? 2.4 : 4, 0.3), M.ink);
        tick.position.set(Math.sin(a) * 14.6, Math.cos(a) * 14.6, 3.8); tick.rotation.z = -a; c.add(tick);
      }
      const n = R.label('N', 9, M.inkHex); n.position.set(0, 9.5, 3.9); n.scale.setScalar(0.55);
      const loop = new T.Mesh(new T.TorusGeometry(4.2, 1.1, 8, 18), M.brass); loop.position.y = 23.5;
      const glass = new T.Mesh(new T.CircleGeometry(17.4, 32), M.glass); glass.position.z = 5.4;
      c.add(body, face, ring, needle, pin, n, loop, glass);
      c.position.set(0, 19, 0); c.rotation.set(-0.38, 0.25, 0.12);
      g.add(c);
      return { grp: g, knot: [15, 36, 6] };
    },
    knife(R, T, M) {
      const g = new T.Group();
      const log = new T.Mesh(new T.CylinderGeometry(11, 12, 54, 16), M.wood); log.rotation.z = Math.PI / 2; log.position.y = 11;
      const cut = new T.Mesh(new T.CircleGeometry(11, 16), M.freshWood); cut.rotation.y = Math.PI / 2; cut.position.set(27.1, 11, 0);
      const k = new T.Group();
      const blade = new T.Mesh(new T.BoxGeometry(6, 18, 0.9), M.steel); blade.position.y = 9;
      const handle = new T.Mesh(new T.BoxGeometry(8.5, 28, 5.5), M.redWood); handle.position.y = 32;
      for (const y of [19, 45]) { const b = new T.Mesh(new T.BoxGeometry(9, 3.4, 6), M.brass); b.position.y = y; k.add(b); }
      for (const y of [26, 38]) { const r = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 5.8, 8), M.brass); r.rotation.x = Math.PI / 2; r.position.y = y; k.add(r); }
      k.add(blade, handle); k.position.set(2, 17, 2); k.rotation.z = -0.22;
      for (let i = 0; i < 6; i++) {
        const ch = new T.Mesh(new T.BoxGeometry(4 + i % 3, 0.7, 2.5), M.freshWood);
        ch.position.set(-22 + i * 9, 0.6, 12 + (i % 2) * 5); ch.rotation.set(0.3 * i, i, 0.2); g.add(ch);
      }
      g.add(log, cut, k);
      return { grp: g, knot: [12, 62, 5] };
    },
    oar(R, T, M) {
      const g = new T.Group(), o = new T.Group();
      const shaft = new T.Mesh(new T.CylinderGeometry(2.4, 2.8, 104, 10), M.wood); shaft.position.y = 52;
      const blade = new T.Mesh(new T.BoxGeometry(14, 42, 2.2), M.wood); blade.position.y = 116;
      const neck = new T.Mesh(new T.CylinderGeometry(3.4, 2.4, 10, 10), M.wood); neck.position.y = 99;
      const grip = new T.Mesh(new T.CylinderGeometry(3.2, 3.2, 12, 10), M.freshWood); grip.position.y = 5;
      const txt = R.label('N + A', 30, M.inkHex); txt.rotation.z = Math.PI / 2; txt.position.set(0, 116, 1.3); txt.scale.setScalar(0.42);
      o.add(shaft, blade, neck, grip, txt); o.rotation.z = -0.62; o.position.set(-38, -3, -8);
      const stone = new T.Mesh(new T.DodecahedronGeometry(13, 1), R.mats.stone); stone.position.set(12, 6, -12); stone.scale.set(1.3, 0.8, 1);
      g.add(o, stone);
      return { grp: g, knot: [-6, 42, -4] };
    },
    bird(R, T, M) {
      const g = new T.Group(), w = M.freshWood;
      const block = new T.Mesh(new T.BoxGeometry(28, 15, 19), M.wood); block.position.y = 7.5;
      const body = new T.Mesh(new T.SphereGeometry(1, 20, 14), w); body.scale.set(15, 10, 9); body.position.set(0, 22, 0);
      const head = new T.Mesh(new T.SphereGeometry(7, 16, 12), w); head.position.set(12, 31, 0);
      const beak = new T.Mesh(new T.ConeGeometry(2.3, 7.5, 8), w); beak.rotation.z = -Math.PI / 2; beak.position.set(21, 30.5, 0);
      const tail = new T.Mesh(new T.BoxGeometry(15, 3, 8), w); tail.position.set(-16, 25, 0); tail.rotation.z = 0.4;
      const wing = new T.Mesh(new T.SphereGeometry(1, 14, 10), w); wing.scale.set(9, 6, 2); wing.position.set(-2, 23, 8.4); wing.rotation.z = 0.2;
      const eye = new T.Mesh(new T.SphereGeometry(1, 8, 6), M.ink); eye.position.set(15.5, 33, 5.4);
      for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.BoxGeometry(6, 0.5, 0.5), M.ink); f.position.set(-3 + i * 0.6, 21 + i * 1.6, 10.2); f.rotation.z = 0.25; g.add(f); }
      for (let i = 0; i < 7; i++) {
        const ch = new T.Mesh(new T.BoxGeometry(3 + i % 3 * 2, 0.6, 2), w);
        ch.position.set(-26 + i * 9, 0.5, 13 + (i % 3) * 4); ch.rotation.set(i, i * 2, 0.3); g.add(ch);
      }
      g.add(block, body, head, beak, tail, wing, eye);
      return { grp: g, knot: [-17, 31, 4] };
    },
    photo(R, T, M) {
      const g = new T.Group(), f = new T.Group();
      const frame = new T.Mesh(new T.BoxGeometry(46, 58, 3), M.darkWood);
      const pic = new T.Mesh(new T.PlaneGeometry(38, 50), new T.MeshStandardMaterial({ map: R.photoTexture(), roughness: 0.55 })); pic.position.z = 1.6;
      const glass = new T.Mesh(new T.PlaneGeometry(38, 50), M.glass); glass.position.z = 1.9;
      const leg = new T.Mesh(new T.BoxGeometry(3, 44, 3), M.darkWood); leg.position.set(0, -4, -9); leg.rotation.x = 0.5;
      f.add(frame, pic, glass, leg); f.position.set(0, 29, -2); f.rotation.set(-0.2, 0.22, 0);
      g.add(f);
      return { grp: g, knot: [21, 57, 2] };
    },
    bucket(R, T, M) {
      const g = new T.Group();
      const side = new T.Mesh(new T.CylinderGeometry(19, 14, 30, 28, 1, true), M.tin); side.position.y = 15;
      const bottom = new T.Mesh(new T.CircleGeometry(14, 24), M.tin); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.6;
      const rim = new T.Mesh(new T.TorusGeometry(19, 1.2, 8, 28), M.tin); rim.rotation.x = Math.PI / 2; rim.position.y = 30;
      const rnd = FF.rng(11);
      const bg = new T.SphereGeometry(3.1, 10, 8);
      for (let i = 0; i < 22; i++) {
        const a = rnd() * 6.3, r = Math.sqrt(rnd()) * 14.5;
        const b = new T.Mesh(bg, i % 5 ? M.berry : M.berry2); b.position.set(Math.cos(a) * r, 26.5 + rnd() * 4 + (1 - r / 15) * 3, Math.sin(a) * r); g.add(b);
      }
      for (let i = 0; i < 3; i++) { const b = new T.Mesh(bg, M.berry); b.position.set(24 + i * 7, 3, 9 - i * 5); g.add(b); }
      const big = new T.Mesh(new T.TorusGeometry(18.5, 1, 6, 24, Math.PI), M.steel); big.position.y = 30; big.rotation.x = -0.35;
      const small = new T.Mesh(new T.TorusGeometry(7, 1, 6, 16, Math.PI), M.steel); small.position.set(0, 30, 17); small.rotation.x = 0.5;
      g.add(side, bottom, rim, big, small);
      return { grp: g, knot: [0, 46, -6] };
    },
    bottle(R, T, M) {
      const g = new T.Group(), b = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(9, 9, 34, 24), M.bottle); body.rotation.z = Math.PI / 2;
      const base = new T.Mesh(new T.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.bottle); base.rotation.z = Math.PI / 2; base.position.x = -17; base.scale.y = 0.4;
      const sh = new T.Mesh(new T.CylinderGeometry(3.6, 9, 9, 24), M.bottle); sh.rotation.z = -Math.PI / 2; sh.position.x = 21.5;
      const neck = new T.Mesh(new T.CylinderGeometry(3.6, 3.6, 12, 16), M.bottle); neck.rotation.z = Math.PI / 2; neck.position.x = 32;
      const lip = new T.Mesh(new T.TorusGeometry(3.8, 0.9, 6, 16), M.bottle); lip.rotation.y = Math.PI / 2; lip.position.x = 38;
      const cork = new T.Mesh(new T.CylinderGeometry(3.3, 2.9, 7, 12), M.cork); cork.rotation.z = -Math.PI / 2; cork.position.x = 39.5;
      const paper = new T.Mesh(new T.CylinderGeometry(4.6, 4.6, 26, 14), M.paper); paper.rotation.z = Math.PI / 2; paper.position.set(-1, -3.6, 0);
      const band = new T.Mesh(new T.TorusGeometry(4.8, 0.6, 6, 14), M.red); band.rotation.y = Math.PI / 2; band.position.set(-1, -3.6, 0);
      b.add(paper, band, body, base, sh, neck, lip, cork); b.position.set(-4, 11, 0); b.rotation.z = 0.2;
      g.add(b);
      return { grp: g, knot: [27, 21, 3] };
    },
    skate(R, T, M) {
      const g = new T.Group(), s = new T.Group();
      const boot = new T.Mesh(new T.BoxGeometry(30, 13, 11), M.leather); boot.position.set(0, 16, 0);
      const ankle = new T.Mesh(new T.BoxGeometry(14, 22, 11), M.leather); ankle.position.set(-8, 31, 0);
      const cuff = new T.Mesh(new T.BoxGeometry(15.5, 3, 12), M.darkWood); cuff.position.set(-8, 42, 0);
      const toe = new T.Mesh(new T.SphereGeometry(1, 14, 10), M.leather); toe.scale.set(8, 6.5, 5.5); toe.position.set(14, 15.5, 0);
      const sole = new T.Mesh(new T.BoxGeometry(36, 2.2, 12), M.darkWood); sole.position.set(2, 8.6, 0);
      for (const x of [-10, 12]) { const st = new T.Mesh(new T.BoxGeometry(3, 6, 2), M.steel); st.position.set(x, 4.6, 0); s.add(st); }
      const blade = new T.Mesh(new T.BoxGeometry(44, 2.2, 1.3), M.steel); blade.position.set(3, 1.4, 0);
      const curl = new T.Mesh(new T.TorusGeometry(4, 1, 6, 12, Math.PI), M.steel); curl.position.set(25, 5.2, 0); curl.rotation.z = -Math.PI / 2;
      for (let i = 0; i < 4; i++) { const l = new T.Mesh(new T.BoxGeometry(7, 0.8, 0.8), M.paper); l.position.set(-2 + i * 0.5, 24 + i * 4.5, 5.8); l.rotation.z = i % 2 ? 0.5 : -0.5; s.add(l); }
      s.add(boot, ankle, cuff, toe, sole, blade, curl); s.rotation.set(0, 0.25, 0.1); s.position.set(0, -1, 0);
      const ice = new T.Mesh(new T.DodecahedronGeometry(15, 0), R.mats.ice); ice.position.set(12, 2, -6); ice.scale.set(1.8, 0.45, 1.2);
      g.add(s, ice);
      return { grp: g, knot: [-10, 43, 5] };
    },
    bell(R, T, M) {
      const g = new T.Group(), b = new T.Group();
      const prof = [[0, 34], [5, 34], [8.5, 31], [10.5, 24], [12, 14], [14.5, 6], [19, 1.5], [21.5, 0], [20, -0.6]].map(([x, y]) => new T.Vector2(x, y));
      const bell = new T.Mesh(new T.LatheGeometry(prof, 36), M.brassSide);
      const clap = new T.Mesh(new T.SphereGeometry(3.6, 12, 10), M.ink); clap.position.y = 2.5;
      const rod = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 26, 6), M.ink); rod.position.y = 16;
      const crown = new T.Mesh(new T.TorusGeometry(4, 1.3, 8, 16), M.brass); crown.position.y = 37.5;
      for (let i = 0; i < 5; i++) {
        const a = -0.55 + i * 0.27, n = new T.Mesh(new T.BoxGeometry(0.9, 4.5, 1.6), M.ink);
        n.position.set(Math.sin(a) * 19.4, 3.4, Math.cos(a) * 19.4); n.rotation.y = a; b.add(n);
      }
      b.add(bell, clap, rod, crown); b.position.set(6, 16, 0); b.rotation.z = 0.08;
      const post = new T.Mesh(new T.BoxGeometry(5.5, 66, 5.5), M.wood); post.position.set(-24, 33, -3);
      const arm = new T.Mesh(new T.BoxGeometry(40, 4.5, 4.5), M.wood); arm.position.set(-6, 60, -3);
      const brace = new T.Mesh(new T.BoxGeometry(22, 3, 3), M.wood); brace.position.set(-16, 50, -3); brace.rotation.z = 0.8;
      g.add(b, post, arm, brace);
      return { grp: g, knot: [-12, 64, 1] };
    },
    glove(R, T, M) {
      const g = new T.Group(), h = new T.Group();
      const hand = new T.Mesh(new T.SphereGeometry(1, 20, 16), M.greenYarn); hand.scale.set(11, 15, 5.5); hand.position.set(0, 23, 0);
      const thumb = new T.Mesh(new T.SphereGeometry(1, 14, 10), M.greenYarn); thumb.scale.set(4.2, 7.5, 4); thumb.position.set(-11.5, 19, 0.5); thumb.rotation.z = 0.55;
      const cuff = new T.Mesh(new T.CylinderGeometry(9, 9.8, 10, 18), M.greenYarnDark); cuff.position.set(0, 6.5, 0); cuff.scale.z = 0.6;
      for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(9.6 - i * 0.2, 0.8, 6, 20), M.greenYarn); r.rotation.x = Math.PI / 2; r.position.y = 3.5 + i * 3; r.scale.y = 0.6; h.add(r); }
      const fz = new T.Mesh(new T.SphereGeometry(1, 18, 14), R.fuzzMaterial('#5f8a4a')); fz.scale.set(11.8, 15.8, 6.2); fz.position.copy(hand.position);
      h.add(hand, thumb, cuff, fz); h.rotation.set(-0.15, 0.2, -0.4); h.position.set(-4, 1, 0);
      const twig = new T.Mesh(new T.CylinderGeometry(1.2, 1.8, 46, 6), R.mats.twig); twig.position.set(14, 16, -6); twig.rotation.z = 0.5;
      g.add(h, twig);
      return { grp: g, knot: [12, 34, 4] };
    },
    ring(R, T, M) {
      const g = new T.Group(), r = new T.Group();
      r.add(new T.Mesh(new T.TorusGeometry(22, 6.5, 14, 44), M.white));
      for (let i = 0; i < 4; i++) { const band = new T.Mesh(new T.TorusGeometry(22, 6.9, 12, 8, 0.42), M.red); band.rotation.z = i * Math.PI / 2 + 0.58; r.add(band); }
      for (let i = 0; i < 4; i++) {
        const a0 = i * Math.PI / 2 + 0.3, pts = [];
        for (let k = 0; k <= 8; k++) { const a = a0 + k / 8 * (Math.PI / 2 - 0.6), rr = 29.5 + Math.sin(k / 8 * Math.PI) * 3; pts.push(new T.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 2)); }
        r.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 0.8, 5, false), M.rope));
      }
      r.position.set(0, 27, -2); r.rotation.set(-0.32, 0.15, 0);
      const post = new T.Mesh(new T.CylinderGeometry(3, 3.6, 46, 8), M.wood); post.position.set(0, 23, -14);
      g.add(r, post);
      return { grp: g, knot: [19, 46, 4] };
    },
    sled(R, T, M) {
      const g = new T.Group(), s = new T.Group(), w = M.wood;
      for (const z of [-9, 9]) {
        const run = new T.Mesh(new T.BoxGeometry(64, 3, 3), w); run.position.set(0, 1.5, z);
        const curl = new T.Mesh(new T.TorusGeometry(7, 1.5, 6, 12, Math.PI / 2), w); curl.position.set(32, 8.5, z); curl.rotation.z = -Math.PI / 2;
        const iron = new T.Mesh(new T.BoxGeometry(64, 0.7, 2), M.steel); iron.position.set(0, 0.2, z);
        s.add(run, curl, iron);
        for (const x of [-18, 18]) { const p = new T.Mesh(new T.BoxGeometry(2.6, 12, 2.6), w); p.position.set(x, 9, z); s.add(p); }
      }
      for (const z of [-7.5, -2.5, 2.5, 7.5]) { const sl = new T.Mesh(new T.BoxGeometry(52, 2, 4.2), M.freshWood); sl.position.set(-2, 16, z); s.add(sl); }
      for (const x of [-18, 18]) { const c = new T.Mesh(new T.BoxGeometry(3, 2, 20), w); c.position.set(x, 14.4, 0); s.add(c); }
      const board = new T.Mesh(new T.BoxGeometry(26, 7, 1.2), M.freshWood); board.position.set(0, 9.5, 10.6);
      const m = R.label('M', 12, M.inkHex); m.position.set(0, 9.5, 11.3); m.scale.setScalar(0.5);
      for (const dx of [-4.2, 4.2]) { const l = new T.Mesh(new T.TorusGeometry(3.6, 1.1, 6, 14), M.red); l.position.set(-14 + dx, 21.5, 2); l.scale.y = 0.7; s.add(l); }
      const kn = new T.Mesh(new T.SphereGeometry(1.9, 10, 8), M.red); kn.position.set(-14, 21.5, 2);
      const rope = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(38, 10, -9), new T.Vector3(50, 3, -2), new T.Vector3(46, 1.5, 8), new T.Vector3(38, 10, 9)]), 20, 0.8, 5, false), M.rope);
      s.add(board, m, kn, rope); s.rotation.y = 0.3;
      g.add(s);
      return { grp: g, knot: [20, 22, 3] };
    },
    needles(R, T, M) {
      const g = new T.Group();
      const mk = (rz, z, stitches) => {
        const n = new T.Group();
        const rod = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 66, 8), M.needle);
        const tip = new T.Mesh(new T.ConeGeometry(1.1, 6, 8), M.needle); tip.position.y = -36; tip.rotation.z = Math.PI;
        const knob = new T.Mesh(new T.SphereGeometry(2.7, 12, 10), M.brass); knob.position.y = 34;
        n.add(rod, tip, knob);
        if (stitches) for (let i = 0; i < 9; i++) { const st = new T.Mesh(new T.TorusGeometry(2.3, 0.75, 6, 12), M.redYarn); st.rotation.x = Math.PI / 2; st.position.y = -26 + i * 2.9; n.add(st); }
        n.rotation.z = rz; n.position.set(0, 27, z);
        return n;
      };
      const pts = [new T.Vector3(-17, 9, 1), new T.Vector3(-24, 3, 6), new T.Vector3(-34, 1.2, 2), new T.Vector3(-40, 1.2, 9), new T.Vector3(-50, 1.2, 4)];
      const yarn = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 30, 0.75, 5, false), M.redYarn);
      const ball = R.yarnBall(9, [FF.COLORS[0], FF.COLORS_DARK[0]], 16, 0.7, FF.rng(4)); ball.position.set(-56, 8.5, 4);
      g.add(mk(0.85, 0, true), mk(-0.85, 3, false), yarn, ball);
      return { grp: g, knot: [22, 50, 4] };
    },
  };

  // Schrift oder Schnitzerei als kleine Karte
  P.label = function (text, w, color) {
    const T = this.THREE, c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = color || '#2a1c12'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'italic 700 72px Georgia, serif';
    x.fillText(text, 128, 50);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    return new T.Mesh(new T.PlaneGeometry(w, w * 0.375), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }));
  };

  // Vergilbtes Foto: ein junger Mann winkt von der Galerie des Leuchtturms
  P.photoTexture = function () {
    const T = this.THREE, c = document.createElement('canvas');
    c.width = 190; c.height = 250;
    const x = c.getContext('2d');
    const sky = x.createLinearGradient(0, 0, 0, 250); sky.addColorStop(0, '#d9c49a'); sky.addColorStop(0.7, '#efe2c0'); sky.addColorStop(1, '#b9a57c');
    x.fillStyle = sky; x.fillRect(0, 0, 190, 250);
    x.fillStyle = 'rgba(120,96,64,0.5)'; x.fillRect(0, 196, 190, 54);            // Meer
    x.fillStyle = '#6e5a40'; x.beginPath(); x.moveTo(0, 250); x.lineTo(0, 214); x.quadraticCurveTo(60, 196, 120, 216); x.lineTo(190, 232); x.lineTo(190, 250); x.fill();
    x.fillStyle = '#f4ead2'; x.beginPath(); x.moveTo(52, 226); x.lineTo(62, 96); x.lineTo(96, 96); x.lineTo(106, 226); x.fill();  // Turm
    x.fillStyle = '#8a4a34'; x.fillRect(57, 150, 44, 22);
    x.fillStyle = '#4a3a28'; x.fillRect(50, 88, 58, 8); x.fillRect(64, 62, 30, 26);
    x.beginPath(); x.moveTo(60, 62); x.lineTo(79, 42); x.lineTo(98, 62); x.fill();
    x.fillStyle = '#fff3c8'; x.fillRect(70, 68, 18, 16);
    x.strokeStyle = '#4a3a28'; x.lineWidth = 2; x.beginPath(); x.moveTo(46, 80); x.lineTo(112, 80); x.stroke();
    x.fillStyle = '#3a2c1e'; x.beginPath(); x.arc(118, 70, 4.5, 0, 6.3); x.fill(); x.fillRect(114.5, 74, 7, 15);  // Nils
    x.lineWidth = 2.6; x.strokeStyle = '#3a2c1e'; x.beginPath(); x.moveTo(121, 77); x.lineTo(130, 62); x.stroke();
    x.strokeStyle = 'rgba(70,56,40,0.6)'; x.lineWidth = 1.5;
    for (const [bx, by] of [[150, 60], [166, 76], [30, 50]]) { x.beginPath(); x.moveTo(bx - 7, by); x.quadraticCurveTo(bx - 3, by - 6, bx, by); x.quadraticCurveTo(bx + 3, by - 6, bx + 7, by); x.stroke(); }
    const v = x.createRadialGradient(95, 125, 60, 95, 125, 170); v.addColorStop(0, 'rgba(60,40,20,0)'); v.addColorStop(1, 'rgba(60,40,20,0.5)');
    x.fillStyle = v; x.fillRect(0, 0, 190, 250);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    return tex;
  };

  // Baut das Erinnerungsstück in die Zielgruppe und gibt den glimmenden Knoten zurück
  P.buildMemory = function (goal, st, rnd) {
    const T = this.THREE, std = (o) => new T.MeshStandardMaterial(o);
    const M = {
      brass: std({ color: col('#c9a24e'), roughness: 0.32, metalness: 0.9 }),
      brassSide: std({ color: col('#c9a24e'), roughness: 0.36, metalness: 0.9, side: T.DoubleSide }),
      steel: std({ color: col('#b9c0c6'), roughness: 0.3, metalness: 0.9 }),
      tin: std({ color: col('#9aa3a8'), roughness: 0.45, metalness: 0.75, side: T.DoubleSide }),
      wood: this.mats.wood,
      freshWood: std({ color: col('#c9a877'), roughness: 0.8 }),
      darkWood: std({ color: col('#4a3324'), roughness: 0.7 }),
      redWood: std({ color: col('#7c2c22'), roughness: 0.45 }),
      leather: std({ color: col('#6a4630'), roughness: 0.6 }),
      paper: std({ color: col('#efe4c8'), roughness: 0.9 }),
      cork: std({ color: col('#b08a5a'), roughness: 0.95 }),
      ink: std({ color: col('#241a14'), roughness: 0.6 }),
      inkHex: '#2a1c12',
      red: std({ color: col('#c23a2c'), roughness: 0.55 }),
      white: std({ color: col('#eeeae0'), roughness: 0.6 }),
      rope: std({ color: col('#cdbb92'), roughness: 1 }),
      needle: std({ color: col('#dcc79c'), roughness: 0.4 }),
      berry: new T.MeshPhysicalMaterial({ color: col('#f0a43a'), roughness: 0.3, clearcoat: 0.7 }),
      berry2: new T.MeshPhysicalMaterial({ color: col('#e8703a'), roughness: 0.3, clearcoat: 0.7 }),
      glass: new T.MeshPhysicalMaterial({ color: col('#ffffff'), roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
      bottle: new T.MeshPhysicalMaterial({ color: col('#8fc7a6'), roughness: 0.05, transparent: true, opacity: 0.42, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false, side: T.DoubleSide }),
      greenYarn: this.yarnMaterial('#5f8a4a'), greenYarnDark: this.yarnMaterial('#3f6436'), redYarn: this.yarnMaterial(FF.COLORS[0]),
    };
    const obj = (MEM[st.item] || MEM.compass)(this, T, M);
    obj.grp.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
    // Etwas größer als gebaut: für die kleinen Garnfiguren sind es Dinge aus einer riesigen Welt
    const S = 1.4;
    obj.grp.scale.setScalar(S);
    goal.add(obj.grp);
    // Erinnerungsknoten: kleines rotes Knäuel mit losem, glimmendem Fadenende
    const [kx, ky, kz] = obj.knot.map((v) => v * S);
    const knot = this.yarnBall(4.6, [FF.COLORS[0], FF.COLORS_DARK[0]], 14, 0.5, rnd);
    knot.position.set(kx, ky, kz);
    const ember = new T.MeshStandardMaterial({ color: col(FF.COLORS[0]), emissive: col('#ff5a30'), emissiveIntensity: 1.1, roughness: 0.7 });
    const side = kx > 0 ? 1 : -1;
    const pts = [new T.Vector3(kx, ky, kz), new T.Vector3(kx + side * 5, ky * 0.62, kz + 5), new T.Vector3(kx + side * 12, ky * 0.25, kz + 9),
      new T.Vector3(kx + side * 22, 1.6, kz + 6), new T.Vector3(kx + side * 30, 1.2, kz + 11), new T.Vector3(kx + side * 39, 1.2, kz + 7)];
    const tail = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 40, 0.6, 5, false), ember);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: this.tex.glow, color: col('#ff7a4a'), transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
    glow.position.set(kx, ky, kz + 3); glow.scale.set(46, 46, 1);
    goal.add(knot, tail, glow);
    this.memory = { glow, ember };
    return knot;
  };

  // ------------------------------------------------------------ Aufbau der Kleinigkeiten
  const BIRDS = { coast: ['gull', 6], lighthouse: ['gull', 4], scrap: ['gull', 3], garden: ['bird', 3], pond: ['bird', 3], autumn: ['bird', 5], quarry: ['bird', 2], marsh: ['bird', 3], winter: ['bird', 2] };
  const FLUTTER = { garden: 6, pond: 4, marsh: 3, quarry: 2, coast: 2, scrap: 1 };
  const WING_COLORS = ['#f4c542', '#fbf6ea', '#e8803a', '#7fb4e8', '#f09ab8', '#c8e06a'];

  P.buildDetails = function (g) {
    const T = this.THREE, theme = this.level3dTheme, rnd = FF.rng(g.levelIndex * 17 + 3), scene = this.scene;
    const D = (this.det = { puffs: [], drips: [], birds: [], flies: [], fish: null, seal: null, yarn: [], t: 0 });

    // Atemwölkchen und Tropfen (kleiner Vorrat, wird reihum benutzt)
    for (let i = 0; i < 10; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: this.tex.glow, color: col('#e6eef6'), transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s); D.puffs.push({ s, t: 9, life: 1 });
    }
    const dg = new T.SphereGeometry(0.85, 6, 5), dm = new T.MeshBasicMaterial({ color: col('#cfe4f4'), transparent: true, opacity: 0.85 });
    for (let i = 0; i < 12; i++) { const m = new T.Mesh(dg, dm); m.visible = false; m.scale.y = 1.5; scene.add(m); D.drips.push({ m, vy: 0, floor: 0, on: false }); }

    // Garn der Figuren: Grundfarbe merken, damit es bei Nässe dunkler werden kann
    const seen = new Set();
    for (const y of this.yarnies) y.root.traverse((o) => {
      const m = o.material;
      if (!m || seen.has(m) || !m.color) return;
      if ((m.isMeshPhysicalMaterial && m.sheen > 0) || m.alphaMap) { seen.add(m); D.yarn.push({ m, base: m.color.clone(), rough: m.roughness }); }
    });

    // Fußspuren im Schnee
    const pg = new T.CircleGeometry(1, 10); pg.rotateX(-Math.PI / 2);
    const pm = new T.MeshBasicMaterial({ color: col('#56657c'), transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    D.prints = new T.InstancedMesh(pg, pm, 90); D.prints.count = 0; D.prints.frustumCulled = false; D.printI = 0;
    scene.add(D.prints);

    // Vögel
    const bk = BIRDS[theme];
    if (bk) {
      const gull = bk[0] === 'gull';
      const bodyM = new T.MeshStandardMaterial({ color: col(gull ? '#f1f2f0' : '#2c2a2c'), roughness: 0.8 });
      const wingM = new T.MeshStandardMaterial({ color: col(gull ? '#c9ced2' : '#3a3638'), roughness: 0.8, side: T.DoubleSide });
      const bodyG = new T.SphereGeometry(1, 10, 8);
      const wingG = new T.BufferGeometry();
      wingG.setAttribute('position', new T.Float32BufferAttribute([1.3, 0, 0, -1.3, 0, 0, 1.0, 0, 4.4, -1.3, 0, 0, -0.9, 0, 7.6, 1.0, 0, 4.4], 3));
      wingG.computeVertexNormals();
      for (let i = 0; i < bk[1]; i++) {
        const grp = new T.Group();
        const body = new T.Mesh(bodyG, bodyM); body.scale.set(4.2, 1.3, 1.4);
        const head = new T.Mesh(bodyG, bodyM); head.scale.setScalar(1.25); head.position.set(4, 0.5, 0);
        const beak = new T.Mesh(new T.ConeGeometry(0.45, 1.8, 5), new T.MeshStandardMaterial({ color: col(gull ? '#e8a030' : '#2c2a2c') })); beak.rotation.z = -Math.PI / 2; beak.position.set(5.8, 0.4, 0);
        const wl = new T.Group(), wr = new T.Group();
        wl.add(new T.Mesh(wingG, wingM)); const rm = new T.Mesh(wingG, wingM); rm.scale.z = -1; wr.add(rm);
        grp.add(body, head, beak, wl, wr);
        const s = gull ? 5.5 + rnd() * 2 : 3.4 + rnd() * 1.2;
        grp.scale.setScalar(s);
        scene.add(grp);
        D.birds.push({ grp, wl, wr, a: rnd() * 6.3, sp: (0.16 + rnd() * 0.14) * (rnd() < 0.5 ? -1 : 1), rx: 240 + rnd() * 380, rz: 60 + rnd() * 110,
          zc: -190 - rnd() * 260, off: (rnd() - 0.5) * 800, cx: null, h: 0.36 + rnd() * 0.36, ph: rnd() * 6.3, flap: gull ? 5 : 9, gull });
      }
    }
    // Schmetterlinge
    const nf = FLUTTER[theme] || 0;
    if (nf) {
      const ws = new T.Shape();
      ws.moveTo(0, 0); ws.bezierCurveTo(1, 3.4, 4.6, 3.6, 3.9, 0.7); ws.bezierCurveTo(4.1, -0.4, 3, -2.9, 1.2, -2.7); ws.bezierCurveTo(0.6, -2.5, 0.2, -1, 0, 0);
      const wg = new T.ShapeGeometry(ws, 6);
      for (let i = 0; i < nf; i++) {
        const mat = new T.MeshStandardMaterial({ color: col(WING_COLORS[Math.floor(rnd() * WING_COLORS.length)]), roughness: 0.7, side: T.DoubleSide, emissive: col('#201a10') });
        const grp = new T.Group(), a = new T.Group(), b = new T.Group();
        a.add(new T.Mesh(wg, mat)); const m2 = new T.Mesh(wg, mat); m2.scale.x = -1; b.add(m2);
        const body = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 4, 5), new T.MeshStandardMaterial({ color: col('#2a2018') }));
        grp.add(a, b, body); grp.visible = false; grp.scale.setScalar(1.9 + rnd() * 0.7);
        scene.add(grp);
        D.flies.push({ grp, a, b, hx: -1e9, hy: 0, hz: 0, ph: rnd() * 20, sp: 0.7 + rnd() * 0.6 });
      }
    }
    // Springender Fisch (in Welten mit offenem Wasser)
    if (g.world.water.length && theme !== 'winter' && theme !== 'aurora') {
      const grp = new T.Group(), fm = new T.MeshStandardMaterial({ color: col('#a9bcc8'), roughness: 0.25, metalness: 0.65 });
      const body = new T.Mesh(new T.SphereGeometry(1, 14, 10), fm); body.scale.set(6.5, 2.6, 1.5);
      const tail = new T.Mesh(new T.ConeGeometry(2.8, 4.6, 4), fm); tail.rotation.z = -Math.PI / 2; tail.position.x = -8; tail.scale.z = 0.3;
      const fin = new T.Mesh(new T.ConeGeometry(1.4, 2.6, 4), fm); fin.position.set(0.5, 2.8, 0); fin.scale.z = 0.3;
      grp.add(body, tail, fin); grp.visible = false; scene.add(grp);
      D.fish = { grp, t: -1, wait: 3 + rnd() * 4 };
    }
    // Robbe (in den Winterwelten): taucht auf und schaut neugierig herüber
    if (g.world.water.length && (theme === 'winter' || theme === 'aurora')) {
      const grp = new T.Group();
      const skin = new T.MeshPhysicalMaterial({ color: col('#565a62'), roughness: 0.3, clearcoat: 0.8 });
      const light = new T.MeshPhysicalMaterial({ color: col('#8a8c90'), roughness: 0.35, clearcoat: 0.6 });
      const eyeM = new T.MeshPhysicalMaterial({ color: col('#0a0a0c'), roughness: 0.05, clearcoat: 1 });
      const head = new T.Mesh(new T.SphereGeometry(8, 18, 14), skin); head.scale.set(1, 0.92, 0.95);
      const neck = new T.Mesh(new T.CylinderGeometry(7.4, 9, 16, 16), skin); neck.position.y = -9;
      const snout = new T.Mesh(new T.SphereGeometry(4.4, 14, 10), light); snout.position.set(6, -1.6, 0); snout.scale.set(1, 0.8, 1.15);
      const nose = new T.Mesh(new T.SphereGeometry(1.3, 8, 6), eyeM); nose.position.set(10, -0.6, 0);
      grp.add(head, neck, snout, nose);
      for (const z of [3.4, -3.4]) { const e = new T.Mesh(new T.SphereGeometry(1.35, 10, 8), eyeM); e.position.set(5.6, 2.4, z); grp.add(e); }
      const wm = new T.MeshBasicMaterial({ color: col('#d8d8d8') });
      for (const z of [1, -1]) for (let i = 0; i < 3; i++) { const w = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 6, 4), wm); w.position.set(8, -2 + i * 0.5, z * 5.5); w.rotation.x = z * (1.2 + i * 0.15); grp.add(w); }
      grp.visible = false; scene.add(grp);
      D.seal = { grp, t: 0, wait: 4, x: 0, y: 0, ry: 0 };
    }
  };

  const groundAt = (g, x) => {
    let top = Infinity;
    for (const s of g.world.solids) if (s.w < 2000 && s.h > 30 && x >= s.x + 6 && x <= s.x + s.w - 6 && s.y < top) top = s.y;
    for (const w of g.world.water) if (x >= w.x && x <= w.x + w.w) return null;
    return isFinite(top) ? top : null;
  };
  const waterInView = (g, x0, x1, minW) => g.world.water.filter((w) => w.w >= minW && w.x + w.w > x0 && w.x < x1);

  P.puff = function (x, y, z, vx, vy, size, life, alpha) {
    const D = this.det, p = D.puffs[(D.puffI = ((D.puffI || 0) + 1) % D.puffs.length)];
    p.t = 0; p.life = life; p.vx = vx; p.vy = vy; p.size = size; p.alpha = alpha;
    p.s.position.set(x, y, z); p.s.visible = true;
  };

  // ------------------------------------------------------------ Pro Bild
  P.updateDetails = function (g, dt) {
    const D = this.det;
    if (!D) return;
    const T = this.THREE, wv = this.ws.v, cam = this.r2.cam, clock = this.clock;
    const viewW = cam.h * (this.r2.W / Math.max(1, this.r2.H));
    const x0 = cam.x - viewW / 2, x1 = cam.x + viewW / 2;
    const fair = wv.rain < 0.3 && wv.snow < 0.3;
    D.t += dt;

    if (this.memory) {
      const won = g.state === 'won' ? Math.min(1, g.stateT) : 0, pulse = 0.5 + 0.5 * Math.sin(clock * 2.6);
      this.memory.glow.material.opacity = 0.45 + pulse * 0.3 + won * 0.3;
      this.memory.glow.scale.setScalar(40 + pulse * 10 + won * 60);
      this.memory.ember.emissiveIntensity = 0.8 + pulse * 0.7 + won * 2;
    }

    // Nasses Garn: dunkler und etwas glänzender
    const wet = Math.min(1, wv.wet);
    if (D.wetNow === undefined || Math.abs(D.wetNow - wet) > 0.01) {
      D.wetNow = wet;
      for (const y of D.yarn) { y.m.color.copy(y.base).multiplyScalar(1 - 0.22 * wet); y.m.roughness = y.rough * (1 - 0.3 * wet); }
    }

    for (const p of D.puffs) {
      if (p.t >= p.life) { p.s.visible = false; continue; }
      p.t += dt;
      const k = p.t / p.life;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt;
      p.s.scale.setScalar(p.size * (0.5 + k * 1.3));
      p.s.material.opacity = p.alpha * Math.sin(Math.min(1, k * 1.2) * Math.PI);
    }
    for (const d of D.drips) {
      if (!d.on) continue;
      d.vy -= 420 * dt; d.m.position.y += d.vy * dt;
      if (d.m.position.y <= d.floor) { d.on = false; d.m.visible = false; }
    }
    D.prints.visible = wv.cover > 0.35;

    // Vögel kreisen weit hinten über der Landschaft
    for (const b of D.birds) {
      if (b.cx === null) b.cx = cam.x + b.off;
      b.cx += (cam.x + b.off - b.cx) * Math.min(1, dt * 0.25);
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.rx, z = b.zc + Math.sin(b.a) * b.rz;
      const y = -cam.y + cam.h * b.h + Math.sin(b.a * 2 + b.ph) * 16;
      b.grp.position.set(x, y, z);
      const dir = Math.sign(b.sp);
      b.grp.rotation.set(0, Math.atan2(-Math.cos(b.a) * dir * b.rz, -Math.sin(b.a) * dir * b.rx), 0);
      // Möwen segeln zwischendurch, kleine Vögel flattern in Schüben
      const glide = b.gull ? 0.35 + 0.65 * Math.max(0, Math.sin(clock * 0.4 + b.ph)) : (Math.sin(clock * 1.7 + b.ph) > -0.2 ? 1 : 0.15);
      const f = Math.sin(clock * b.flap + b.ph) * 0.65 * glide - 0.1;
      b.wl.rotation.x = -f; b.wr.rotation.x = f;
      b.grp.visible = b.gull ? wv.snow < 0.6 : wv.rain < 0.5 && wv.snow < 0.5;
    }

    // Schmetterlinge über dem Gras
    for (const f of D.flies) {
      if (!fair) { f.grp.visible = false; continue; }
      if (Math.abs(f.hx - cam.x) > viewW * 0.8) {
        const nx = cam.x + (Math.random() - 0.5) * viewW * 1.3, gy = groundAt(g, nx);
        if (gy === null) { f.grp.visible = false; continue; }
        f.hx = nx; f.hy = -gy + 16 + Math.random() * 34; f.hz = -8 - Math.random() * 46;
      }
      const t = clock * f.sp + f.ph;
      f.grp.visible = true;
      f.grp.position.set(f.hx + Math.sin(t * 0.9) * 30 + Math.sin(t * 2.3) * 6, f.hy + Math.sin(t * 1.7) * 9 + Math.abs(Math.sin(t * 7)) * 2.5, f.hz + Math.cos(t * 0.6) * 14);
      f.grp.rotation.set(0.5, Math.sin(t * 0.9 + 1.5) * 0.9, 0);
      const fl = 0.25 + Math.abs(Math.sin(clock * 13 + f.ph)) * 1.15;
      f.a.rotation.y = -fl; f.b.rotation.y = fl;
    }

    // Fisch springt aus dem Wasser
    if (D.fish) {
      const F = D.fish;
      if (F.t < 0) {
        F.wait -= dt;
        if (F.wait <= 0) {
          const ws = waterInView(g, x0, x1, 120);
          F.wait = 4 + Math.random() * 6;
          if (ws.length) {
            const w = ws[Math.floor(Math.random() * ws.length)];
            F.dir = Math.random() < 0.5 ? -1 : 1;
            F.x = w.x + 45 + Math.random() * Math.max(1, w.w - 90); F.y = w.y; F.z = -35 - Math.random() * 70; F.t = 0;
            F.grp.scale.set(F.dir, 1, 1);
          }
        }
      } else {
        F.t += dt / 0.85;
        const u = F.t;
        F.grp.visible = u < 1;
        F.grp.position.set(F.x + F.dir * 46 * (u - 0.5), -F.y - 5 + Math.sin(u * Math.PI) * 30, F.z);
        F.grp.rotation.z = F.dir * Math.atan2(Math.cos(u * Math.PI) * 94, 46);
        if (u >= 1) F.t = -1;
      }
    }

    // Robbe
    if (D.seal) {
      const S = D.seal;
      if (!S.grp.visible) {
        S.wait -= dt;
        if (S.wait <= 0) {
          const ws = waterInView(g, x0 + 40, x1 - 40, 100);
          S.wait = 5 + Math.random() * 7;
          if (ws.length) {
            const w = ws[Math.floor(Math.random() * ws.length)];
            S.x = Math.max(x0 + 30, Math.min(x1 - 30, w.x + 30 + Math.random() * Math.max(1, w.w - 60)));
            S.x = Math.max(w.x + 20, Math.min(w.x + w.w - 20, S.x)); S.y = w.y; S.z = -45 - Math.random() * 60; S.t = 0;
            S.grp.visible = true;
          }
        }
      } else {
        S.t += dt;
        const up = Math.min(1, S.t / 0.9) - Math.max(0, (S.t - 5) / 0.9);
        const near = g.players.reduce((a, p) => (Math.abs(p.x - S.x) < Math.abs(a.x - S.x) ? p : a), g.players[0]);
        const want = near.x + near.w / 2 < S.x ? Math.PI - 0.5 : -0.5;
        S.ry += (want - S.ry) * Math.min(1, dt * 2.5);
        S.grp.position.set(S.x, -S.y - 15 + up * 18 + Math.sin(clock * 1.8) * 1.2, S.z);
        S.grp.rotation.set(0, S.ry, Math.sin(clock * 0.9) * 0.08);
        if (S.t > 5.9) S.grp.visible = false;
      }
    }
  };

  // ------------------------------------------------------------ Feinheiten an den Figuren
  const basePose = P.poseYarny;
  P.poseYarny = function (y, p, g, dt) {
    basePose.call(this, y, p, g, dt);
    const D = this.det;
    if (!D || !y.root.visible) { y.idle = 0; return; }
    const wv = this.ws.v, clock = this.clock;
    const cold = Math.min(1, Math.max(wv.cover, wv.snow)), wet = wv.wet;
    const still = g.state === 'play' && p.grounded && Math.abs(p.vx) < 6 && !p.grip && !p.lasso && !p.ledge && !(p.pushT > 0) && !p.climbing;
    y.idle = still ? (y.idle || 0) + dt : 0;
    const sitGoal = y.idle > 14 ? 1 : 0, hugGoal = cold > 0.4 && y.idle > 1.2 ? 1 : 0;
    y.sit = (y.sit || 0) + (sitGoal - (y.sit || 0)) * Math.min(1, dt * (sitGoal ? 3 : 14));
    y.hug = (y.hug || 0) + (hugGoal - (y.hug || 0)) * Math.min(1, dt * (hugGoal ? 4 : 12));
    const k = y.sit, h = y.hug;
    if (k > 0.01 || h > 0.01) {
      const hipY = 10, sh = 17;
      const { A, B, D: V, Y } = this.tmp;
      const seg = (m, e, ax, ay, bx, by, z, r) => {
        A.set(ax, ay, z); B.set(bx, by, z); V.subVectors(B, A);
        const len = Math.max(0.1, V.length());
        m.position.copy(A); m.quaternion.setFromUnitVectors(Y, V.multiplyScalar(1 / len)); m.scale.set(r, len, r); e.position.copy(B);
      };
      // Hinsetzen: Beine nach vorn, Hände auf die Knie, der Kopf schaut sich um
      y.root.position.y -= 7 * k;
      seg(y.limbs[0], y.ends[0], -1, hipY, lerp(-1, 9.8, k), lerp(0, 8.4, k), 1.9, 1.15);
      seg(y.limbs[1], y.ends[1], 1, hipY, lerp(1, 9.2, k), lerp(0, 8.4, k), -1.9, 1.15);
      // Frieren: Arme vor die Brust, Schultern hoch, Zittern
      const ax1 = lerp(lerp(-3, 5.6, k), 3.4, h), ay1 = lerp(lerp(sh - 7, hipY + 1.6, k), sh - 3.2, h);
      const ax2 = lerp(lerp(3, 5.2, k), 3.6, h), ay2 = lerp(lerp(sh - 7, hipY + 1.6, k), sh - 5.4, h);
      seg(y.limbs[2], y.ends[2], 0, sh, ax1, ay1, lerp(3.2, 1.2, h), 0.95);
      seg(y.limbs[3], y.ends[3], 0, sh, ax2, ay2, lerp(-3.2, -1.2, h), 0.95);
      y.root.position.x += Math.sin(clock * 41 + p.id * 2) * 0.32 * h;
      y.head.position.y -= 1.3 * h;
    }
    y.head.rotation.set(0, Math.sin(clock * 0.45 + p.id * 2.2) * 0.55 * k, (0.12 + Math.sin(clock * 0.3 + p.id) * 0.22) * k);

    const hx = y.root.position.x, hy = y.root.position.y + 25;
    // Atem in der Kälte
    if (cold > 0.4) {
      y.breath = (y.breath === undefined ? p.id * 1.3 : y.breath) - dt;
      if (y.breath <= 0) {
        y.breath = 2.2 + Math.random() * 1.2;
        this.puff(hx + p.face * 7, hy, ZP + 1, p.face * 7 + p.vx * 0.3, 5, 11, 1.5, 0.3);
      }
    }
    // Tropfen im Regen
    if (wet > 0.5) {
      y.drip = (y.drip || 0) - dt;
      if (y.drip <= 0) {
        y.drip = 0.3 + Math.random() * 0.4;
        const d = D.drips[(D.dripI = ((D.dripI || 0) + 1) % D.drips.length)];
        d.on = true; d.vy = -10; d.floor = -(p.y + p.h) + 1;
        d.m.position.set(hx + (Math.random() - 0.5) * 9, hy - 4 - Math.random() * 12, ZP + (Math.random() - 0.5) * 6);
        d.m.visible = true;
      }
    }
    // Fußspuren im Schnee
    if (wv.cover > 0.5 && p.grounded && Math.abs(p.vx) > 12 && !p.standOn && !p.bridge) {
      const s = Math.sin(p.walk * 1.9) > 0 ? 1 : -1;
      if (y.step !== s) {
        y.step = s;
        const M = (this.pm = this.pm || new this.THREE.Matrix4());
        M.makeScale(2.3, 1, 1.35); M.setPosition(hx - p.face * 2, -(p.y + p.h) + 0.7, ZP + s * 1.8);
        D.prints.setMatrixAt(D.printI, M);
        D.printI = (D.printI + 1) % 90;
        D.prints.count = Math.min(90, D.prints.count + 1);
        D.prints.instanceMatrix.needsUpdate = true;
      }
    }
  };
})();
