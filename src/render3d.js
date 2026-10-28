'use strict';
// 3D-Darstellung mit Three.js (WebGL). Die Spielebene liegt bei z ≈ 0, das Gelände reicht nach hinten in die Tiefe.
// Die Kamera schaut senkrecht auf die Spielebene, darum passen 2D-Overlay (Hinweise, Funken) und 3D genau übereinander.
//
// Leistung: Szene in x-Abschnitte zerlegt (unsichtbare Teile werden nicht gezeichnet), Tiefenunschärfe aus dem
// vorhandenen Tiefenpuffer (kein zweiter Szenendurchlauf), Auflösung passt sich der Bildrate an, Fäden ohne
// Speicher-Neuanlage pro Bild, Shader und Texturen werden beim Laden vorbereitet.
(function () {
  const FF = globalThis.FF;
  const ZP = 3;          // z der Figuren und Fäden (knapp vor der Geländekante)
  const DEPTH = 300;     // wie weit das Gelände nach hinten reicht
  const FOV = 32;
  const CH = 700;        // Breite eines Szenenabschnitts

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

  // Farbtöne je Stimmung für die Foto-Texturen
  const TINT = {
    garden: { top: '#f2f6ea', wall: '#806652', wallTex: 'dirt', stone: '#b8b2a8', leaf: '#d6e6bc', recolor: 0, grass: ['#3e5a22', '#9bb862'] },
    quarry: { top: '#b4b9a2', wall: '#a8a49c', wallTex: 'gravel', stone: '#a6aeb4', leaf: '#9cb494', recolor: 0.3, grass: ['#46523a', '#9aa477'] },
    pond: { top: '#efe2a8', wall: '#8c6c4e', wallTex: 'dirt', stone: '#c0b2a0', leaf: '#e6ecb0', recolor: 0.2, grass: ['#545a26', '#c4bc62'] },
    autumn: { top: '#d0a468', wall: '#8e6a52', wallTex: 'dirt', stone: '#a8988a', leaf: '#ff9a4a', recolor: 1, grass: ['#5c4222', '#c8984c'] },
    dusk: { top: '#a2aca0', wall: '#9a8a94', wallTex: 'dirt', stone: '#9a92a0', leaf: '#7e9282', recolor: 1, grass: ['#2c3426', '#6a7a54'] },
  };

  // Fototextur in Graustufen mit der Materialfarbe einfärben (k = Anteil, gain = Helligkeitsausgleich)
  function recolorChunk(frag, k, gain) {
    return frag.replace('#include <map_fragment>', `#include <map_fragment>
      { float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / max(dot(diffuse, vec3(0.3, 0.59, 0.11)), 0.001);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * lum * ${gain.toFixed(2)}, ${k.toFixed(2)}); }`);
  }

  // Shader-Ergänzungen kombinierbar machen: jede bekommt einen Namen für den Programm-Cache.
  // (In einer WeakMap statt userData, weil Material.clone() Funktionen in userData nicht mitnimmt.)
  const PATCHES = new WeakMap();
  function patch(mat, key, fn) {
    const list = PATCHES.get(mat) || [];
    PATCHES.set(mat, list);
    list.push({ key, fn });
    mat.onBeforeCompile = (sh, r) => { for (const p of list) p.fn(sh, r); };
    mat.customProgramCacheKey = () => list.map((p) => p.key).join('|');
    return mat;
  }

  const NOISE = `
    float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }
  `;

  // Welt-Normale und Welt-Position an den Fragment-Shader weiterreichen (auch für Instanzen)
  function worldVaryings(sh) {
    if (sh.vertexShader.includes('varying vec3 vWN;')) return;
    sh.vertexShader = 'varying vec3 vWN;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 wq = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wq = instanceMatrix * wq;
        #endif
        vWP = (modelMatrix * wq).xyz; }
      vWN = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);`);
    sh.fragmentShader = 'varying vec3 vWN;\nvarying vec3 vWP;\n' + sh.fragmentShader;
  }

  // Wetter auf Oberflächen: Nässe (dunkler, glänzender), Pfützen auf ebenen Flächen, Schneedecke auf
  // nach oben zeigenden Flächen, dazu auf Wunsch Moos. o = { wet, puddle, snow, moss: 'r, g, b' }
  function weatherSurface(mat, wu, o) {
    const key = 'ws' + [o.wet, o.puddle, o.snow, o.moss || ''].join(',');
    return patch(mat, key, (sh) => {
      sh.uniforms.wWet = wu.wWet; sh.uniforms.wSnow = wu.wSnow;
      worldVaryings(sh);
      sh.fragmentShader = 'uniform float wWet;\nuniform float wSnow;\n' + NOISE + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wUp = clamp(vWN.y, 0.0, 1.0);
          float wN = wNoise(vWP.xz * 0.035 + vWP.y * 0.01) * 0.6 + wNoise(vWP.xz * 0.11 + vWP.y * 0.05) * 0.4;
          ${o.moss ? `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${o.moss}) * (0.7 + wN * 0.6), smoothstep(0.35, 0.8, wUp + (wN - 0.5) * 0.7) * 0.9);` : ''}
          float wetK = wWet * ${o.wet.toFixed(2)};
          float snowK = wSnow * ${o.snow.toFixed(2)} * smoothstep(0.42, 0.8, wUp + (wN - 0.5) * 0.45);
          float puddle = wWet * ${o.puddle.toFixed(2)} * smoothstep(0.92, 0.985, wUp) * smoothstep(0.5, 0.64, wNoise(vWP.xz * 0.018 + 3.7));
          diffuseColor.rgb *= mix(1.0, 0.55, wetK);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.07), puddle * 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.97) * (0.9 + wN * 0.14), snowK);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.28, wetK * (0.35 + 0.65 * wUp));
          roughnessFactor = mix(roughnessFactor, 0.03, puddle);
          roughnessFactor = mix(roughnessFactor, 0.78, snowK);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), max(puddle, snowK * 0.6)));`);
    });
  }

  const MOSS = { garden: '0.12, 0.2, 0.05', pond: '0.16, 0.2, 0.06', quarry: '0.14, 0.18, 0.09', autumn: '0.2, 0.18, 0.06', dusk: '' };

  // ------------------------------------------------------------ Faden-Röhre ohne Neuanlage pro Bild
  class RopeMesh {
    constructor(THREE, material, rings = 220, radial = 6) {
      this.rings = rings; this.radial = radial;
      const nv = rings * (radial + 1);
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3); this.uv = new Float32Array(nv * 2);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < rings - 1; i++) {
        for (let k = 0; k < radial; k++) {
          const a = i * (radial + 1) + k, b = a + radial + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      geo.setIndex(idx);
      this.geo = geo;
      this.mesh = new THREE.Mesh(geo, material);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      this.mesh.visible = false;
    }
    // pts: flaches Array [x0,y0,z0, x1,y1,z1, ...]
    update(pts, n, radius, uScale) {
      n = Math.min(n, this.rings);
      if (n < 2) { this.mesh.visible = false; return; }
      const R = this.radial, P = this.pos, N = this.nor, U = this.uv;
      let len = 0;
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
        let tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;            // Normale in der Ebene, Binormale = z
        if (i > 0) len += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2]);
        for (let k = 0; k <= R; k++) {
          const a = (k / R) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          const dx = nx * c, dy = ny * c, dz = s;
          const v = (i * (R + 1) + k);
          P[v * 3] = pts[i * 3] + dx * radius; P[v * 3 + 1] = pts[i * 3 + 1] + dy * radius; P[v * 3 + 2] = pts[i * 3 + 2] + dz * radius;
          N[v * 3] = dx; N[v * 3 + 1] = dy; N[v * 3 + 2] = dz;
          U[v * 2] = len * (uScale || 0.05); U[v * 2 + 1] = k / R;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.normal.needsUpdate = true;
      this.geo.attributes.uv.needsUpdate = true;
      this.geo.setDrawRange(0, (n - 1) * R * 6);
      this.mesh.visible = true;
    }
  }

  // ------------------------------------------------------------ Spiegelung und Tiefenunschärfe in einem Durchlauf
  // Wasser: Die Kamera schaut von der Seite, also spiegelt sich, was über der Wasserlinie im Bild ist, unterhalb von ihr.
  // Dafür wird das fertige Bild an der Wasserlinie gespiegelt abgetastet, mit Wellen verzerrt und zur Tiefe hin
  // schwächer. Die Tiefenunschärfe liest denselben Tiefenpuffer; beides zusammen braucht keinen zweiten Szenendurchlauf.
  function makeFXPass(THREE) {
    class FXPass extends THREE.Pass {
      constructor(dof) {
        super();
        this.uniforms = {
          tColor: { value: null }, tDepth: { value: null }, near: { value: 10 }, far: { value: 14000 },
          focus: { value: 1000 }, range: { value: 900 }, maxR: { value: 9 }, res: { value: new THREE.Vector2(1, 1) },
          wRect: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, wDepth: { value: [0, 0, 0, 0] }, wCount: { value: 0 },
          time: { value: 0 }, rain: { value: 0 }, wTint: { value: new THREE.Color(1, 1, 1) },
        };
        this.material = new THREE.ShaderMaterial({
          defines: { DOF: dof ? 1 : 0 },
          uniforms: this.uniforms,
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `
            uniform sampler2D tColor; uniform sampler2D tDepth; uniform float near; uniform float far;
            uniform float focus; uniform float range; uniform float maxR; uniform vec2 res; varying vec2 vUv;
            uniform vec4 wRect[4]; uniform float wDepth[4]; uniform int wCount; uniform float time; uniform float rain; uniform vec3 wTint;
            float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
            vec3 scene(vec2 uv){
              vec3 c = texture2D(tColor, uv).rgb;
              for (int i = 0; i < 4; i++) {
                if (i >= wCount) break;
                vec4 r = wRect[i];
                if (uv.x > r.x && uv.x < r.y && uv.y < r.z && uv.y > r.w) {
                  if (lin(texture2D(tDepth, uv).x) > wDepth[i] - 6.0) {
                    float d = r.z - uv.y;
                    float amp = (0.0012 + rain * 0.0035) * (0.5 + d * 9.0);
                    vec2 ru = vec2(uv.x + sin(uv.y * 620.0 + time * 3.1) * amp + sin(uv.x * 85.0 - time * 1.4) * amp * 0.6,
                                   r.z + d * 1.02 + 0.0015 + sin(uv.x * 140.0 + time * 2.2) * amp * 0.4);
                    if (ru.y < 0.999) {
                      vec3 rc = texture2D(tColor, ru).rgb;
                      float k = (0.6 * exp(-d * 7.0) + 0.1) * (1.0 - rain * 0.3);
                      c = mix(c, rc * wTint, k);
                    }
                    c += wTint * 0.1 * exp(-d * 420.0);
                  }
                }
              }
              return c;
            }
            float coc(vec2 uv){ float z = lin(texture2D(tDepth, uv).x); float d = z - focus;
              return clamp(abs(d) / range * (d < 0.0 ? 3.0 : 1.0) - 0.06, 0.0, 1.0) * maxR; }
            void main(){
              vec3 c = scene(vUv);
            #if DOF
              float c0 = coc(vUv);
              if (c0 >= 0.5) {
                vec4 acc = vec4(c, 1.0);
                for (int i = 1; i < 18; i++) {
                  float r = sqrt(float(i) / 18.0);
                  float a = float(i) * 2.39996;
                  vec2 o = vec2(cos(a), sin(a)) * r * c0 / res;
                  float cs = coc(vUv + o);
                  float w = clamp(cs / max(c0 * r, 0.001), 0.0, 1.0);
                  acc += vec4(scene(vUv + o) * w, w);
                }
                c = acc.rgb / acc.a;
              }
            #endif
              gl_FragColor = vec4(c, 1.0);
            }`,
        });
        this.fsQuad = new THREE.FullScreenQuad(this.material);
      }
      render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tColor.value = readBuffer.texture;
        this.uniforms.tDepth.value = readBuffer.depthTexture;
        this.uniforms.res.value.set(readBuffer.width, readBuffer.height);
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.fsQuad.render(renderer);
      }
      dispose() { this.material.dispose(); this.fsQuad.dispose(); }
    }
    return FXPass;
  }

  class Renderer3D {
    constructor(glCanvas, overlayCanvas) {
      const THREE = globalThis.THREE;
      this.THREE = THREE;
      this.gl = glCanvas;
      this.r2 = new FF.Renderer(overlayCanvas);
      this.quality = FF.store.get('quality3d', null) || ((matchMedia('(pointer: coarse)').matches || /TV|SMART|Tizen|Web0S|AFT/i.test(navigator.userAgent)) ? 'medium' : 'high');
      this.renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance', stencil: false });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 10, 14000);
      this.FXPass = makeFXPass(THREE);
      // Gemeinsame Uniforms für Wind, Nässe, Schnee und Zeit (alle Materialien greifen darauf zu)
      this.wu = { wTime: { value: 0 }, wWet: { value: 0 }, wSnow: { value: 0 }, wWind: { value: 0.35 }, wSun: { value: new THREE.Color(0.3, 0.28, 0.2) } };
      this.ws = new FF.WeatherState();
      this.weatherPref = 'auto';
      this.clock = 0;
      this.level = null;
      this.loading = null;
      this.dynScale = 1;
      this.ft = 1 / 60;
      this.lastAdj = 0;
      this.tmp = { A: new THREE.Vector3(), B: new THREE.Vector3(), D: new THREE.Vector3(), Y: new THREE.Vector3(0, 1, 0) };
      this.ropeBuf = new Float32Array(220 * 3);
      this.resize();
    }

    get cam() { return this.r2.cam; }
    get snap() { return this.r2.snap; }
    set snap(v) { this.r2.snap = v; }
    get keyLabels() { return this.r2.keyLabels; }
    set keyLabels(f) { this.r2.keyLabels = f; }
    get busy() { return !!this.loading; }
    setWeather(pref) { this.weatherPref = pref; }
    ready(g) { return this.level === g.L && !!this.scene && !this.loading; }

    basePixelRatio() {
      const d = Math.min(2, devicePixelRatio || 1);
      return this.quality === 'high' ? Math.min(d, 1.5) : this.quality === 'medium' ? Math.min(d, 1) : 0.75;
    }
    pixelRatio() { return this.basePixelRatio() * this.dynScale; }

    // Vom Hauptprogramm, wenn es dauerhaft ruckelt: erst Auflösung, dann Qualitätsstufe senken
    setQuality(q) {
      if (q === 'low' && this.dynScale > 0.62) { this.dynScale = 0.6; this.applyResolution(); return; }
      if (q === 'low' && this.quality === 'high') q = 'medium';
      this.quality = q;
      FF.store.set('quality3d', q);
      this.dynScale = 1;
      this.level = null;
      this.resize();
    }

    resize() {
      this.r2.resize();
      const { w, h } = FF.viewSize(this.gl);
      this.cssW = w; this.cssH = h;
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.buildComposer();
    }

    applyResolution() {
      const w = this.cssW, h = this.cssH;
      this.renderer.setPixelRatio(this.pixelRatio());
      this.renderer.setSize(w, h, false);
      if (this.composer) { this.composer.setPixelRatio(this.pixelRatio()); this.composer.setSize(w, h); }
    }

    // Dynamische Auflösung, Ziel 60 Bilder pro Sekunde. Jede Absenkung ist ein Versuch: bringt sie nichts, hängt die
    // Bildrate an einer festen Obergrenze (z. B. 30 Bilder im Stromsparmodus) – dann bleibt die volle Auflösung.
    adapt(dt) {
      if (!dt || dt > 0.25 || this.loading) return;
      this.ft += (dt - this.ft) * 0.08;
      const now = this.clock, pr = this.probe;
      if (pr && now - pr.t > 1.5) {
        this.probe = null;
        if (this.ft > pr.ft * 0.93) { this.capped = true; this.dynScale = pr.scale; this.applyResolution(); return; }
      }
      if (this.probe) return;
      if (!this.capped && this.ft > 1 / 50 && now - this.lastAdj > 1.2 && this.dynScale > 0.55) {
        this.probe = { ft: this.ft, scale: this.dynScale, t: now };
        this.dynScale = Math.max(0.55, this.dynScale * 0.85); this.lastAdj = now; this.applyResolution();
      } else if (this.ft < 1 / 58 && now - this.lastAdj > 4 && this.dynScale < 1) {
        this.dynScale = Math.min(1, this.dynScale * 1.08); this.lastAdj = now; this.applyResolution();
      }
    }

    buildComposer() {
      const THREE = this.THREE, R = this.renderer;
      if (this.composer) { this.composer.dispose && this.composer.dispose(); }
      this.composer = null; this.dof = null; this.fx = null;
      if (this.quality === 'low' || !this.scene) return;
      const w = this.cssW, h = this.cssH, pr = this.pixelRatio();
      const rt = new THREE.WebGLRenderTarget(Math.round(w * pr), Math.round(h * pr), {
        type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0,
      });
      rt.depthTexture = new THREE.DepthTexture(Math.round(w * pr), Math.round(h * pr));
      const comp = new THREE.EffectComposer(R, rt);
      // Eigene Tiefen-Textur für den zweiten Puffer: ein Klon teilt sich die Quelle und damit die GPU-Textur,
      // dann liest der Effekt-Durchlauf aus der Textur, in die er gerade schreibt.
      comp.renderTarget2.depthTexture = new THREE.DepthTexture(Math.round(w * pr), Math.round(h * pr));
      comp.setPixelRatio(pr);
      comp.setSize(w, h);
      comp.addPass(new THREE.RenderPass(this.scene, this.camera));
      this.fx = new this.FXPass(this.quality === 'high');
      if (this.quality === 'high') this.dof = this.fx;
      comp.addPass(this.fx);
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.5, 0.6, 0.85);
      comp.addPass(this.bloom);
      comp.addPass(new THREE.OutputPass());
      this.grade = new THREE.ShaderPass({
        uniforms: {
          tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.035 },
          top: { value: new THREE.Vector3(1, 1, 1) }, bottom: { value: new THREE.Vector3(0.92, 0.95, 1.0) },
          desat: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float time; uniform float grain; uniform vec3 top; uniform vec3 bottom; varying vec2 vUv;
          uniform float desat; uniform vec3 tint;
          float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.3, 0.59, 0.11))), desat) * tint;
            c.rgb *= mix(bottom, top, smoothstep(0.0, 1.0, vUv.y));
            vec2 d = vUv - 0.5;
            c.rgb *= mix(0.55, 1.0, smoothstep(0.92, 0.3, length(d * vec2(1.0, 1.25))));
            c.rgb += (rnd(vUv * 731.0 + time) - 0.5) * grain;
            gl_FragColor = c;
          }`,
      });
      if (this.th) {
        const top = col(`rgb(${this.th.light})`);
        this.grade.uniforms.top.value.set(1 + (top.r - 0.8) * 0.12, 1 + (top.g - 0.8) * 0.12, 1 + (top.b - 0.8) * 0.12);
      }
      comp.addPass(this.grade);
      this.composer = comp;
    }

    // ------------------------------------------------------------ Laden & Aufbauen
    ensureLevel(g) {
      if (this.level === g.L && this.scene) { this.game = g; return true; }
      if (this.loading && this.loading.L === g.L) return false;
      const job = { L: g.L };
      this.loading = job;
      const go = async () => {
        let A = null;
        if (FF.canLoadPhotos()) {
          try { A = await FF.loadPhotoAssets(this.renderer, g.L.theme); } catch (e) { console.warn(e.message); A = null; }
        }
        await new Promise((r) => setTimeout(r, 0));
        if (this.loading !== job) return;
        this.build(g, A);
        // Shader übersetzen und Texturen hochladen, bevor das erste Bild gezeigt wird
        try { this.renderer.compile(this.scene, this.camera); } catch (e) { /* egal */ }
        if (this.loading === job) this.loading = null;
      };
      go().catch((e) => { console.error(e); if (this.loading === job) this.loading = null; });
      return false;
    }

    build(g, A) {
      const THREE = this.THREE;
      if (this.scene) this.disposeScene();
      const L = g.L, th = FF.THEMES[L.theme];
      this.th = th;
      this.photo = !!A;
      this.tex = FF.textures(L.theme, this.quality === 'high');
      this.A = A;
      this.tint = TINT[L.theme] || TINT.garden;
      this.level3dTheme = L.theme;
      const scene = (this.scene = new THREE.Scene());
      scene.fog = new THREE.FogExp2(col(`rgb(${th.haze})`), L.theme === 'quarry' ? 0.00026 : 0.0002);
      this.renderer.toneMappingExposure = L.theme === 'dusk' ? 1.3 : 1.0;
      this.renderer.shadowMap.enabled = this.quality !== 'low';
      const rnd = FF.rng(g.levelIndex * 131 + 7);
      this.q = this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.6 : 0.3;
      this.mats = this.makeMaterials();
      this.buildSkyAndLight(g);
      this.buildTerrain(g, rnd);
      this.buildBackground(g, rnd);
      this.buildProps(g, rnd);
      this.buildPlayers(g);
      this.buildPrecip(g, rnd);
      this.wsSnap = true;
      this.buildComposer();
      this.ropes = [];
      for (let i = 0; i < 8; i++) {
        const r = new RopeMesh(THREE, this.mats.yarn[0]);
        this.scene.add(r.mesh);
        this.ropes.push(r);
      }
      this.level = L; this.game = g;
      this.capped = false; this.probe = null; this.ft = 1 / 60;
      this.r2.snap = true;
    }

    disposeScene() {
      const seen = new Set();
      this.scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (!seen.has(m)) { seen.add(m); m.dispose(); } });
      });
      if (this.env) this.env.dispose();
      this.scene = null;
    }

    makeMaterials() {
      const THREE = this.THREE, T = this.tex, A = this.A, tn = this.tint;
      const std = (o) => new THREE.MeshStandardMaterial(o);
      const m = {};
      if (A) {
        const wallMap = tn.wallTex === 'gravel' ? A.gravel : A.dirt, wallN = tn.wallTex === 'gravel' ? A.gravelN : A.dirtN;
        m.wall = std({ map: wallMap, normalMap: wallN, normalScale: new THREE.Vector2(1.7, 1.7), roughness: 1, color: col(tn.wall), vertexColors: true });
        if (tn.wallTex === 'gravel') {
          patch(m.wall, 'wallGrey', (sh) => { sh.fragmentShader = recolorChunk(sh.fragmentShader, 0.85, 1.45); });
        }
        m.top = std({ map: A.grass, normalMap: A.grassN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.95, color: col(tn.top), vertexColors: true });
        m.stone = std({ map: A.gravel, normalMap: A.gravelN, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.9, color: col(tn.stone) });
        m.wood = std({ map: A.wood, normalMap: A.woodN, roughness: 0.9, color: col('#b4a898') });
        m.leaf = this.foliage(std({ map: A.canopy, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85, color: col(tn.leaf) }), tn.recolor);
        m.plant = this.foliage(std({ map: A.canopy, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, color: col(tn.leaf).multiplyScalar(0.9) }), tn.recolor);
        m.waterN = A.waterN;
      } else {
        m.wall = std({ map: T.rock.map, normalMap: T.rock.normal, normalScale: new THREE.Vector2(2.2, 2.2), roughness: 0.9, vertexColors: true });
        m.top = std({ map: T.top.map, normalMap: T.top.normal, roughness: 1, vertexColors: true });
        m.stone = std({ map: T.rock.map, normalMap: T.rock.normal, roughness: 0.85, color: col('#b9b2a6') });
        m.wood = std({ map: T.wood.map, normalMap: T.wood.normal, roughness: 0.85 });
        m.leaf = this.foliage(std({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }), 0);
        m.plant = m.leaf;
        m.waterN = T.water.normal;
      }
      m.bark = std({ map: T.bark.map, normalMap: T.bark.normal, roughness: 0.95 });
      m.root = std({ color: col(this.th.moss2), roughness: 1 });
      m.metal = std({ color: col('#c2a066'), roughness: 0.35, metalness: 0.8 });
      m.twig = std({ color: col('#4a3626'), roughness: 1 });
      const wu = this.wu, moss = MOSS[this.level3dTheme];
      weatherSurface(m.wall, wu, { wet: 0.9, puddle: 0, snow: 0.8 });
      weatherSurface(m.top, wu, { wet: 0.8, puddle: 1, snow: 1 });
      weatherSurface(m.stone, wu, { wet: 1, puddle: 0, snow: 1, moss });
      weatherSurface(m.wood, wu, { wet: 0.8, puddle: 0, snow: 0.9 });
      weatherSurface(m.bark, wu, { wet: 0.8, puddle: 0, snow: 0.6 });
      weatherSurface(m.root, wu, { wet: 0.7, puddle: 0, snow: 0.6 });
      m.yarn = [0, 1].map((i) => this.yarnMaterial(FF.COLORS[i]));
      m.yarnDark = [0, 1].map((i) => this.yarnMaterial(FF.COLORS_DARK[i]));
      m.tether = this.gradientYarn();
      return m;
    }

    // Blattkarten: Licht wie bei einer runden Krone (Normale zeigt nach oben/vorne statt senkrecht auf die Karte),
    // etwas Durchscheinen, Umfärben des Foto-Laubs in die Farbe der Stimmung, Wiegen im Wind, Schnee.
    foliage(mat, recolor, sway = 0) {
      mat.emissive = mat.color.clone().multiplyScalar(0.12);
      const wu = this.wu;
      return patch(mat, 'foliage' + recolor + '/' + sway, (sh) => {
        sh.uniforms.wTime = wu.wTime; sh.uniforms.wWind = wu.wWind; sh.uniforms.wSnow = wu.wSnow;
        sh.vertexShader = 'uniform float wTime;\nuniform float wWind;\n' + sh.vertexShader
          .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
            transformedNormal = normalize(normalMatrix * vec3(0.0, 0.85, 0.5));`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            #ifdef USE_INSTANCING
            if (${sway.toFixed(2)} > 0.0) {
              vec3 ip = instanceMatrix[3].xyz; float sc = max(length(instanceMatrix[0].xyz), 0.001);
              float ph = ip.x * 0.013 + ip.y * 0.021;
              float gust = max(0.0, sin(ip.x * 0.002 - wTime * 0.9));
              float sw = (sin(wTime * 1.7 + ph) + 0.5 * sin(wTime * 4.1 + ph * 2.3) + gust * 1.5) * wWind * ${sway.toFixed(2)};
              vec3 d = transpose(mat3(instanceMatrix)) * vec3(sw, sw * 0.25 * cos(ph * 3.0), 0.0);
              transformed += d / (sc * sc);
            }
            #endif`);
        sh.fragmentShader = 'uniform float wSnow;\n' + (recolor > 0 ? recolorChunk(sh.fragmentShader, recolor, 1.6) : sh.fragmentShader)
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.95), wSnow * 0.4);`);
      });
    }

    buildSkyAndLight(g) {
      const THREE = this.THREE, th = this.th, L = g.L, scene = this.scene;
      const sunX = (th.sun[0] - 0.5) * 2, sunEl = (1 - th.sun[1]) * 0.9 + 0.05;
      this.sunDir = new THREE.Vector3(sunX * 0.9, sunEl, -0.9).normalize();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(11000, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          c0: { value: col(th.sky[0]) }, c1: { value: col(th.sky[1]) }, c2: { value: col(th.sky[2]) },
          sun: { value: this.sunDir }, sunC: { value: col(`rgb(${th.light})`) },
          cloud: { value: 0 }, flash: { value: 0 }, time: this.wu.wTime, snowy: { value: 0 },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 sun; uniform vec3 sunC;
          uniform float cloud; uniform float flash; uniform float time; uniform float snowy; varying vec3 vP;
          ${NOISE}
          float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += wNoise(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return s; }
          void main(){
            float y = vP.y;
            vec3 c = y > 0.12 ? mix(c1, c0, smoothstep(0.12, 0.7, y)) : mix(c2, c1, smoothstep(-0.05, 0.12, y));
            c = mix(c, c2 * 0.35, smoothstep(-0.02, -0.3, y));
            // Wolken: Schicht über dem Horizont, bei Regen und Sturm dicht und grau
            vec3 grey = mix(vec3(0.62, 0.66, 0.72), vec3(0.78, 0.8, 0.85), snowy);
            vec3 over = mix(grey, grey * 0.45, cloud * (1.0 - snowy * 0.6));
            c = mix(c, over, cloud * 0.8);
            vec2 cp = vP.xz / max(y + 0.18, 0.06) * 0.9 + vec2(time * 0.012, 0.0);
            float cl = smoothstep(0.48 - cloud * 0.25, 0.85, fbm(cp));
            vec3 cc = mix(vec3(1.0, 0.98, 0.95) * (0.9 + 0.3 * (1.0 - cloud)), over * 0.75, cloud);
            c = mix(c, cc, cl * smoothstep(-0.02, 0.15, y) * (0.35 + cloud * 0.55));
            float s = max(dot(vP, sun), 0.0);
            c += sunC * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12) * (1.0 - cloud * 0.85);
            c += vec3(0.75, 0.8, 1.0) * flash * 0.9;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      sky.frustumCulled = false;
      scene.add(sky);
      this.sky = sky;

      const dusk = L.theme === 'dusk';
      const pm = new THREE.PMREMGenerator(this.renderer);
      if (this.A && this.A.hdr) {
        this.env = pm.fromEquirectangular(this.A.hdr).texture;
        scene.environmentIntensity = dusk ? 1.1 : 0.75;
      } else {
        const envScene = new THREE.Scene();
        envScene.add(sky.clone());
        this.env = pm.fromScene(envScene, 0, 10, 20000).texture;
        scene.environmentIntensity = 0.35;
      }
      pm.dispose();
      scene.environment = this.env;

      const hemi = new THREE.HemisphereLight(col(th.sky[1]).lerp(col('#ffffff'), dusk ? 0.25 : 0), col(th.earth), (dusk ? 0.8 : 0.55) * (this.A ? 0.7 : 1.4));
      scene.add(hemi);
      this.hemi = hemi;
      const key = new THREE.DirectionalLight(col(`rgb(${th.light})`).lerp(col('#ffffff'), 0.35), dusk ? 1.0 : 1.9);
      key.castShadow = this.quality !== 'low';
      const sm = this.quality === 'high' ? 2048 : 1024;
      key.shadow.mapSize.set(sm, sm);
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.8;
      key.shadow.camera.near = 10; key.shadow.camera.far = 5000;
      scene.add(key); scene.add(key.target);
      this.key = key;
      this.keyDir = new THREE.Vector3(sunX * 0.7, 1.0, 0.6).normalize();
      const rim = new THREE.DirectionalLight(col(`rgb(${th.light})`), dusk ? 1.5 : 2.0);
      rim.position.copy(this.sunDir).multiplyScalar(3000);
      scene.add(rim);
      this.rim = rim;
      // Grundwerte, die das Wetter abwandelt
      this.base = {
        key: key.intensity, rim: rim.intensity, hemi: hemi.intensity, env: scene.environmentIntensity,
        fog: scene.fog.density, fogC: scene.fog.color.clone(), exp: this.renderer.toneMappingExposure,
        sunC: key.color.clone(),
      };
    }

    // InstancedMesh pro Abschnitt, damit nur Sichtbares gezeichnet wird
    instanced(geo, mat, list, opts = {}) {
      const THREE = this.THREE;
      const byChunk = new Map();
      for (const it of list) {
        const k = Math.floor(it[0] / CH);
        if (!byChunk.has(k)) byChunk.set(k, []);
        byChunk.get(k).push(it);
      }
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
      const parent = opts.parent || this.scene;
      for (const items of byChunk.values()) {
        const im = new THREE.InstancedMesh(geo, mat, items.length);
        items.forEach((it, i) => {
          P.set(it[0], it[1], it[2]); E.set(it[3], it[4], it[5]); Q.setFromEuler(E); S.set(it[6], it[7], it[8]);
          M.compose(P, Q, S); im.setMatrixAt(i, M);
          if (it[9] !== undefined) { C.setRGB(it[9], it[10], it[11]); im.setColorAt(i, C); }
        });
        im.computeBoundingSphere();
        im.castShadow = !!opts.cast; im.receiveShadow = opts.receive !== false;
        parent.add(im);
      }
    }

    // ------------------------------------------------------------ Gelände
    buildTerrain(g, rnd) {
      const THREE = this.THREE, S = g.world.solids, q = this.q, tn = this.tint, mats = this.mats;
      const noise = (x, y) => FF.noise1(x * 0.021, 3) * 0.6 + FF.noise1(y * 0.027 + x * 0.004, 9) * 0.4;
      const covered = (r, side) => S.some((s) => s !== r && s.y < r.y + 12 && s.y + s.h > r.y + 12 &&
        (side < 0 ? s.x < r.x && s.x + s.w >= r.x - 1 : s.x <= r.x + r.w + 1 && s.x + s.w > r.x + r.w));
      const worldUV = (geo, fx, fy, k) => {
        const p = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < p.count; i++) uv.setXY(i, fx(p, i) / k, fy(p, i) / k);
      };
      const shade = (geo, depthOf) => {
        const p = geo.attributes.position, c = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
          const d = Math.max(0, depthOf(p, i));
          const k = 0.28 + 0.72 * Math.exp(-d / 170) + (FF.noise1(p.getX(i) * 0.008 + p.getZ(i) * 0.01, 4) - 0.5) * 0.18;
          c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      };
      const wallScale = this.photo ? 260 : 400, topScale = this.photo ? 150 : 200;
      for (const r of S) {
        const hv = Math.min(r.h, 1100);
        const sx = Math.max(2, Math.round(r.w / 10)), sy = Math.max(2, Math.round(hv / 10));
        const parts = [];
        const f = new THREE.PlaneGeometry(r.w, hv, sx, sy);
        f.translate(r.x + r.w / 2, -(r.y + hv / 2), 0);
        const p = f.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), wy = -p.getY(i), d = wy - r.y;
          let z = -noise(x, wy) * 12 - 1.5 - Math.max(0, FF.noise1(x * 0.09 + wy * 0.05, 7) - 0.6) * 10;
          if (d < 8) z = z * (d / 8) - (8 - d) * 0.6;
          p.setZ(i, z);
        }
        worldUV(f, (pp, i) => pp.getX(i) + FF.noise1(pp.getY(i) * 0.004, 2) * 90, (pp, i) => pp.getY(i), wallScale);
        f.computeVertexNormals();
        shade(f, (pp, i) => -pp.getY(i) - r.y);
        parts.push(f);
        for (const side of [-1, 1]) {
          if (covered(r, side)) continue;
          const sg = new THREE.PlaneGeometry(DEPTH, hv, 16, sy);
          sg.rotateY(side * Math.PI / 2);
          sg.translate(side < 0 ? r.x : r.x + r.w, -(r.y + hv / 2), -DEPTH / 2);
          const sp = sg.attributes.position;
          for (let i = 0; i < sp.count; i++) sp.setX(i, sp.getX(i) + side * noise(sp.getZ(i) * 1.3, -sp.getY(i)) * 7);
          worldUV(sg, (pp, i) => pp.getZ(i), (pp, i) => pp.getY(i), wallScale);
          sg.computeVertexNormals();
          shade(sg, (pp, i) => -pp.getY(i) - r.y);
          parts.push(sg);
        }
        const wm = new THREE.Mesh(THREE.mergeGeometries(parts), mats.wall);
        parts.forEach((x) => x.dispose());
        wm.receiveShadow = true;
        this.scene.add(wm);
        const tg = new THREE.PlaneGeometry(r.w, DEPTH, sx, 12);
        tg.rotateX(-Math.PI / 2);
        tg.translate(r.x + r.w / 2, -r.y, -DEPTH / 2);
        const tp = tg.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const zz = tp.getZ(i);
          if (zz < -12) tp.setY(i, tp.getY(i) + (FF.noise1(tp.getX(i) * 0.03 + zz * 0.05, 5) - 0.5) * 8 * Math.min(1, -zz / 80));
        }
        worldUV(tg, (pp, i) => pp.getX(i), (pp, i) => pp.getZ(i), topScale);
        tg.computeVertexNormals();
        shade(tg, () => 0);
        const tm = new THREE.Mesh(tg, mats.top);
        tm.receiveShadow = true;
        this.scene.add(tm);
      }

      // Kleinkram auf und an den Blöcken
      const tops = S.filter((r) => r.w < 2000);
      const grass = [], stones = [], wallStones = [], pebbles = [], plants = [], litter = [], twigs = [], flowers = [[], [], [], []], stems = [], shrooms = [];
      const g0 = col(tn.grass[0]), g1 = col(tn.grass[1]);
      const theme = this.level3dTheme;
      const flowerRate = { garden: 1, pond: 0.8, quarry: 0.25, autumn: 0.15, dusk: 0.35 }[theme] || 0.5;
      const shroomRate = { garden: 0.15, pond: 0.1, quarry: 0.05, autumn: 1, dusk: 0.4 }[theme] || 0.2;
      for (const r of tops) {
        // Grasbüschel: vorne an der Kante dicht, nach hinten lockerer
        const n = Math.floor((r.w * DEPTH) / 150 * q), nf = Math.floor(r.w / 2.6 * q);
        for (let i = 0; i < n + nf; i++) {
          const front = i >= n;
          const z = front ? -1 - rnd() * 12 : -8 - Math.pow(rnd(), 1.5) * (DEPTH - 10);
          const h = (front ? 8 + rnd() * 10 : 7 + rnd() * 14) * (rnd() < 0.08 ? 1.7 : 1);
          const t = rnd(), dry = rnd() < 0.12 ? 0.25 : 0;
          grass.push([r.x + 1 + rnd() * (r.w - 2), -r.y - 0.5, z, 0, rnd() * Math.PI * 2, 0, 0.8 + rnd() * 0.5, h, 0.8 + rnd() * 0.5,
            0.8 + t * 0.3 + dry, 0.85 + t * 0.25 + dry * 0.6, 0.78 + rnd() * 0.25]);
        }
        // Blumen und Pilze
        for (let i = 0; i < r.w / 16 * q * flowerRate; i++) {
          const k = Math.floor(rnd() * 4), hgt = 6 + rnd() * 9, s = 3.2 + rnd() * 2.6;
          const fx = r.x + rnd() * r.w, fz = -2 - Math.pow(rnd(), 1.4) * (DEPTH - 40);
          flowers[k].push([fx, -r.y + hgt, fz, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 0.4, s, s, s]);
          stems.push([fx, -r.y + hgt / 2, fz - 0.3, 0, 0, (rnd() - 0.5) * 0.15, 0.35, hgt, 0.35]);
        }
        for (let i = 0; i < r.w / 60 * shroomRate * (0.5 + q * 0.5); i++) {
          const s = 1.6 + rnd() * 2.8, x0 = r.x + rnd() * r.w, z0 = -3 - Math.pow(rnd(), 1.3) * (DEPTH - 30);
          for (let j = 0, m = 1 + Math.floor(rnd() * 3); j < m; j++) {
            const ss = s * (0.6 + rnd() * 0.5);
            shrooms.push([x0 + (rnd() - 0.5) * 9, -r.y, z0 + (rnd() - 0.5) * 9, (rnd() - 0.5) * 0.3, rnd() * 6.3, (rnd() - 0.5) * 0.3, ss, ss * (0.8 + rnd() * 0.5), ss]);
          }
        }
        for (let i = 0; i < r.w / 45; i++) {
          const s = 3 + Math.pow(rnd(), 3) * 30;
          stones.push([r.x + rnd() * r.w, -r.y + s * 0.12, -40 - rnd() * (DEPTH - 50), rnd() * 3, rnd() * 3, rnd() * 3, s, s * 0.7, s]);
        }
        for (let i = 0; i < r.w / 14 * q; i++) {
          const s = 1 + rnd() * 2.6;
          pebbles.push([r.x + rnd() * r.w, -r.y + s * 0.2, -4 - rnd() * (DEPTH - 10), rnd() * 3, rnd() * 3, rnd() * 3, s, s * 0.6, s]);
        }
        // Pflanzen und Büsche aus Blattbüscheln
        for (let i = 0; i < r.w / 28 * q; i++) {
          const s = 9 + rnd() * 22, z = -14 - Math.pow(rnd(), 0.7) * (DEPTH - 40);
          plants.push([r.x + rnd() * r.w, -r.y + s * 0.38, z, (rnd() - 0.5) * 0.4, rnd() * 6.3, (rnd() - 0.5) * 0.3, s, s * 0.8, s]);
        }
        // Laub und Zweige am Boden
        for (let i = 0; i < r.w / 6 * q; i++) {
          const s = 3 + rnd() * 5;
          litter.push([r.x + rnd() * r.w, -r.y + 0.4, -3 - rnd() * (DEPTH - 6), -Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, rnd() * 6.3, s, s, 1]);
        }
        for (let i = 0; i < r.w / 55 * q; i++) {
          const L = 8 + rnd() * 18;
          twigs.push([r.x + rnd() * r.w, -r.y + 0.6, -6 - rnd() * (DEPTH - 12), Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, rnd() * 6.3, 0.5 + rnd() * 0.4, L, 0.5 + rnd() * 0.4]);
        }
        // Steine, die aus der Erdwand ragen
        const hv = Math.min(r.h, 700);
        for (let i = 0; i < (r.w * hv) / 11000; i++) {
          const s = 2.5 + Math.pow(rnd(), 2.6) * 13, yy = r.y + s + 10 + Math.pow(rnd(), 1.2) * Math.max(0, hv - s - 20);
          wallStones.push([r.x + 4 + rnd() * (r.w - 8), -yy, -6 - rnd() * 2, rnd() * 3, rnd() * 3, rnd() * 3, s * (0.8 + rnd() * 0.5), s * (0.55 + rnd() * 0.35), s * 0.5]);
        }
      }
      this.instanced(this.grassClump(g0, g1, rnd), this.grassMaterial(), grass);
      const rockGeo = new THREE.IcosahedronGeometry(1, 2);
      const rp = rockGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
        const s = 0.78 + FF.noise1(x * 2.1 + y * 3.3 + z * 1.7, 11) * 0.4;
        rp.setXYZ(i, x * s, y * s, z * s);
      }
      rockGeo.computeVertexNormals();
      this.instanced(rockGeo, mats.stone, stones, { cast: true });
      const wallStone = weatherSurface(mats.stone.clone(), this.wu, { wet: 1, puddle: 0, snow: 0.6 });
      wallStone.color = col(tn.stone).multiplyScalar(0.62);
      this.instanced(rockGeo, wallStone, wallStones);
      this.instanced(new THREE.IcosahedronGeometry(1, 0), mats.stone, pebbles);
      const card = new THREE.PlaneGeometry(1, 1);
      this.instanced(card, this.foliage(mats.plant.clone(), this.photo ? tn.recolor : 0, 1.2), plants);
      // Blumen: Blüte als Karte, Stiel als dünner Zylinder bis zum Boden
      flowers.forEach((list, k) => { if (list.length) this.instanced(card, this.flowerMaterial(k), list); });
      if (stems.length) this.instanced(new THREE.CylinderGeometry(1, 1, 1, 4), this.foliage(new THREE.MeshStandardMaterial({ color: col(tn.grass[0]).multiplyScalar(1.3), roughness: 0.8 }), 0), stems);
      if (shrooms.length) this.instanced(this.mushroomGeometry(), weatherSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), this.wu, { wet: 0.6, puddle: 0, snow: 0.8 }), shrooms, { cast: true });
      const leafMat = this.foliage(mats.plant.clone(), this.photo ? Math.max(0.6, tn.recolor) : 0);
      leafMat.color = col(this.th.tree === 'autumn' ? '#e08a40' : tn.leaf).multiplyScalar(0.8);
      this.instanced(card, leafMat, litter);
      this.instanced(new THREE.CylinderGeometry(1, 1, 1, 4), mats.twig, twigs);

      // Hängende Wurzeln an freien Kanten
      const roots = [];
      for (const r of tops) {
        for (const side of [-1, 1]) {
          if (covered(r, side) || r.h < 40) continue;
          const x0 = side < 0 ? r.x : r.x + r.w;
          for (let i = 0; i < 3; i++) {
            const len = 14 + rnd() * Math.min(60, r.h * 0.35), zz = -4 - rnd() * 30;
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
        this.scene.add(new THREE.Mesh(THREE.mergeGeometries(roots), mats.root));
        roots.forEach((x) => x.dispose());
      }
    }

    // Ein Grasbüschel: 7 schmale, gebogene Halme mit Farbverlauf. y läuft von 0 bis 1 (Höhe kommt über die Instanz),
    // x/z sind Weltmaß. Normale halb nach oben, damit die Halme weich beleuchtet wirken.
    grassClump(g0, g1, rnd) {
      const THREE = this.THREE;
      const pos = [], nor = [], colr = [], idx = [];
      const SEG = 5;
      for (let b = 0; b < 7; b++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 2.2;
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr * 0.7;
        const face = rnd() * Math.PI * 2, fx = Math.cos(face), fz = Math.sin(face);
        const lean = 0.8 + rnd() * 3.2, hb = 0.55 + rnd() * 0.45, w = 0.55 + rnd() * 0.45;
        const tone = rnd(), dry = rnd() < 0.15;
        const c0 = g0.clone().multiplyScalar(0.55 + tone * 0.2);
        const c1 = (dry ? g1.clone().lerp(col('#c8b77a'), 0.6) : g1.clone()).multiplyScalar(0.85 + tone * 0.3);
        const start = pos.length / 3;
        for (let i = 0; i <= SEG; i++) {
          const t = i / SEG, wt = w * (1 - Math.pow(t, 1.4)) + 0.04;
          const cx = bx + fx * lean * t * t, cz = bz + fz * lean * t * t, y = hb * t;
          const px = -fz, pz = fx;   // quer zur Neigung
          pos.push(cx + px * wt / 2, y, cz + pz * wt / 2, cx - px * wt / 2, y, cz - pz * wt / 2);
          for (let k = 0; k < 2; k++) nor.push(fx * 0.6, 0.8, fz * 0.6);
          const c = c0.clone().lerp(c1, Math.pow(t, 0.75));
          colr.push(c.r, c.g, c.b, c.r, c.g, c.b);
          if (i < SEG) { const v = start + i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
      geo.setIndex(idx);
      return geo;
    }

    // Gras: Wind mit Böen, die als Welle über die Wiese laufen; Licht scheint durch die Halme;
    // bei Schnee werden die Spitzen weiß und die Halme drücken sich nieder.
    grassMaterial() {
      const THREE = this.THREE, wu = this.wu;
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62 });
      return patch(m, 'grass2', (sh) => {
        Object.assign(sh.uniforms, { wTime: wu.wTime, wWind: wu.wWind, wSnow: wu.wSnow, wWet: wu.wWet, wSun: wu.wSun });
        sh.vertexShader = 'uniform float wTime;\nuniform float wWind;\nuniform float wSnow;\nvarying float vGH;\n' + sh.vertexShader
          .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.5));`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            {
              float gh = position.y;
              vec3 ip = instanceMatrix[3].xyz;
              float gust = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(ip.x * 0.004 - wTime * 1.15) + 0.3 * sin(ip.x * 0.0013 + ip.z * 0.01 - wTime * 0.55));
              float ph = ip.x * 0.031 + ip.z * 0.017;
              float bend = (sin(wTime * 1.7 + ph) * 0.3 + sin(wTime * 4.6 + ph * 2.7) * 0.07 + 0.2 + gust * 0.9) * wWind;
              vec3 wd = transpose(mat3(instanceMatrix)) * vec3(1.0, 0.0, 0.0);
              transformed.xz += normalize(wd.xz + 1e-5) * bend * gh * gh * 5.5;
              transformed.y *= 1.0 - wSnow * 0.35 - min(bend, 1.4) * 0.1 * gh;
              vGH = gh;
            }`);
        sh.fragmentShader = 'uniform float wSnow;\nuniform float wWet;\nuniform vec3 wSun;\nvarying float vGH;\n' + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
            diffuseColor.rgb *= mix(1.0, 0.7, wWet);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), wSnow * smoothstep(0.25, 0.85, vGH) * 0.85);`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
            roughnessFactor = mix(roughnessFactor, 0.3, wWet);`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += diffuseColor.rgb * wSun * (0.25 + vGH * 0.75);`);
      });
    }

    // Blüten als kleine gemalte Texturen (weiß, lila, gelb, Mohn)
    flowerMaterial(k) {
      const THREE = this.THREE;
      this.flowerTex = this.flowerTex || [];
      if (!this.flowerTex[k]) {
        const [petal, mid] = [['#f6f2e8', '#f0c93a'], ['#b996e0', '#f4d564'], ['#f2c43c', '#9a5a22'], ['#d9483a', '#2a1c16']][k];
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const x = c.getContext('2d');
        x.translate(32, 32);
        const n = k === 3 ? 4 : 5 + (k === 1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          x.rotate((Math.PI * 2) / n);
          const gr = x.createLinearGradient(0, 0, 0, -28);
          gr.addColorStop(0, petal); gr.addColorStop(1, petal);
          x.fillStyle = gr;
          x.beginPath(); x.ellipse(0, -15, k === 3 ? 13 : 8, 15, 0, 0, Math.PI * 2); x.fill();
          x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 1; x.stroke();
        }
        x.fillStyle = mid; x.beginPath(); x.arc(0, 0, k === 3 ? 7 : 6, 0, Math.PI * 2); x.fill();
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        this.flowerTex[k] = t;
      }
      const m = new THREE.MeshStandardMaterial({ map: this.flowerTex[k], alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
      return this.foliage(m, 0, 0.5);
    }

    // Pilz: Hut (halbe Kugel, rot oder braun) und heller Stiel, als eine Geometrie mit Farben
    mushroomGeometry() {
      const THREE = this.THREE;
      const red = this.level3dTheme === 'autumn' || this.level3dTheme === 'garden';
      const cap = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      cap.scale(1, 0.62, 1); cap.translate(0, 1.15, 0);
      const stem = new THREE.CylinderGeometry(0.28, 0.36, 1.2, 8);
      stem.translate(0, 0.6, 0);
      const paint = (geo, hex, dots) => {
        const p = geo.attributes.position, c = [], base = col(hex), white = col('#f4ecdc');
        for (let i = 0; i < p.count; i++) {
          const spot = dots && FF.noise1(p.getX(i) * 3.1 + p.getZ(i) * 2.3, 21) > 0.72;
          const k = spot ? white : base;
          c.push(k.r, k.g, k.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        return geo.toNonIndexed();
      };
      return THREE.mergeGeometries([paint(cap, red ? '#b4321f' : '#8a5a34', red), paint(stem, '#e8dcc4', false)]);
    }

    // ------------------------------------------------------------ Hintergrund
    buildBackground(g, rnd) {
      const THREE = this.THREE, th = this.th, L = g.L, q = this.q, mats = this.mats;
      const ground = -(L.spawn[1] + 40);
      const far = new THREE.PlaneGeometry(L.width + 20000, 9000, 1, 1);
      far.rotateX(-Math.PI / 2);
      far.translate(L.width / 2, ground - 60, -DEPTH - 4500);
      const fuv = far.attributes.uv;
      for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 140, fuv.getY(i) * 60);
      const farMat = weatherSurface(mats.top.clone(), this.wu, { wet: 0.6, puddle: 0, snow: 1 }); farMat.vertexColors = false; farMat.normalMap = null;
      this.scene.add(new THREE.Mesh(far, farMat));
      const back = new THREE.PlaneGeometry(L.width + 20000, 7000, 1, 1);
      back.translate(L.width / 2, ground - 60 - 3500, -DEPTH - 700);
      const buv = back.attributes.uv;
      for (let i = 0; i < buv.count; i++) buv.setXY(i, buv.getX(i) * 80, buv.getY(i) * 28);
      const backMat = mats.wall.clone(); backMat.vertexColors = false; backMat.color = col('#4a4440');
      this.scene.add(new THREE.Mesh(back, backMat));
      for (const [z, hgt, color, seed] of [[-7000, 2600, th.far, 3], [-4600, 1500, th.far2, 9]]) {
        const shape = new THREE.Shape();
        const x0 = -6000, x1 = L.width + 6000;
        shape.moveTo(x0, ground - 400);
        for (let x = x0; x <= x1; x += 100) shape.lineTo(x, ground + (FF.noise1(x * 0.0009, seed) * 0.75 + FF.noise1(x * 0.004, seed + 2) * 0.2 + FF.noise1(x * 0.02, seed + 5) * 0.05) * hgt);
        shape.lineTo(x1, ground - 400);
        const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col(color) }));
        m.position.z = z;
        this.scene.add(m);
      }

      // Bäume: Stämme pro Abschnitt zusammengefasst, Kronen aus Foto-Blattbüscheln
      const kind = th.tree;
      const trunksByChunk = new Map(), leaves = [];
      const addGeo = (x, geo) => {
        const k = Math.floor(x / CH);
        if (!trunksByChunk.has(k)) trunksByChunk.set(k, []);
        trunksByChunk.get(k).push(geo);
      };
      const leafScale = this.photo ? 1.5 : 1;
      const addTree = (x, z, H) => {
        const bx = x, by = ground - 30, bz = z;
        const bend = (rnd() - 0.5) * H * 0.12;
        const tr = new THREE.CylinderGeometry(H * 0.02, H * 0.042, H, 9, 10, true);
        tr.translate(0, H / 2, 0);
        const tp = tr.attributes.position;
        for (let i = 0; i < tp.count; i++) {
          const y = tp.getY(i) / H;
          tp.setX(i, tp.getX(i) * (1 + Math.max(0, 0.08 - y) * 4) + bend * y * y);
          tp.setZ(i, tp.getZ(i) * (1 + Math.max(0, 0.08 - y) * 4));
        }
        tr.translate(bx, by, bz);
        const uv = tr.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * H / 160);
        tr.computeVertexNormals();
        addGeo(x, tr);
        const clusters = [[bx + bend, by + H, bz, 1]];
        if (kind !== 'pine') {
          for (let b = 0; b < 6; b++) {
            const y0 = H * (0.4 + rnd() * 0.45), ang = rnd() * Math.PI * 2;
            const sx = bx + bend * (y0 / H) ** 2, sy = by + y0;
            const len = H * (0.2 + rnd() * 0.22);
            const ex = sx + Math.cos(ang) * len, ey = sy + len * 0.55, ez = bz + Math.sin(ang) * len * 0.7;
            const br = new THREE.CylinderGeometry(H * 0.005, H * 0.013, len * 1.15, 5, 1, true);
            br.translate(0, len * 0.57, 0);
            br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ex - sx, ey - sy, ez - bz).normalize()));
            br.translate(sx, sy, bz);
            addGeo(x, br);
            clusters.push([ex, ey, ez, 0.8]);
          }
          for (const [cx, cy, cz, k] of clusters) {
            const n = Math.round(14 * Math.max(0.5, q) * k);
            const rad = H * (0.12 + rnd() * 0.05);
            for (let i = 0; i < n; i++) {
              const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rad, yy = (rnd() - 0.35) * rad * 0.8;
              const s = H * 0.15 * leafScale * (0.7 + rnd() * 0.5);
              leaves.push([cx + Math.cos(a) * r, cy + yy, cz + Math.sin(a) * r * 0.8, (rnd() - 0.5) * 1.2, rnd() * 6.3, rnd() * 6.3, s, s, s]);
            }
          }
        } else {
          for (let t = 0; t < 12; t++) {
            const y = by + H * (0.22 + t * 0.068), rad = H * 0.25 * (1 - t / 12.5);
            for (let i = 0; i < 14 * Math.max(0.6, q); i++) {
              const a = rnd() * Math.PI * 2, r = rad * Math.sqrt(rnd()), s = H * (0.11 + rnd() * 0.05) * leafScale;
              leaves.push([bx + bend * ((y - by) / H) ** 2 + Math.cos(a) * r, y - r * 0.3, bz + Math.sin(a) * r * 0.8, (rnd() - 0.5) * 0.8 - 0.4, rnd() * 6.3, rnd() * 6.3, s, s, s]);
            }
          }
        }
      };
      const bands = [[-420, -760, 280, 560, 0.85], [-1000, -1900, 420, 950, 0.6], [-2600, -4000, 550, 1300, 0.4]];
      for (const [z0, z1, h0, h1, dens] of bands) {
        const step = 330 / dens;
        for (let x = -900; x < L.width + 900; x += step * (0.6 + rnd() * 0.8)) {
          if (rnd() < 0.2) continue;
          addTree(x, z0 + (z1 - z0) * rnd(), h0 + (h1 - h0) * rnd());
        }
      }
      for (const geos of trunksByChunk.values()) {
        this.scene.add(new THREE.Mesh(THREE.mergeGeometries(geos), mats.bark));
        geos.forEach((x) => x.dispose());
      }
      const card = new THREE.PlaneGeometry(1, 1);
      this.instanced(card, this.foliage(mats.leaf.clone(), this.photo ? this.tint.recolor : 0, 5), leaves, { receive: false });

      // Lichtbahnen durch den Wald
      this.shafts = [];
      if (th.rays && this.quality !== 'low') {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 256;
        const x = c.getContext('2d');
        const gh = x.createLinearGradient(0, 0, 64, 0);
        gh.addColorStop(0, 'rgba(255,255,255,0)'); gh.addColorStop(0.5, 'rgba(255,255,255,1)'); gh.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gh; x.fillRect(0, 0, 64, 256);
        x.globalCompositeOperation = 'destination-in';
        const gv = x.createLinearGradient(0, 0, 0, 256);
        gv.addColorStop(0, 'rgba(0,0,0,0)'); gv.addColorStop(0.25, 'rgba(0,0,0,1)'); gv.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gv; x.fillRect(0, 0, 64, 256);
        const tex = new THREE.CanvasTexture(c);
        const ang = Math.atan2(this.sunDir.x, this.sunDir.y);
        for (let X = 0; X < L.width; X += 380 + rnd() * 500) {
          const mat = new THREE.MeshBasicMaterial({ map: tex, color: col(`rgb(${th.light})`), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
          const m = new THREE.Mesh(new THREE.PlaneGeometry(120 + rnd() * 160, 2600), mat);
          m.position.set(X, ground + 700, -260 - rnd() * 700);
          m.rotation.z = -ang * 0.85;
          m.userData = { base: (0.05 + rnd() * 0.06) * th.rays, ph: rnd() * 6.3 };
          this.scene.add(m);
          this.shafts.push(m);
        }
      }

      // Vordergrund nah an der Kamera (unscharf im hohen Modus)
      this.fg = null;
      if (this.quality !== 'low') {
        const fgM = this.foliage(mats.plant.clone(), this.photo ? this.tint.recolor : 0, 3);
        fgM.color = col('#2c2c2c');
        fgM.emissive = col('#000000');
        const pos = [];
        for (let x = -600; x < L.width + 600; x += 380 + rnd() * 520) {
          const n = 3 + Math.floor(rnd() * 4);
          for (let i = 0; i < n; i++) {
            const s = 28 + rnd() * 32;
            pos.push([x + (rnd() - 0.5) * 90, (rnd() - 0.8) * 30, 560 + rnd() * 120, -0.3 + rnd() * 0.6, 0, rnd() * 6.3, s, s * 1.5, s]);
          }
        }
        this.fg = new THREE.Group();
        this.scene.add(this.fg);
        this.instanced(card, fgM, pos, { receive: false, parent: this.fg });
      }
    }

    // ------------------------------------------------------------ Gegenstände
    buildProps(g, rnd) {
      const THREE = this.THREE, T = this.tex, th = this.th, W = g.world, mats = this.mats;
      const wood = mats.wood;
      this.waterMats = [];
      for (const w of W.water) {
        const surf = new THREE.PlaneGeometry(w.w, DEPTH + 6, 1, 1);
        surf.rotateX(-Math.PI / 2);
        surf.translate(w.x + w.w / 2, -w.y, -DEPTH / 2 + 3);
        const uv = surf.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w.w / 120, uv.getY(i) * DEPTH / 120);
        const n = mats.waterN.clone(); n.needsUpdate = true; n.wrapS = n.wrapT = THREE.RepeatWrapping;
        const mat = new THREE.MeshPhysicalMaterial({ color: col(th.water[1]), roughness: 0.04, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), transparent: true, opacity: 0.88, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.08 });
        this.waterMats.push(mat);
        const m = new THREE.Mesh(surf, mat);
        m.receiveShadow = true;
        this.scene.add(m);
        const fh = Math.min(w.h, 700);
        const front = new THREE.PlaneGeometry(w.w, fh, 1, 8);
        front.translate(w.x + w.w / 2, -w.y - fh / 2, 6);
        const fc = [], c1 = col(th.water[1]), c2 = col(th.water[2]);
        const fp = front.attributes.position;
        for (let i = 0; i < fp.count; i++) { const k = Math.min(1, (-fp.getY(i) - w.y) / 70); const c = c1.clone().multiplyScalar(0.6).lerp(c2, k); fc.push(c.r, c.g, c.b); }
        front.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
        this.scene.add(new THREE.Mesh(front, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.96, depthWrite: false })));
      }
      const thorns = [];
      for (const t of W.thorns) {
        for (let i = 0; i < Math.max(8, t.w / 5); i++) {
          let x = t.x + rnd() * t.w, y = t.y + t.h, z = -30 + rnd() * 34;
          const pts = [new THREE.Vector3(x, -y, z)];
          for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 16; y -= Math.max(3, t.h * 0.15) + rnd() * 6; z += (rnd() - 0.5) * 8; pts.push(new THREE.Vector3(x, -y, z)); }
          const c = new THREE.CatmullRomCurve3(pts);
          thorns.push(new THREE.TubeGeometry(c, 16, 1.1, 5, false));
          for (let k = 0; k < 10; k++) {
            const p = c.getPoint(rnd()), cone = new THREE.ConeGeometry(0.8, 6, 4);
            cone.rotateZ((rnd() - 0.5) * 3); cone.rotateX((rnd() - 0.5) * 2);
            cone.translate(p.x, p.y, p.z);
            thorns.push(cone);
          }
        }
      }
      if (thorns.length) {
        const m = new THREE.Mesh(THREE.mergeGeometries(thorns), new THREE.MeshStandardMaterial({ color: col('#2b1a16'), roughness: 0.6 }));
        m.castShadow = true;
        this.scene.add(m);
        thorns.forEach((x) => x.dispose());
      }
      for (const a of W.anchors) {
        if (a.post) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 26, 10), wood);
          post.position.set(a.x, -(a.y + 10), 0);
          post.castShadow = true;
          this.scene.add(post);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.9, 8, 18), mats.metal);
          ring.rotation.x = Math.PI / 2; ring.position.set(a.x, -(a.y + 2), 0);
          this.scene.add(ring);
        } else {
          const start = new THREE.Vector3(a.x - 70, -(a.y - 14), -150), end = new THREE.Vector3(a.x + 16, -(a.y - 9), ZP);
          const c = new THREE.CatmullRomCurve3([start, new THREE.Vector3(a.x - 30, -(a.y - 4), -60), end]);
          const br = new THREE.Mesh(new THREE.TubeGeometry(c, 20, 3, 8, false), mats.bark);
          br.castShadow = true;
          this.scene.add(br);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1, 10, 20), mats.metal);
          ring.position.set(a.x, -(a.y + 1), ZP);
          this.scene.add(ring);
          const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7, 6), mats.metal);
          hook.position.set(a.x, -(a.y - 5.5), ZP);
          this.scene.add(hook);
          const lg = new THREE.PlaneGeometry(30, 30);
          for (let i = 0; i < 7; i++) {
            const l = new THREE.Mesh(lg, mats.leaf);
            l.position.copy(c.getPoint(0.2 + rnd() * 0.7)).add(new THREE.Vector3((rnd() - 0.5) * 12, 6 + rnd() * 8, (rnd() - 0.5) * 20));
            l.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
            this.scene.add(l);
          }
        }
      }
      for (const s of g.signs) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 34, 8), wood);
        post.position.set(s.x, -(s.y - 15), -14);
        const board = new THREE.Mesh(new THREE.BoxGeometry(34, 20, 3), wood);
        board.position.set(s.x, -(s.y - 34), -12);
        board.rotation.z = (rnd() - 0.5) * 0.12;
        for (const m of [post, board]) { m.castShadow = true; this.scene.add(m); }
      }
      this.lanterns = g.checkpoints.map((cp) => {
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 46, 8), wood);
        pole.position.set(0, 23, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 2.4), wood);
        arm.position.set(6, 45, 0);
        const glassMat = new THREE.MeshStandardMaterial({ color: col('#8a8170'), emissive: col('#ffb25a'), emissiveIntensity: 0, roughness: 0.3, transparent: true, opacity: 0.85 });
        const glass = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 9), glassMat);
        glass.position.set(12, 33, 0);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2, 10.5), new THREE.MeshStandardMaterial({ color: col('#2c241c'), roughness: 0.6, metalness: 0.4 }));
        frame.position.set(12, 39.5, 0);
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col('#ffbf6a'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.position.set(12, 33, 2); halo.scale.set(110, 110, 1);
        grp.add(pole, arm, glass, frame, halo);
        grp.position.set(cp.x, -cp.y, -10);
        grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(grp);
        return { glassMat, halo };
      });
      const goal = new THREE.Group();
      const ball = this.yarnBall(24, [FF.COLORS[0], FF.COLORS[1], '#e9d6b2'], 34, 0.9, rnd);
      ball.position.set(0, 24, 0);
      goal.add(ball);
      const gh = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col(`rgb(${th.light})`), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      gh.position.set(0, 24, -8); gh.scale.set(190, 190, 1);
      goal.add(gh);
      goal.position.set(g.goal.x, -g.goal.y, -8);
      this.scene.add(goal);
      this.goal = { grp: goal, ball, halo: gh };
      const beadGeo = new THREE.SphereGeometry(4.3, 18, 12);
      this.beads = g.beads.map((b) => {
        const m = new THREE.Mesh(beadGeo, new THREE.MeshStandardMaterial({ color: col('#f4c95d'), emissive: col('#ffcf5a'), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2, transparent: true }));
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: col('#ffe2a0'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.set(34, 34, 1);
        m.add(halo);
        m.position.set(b.x, -b.y, ZP);
        this.scene.add(m);
        return m;
      });
      this.crates = W.crates.map((c) => {
        const grp = new THREE.Group();
        const mat = c.heavy ? wood.clone() : wood;
        if (c.heavy) mat.color = col('#8a7a6a');
        grp.add(new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, 36), mat));
        // Bretter vorne
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(c.w - 4, c.h / 3 - 2.5, 2), wood);
          b.position.set(0, -c.h / 3 + i * c.h / 3, 18.5);
          grp.add(b);
        }
        const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(c.w, c.h) * 0.92, 4, 2), wood);
        brace.rotation.z = Math.atan2(c.h, c.w); brace.position.z = 20;
        grp.add(brace);
        if (c.heavy) {
          const metalC = new THREE.MeshStandardMaterial({ color: col('#9aa0a3'), roughness: 0.4, metalness: 0.85 });
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const k = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 40), metalC);
            k.position.set(sx * (c.w / 2 - 4), sy * (c.h / 2 - 4), 0);
            grp.add(k);
          }
        }
        grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(grp);
        return grp;
      });
    }

    yarnMaterial(color) {
      const THREE = this.THREE, T = this.tex;
      return new THREE.MeshPhysicalMaterial({
        color: col(color), roughness: 0.8, sheen: 1, sheenRoughness: 0.5, sheenColor: col(color).lerp(col('#ffffff'), 0.55),
        map: T.yarn.map, normalMap: T.yarn.normal, normalScale: new THREE.Vector2(1, 1),
      });
    }

    // Flaum: abstehende Fasern als durchbrochene Hülle
    fuzzMaterial(color) {
      const THREE = this.THREE;
      if (!this.fuzzTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const x = c.getContext('2d');
        const rnd = FF.rng(3);
        x.strokeStyle = '#fff'; x.lineWidth = 1;
        for (let i = 0; i < 500; i++) {
          const px = rnd() * 128, py = rnd() * 128, a = rnd() * 6.3, l = 2 + rnd() * 5;
          x.globalAlpha = 0.5 + rnd() * 0.5;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
        }
        this.fuzzTex = new THREE.CanvasTexture(c);
        this.fuzzTex.wrapS = this.fuzzTex.wrapT = THREE.RepeatWrapping;
        this.fuzzTex.repeat.set(3, 3);
      }
      return new THREE.MeshStandardMaterial({ color: col(color).lerp(col('#ffffff'), 0.15), alphaMap: this.fuzzTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    }

    yarnBall(r, colors, n, thick, rnd, scale) {
      const THREE = this.THREE;
      const grp = new THREE.Group();
      const sc = scale || [1, 1, 1];
      const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.96, 22, 16), this.yarnMaterial(colors[colors.length - 1]));
      core.scale.set(sc[0], sc[1], sc[2]);
      grp.add(core);
      const byColor = colors.map(() => []);
      const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        E.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3); Q.setFromEuler(E);
        const pts = [];
        for (let k = 0; k < 22; k++) {
          const a = (k / 22) * Math.PI * 2;
          V.set(Math.cos(a), Math.sin(a), 0).applyQuaternion(Q);
          pts.push(new THREE.Vector3(V.x * r * sc[0], V.y * r * sc[1], V.z * r * sc[2]));
        }
        byColor[i % colors.length].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, thick, 5, true));
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
        const mat = this.mats.yarn[id];
        const root = new THREE.Group();
        const turn = new THREE.Group();
        root.add(turn);
        const body = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), this.mats.yarnDark[id]);
        core.scale.set(4.5, 7.3, 4.1);
        body.add(core, this.bodyWraps(id, rnd));
        const head = this.yarnBall(6.2, [FF.COLORS[id], FF.COLORS_DARK[id]], 20, 0.62, rnd);
        if (this.quality !== 'low') {
          const fz = this.fuzzMaterial(FF.COLORS[id]);
          head.add(new THREE.Mesh(new THREE.SphereGeometry(6.9, 18, 14), fz));
          const bf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fz);
          bf.scale.set(5.3, 8.1, 4.9);
          body.add(bf);
        }
        turn.add(body, head);
        const eyeW = new THREE.MeshStandardMaterial({ color: col('#fbf4e6'), emissive: col('#fff6e0'), emissiveIntensity: 0.5, roughness: 0.25 });
        const eyeB = new THREE.MeshStandardMaterial({ color: col('#140d10'), roughness: 0.15 });
        const eyes = [];
        for (const z of [2.3, -2.3]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 10), eyeW);
          const pu = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), eyeB);
          pu.position.set(1.0, 0, 0);
          e.add(pu);
          head.add(e);
          e.position.set(5.2, 0.6, z);
          eyes.push(e);
        }
        const curl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          new THREE.Vector3(-1, 5.6, 0), new THREE.Vector3(-4, 10, 0.5), new THREE.Vector3(-8.5, 9.5, 0), new THREE.Vector3(-10, 6.5, -0.5),
        ]), 20, 0.55, 5, false), mat);
        head.add(curl);
        const limbGeo = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
        limbGeo.translate(0, 0.5, 0);
        const limbs = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(limbGeo, mat); turn.add(m); return m; });
        const endGeo = new THREE.SphereGeometry(1.5, 10, 8);
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
      const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
      for (let i = 0; i < 22; i++) {
        E.set((rnd() - 0.5) * 1.3 + Math.PI / 2, rnd() * 6.3, (rnd() - 0.5) * 1.3); Q.setFromEuler(E);
        const pts = [];
        for (let k = 0; k < 18; k++) {
          const a = (k / 18) * Math.PI * 2;
          V.set(Math.cos(a), Math.sin(a), 0).applyQuaternion(Q);
          pts.push(new THREE.Vector3(V.x * 4.8, V.y * 7.6, V.z * 4.4));
        }
        sets[i % 3 === 0 ? 1 : 0].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.6, 5, true));
      }
      sets.forEach((geos, k) => {
        grp.add(new THREE.Mesh(THREE.mergeGeometries(geos), k ? this.mats.yarnDark[id] : this.mats.yarn[id]));
        geos.forEach((x) => x.dispose());
      });
      return grp;
    }

    poseYarny(y, p, g, dt) {
      const show = !p.merged;
      y.root.visible = show;
      if (!show) return;
      for (const l of y.limbs) l.visible = true;
      for (const e of y.ends) e.visible = true;
      y.root.scale.set(1, 1, 1);
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
      y.head.position.set(0.4, shY + 7 + (moving ? Math.abs(sw) * 0.8 : 0), 0);
      const blink = p.blink < 0 ? 0.15 : 1;
      for (const e of y.eyes) e.scale.set(1, blink, 1);
      y.curl.rotation.z = Math.sin(this.clock * 3 + p.id) * 0.12;
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
      const { A, B, D, Y } = this.tmp;
      const seg = (m, e, ax, ay, b, z, r) => {
        A.set(ax, ay, z); B.set(b[0], b[1], z);
        D.subVectors(B, A);
        const len = Math.max(0.1, D.length());
        m.position.copy(A);
        m.quaternion.setFromUnitVectors(Y, D.multiplyScalar(1 / len));
        m.scale.set(r, len, r);
        e.position.copy(B);
      };
      seg(y.limbs[0], y.ends[0], -1, hipY, L1, 1.7, 1.15);
      seg(y.limbs[1], y.ends[1], 1, hipY, L2, -1.7, 1.15);
      seg(y.limbs[2], y.ends[2], 0, sh, A1, 3.2, 0.95);
      seg(y.limbs[3], y.ends[3], 0, sh, A2, -3.2, 0.95);
      y.shY = shY; y.lean = lean;
    }

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
    // Durchhängende Kurve durch die Seilpunkte in den Puffer schreiben (wie im 2D-Renderer)
    ropePoints(pts2d, slack, sagK) {
      const out = this.ropeBuf, max = out.length / 3;
      let total = 0, n = 0;
      for (let i = 1; i < pts2d.length; i++) total += Math.hypot(pts2d[i][0] - pts2d[i - 1][0], pts2d[i][1] - pts2d[i - 1][1]);
      out[0] = pts2d[0][0]; out[1] = -pts2d[0][1]; out[2] = ZP; n = 1;
      for (let i = 1; i < pts2d.length && n < max; i++) {
        const ax = pts2d[i - 1][0], ay = pts2d[i - 1][1], bx = pts2d[i][0], by = pts2d[i][1];
        const L = Math.hypot(bx - ax, by - ay);
        const share = total > 0 ? (slack * L) / total : 0;
        const sag = Math.sqrt(Math.max(0, share) * Math.max(L, 1)) * sagK;
        const segs = Math.max(2, Math.min(40, Math.round(L / 7)));
        const mx = (ax + bx) / 2, my = (ay + by) / 2 + sag;
        for (let k = 1; k <= segs && n < max; k++) {
          const t = k / segs;
          out[n * 3] = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
          out[n * 3 + 1] = -((1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by);
          out[n * 3 + 2] = ZP + Math.sin(t * Math.PI) * 1.2;
          n++;
        }
      }
      return n;
    }

    rope(i, pts2d, slack, sagK, mat, radius) {
      const r = this.ropes[i];
      if (!r) return;
      r.mesh.material = mat;
      r.update(this.ropeBuf, this.ropePoints(pts2d, slack, sagK), radius, 0.08);
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
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.8, sheen: 1, sheenRoughness: 0.5, sheenColor: col('#ffffff'), normalMap: this.tex.yarn.normal });
    }

    // ------------------------------------------------------------ Wetter-Partikel
    // Regen und Schnee laufen komplett auf der Grafikkarte: Jedes Teilchen hat eine feste Zufallslage, die mit der Zeit
    // fällt und in ein Fenster um die Kamera gefaltet wird. In der Welt verankert, darum stimmt die Bewegung beim Laufen.
    buildPrecip(g, rnd) {
      const THREE = this.THREE;
      const scale = this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.65 : 0.35;
      const quad = new THREE.PlaneGeometry(1, 1);
      const inst = (count, size, fill) => {
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = quad.index;
        geo.setAttribute('position', quad.attributes.position);
        geo.setAttribute('uv', quad.attributes.uv);
        const a = new Float32Array(count * size);
        for (let i = 0; i < count; i++) fill(a, i * size, i);
        geo.setAttribute('seed', new THREE.InstancedBufferAttribute(a, size));
        geo.instanceCount = 0;
        return geo;
      };
      const pu = this.pu = {
        time: this.wu.wTime, cpos: { value: new THREE.Vector3() }, area: { value: new THREE.Vector2(1000, 600) },
        wind: { value: 0 }, color: { value: new THREE.Color(0.8, 0.85, 0.92) }, alpha: { value: 0.4 },
      };
      const shader = (snow) => new THREE.ShaderMaterial({
        defines: { SNOW: snow ? 1 : 0 }, uniforms: pu, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `
          attribute vec4 seed; uniform float time; uniform vec3 cpos; uniform vec2 area; uniform float wind;
          varying vec2 vUv; varying float vF;
          void main(){
            vUv = uv;
            float z = mix(-220.0, cpos.z * 0.55, seed.z * seed.z * seed.z);
            float k = (cpos.z - z) / cpos.z;
            vec2 A = area * k * 1.2;
          #if SNOW
            vec2 vel = vec2(wind * 70.0 + sin(time * 0.6 + seed.w * 30.0) * 16.0, -(50.0 + 45.0 * seed.w));
          #else
            vec2 vel = vec2(wind * 330.0, -(1150.0 + 450.0 * seed.w));
          #endif
            vec2 wp = seed.xy * vec2(9000.0, 7000.0) + vel * time;
            vec2 rel = mod(wp - cpos.xy + A * 0.5, A) - A * 0.5;
            vec3 p = vec3(cpos.xy + rel, z);
          #if SNOW
            p.xy += position.xy * (2.4 + 3.2 * seed.w);
          #else
            vec2 dir = normalize(vel); vec2 side = vec2(-dir.y, dir.x);
            p.xy += dir * position.y * (22.0 + 20.0 * seed.w) + side * position.x * (1.1 + 0.7 * seed.w);
          #endif
            vF = 1.0 - smoothstep(0.8, 1.0, abs(rel.y) / (A.y * 0.5));
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 color; uniform float alpha; varying vec2 vUv; varying float vF;
          void main(){
          #if SNOW
            float a = smoothstep(0.5, 0.12, length(vUv - 0.5));
          #else
            float a = smoothstep(0.0, 0.6, vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0);
          #endif
            gl_FragColor = vec4(color, a * alpha * vF);
          }`,
      });
      const rnd4 = (a, o) => { a[o] = Math.random(); a[o + 1] = Math.random(); a[o + 2] = Math.random(); a[o + 3] = Math.random(); };
      this.rainMax = Math.round(3200 * scale); this.snowMax = Math.round(2400 * scale);
      this.rainMesh = new THREE.Mesh(inst(this.rainMax, 4, rnd4), shader(false));
      this.snowMesh = new THREE.Mesh(inst(this.snowMax, 4, rnd4), shader(true));
      // Spritzer auf Böden und Wasser vorne im Bild
      const pts = [];
      for (const r of g.world.solids.concat(g.world.water)) {
        const n = Math.min(r.w, 3000) / 7 * scale;
        for (let i = 0; i < n; i++) pts.push([r.x + rnd() * r.w, -r.y + 0.3, -1 - Math.pow(rnd(), 2) * 110, rnd()]);
      }
      for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
      this.splashMax = pts.length;
      this.splashMesh = new THREE.Mesh(inst(pts.length, 4, (a, o, i) => { a.set(pts[i], o); }), new THREE.ShaderMaterial({
        uniforms: pu, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `
          attribute vec4 seed; uniform float time; varying vec2 vUv; varying float vA;
          void main(){
            vUv = uv;
            float ph = fract(time * (1.4 + seed.w * 0.8) + seed.w * 17.0);
            float s = 1.0 + ph * (4.0 + seed.w * 3.0);
            vec3 p = seed.xyz + vec3(position.x * s * 2.0, (position.y + 0.5) * s * 1.1, 0.0);
            vA = smoothstep(0.4, 0.0, ph);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 color; uniform float alpha; varying vec2 vUv; varying float vA;
          void main(){
            float d = length((vUv - vec2(0.5, 0.0)) * vec2(1.0, 1.7));
            float ring = smoothstep(0.1, 0.0, abs(d - 0.4)) + smoothstep(0.06, 0.0, abs(vUv.x - 0.5)) * step(vUv.y, 0.5) * 0.4;
            gl_FragColor = vec4(color, ring * vA * alpha * 1.4);
          }`,
      }));
      for (const m of [this.rainMesh, this.snowMesh, this.splashMesh]) { m.frustumCulled = false; m.renderOrder = 5; this.scene.add(m); }
    }

    // Wetter in Licht, Nebel, Himmel, Materialien und Partikel übertragen
    applyWeather(g, dt) {
      const ws = this.ws, v = ws.update(FF.weatherOf(g.L.theme, this.weatherPref), dt, this.wsSnap);
      this.wsSnap = false;
      const wu = this.wu, B = this.base, bolt = ws.bolt, light = Math.min(1.25, v.light);
      wu.wTime.value = this.clock; wu.wWet.value = v.wet; wu.wSnow.value = v.cover; wu.wWind.value = v.wind;
      wu.wSun.value.copy(B.sunC).multiplyScalar(0.16 * light * light);
      this.key.intensity = B.key * light + bolt * 2.5;
      this.rim.intensity = B.rim * light;
      this.hemi.intensity = B.hemi * (1 + v.cloud * 0.3 + v.cover * 0.35) + bolt * 3;
      this.scene.environmentIntensity = B.env * (1 + v.cover * 0.3);
      const fog = this.scene.fog;
      fog.density = B.fog * v.fog;
      fog.color.copy(B.fogC).lerp(this.cGrey || (this.cGrey = col('#7d848c')), v.cloud * 0.55).lerp(this.cSnow || (this.cSnow = col('#d6dde8')), v.cover * 0.4);
      this.renderer.toneMappingExposure = B.exp * (1 + (1 - Math.min(1, v.light)) * 0.15 + v.cover * 0.1);
      const su = this.sky.material.uniforms;
      su.cloud.value = v.cloud; su.flash.value = bolt; su.snowy.value = v.cover;
      const shaftK = FF.clamp((v.light - 0.7) * 2.4, 0, 1.4);
      for (const s of this.shafts) s.material.opacity = s.userData.base * shaftK * (0.6 + 0.4 * Math.sin(this.clock * 0.25 + s.userData.ph));
      for (const m of this.waterMats) {
        m.normalMap.offset.x = this.clock * 0.02 * (1 + v.wind); m.normalMap.offset.y = this.clock * 0.013 * (1 + v.wind);
        m.normalScale.setScalar(0.5 + v.rain * 0.7 + v.wind * 0.15);
      }
      // Partikel
      const cam = this.r2.cam, pu = this.pu;
      pu.cpos.value.copy(this.camera.position);
      pu.area.value.set(cam.h * this.camera.aspect, cam.h);
      pu.wind.value = v.wind;
      pu.color.value.setRGB(0.8, 0.86, 0.95).multiplyScalar(0.75 + 0.45 * light + bolt);
      pu.alpha.value = 0.4 + v.rain * 0.1;
      this.rainMesh.geometry.instanceCount = Math.round(this.rainMax * v.rain);
      this.rainMesh.visible = v.rain > 0.01;
      this.snowMesh.geometry.instanceCount = Math.round(this.snowMax * v.snow);
      this.snowMesh.visible = v.snow > 0.01;
      this.splashMesh.geometry.instanceCount = Math.round(this.splashMax * v.rain);
      this.splashMesh.visible = v.rain > 0.05;
      if (this.grade) {
        // Stimmung: Regen und Sturm entsättigt und kühl, Schnee hell und bläulich, Sonne leicht warm
        const gu = this.grade.uniforms;
        gu.desat.value = v.cloud * 0.38 + v.cover * 0.12;
        const dark = 1 - v.cloud * 0.22 * (1 - v.cover) + bolt * 0.5;
        gu.tint.value.set((1 - v.cloud * 0.1 + Math.max(0, light - 1) * 0.25) * dark, (1 - v.cloud * 0.04) * dark, (1 + v.cloud * 0.06 + v.cover * 0.06) * dark);
      }
      if (this.fx) {
        this.fx.uniforms.rain.value = v.rain;
        this.fx.uniforms.wTint.value.setRGB(0.78, 0.84, 0.9).multiplyScalar(0.85 + 0.25 * light);
      }
      if (FF.audio && FF.audio.setWeather) FF.audio.setWeather(v);
    }

    // Wasserflächen im Bild für die Spiegelung bestimmen
    waterRects(g) {
      const fx = this.fx;
      if (!fx) return;
      const A = this.tmp.A, B = this.tmp.B, u = fx.uniforms;
      let n = 0;
      for (const w of g.world.water) {
        if (n >= 4) break;
        const fh = Math.min(w.h, 700);
        A.set(w.x, -w.y, 6).project(this.camera);
        B.set(w.x + w.w, -w.y - fh, 6).project(this.camera);
        const u0 = A.x * 0.5 + 0.5, u1 = B.x * 0.5 + 0.5, vs = A.y * 0.5 + 0.5, vb = B.y * 0.5 + 0.5;
        if (u1 < 0 || u0 > 1 || vs < 0 || vb > 1) continue;
        u.wRect.value[n].set(u0, u1, vs, vb);
        u.wDepth.value[n] = this.camera.position.z - 6;
        n++;
      }
      u.wCount.value = n;
      u.time.value = this.clock;
    }

    // ------------------------------------------------------------ Bild
    draw(g, dt, opts = {}) {
      this.clock += dt;
      const r2 = this.r2;
      r2.t += dt;
      if (!this.ensureLevel(g)) { this.drawLoading(); return; }
      this.adapt(dt);
      r2.prepare(g);
      r2.zoom = opts.pan ? 1 : 0.8;
      r2.updateCamera(g, dt, opts);
      const cam = r2.cam;
      const D = (cam.h / 2) / Math.tan((FOV * Math.PI / 180) / 2);
      this.camera.position.set(cam.x, -cam.y, D);
      this.camera.lookAt(cam.x, -cam.y, 0);
      if (this.dof) {
        this.dof.uniforms.focus.value = D;
        this.dof.uniforms.range.value = D * 0.95;
        this.dof.uniforms.maxR.value = 10 * this.pixelRatio();
      }
      const vw = cam.h * this.camera.aspect;
      const k = this.key;
      k.target.position.set(cam.x, -cam.y, -60);
      k.position.copy(k.target.position).addScaledVector(this.keyDir, 1800);
      const sc = k.shadow.camera;
      sc.left = -vw / 2 - 150; sc.right = vw / 2 + 150; sc.top = cam.h / 2 + 300; sc.bottom = -cam.h / 2 - 300;
      sc.updateProjectionMatrix();
      this.sky.position.copy(this.camera.position);
      this.camera.updateMatrixWorld();
      this.applyWeather(g, dt);
      this.waterRects(g);
      if (this.fg) this.fg.position.y = -cam.y - cam.h * 0.2;

      g.world.crates.forEach((c, i) => this.crates[i] && this.crates[i].position.set(c.x + c.w / 2 + (c.strain > 0 ? Math.sin(this.clock * 60) * 0.8 : 0), -(c.y + c.h / 2), -16));
      g.beads.forEach((b, i) => {
        const m = this.beads[i];
        if (!m) return;
        const a = b.got ? Math.max(0, 1 - b.t / 0.6) : 1;
        m.visible = a > 0.01;
        if (!m.visible) return;
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

      // Fäden
      let ri = 0;
      for (const b of g.world.bridges) {
        let load = null;
        for (const p of g.players) if (!p.merged && p.bridge === b && p.grounded) load = p.x + p.w / 2;
        const sag = (load !== null ? 4 : 0) + Math.sin(this.clock * 34) * b.wob * 7;
        const cx = load !== null ? load : (b.ax + b.bx) / 2;
        const cy = (load !== null ? FF.bridgeY(b, load) : (b.ay + b.by) / 2) + sag * 2;
        this.rope(ri++, [[b.ax, b.ay], [cx, cy], [b.bx, b.by]], 0, 0, this.mats.yarn[b.owner], 1.4);
      }
      if (g.tetherOn) {
        const T = g.tether;
        this.rope(ri++, T.points(), Math.min(Math.max(0, T.len - T.total), 260), 0.75, this.mats.tether, 1.0);
      }
      for (const p of g.players) {
        if (!p.lasso) continue;
        const pts = p.lasso.points();
        const kk = Math.min(1, p.throwT / 0.12);
        if (kk < 1) {
          const a = pts[0], b = pts[pts.length - 1];
          this.rope(ri++, [a, [a[0] + (b[0] - a[0]) * kk, a[1] + (b[1] - a[1]) * kk - Math.sin(kk * Math.PI) * 20]], 0, 0, this.mats.yarn[p.id], 0.9);
        } else this.rope(ri++, pts, Math.min(Math.max(0, p.lasso.len - p.lasso.total), 200), 0.7, this.mats.yarn[p.id], 0.95);
      }
      for (; ri < this.ropes.length; ri++) this.ropes[ri].mesh.visible = false;
      g.players.forEach((p, i) => this.poseYarny(this.yarnies[i], p, g, dt));
      this.posePassenger(g);

      if (this.composer) {
        this.grade.uniforms.time.value = this.clock % 10;
        this.composer.render(dt);
      } else this.renderer.render(this.scene, this.camera);

      this.drawOverlay(g, dt, opts);
    }

    drawLoading() {
      const r2 = this.r2, ctx = r2.ctx, W = r2.W, H = r2.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#111a18';
      ctx.fillRect(0, 0, W, H);
      const t = this.clock;
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.05;
      ctx.lineWidth = Math.max(2, R * 0.12);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const a = t * (i ? -3 : 2.4);
        ctx.strokeStyle = FF.COLORS[i];
        ctx.beginPath();
        ctx.arc(cx, cy, R * (1 - i * 0.35), a, a + 4.2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(240,231,211,0.8)';
      ctx.font = `600 ${Math.round(R * 0.38)}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Landschaft wird geladen …', cx, cy + R * 1.9);
      ctx.textAlign = 'left';
    }

    drawOverlay(g, dt, opts) {
      const r2 = this.r2, ctx = r2.ctx, W = r2.W, H = r2.H, cam = r2.cam;
      const sc = H / cam.h;
      r2.sc = sc;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(sc, 0, 0, sc, W / 2 - cam.x * sc, H / 2 - cam.y * sc);
      r2.view = { x0: cam.x - W / 2 / sc - 40, x1: cam.x + W / 2 / sc + 40, y0: cam.y - cam.h / 2 - 40, y1: cam.y + cam.h / 2 + 40 };
      const wv = this.ws.v;
      if (r2.th.amb !== 'mist' && FF.ambientOk(r2.th.amb, wv)) r2.drawAmbient(ctx, g, sc);
      r2.drawTargets(ctx, g);
      for (const p of g.players) if (p.miss && !p.lasso) r2.drawLasso(ctx, p);
      r2.drawFx(ctx, g);
      if (!opts.pan) for (const s of g.signs) if (s.show > 0.01) r2.drawSignBubble(ctx, s, g);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      FF.drawBolt(ctx, W, H, this.ws);
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
