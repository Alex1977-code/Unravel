'use strict';
// 3D-Darstellung mit Three.js (WebGL): die Spielebene liegt bei z ≈ 0, das Gelände reicht nach hinten in die Tiefe.
// Die Kamera schaut senkrecht auf die Spielebene, darum passen 2D-Overlay (Hinweise, Funken) und 3D genau übereinander.
(function () {
  const FF = globalThis.FF;
  const ZP = 3;          // z der Figuren und Fäden (knapp vor der Geländekante)
  const DEPTH = 300;     // wie weit das Gelände nach hinten reicht
  const FOV = 32;

  // WebGL vorhanden und nicht nur per Software gerechnet? (force: auch bei Software-Grafik)
  FF.has3D = function (force) {
    if (!globalThis.THREE) return false;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      if (force) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      return !/swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch (e) { return false; }
  };

  const col = (h) => new globalThis.THREE.Color(h);

  class Renderer3D {
    constructor(glCanvas, overlayCanvas) {
      const THREE = globalThis.THREE;
      this.THREE = THREE;
      this.gl = glCanvas;
      this.r2 = new FF.Renderer(overlayCanvas);   // Kamera-Logik und Overlay
      this.quality = FF.store.get('quality3d', null) || ((matchMedia('(pointer: coarse)').matches || /TV|SMART|Tizen|Web0S|AFT/i.test(navigator.userAgent)) ? 'medium' : 'high');
      this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 10, 14000);
      this.clock = 0;
      this.level = null;
      this.dyn = [];
      this.resize();
    }

    get cam() { return this.r2.cam; }
    get snap() { return this.r2.snap; }
    set snap(v) { this.r2.snap = v; }
    get keyLabels() { return this.r2.keyLabels; }
    set keyLabels(f) { this.r2.keyLabels = f; }

    pixelRatio() {
      const d = Math.min(2, devicePixelRatio || 1);
      return this.quality === 'high' ? Math.min(d, 1.5) : this.quality === 'medium' ? Math.min(d, 1) : 0.7;
    }

    setQuality(q) {
      // Stufenweise: hoch → mittel → niedrig
      if (q === 'low' && this.quality === 'high') q = 'medium';
      this.quality = q;
      FF.store.set('quality3d', q);
      this.level = null;      // Szene neu aufbauen (Grasmenge, Schatten)
      this.resize();
    }

    resize() {
      this.r2.resize();
      const w = innerWidth, h = innerHeight;
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.buildComposer();
    }

    buildComposer() {
      const THREE = this.THREE, R = this.renderer;
      this.composer = null;
      if (this.quality === 'low' || !this.scene) return;
      const w = innerWidth, h = innerHeight;
      const comp = new THREE.EffectComposer(R);
      comp.setPixelRatio(this.pixelRatio());
      comp.setSize(w, h);
      comp.addPass(new THREE.RenderPass(this.scene, this.camera));
      if (this.quality === 'high') {
        this.bokeh = new THREE.BokehPass(this.scene, this.camera, { focus: 1000, aperture: 0.000012, maxblur: 0.009 });
        comp.addPass(this.bokeh);
      } else this.bokeh = null;
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.55, 0.65, 0.82);
      comp.addPass(this.bloom);
      comp.addPass(new THREE.OutputPass());
      this.grade = new THREE.ShaderPass({
        uniforms: {
          tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.045 },
          top: { value: new THREE.Vector3(1, 1, 1) }, bottom: { value: new THREE.Vector3(1, 1, 1) },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform vec3 top; uniform vec3 bottom; varying vec2 vUv;
          float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            c.rgb *= mix(bottom, top, smoothstep(0.0, 1.0, vUv.y));
            vec2 d = vUv - 0.5;
            float v = smoothstep(0.9, 0.28, length(d * vec2(1.0, 1.25)));
            c.rgb *= mix(0.5, 1.0, v);
            c.rgb += (rnd(vUv * 731.0 + time) - 0.5) * grain;
            gl_FragColor = c;
          }`,
      });
      comp.addPass(this.grade);
      this.composer = comp;
    }

    // ------------------------------------------------------------ Szene
    build(g) {
      const THREE = this.THREE;
      if (this.scene) this.disposeScene();
      const L = g.L, th = FF.THEMES[L.theme];
      this.th = th;
      this.tex = FF.textures(L.theme, this.quality === 'high');
      const scene = (this.scene = new THREE.Scene());
      const haze = col(`rgb(${th.haze})`);
      scene.fog = new THREE.FogExp2(haze, th.tree === 'pine' && L.theme === 'quarry' ? 0.00034 : 0.00026);
      this.renderer.toneMappingExposure = L.theme === 'dusk' ? 1.25 : 1.05;
      this.renderer.shadowMap.enabled = this.quality !== 'low';
      const rnd = FF.rng(g.levelIndex * 131 + 7);
      const q = this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.6 : 0.3;

      // Himmel
      const sunX = (th.sun[0] - 0.5) * 2, sunEl = (1 - th.sun[1]) * 0.9 + 0.05;
      this.sunDir = new THREE.Vector3(sunX * 0.9, sunEl, -0.9).normalize();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(11000, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          c0: { value: col(th.sky[0]) }, c1: { value: col(th.sky[1]) }, c2: { value: col(th.sky[2]) },
          sun: { value: this.sunDir }, sunC: { value: col(`rgb(${th.light})`) },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 sun; uniform vec3 sunC; varying vec3 vP;
          void main(){
            float y = vP.y;
            vec3 c = y > 0.12 ? mix(c1, c0, smoothstep(0.12, 0.7, y)) : mix(c2, c1, smoothstep(-0.05, 0.12, y));
            c = mix(c, c2 * 0.35, smoothstep(-0.02, -0.3, y));
            float s = max(dot(vP, sun), 0.0);
            c += sunC * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      scene.add(sky);
      this.sky = sky;

      // Licht: Hauptlicht mit Schatten, Gegenlicht für den Lichtsaum, Himmelslicht
      const hemi = new THREE.HemisphereLight(col(th.sky[1]).lerp(col('#ffffff'), L.theme === 'dusk' ? 0.25 : 0), col(th.earth), L.theme === 'dusk' ? 1.1 : 0.95);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(col(`rgb(${th.light})`).lerp(col('#ffffff'), 0.4), L.theme === 'dusk' ? 0.9 : 1.6);
      key.castShadow = this.quality !== 'low';
      const sm = this.quality === 'high' ? 2048 : 1024;
      key.shadow.mapSize.set(sm, sm);
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.6;
      key.shadow.camera.near = 10; key.shadow.camera.far = 5000;
      scene.add(key); scene.add(key.target);
      this.key = key;
      this.keyDir = new THREE.Vector3(sunX * 0.7, 1.0, 0.55).normalize();
      const rim = new THREE.DirectionalLight(col(`rgb(${th.light})`), L.theme === 'dusk' ? 1.4 : 1.8);
      rim.position.copy(this.sunDir).multiplyScalar(3000);
      scene.add(rim);

      // Spiegelungen: Umgebung aus dem Himmel berechnen
      const pm = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      envScene.add(sky.clone());
      this.env = pm.fromScene(envScene, 0, 10, 20000).texture;
      pm.dispose();
      scene.environment = this.env;
      scene.environmentIntensity = 0.35;

      this.buildTerrain(g, rnd, q);
      this.buildBackground(g, rnd, q);
      this.buildProps(g, rnd);
      this.buildPlayers(g);
      this.buildComposer();
      if (this.grade) {
        const top = col(`rgb(${th.light})`), bot = col(th.grade ? '#000000' : '#000000');
        this.grade.uniforms.top.value.set(1 + (top.r - 0.8) * 0.12, 1 + (top.g - 0.8) * 0.12, 1 + (top.b - 0.8) * 0.12);
        void bot;
        this.grade.uniforms.bottom.value.set(0.9, 0.93, 1.0);
      }
      this.level = L; this.game = g;
    }

    disposeScene() {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      if (this.env) this.env.dispose();
      for (const d of this.dyn) d.geometry && d.geometry.dispose();
      this.dyn = [];
      this.scene = null;
    }

    // Felsblöcke: Vorderseite, Seiten (wo frei) und Oberseite mit Moos
    buildTerrain(g, rnd, q) {
      const THREE = this.THREE, T = this.tex, S = g.world.solids;
      const rock = [], top = [];
      const noise = (x, y) => FF.noise1(x * 0.021, 3) * 0.6 + FF.noise1(y * 0.027 + x * 0.004, 9) * 0.4;
      const covered = (r, side) => S.some((s) => s !== r && s.y < r.y + 12 && s.y + s.h > r.y + 12 &&
        (side < 0 ? s.x < r.x && s.x + s.w >= r.x - 1 : s.x <= r.x + r.w + 1 && s.x + s.w > r.x + r.w));
      const worldUV = (geo, fx, fy, k) => {
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, fx(p, i) / k, fy(p, i) / k);
      };
      // Je tiefer unter der Kante, desto dunkler (wie Umgebungsverdeckung)
      const shade = (geo, depthOf) => {
        const p = geo.attributes.position, c = [];
        for (let i = 0; i < p.count; i++) {
          const d = Math.max(0, depthOf(p, i));
          const k = 0.3 + 0.7 * Math.exp(-d / 170) + (FF.noise1(p.getX(i) * 0.01 + p.getZ(i) * 0.01, 4) - 0.5) * 0.14;
          c.push(k, k, k);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
      };
      for (const r of S) {
        const hv = Math.min(r.h, 1100);
        const sx = Math.max(2, Math.round(r.w / 12)), sy = Math.max(2, Math.round(hv / 12));
        // Vorderseite
        const f = new THREE.PlaneGeometry(r.w, hv, sx, sy);
        f.translate(r.x + r.w / 2, -(r.y + hv / 2), 0);
        const p = f.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), wy = -p.getY(i), d = wy - r.y;
          let z = -noise(x, wy) * 10 - 1.5;
          if (d < 8) z = z * (d / 8) - (8 - d) * 0.5;            // abgerundete Kante oben
          p.setZ(i, z);
        }
        worldUV(f, (pp, i) => pp.getX(i) + FF.noise1(pp.getY(i) * 0.004, 2) * 90, (pp, i) => pp.getY(i), 400);
        f.computeVertexNormals();
        shade(f, (pp, i) => -pp.getY(i) - r.y);
        rock.push(f);
        // Seitenwände, wenn kein Nachbarblock anliegt
        for (const side of [-1, 1]) {
          if (covered(r, side)) continue;
          const sg = new THREE.PlaneGeometry(DEPTH, hv, 14, sy);
          sg.rotateY(side * Math.PI / 2);
          sg.translate(side < 0 ? r.x : r.x + r.w, -(r.y + hv / 2), -DEPTH / 2);
          const sp = sg.attributes.position;
          for (let i = 0; i < sp.count; i++) sp.setX(i, sp.getX(i) + side * noise(sp.getZ(i) * 1.3, -sp.getY(i)) * 6);
          worldUV(sg, (pp, i) => pp.getZ(i), (pp, i) => pp.getY(i), 400);
          sg.computeVertexNormals();
          shade(sg, (pp, i) => -pp.getY(i) - r.y);
          rock.push(sg);
        }
        // Oberseite
        const tg = new THREE.PlaneGeometry(r.w, DEPTH, sx, 10);
        tg.rotateX(-Math.PI / 2);
        tg.translate(r.x + r.w / 2, -r.y, -DEPTH / 2);
        const tp = tg.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const zz = tp.getZ(i);
          if (zz < -12) tp.setY(i, tp.getY(i) + (FF.noise1(tp.getX(i) * 0.03 + zz * 0.05, 5) - 0.5) * 7 * Math.min(1, -zz / 80));
        }
        worldUV(tg, (pp, i) => pp.getX(i), (pp, i) => pp.getZ(i), 200);
        tg.computeVertexNormals();
        shade(tg, () => 0);
        top.push(tg);
      }
      const rockMat = new THREE.MeshStandardMaterial({ map: T.rock.map, normalMap: T.rock.normal, normalScale: new THREE.Vector2(2.2, 2.2), roughness: 0.9, vertexColors: true });
      const topMat = new THREE.MeshStandardMaterial({ map: T.top.map, normalMap: T.top.normal, roughness: 1, vertexColors: true });
      this.stoneMat = new THREE.MeshStandardMaterial({ map: T.rock.map, normalMap: T.rock.normal, roughness: 0.85, color: col('#b9b2a6') });
      const rm = new THREE.Mesh(THREE.mergeGeometries(rock), rockMat);
      const tm = new THREE.Mesh(THREE.mergeGeometries(top), topMat);
      for (const m of [rm, tm]) { m.receiveShadow = true; m.castShadow = true; this.scene.add(m); }
      rock.concat(top).forEach((x) => x.dispose());

      // Grashalme mit Wind
      const tops = S.filter((r) => r.w < 2000);
      const blade = new THREE.PlaneGeometry(1.7, 1, 1, 4);
      blade.translate(0, 0.5, 0);
      const bp = blade.attributes.position, colors = [];
      const g0 = col(this.th.moss2), g1 = col(this.th.grass);
      for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i);
        bp.setX(i, bp.getX(i) * (1 - y * 0.9));
        const c = g0.clone().lerp(g1, y);
        colors.push(c.r, c.g, c.b);
      }
      blade.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      let count = 0;
      for (const r of tops) count += Math.floor((r.w * DEPTH) / 70 * q) + Math.floor(r.w / 3 * q);
      count = Math.min(count, 60000);
      const gm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
      this.windU = { value: 0 };
      gm.onBeforeCompile = (sh) => {
        sh.uniforms.time = this.windU;
        sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.031 + instanceMatrix[3].z * 0.017;
          transformed.x += sin(time * 1.6 + ph) * transformed.y * transformed.y * 0.28 + sin(time * 4.1 + ph * 3.0) * transformed.y * 0.05;`);
      };
      const grass = new THREE.InstancedMesh(blade, gm, count);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), SC = new THREE.Vector3();
      const tint = new THREE.Color();
      let k = 0;
      for (const r of tops) {
        const n = Math.floor((r.w * DEPTH) / 70 * q), nf = Math.floor(r.w / 3 * q);
        for (let i = 0; i < n + nf && k < count; i++, k++) {
          const front = i >= n;
          const x = r.x + 2 + rnd() * (r.w - 4);
          const z = front ? -1 - rnd() * 14 : -12 - Math.pow(rnd(), 0.8) * (DEPTH - 14);
          const h = front ? 7 + rnd() * 9 : 6 + rnd() * 14;
          P.set(x, -r.y - 1, z);
          E.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5);
          Q.setFromEuler(E);
          SC.set(1 + rnd() * 0.6, h, 1);
          M.compose(P, Q, SC);
          grass.setMatrixAt(k, M);
          tint.setRGB(0.75 + rnd() * 0.45, 0.8 + rnd() * 0.35, 0.7 + rnd() * 0.3);
          grass.setColorAt(k, tint);
        }
      }
      grass.count = k;
      grass.receiveShadow = true;
      this.scene.add(grass);

      // Steine
      const sg = new THREE.IcosahedronGeometry(1, 1);
      const sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) { const s = 0.75 + FF.hash(i * 7.1) * 0.45; sp.setXYZ(i, sp.getX(i) * s, sp.getY(i) * s * 0.7, sp.getZ(i) * s); }
      sg.computeVertexNormals();
      const stones = new THREE.InstancedMesh(sg, this.stoneMat, 600);
      let s = 0;
      for (const r of tops) {
        const n = Math.floor(r.w / 45);
        for (let i = 0; i < n && s < 600; i++, s++) {
          const size = 3 + Math.pow(rnd(), 3) * 26;
          P.set(r.x + rnd() * r.w, -r.y + size * 0.15, -30 - rnd() * (DEPTH - 40));
          E.set(rnd() * 3, rnd() * 3, rnd() * 3); Q.setFromEuler(E);
          SC.set(size, size, size);
          M.compose(P, Q, SC);
          stones.setMatrixAt(s, M);
        }
      }
      stones.count = s;
      stones.castShadow = stones.receiveShadow = true;
      this.scene.add(stones);

      // Hängende Wurzeln an freien Kanten
      const roots = [];
      for (const r of tops) {
        for (const side of [-1, 1]) {
          if (covered(r, side) || r.h < 40) continue;
          const x0 = side < 0 ? r.x : r.x + r.w;
          for (let i = 0; i < 2; i++) {
            const len = 14 + rnd() * Math.min(50, r.h * 0.35), zz = -4 - rnd() * 30;
            const c = new THREE.CatmullRomCurve3([
              new THREE.Vector3(x0 - side * (2 + rnd() * 8), -r.y - 1, zz),
              new THREE.Vector3(x0 + side * (2 + rnd() * 5), -r.y - len * 0.4, zz + 3),
              new THREE.Vector3(x0 + side * (3 + rnd() * 6), -r.y - len, zz + rnd() * 6),
            ]);
            roots.push(new THREE.TubeGeometry(c, 10, 0.5 + rnd() * 0.6, 4, false));
          }
        }
      }
      if (roots.length) {
        const rm2 = new THREE.Mesh(THREE.mergeGeometries(roots), new THREE.MeshStandardMaterial({ color: col(this.th.moss2), roughness: 1 }));
        rm2.castShadow = true;
        this.scene.add(rm2);
        roots.forEach((x) => x.dispose());
      }
    }

    // Bäume, Boden in der Tiefe, Berge, unscharfer Vordergrund
    buildBackground(g, rnd, q) {
      const THREE = this.THREE, T = this.tex, th = this.th, L = g.L;
      const ground = -(L.spawn[1] + 40);
      const far = new THREE.PlaneGeometry(L.width + 20000, 9000, 1, 1);
      far.rotateX(-Math.PI / 2);
      far.translate(L.width / 2, ground - 60, -DEPTH - 4500);
      const fuv = far.attributes.uv;
      for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 60, fuv.getY(i) * 25);
      const farMat = new THREE.MeshStandardMaterial({ map: T.top.map, roughness: 1, color: col('#c8c8c8') });
      const fm = new THREE.Mesh(far, farMat);
      fm.receiveShadow = false;
      this.scene.add(fm);

      // Rückwand in der Tiefe, damit man durch tiefe Gruben nicht unter den Horizont sieht
      const back = new THREE.PlaneGeometry(L.width + 20000, 7000, 1, 1);
      back.translate(L.width / 2, ground - 60 - 3500, -DEPTH - 700);
      const buv = back.attributes.uv;
      for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 50, buv.getY(i) * 18);
      this.scene.add(new THREE.Mesh(back, new THREE.MeshStandardMaterial({ map: T.rock.map, roughness: 1, color: col('#6a6a6a') })));

      // Berge als Silhouetten im Dunst
      for (const [z, hgt, color, seed] of [[-7000, 2600, th.far, 3], [-4600, 1500, th.far2, 9]]) {
        const shape = new THREE.Shape();
        const x0 = -6000, x1 = L.width + 6000;
        shape.moveTo(x0, ground - 400);
        for (let x = x0; x <= x1; x += 120) shape.lineTo(x, ground + (FF.noise1(x * 0.0009, seed) * 0.75 + FF.noise1(x * 0.004, seed + 2) * 0.25) * hgt);
        shape.lineTo(x1, ground - 400);
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col(color) }));
        m.position.z = z;
        this.scene.add(m);
      }

      // Bäume
      const bark = new THREE.MeshStandardMaterial({ map: T.bark.map, normalMap: T.bark.normal, roughness: 0.95 });
      const trunks = [], leafM = [];
      const kind = th.tree;
      const addTree = (x, z, H) => {
        const base = new THREE.Vector3(x, ground - 30, z);
        const bend = (rnd() - 0.5) * H * 0.12;
        const tr = new THREE.CylinderGeometry(H * 0.022, H * 0.04, H, 8, 8, true);
        tr.translate(0, H / 2, 0);
        const tp = tr.attributes.position;
        for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / H; tp.setX(i, tp.getX(i) + bend * y * y); }
        tr.translate(base.x, base.y, base.z);
        const uv = tr.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * H / 160);
        tr.computeVertexNormals();
        trunks.push(tr);
        const top = new THREE.Vector3(base.x + bend, base.y + H, base.z);
        const clusters = [top];
        if (kind !== 'pine') {
          for (let b = 0; b < 5; b++) {
            const y0 = H * (0.45 + rnd() * 0.4), ang = rnd() * Math.PI * 2;
            const start = new THREE.Vector3(base.x + bend * (y0 / H) ** 2, base.y + y0, base.z);
            const len = H * (0.22 + rnd() * 0.2);
            const end = start.clone().add(new THREE.Vector3(Math.cos(ang) * len, len * 0.6, Math.sin(ang) * len * 0.7));
            const br = new THREE.CylinderGeometry(H * 0.006, H * 0.014, len * 1.15, 5, 1, true);
            br.translate(0, len * 0.57, 0);
            br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
            br.translate(start.x, start.y, start.z);
            trunks.push(br);
            clusters.push(end);
          }
        }
        for (const c of clusters) {
          const n = Math.round((kind === 'pine' ? 16 : 26) * Math.max(0.5, q));
          const rad = kind === 'pine' ? H * 0.12 : H * (0.13 + rnd() * 0.06);
          for (let i = 0; i < n; i++) {
            const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rad, yy = (rnd() - 0.4) * rad * 0.8;
            leafM.push([c.x + Math.cos(a) * r, c.y + yy, c.z + Math.sin(a) * r * 0.8, H * (kind === 'pine' ? 0.1 : 0.12) * (0.7 + rnd() * 0.6)]);
          }
        }
        if (kind === 'pine') {
          // Kegelförmige Krone aus vielen Nadelbüscheln
          for (let t = 0; t < 12; t++) {
            const y = base.y + H * (0.22 + t * 0.068), rad = H * 0.25 * (1 - t / 12.5);
            for (let i = 0; i < 18 * Math.max(0.6, q); i++) {
              const a = rnd() * Math.PI * 2, r = rad * Math.sqrt(rnd());
              leafM.push([base.x + bend * ((y - base.y) / H) ** 2 + Math.cos(a) * r, y - r * 0.3, base.z + Math.sin(a) * r * 0.8, H * (0.1 + rnd() * 0.05)]);
            }
          }
        }
      };
      const bands = [[-420, -760, 260, 520, 0.85], [-1000, -1900, 380, 900, 0.6], [-2600, -4000, 500, 1300, 0.4]];
      for (const [z0, z1, h0, h1, dens] of bands) {
        const step = 330 / dens;
        for (let x = -900; x < L.width + 900; x += step * (0.6 + rnd() * 0.8)) {
          if (rnd() < 0.2) continue;
          addTree(x, z0 + (z1 - z0) * rnd(), h0 + (h1 - h0) * rnd());
        }
      }
      const tm = new THREE.Mesh(THREE.mergeGeometries(trunks), bark);
      this.scene.add(tm);
      trunks.forEach((x) => x.dispose());
      const card = new THREE.PlaneGeometry(1, 1);
      const leafMat = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: col('#ffffff') });
      const leaves = new THREE.InstancedMesh(card, leafMat, leafM.length);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
      leafM.forEach(([x, y, z, s], i) => {
        P.set(x, y, z); E.set((rnd() - 0.5) * 1.2, rnd() * 6.3, rnd() * 6.3); Q.setFromEuler(E); S.set(s, s, s);
        M.compose(P, Q, S); leaves.setMatrixAt(i, M);
      });
      this.scene.add(leaves);

      // Vordergrund: große Gräser und Blätter nah an der Kamera (unscharf im hohen Qualitätsmodus)
      if (this.quality !== 'low') {
        const fgM = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: col('#3a3a3a') });
        const pos = [];
        for (let x = -600; x < L.width + 600; x += 380 + rnd() * 520) {
          const n = 3 + Math.floor(rnd() * 4);
          for (let i = 0; i < n; i++) pos.push([x + (rnd() - 0.5) * 90, rnd() * 6.3, 28 + rnd() * 30]);
        }
        const fg = new THREE.InstancedMesh(card, fgM, pos.length);
        pos.forEach(([x, rot, s], i) => {
          P.set(x, (rnd() - 0.8) * 30, 560 + rnd() * 120); E.set(-0.3 + rnd() * 0.6, 0, rot); Q.setFromEuler(E); S.set(s, s * 1.5, s);
          M.compose(P, Q, S); fg.setMatrixAt(i, M);
        });
        this.fg = fg;
        this.scene.add(fg);
      } else this.fg = null;
    }

    // Wasser, Dornen, Haken, Pflöcke, Schilder, Laternen, Ziel, Funken, Kisten
    buildProps(g, rnd) {
      const THREE = this.THREE, T = this.tex, th = this.th, W = g.world;
      const wood = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normal, roughness: 0.85 });
      this.woodMat = wood;
      // Wasser
      this.waterMats = [];
      for (const w of W.water) {
        const surf = new THREE.PlaneGeometry(w.w, DEPTH + 6, 1, 1);
        surf.rotateX(-Math.PI / 2);
        surf.translate(w.x + w.w / 2, -w.y, -DEPTH / 2 + 3);
        const uv = surf.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w.w / 160, uv.getY(i) * DEPTH / 160);
        const n = T.water.normal.clone(); n.needsUpdate = true;
        const mat = new THREE.MeshStandardMaterial({ color: col(th.water[1]), roughness: 0.06, metalness: 0.1, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.9, envMapIntensity: 2.2 });
        this.waterMats.push(mat);
        const m = new THREE.Mesh(surf, mat);
        m.receiveShadow = true;
        this.scene.add(m);
        // Vorderseite: dunkles, nach unten tiefer werdendes Wasser
        const fh = Math.min(w.h, 700);
        const front = new THREE.PlaneGeometry(w.w, fh, 1, 8);
        front.translate(w.x + w.w / 2, -w.y - fh / 2, 6);
        const fc = [], c1 = col(th.water[1]), c2 = col(th.water[2]);
        const fp = front.attributes.position;
        for (let i = 0; i < fp.count; i++) { const k = Math.min(1, (-fp.getY(i) - w.y) / 70); const c = c1.clone().multiplyScalar(0.7).lerp(c2, k); fc.push(c.r, c.g, c.b); }
        front.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
        this.scene.add(new THREE.Mesh(front, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false })));
      }
      // Dornen
      const thorns = [], spikes = [];
      for (const t of W.thorns) {
        for (let i = 0; i < Math.max(6, t.w / 6); i++) {
          let x = t.x + rnd() * t.w, y = t.y + t.h, z = -30 + rnd() * 34;
          const pts = [new THREE.Vector3(x, -y, z)];
          for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 16; y -= Math.max(3, t.h * 0.15) + rnd() * 6; z += (rnd() - 0.5) * 8; pts.push(new THREE.Vector3(x, -y, z)); }
          const c = new THREE.CatmullRomCurve3(pts);
          thorns.push(new THREE.TubeGeometry(c, 16, 1.2, 4, false));
          for (let k = 0; k < 8; k++) {
            const p = c.getPoint(rnd()), cone = new THREE.ConeGeometry(0.9, 6, 4);
            cone.rotateZ((rnd() - 0.5) * 3); cone.rotateX((rnd() - 0.5) * 2);
            cone.translate(p.x, p.y, p.z);
            spikes.push(cone);
          }
        }
      }
      if (thorns.length) {
        const m = new THREE.Mesh(THREE.mergeGeometries(thorns.concat(spikes)), new THREE.MeshStandardMaterial({ color: col('#2b1a16'), roughness: 0.7 }));
        m.castShadow = true;
        this.scene.add(m);
      }
      // Haken (Ast mit Ring) und Pflöcke
      const metal = new THREE.MeshStandardMaterial({ color: col('#c2a066'), roughness: 0.35, metalness: 0.8 });
      const barkMat = new THREE.MeshStandardMaterial({ map: T.bark.map, normalMap: T.bark.normal, roughness: 0.95 });
      const leafMat = new THREE.MeshStandardMaterial({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
      for (const a of W.anchors) {
        if (a.post) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 26, 8), wood);
          post.position.set(a.x, -(a.y + 10), 0);
          post.castShadow = true;
          this.scene.add(post);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.9, 6, 16), metal);
          ring.rotation.x = Math.PI / 2; ring.position.set(a.x, -(a.y + 2), 0);
          this.scene.add(ring);
        } else {
          const start = new THREE.Vector3(a.x - 70, -(a.y - 14), -150), end = new THREE.Vector3(a.x + 16, -(a.y - 9), ZP);
          const c = new THREE.CatmullRomCurve3([start, new THREE.Vector3(a.x - 30, -(a.y - 4), -60), end]);
          const br = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 3, 6, false), barkMat);
          br.castShadow = true;
          this.scene.add(br);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1, 8, 18), metal);
          ring.position.set(a.x, -(a.y + 1), ZP);
          this.scene.add(ring);
          const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7, 5), metal);
          hook.position.set(a.x, -(a.y - 5.5), ZP);
          this.scene.add(hook);
          for (let i = 0; i < 6; i++) {
            const l = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), leafMat);
            l.position.copy(c.getPoint(0.2 + rnd() * 0.7)).add(new THREE.Vector3((rnd() - 0.5) * 10, 6 + rnd() * 8, (rnd() - 0.5) * 20));
            l.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
            this.scene.add(l);
          }
        }
      }
      // Schilder
      for (const s of g.signs) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 34, 6), wood);
        post.position.set(s.x, -(s.y - 15), -14);
        const board = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 3), wood);
        board.position.set(s.x, -(s.y - 34), -12);
        board.rotation.z = (rnd() - 0.5) * 0.12;
        for (const m of [post, board]) { m.castShadow = true; this.scene.add(m); }
      }
      // Laternen an Zwischenständen
      this.lanterns = g.checkpoints.map((cp) => {
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 46, 6), wood);
        pole.position.set(0, 23, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 2.4), wood);
        arm.position.set(6, 45, 0);
        const glassMat = new THREE.MeshStandardMaterial({ color: col('#8a8170'), emissive: col('#ffb25a'), emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.85 });
        const glass = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 9), glassMat);
        glass.position.set(12, 33, 0);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2, 10.5), new THREE.MeshStandardMaterial({ color: col('#2c241c'), roughness: 0.6 }));
        frame.position.set(12, 39.5, 0);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col('#ffbf6a'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.set(12, 33, 2); halo.scale.set(110, 110, 1);
        grp.add(pole, arm, glass, frame, halo);
        grp.position.set(cp.x, -cp.y, -10);
        grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(grp);
        return { glassMat, halo };
      });
      // Ziel: großes Wollknäuel
      const goal = new THREE.Group();
      const ball = this.yarnBall(24, [FF.COLORS[0], FF.COLORS[1], '#e9d6b2'], 30, 0.9, rnd);
      ball.position.set(0, 24, 0);
      goal.add(ball);
      const gh = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col(`rgb(${th.light})`), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      gh.position.set(0, 24, -8); gh.scale.set(190, 190, 1);
      goal.add(gh);
      goal.position.set(g.goal.x, -g.goal.y, -8);
      this.scene.add(goal);
      this.goal = { grp: goal, ball, halo: gh };
      // Funken (Sammelperlen)
      const beadGeo = new THREE.SphereGeometry(4.3, 16, 12);
      this.beads = g.beads.map((b) => {
        const m = new THREE.Mesh(beadGeo, new THREE.MeshStandardMaterial({ color: col('#f4c95d'), emissive: col('#ffcf5a'), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2, transparent: true }));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col('#ffe2a0'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.set(34, 34, 1);
        m.add(halo);
        m.position.set(b.x, -b.y, ZP);
        this.scene.add(m);
        return m;
      });
      // Kisten
      this.crates = W.crates.map((c) => {
        const grp = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, 36), c.heavy ? new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normal, roughness: 0.8, color: col('#8a7a6a') }) : wood);
        grp.add(box);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(c.w, c.h) * 0.92, 4, 2), wood);
        brace.rotation.z = Math.atan2(c.h, c.w); brace.position.z = 18.5;
        grp.add(brace);
        if (c.heavy) {
          const metalC = new THREE.MeshStandardMaterial({ color: col('#9aa0a3'), roughness: 0.4, metalness: 0.85 });
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const k = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 38), metalC);
            k.position.set(sx * (c.w / 2 - 4), sy * (c.h / 2 - 4), 0);
            grp.add(k);
          }
        }
        grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(grp);
        return grp;
      });
      this.bridgeMats = [0, 1].map((i) => this.yarnMaterial(FF.COLORS[i]));
    }

    yarnMaterial(color) {
      const THREE = this.THREE, T = this.tex;
      const m = new THREE.MeshPhysicalMaterial({
        color: col(color), roughness: 0.78, sheen: 1, sheenRoughness: 0.45, sheenColor: col(color).lerp(col('#ffffff'), 0.5),
        map: T.yarn.map, normalMap: T.yarn.normal, normalScale: new THREE.Vector2(0.9, 0.9),
      });
      return m;
    }

    // Knäuel aus vielen umlaufenden Fäden
    yarnBall(r, colors, n, thick, rnd, scale) {
      const THREE = this.THREE;
      const grp = new THREE.Group();
      const sc = scale || [1, 1, 1];
      const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.96, 20, 14), this.yarnMaterial(colors[colors.length - 1]));
      core.scale.set(sc[0], sc[1], sc[2]);
      grp.add(core);
      const byColor = colors.map(() => []);
      const Q = new THREE.Quaternion(), E = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        E.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3); Q.setFromEuler(E);
        const pts = [];
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * Math.PI * 2;
          const v = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(Q);
          pts.push(new THREE.Vector3(v.x * r * sc[0], v.y * r * sc[1], v.z * r * sc[2]));
        }
        byColor[i % colors.length].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, thick, 4, true));
      }
      byColor.forEach((geos, i) => {
        if (!geos.length) return;
        const m = new THREE.Mesh(THREE.mergeGeometries(geos), this.yarnMaterial(colors[i]));
        m.castShadow = true;
        grp.add(m);
        geos.forEach((x) => x.dispose());
      });
      return grp;
    }

    // ------------------------------------------------------------ Figuren
    buildPlayers(g) {
      const THREE = this.THREE;
      const rnd = FF.rng(5);
      this.yarnies = g.players.map((p, id) => {
        const mat = this.yarnMaterial(FF.COLORS[id]);
        const root = new THREE.Group();     // Füße bei (0,0)
        const turn = new THREE.Group();     // Blickrichtung
        root.add(turn);
        const body = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.yarnMaterial(FF.COLORS_DARK[id]));
        core.scale.set(4.5, 7.3, 4.1);
        body.add(core, this.bodyWraps(id, rnd));
        const head = this.yarnBall(6.2, [FF.COLORS[id], FF.COLORS_DARK[id]], 18, 0.62, rnd);
        turn.add(body, head);
        const eyeW = new THREE.MeshStandardMaterial({ color: col('#fbf4e6'), emissive: col('#fff6e0'), emissiveIntensity: 0.5, roughness: 0.3 });
        const eyeB = new THREE.MeshStandardMaterial({ color: col('#140d10'), roughness: 0.2 });
        const eyes = [];
        for (const z of [2.3, -2.3]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 8), eyeW);
          const pu = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), eyeB);
          pu.position.set(1.0, 0, 0);
          e.add(pu);
          head.add(e);
          e.position.set(5.2, 0.6, z);
          eyes.push(e);
        }
        // loser Faden auf dem Kopf
        const curl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(-1, 5.6, 0), new THREE.Vector3(-4, 10, 0.5), new THREE.Vector3(-8.5, 9.5, 0), new THREE.Vector3(-10, 6.5, -0.5),
        ]), 16, 0.55, 4, false), mat);
        head.add(curl);
        // Gliedmaßen: dünne Wollstränge
        const limbGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1);
        limbGeo.translate(0, 0.5, 0);
        const limbs = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(limbGeo, mat); turn.add(m); return m; });
        const endGeo = new THREE.SphereGeometry(1.5, 8, 6);
        const ends = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(endGeo, mat); turn.add(m); return m; });
        root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(root);
        return { root, turn, body, head, eyes, limbs, ends, curl, rot: id ? Math.PI + 0.5 : -0.5 };
      });
    }

    bodyWraps(id, rnd) {
      const THREE = this.THREE;
      const grp = new THREE.Group();
      const sets = [[], []];
      const Q = new THREE.Quaternion(), E = new THREE.Euler();
      for (let i = 0; i < 20; i++) {
        E.set((rnd() - 0.5) * 1.3 + Math.PI / 2, rnd() * 6.3, (rnd() - 0.5) * 1.3); Q.setFromEuler(E);
        const pts = [];
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2;
          const v = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(Q);
          pts.push(new THREE.Vector3(v.x * 4.8, v.y * 7.6, v.z * 4.4));
        }
        sets[i % 3 === 0 ? 1 : 0].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 36, 0.6, 4, true));
      }
      sets.forEach((geos, k) => {
        const m = new THREE.Mesh(THREE.mergeGeometries(geos), this.yarnMaterial(k ? FF.COLORS_DARK[id] : FF.COLORS[id]));
        grp.add(m);
        geos.forEach((x) => x.dispose());
      });
      return grp;
    }

    poseYarny(y, p, g, dt) {
      const THREE = this.THREE;
      const show = !p.merged;
      y.root.visible = show;
      if (!show) return;
      for (const l of y.limbs) l.visible = true;
      for (const e of y.ends) e.visible = true;
      const f = 1;
      const moving = p.grounded && Math.abs(p.vx) > 12;
      const hanging = !p.grounded && (p.lasso || p.onTether);
      const sw = moving ? Math.sin(p.walk * 1.9) : 0;
      const land = p.landT > 0 ? p.landT / 0.18 : 0;
      const crouch = p.grip ? 4 : 0;
      const lean = p.grounded ? FF.clamp(p.vx / 165, -1, 1) * 0.12 : FF.clamp(p.vx / 400, -1, 1) * 0.25;
      y.root.position.set(p.x + p.w / 2, -(p.y + p.h) + (p.ledge ? 2 : 0), ZP);
      y.root.rotation.z = -lean;
      y.root.scale.set(1 + land * 0.06, 1 - land * 0.1, 1);
      const target = p.face > 0 ? -0.55 : Math.PI + 0.55;
      let d = target - y.rot;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      y.rot += d * Math.min(1, dt * 12);
      y.turn.rotation.y = y.rot;
      const hipY = 10 - crouch * 0.5, shY = 18 - crouch;
      y.body.position.set(0, (hipY + shY) / 2 + 1, 0);
      y.body.scale.set(1, (shY - hipY + 6) / 14.8, 1);
      const hy = shY + 7 + (moving ? Math.abs(sw) * 0.8 : 0);
      y.head.position.set(f * 0.4, hy, 0);
      const blink = p.blink < 0 ? 0.15 : 1;
      for (const e of y.eyes) e.scale.set(1, blink, 1);
      y.curl.rotation.z = Math.sin(this.clock * 3 + p.id) * 0.12;
      // Beine und Arme (lokal: +x = Blickrichtung, y nach oben)
      let L1, L2, A1, A2;
      if (!p.grounded && !p.ledge) {
        const k = hanging ? 0.5 : 1;
        L1 = [-3 - 2 * k, 2 - (hanging ? 3 : -2)]; L2 = [3 + 3 * k, 3 - (hanging ? 4 : -4)];
      } else if (p.grip) { L1 = [-6, 0]; L2 = [6, 0]; }
      else {
        L1 = [-1 + sw * 6, sw * sw * 1.5 + (sw > 0 ? Math.abs(sw) * 1.2 : 0)];
        L2 = [1 - sw * 6, sw * sw * 1.5 + (sw < 0 ? Math.abs(sw) * 1.2 : 0)];
      }
      const sh = shY - 1;
      if (hanging || p.ledge || (p.climbing && !p.grounded)) {
        const cl = Math.sin(this.clock * 14) * (p.climbing ? 2 : 0);
        A1 = [1, sh + 10 - cl]; A2 = [2, sh + 10 + cl];
      } else if (p.pushT > 0) { A1 = [9, sh - 1]; A2 = [9, sh - 3]; }
      else if (p.grip) { A1 = [-7, 1]; A2 = [7, 1]; }
      else if (p.throwT < 0.2) { A1 = [6, sh + 10]; A2 = [-4, sh - 6]; }
      else { A1 = [-3 - sw * 4, sh - 7]; A2 = [3 + sw * 4, sh - 7]; }
      const seg = (m, e, a, b, z, r) => {
        const A = new THREE.Vector3(a[0], a[1], z), B = new THREE.Vector3(b[0], b[1], z);
        const dir = B.clone().sub(A);
        const len = Math.max(0.1, dir.length());
        m.position.copy(A);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        m.scale.set(r, len, r);
        e.position.copy(B);
      };
      seg(y.limbs[0], y.ends[0], [-1, hipY], L1, 1.7, 1.15);
      seg(y.limbs[1], y.ends[1], [1, hipY], L2, -1.7, 1.15);
      seg(y.limbs[2], y.ends[2], [0, sh], A1, 3.2, 0.95);
      seg(y.limbs[3], y.ends[3], [0, sh], A2, -3.2, 0.95);
      y.shY = shY; y.lean = lean;
    }

    // Huckepack: Partner klein auf dem Rücken des Trägers
    posePassenger(g) {
      for (const p of g.players) {
        if (!p.merged) continue;
        const car = g.players[p.carrier], cy = this.yarnies[car.id], py = this.yarnies[p.id];
        py.root.visible = true;
        py.root.position.set(car.x + car.w / 2 - car.face * 6, -(car.y + car.h) + (cy.shY || 18) - 4, ZP - 3);
        py.root.scale.set(0.7, 0.7, 0.7);
        py.root.rotation.z = -(cy.lean || 0);
        py.turn.rotation.y = cy.rot;
        for (const l of py.limbs) l.visible = false;
        for (const e of py.ends) e.visible = false;
      }
    }

    // ------------------------------------------------------------ Fäden
    yarnTube(pts2d, slack, sagK, color, radius) {
      const THREE = this.THREE;
      const pts = [];
      let total = 0;
      for (let i = 1; i < pts2d.length; i++) total += Math.hypot(pts2d[i][0] - pts2d[i - 1][0], pts2d[i][1] - pts2d[i - 1][1]);
      pts.push(new THREE.Vector3(pts2d[0][0], -pts2d[0][1], ZP));
      for (let i = 1; i < pts2d.length; i++) {
        const [ax, ay] = pts2d[i - 1], [bx, by] = pts2d[i];
        const L = Math.hypot(bx - ax, by - ay);
        const share = total > 0 ? (slack * L) / total : 0;
        const sag = Math.sqrt(Math.max(0, share) * Math.max(L, 1)) * sagK;
        const n = Math.max(2, Math.min(24, Math.round(L / 12)));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          // quadratische Kurve wie im 2D-Renderer
          const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag;
          const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
          const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
          pts.push(new THREE.Vector3(x, -y, ZP + Math.sin(t * Math.PI) * 1.5));
        }
      }
      if (pts.length < 2) return null;
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, Math.min(160, pts.length * 2), radius || 1.05, 5, false);
      const m = new THREE.Mesh(geo, color);
      m.castShadow = true;
      this.scene.add(m);
      this.dyn.push(m);
      return m;
    }

    clearDyn() {
      for (const m of this.dyn) { this.scene.remove(m); m.geometry.dispose(); }
      this.dyn = [];
    }

    // ------------------------------------------------------------ Bild
    draw(g, dt, opts = {}) {
      if (this.level !== g.L || this.game !== g) {
        if (this.level !== g.L || !this.scene) this.build(g);
        this.game = g;
      }
      const THREE = this.THREE, r2 = this.r2;
      this.clock += dt;
      r2.t += dt;
      r2.prepare(g);
      r2.zoom = opts.pan ? 1 : 0.8;
      r2.updateCamera(g, dt, opts);
      const cam = r2.cam;
      const D = (cam.h / 2) / Math.tan((FOV * Math.PI / 180) / 2);
      this.camera.position.set(cam.x, -cam.y, D);
      this.camera.lookAt(cam.x, -cam.y, 0);
      if (this.bokeh) this.bokeh.uniforms.focus.value = D;
      // Hauptlicht und Schattenbereich folgen der Kamera
      const vw = cam.h * this.camera.aspect;
      const k = this.key;
      k.target.position.set(cam.x, -cam.y, -60);
      k.position.copy(k.target.position).addScaledVector(this.keyDir, 1800);
      const sc = k.shadow.camera;
      sc.left = -vw / 2 - 150; sc.right = vw / 2 + 150; sc.top = cam.h / 2 + 300; sc.bottom = -cam.h / 2 - 300;
      sc.updateProjectionMatrix();
      this.sky.position.copy(this.camera.position);
      this.windU.value = this.clock;
      for (const m of this.waterMats) { m.normalMap.offset.x = this.clock * 0.02; m.normalMap.offset.y = this.clock * 0.013; }
      if (this.fg) this.fg.position.y = -cam.y - cam.h * 0.2;

      // Dynamisches
      this.clearDyn();
      g.world.crates.forEach((c, i) => this.crates[i].position.set(c.x + c.w / 2 + (c.strain > 0 ? Math.sin(this.clock * 60) * 0.8 : 0), -(c.y + c.h / 2), -16));
      g.beads.forEach((b, i) => {
        const m = this.beads[i];
        const a = b.got ? Math.max(0, 1 - b.t / 0.6) : 1;
        m.visible = a > 0.01;
        m.position.set(b.x, -(b.y + Math.sin(this.clock * 2.4 + b.x * 0.05) * 3 - (b.got ? b.t * 40 : 0)), ZP);
        m.material.opacity = a;
        m.children[0].material.opacity = 0.55 * a;
        m.rotation.y = this.clock;
      });
      g.checkpoints.forEach((cp, i) => {
        const L = this.lanterns[i];
        const fl = cp.on ? 0.85 + Math.sin(this.clock * 9) * 0.08 + Math.sin(this.clock * 23) * 0.05 : 0;
        L.glassMat.emissiveIntensity = cp.on ? 3 * fl : 0;
        L.halo.material.opacity = cp.on ? 0.55 * fl : 0;
      });
      const won = g.state === 'won' ? Math.min(1, g.stateT) : 0;
      this.goal.ball.rotation.y = this.clock * 0.25;
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2);
      this.goal.halo.scale.setScalar(170 + pulse * 25 + won * 260);
      this.goal.halo.material.opacity = 0.45 + won * 0.4;
      for (const b of g.world.bridges) {
        let load = null;
        for (const p of g.players) if (!p.merged && p.bridge === b && p.grounded) load = p.x + p.w / 2;
        const sag = (load !== null ? 4 : 0) + Math.sin(this.clock * 34) * b.wob * 7;
        const cx = load !== null ? load : (b.ax + b.bx) / 2;
        const cy = (load !== null ? FF.bridgeY(b, load) : (b.ay + b.by) / 2) + sag * 2;
        this.yarnTube([[b.ax, b.ay], [cx, cy], [b.bx, b.by]], 0, 0, this.bridgeMats[b.owner], 1.4);
      }
      if (g.tetherOn) {
        const T = g.tether;
        if (!this.tetherMat) this.tetherMat = this.gradientYarn();
        this.tetherMat.map.offset.x = 0;
        this.yarnTube(T.points(), Math.min(Math.max(0, T.len - T.total), 260), 0.75, this.tetherMat, 1.0);
      }
      for (const p of g.players) {
        if (!p.lasso) continue;
        const pts = p.lasso.points();
        const kk = Math.min(1, p.throwT / 0.12);
        if (kk < 1) {
          const a = pts[0], b = pts[pts.length - 1];
          this.yarnTube([a, [a[0] + (b[0] - a[0]) * kk, a[1] + (b[1] - a[1]) * kk - Math.sin(kk * Math.PI) * 20]], 0, 0, this.bridgeMats[p.id], 0.9);
        } else this.yarnTube(pts, Math.min(Math.max(0, p.lasso.len - p.lasso.total), 200), 0.7, this.bridgeMats[p.id], 0.95);
      }
      g.players.forEach((p, i) => this.poseYarny(this.yarnies[i], p, g, dt));
      this.posePassenger(g);

      // Rendern
      if (this.composer) {
        this.grade.uniforms.time.value = this.clock % 10;
        this.composer.render(dt);
      } else this.renderer.render(this.scene, this.camera);

      this.drawOverlay(g, dt, opts);
    }

    gradientYarn() {
      const THREE = this.THREE;
      const c = document.createElement('canvas');
      c.width = 256; c.height = 4;
      const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, FF.COLORS[0]); gr.addColorStop(1, FF.COLORS[1]);
      x.fillStyle = gr; x.fillRect(0, 0, 256, 4);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.78, sheen: 1, sheenRoughness: 0.45, sheenColor: col('#ffffff'), normalMap: this.tex.yarn.normal });
    }

    // 2D-Ebene obendrauf: Hinweistafeln, Zielmarkierung fürs Lasso, Funkenflug, Pfeil zum Partner
    drawOverlay(g, dt, opts) {
      const r2 = this.r2, ctx = r2.ctx, W = r2.W, H = r2.H, cam = r2.cam;
      const sc = H / cam.h;
      r2.sc = sc;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(sc, 0, 0, sc, W / 2 - cam.x * sc, H / 2 - cam.y * sc);
      r2.view = { x0: cam.x - W / 2 / sc - 40, x1: cam.x + W / 2 / sc + 40, y0: cam.y - cam.h / 2 - 40, y1: cam.y + cam.h / 2 + 40 };
      if (r2.th.amb !== 'mist') r2.drawAmbient(ctx, g, sc);
      r2.drawTargets(ctx, g);
      for (const p of g.players) if (p.miss && !p.lasso) r2.drawLasso(ctx, p);
      r2.drawFx(ctx, g);
      if (!opts.pan) for (const s of g.signs) if (s.show > 0.01) r2.drawSignBubble(ctx, s, g);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (g.mode === 'solo' && !opts.pan) r2.drawOffscreen(ctx, g, sc);
      if (g.state === 'dying') {
        const t = g.stateT;
        const a = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.45);
        ctx.fillStyle = `rgba(10,8,14,${Math.min(1, a) * 0.94})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  FF.Renderer3D = Renderer3D;
})();
