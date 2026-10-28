'use strict';
// Lädt die Foto-Texturen (Babylon.js Assets, CC BY 4.0) und HDR-Himmel (Poly Haven, CC0).
// In der Einzeldatei-Version liegen die Dateien als data:-URLs in FF.ASSET_DATA.
// Beim Öffnen direkt von der Festplatte (file://) erlaubt WebGL keine Bilddateien –
// dann nimmt der 3D-Renderer die berechneten Texturen.
(function () {
  const FF = globalThis.FF;
  const cache = {};

  const HDRI = { garden: 'forest', quarry: 'forest', pond: 'sunset', autumn: 'sunrise', dusk: 'night' };

  function url(p) {
    if (FF.ASSET_DATA && FF.ASSET_DATA[p]) return FF.ASSET_DATA[p];
    return 'assets/' + p + (globalThis.FF_VERSION ? '?v=' + globalThis.FF_VERSION : '');
  }

  FF.canLoadPhotos = () => !!FF.ASSET_DATA || location.protocol !== 'file:';

  function texture(renderer, p, srgb) {
    if (cache[p]) return cache[p];
    const THREE = globalThis.THREE;
    cache[p] = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(url(p), (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        resolve(t);
      }, undefined, () => { delete cache[p]; reject(new Error('Textur fehlt: ' + p)); });
    });
    return cache[p];
  }

  function hdri(name) {
    const p = 'hdri/' + name + '.exr';
    if (cache[p]) return cache[p];
    const THREE = globalThis.THREE;
    cache[p] = new Promise((resolve, reject) => {
      new THREE.EXRLoader().load(url(p), (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        resolve(t);
      }, undefined, () => { delete cache[p]; reject(new Error('HDRI fehlt: ' + p)); });
    });
    return cache[p];
  }

  FF.loadPhotoAssets = async function (renderer, theme) {
    const names = {
      grass: ['tex/grass.jpg', true], grassN: ['tex/grass_n.jpg'], dirt: ['tex/dirt.jpg', true], dirtN: ['tex/dirt_n.jpg'],
      gravel: ['tex/gravel.jpg', true], gravelN: ['tex/gravel_n.jpg'], wood: ['tex/wood.jpg', true], woodN: ['tex/wood_n.jpg'],
      canopy: ['tex/canopy.png', true], waterN: ['tex/water_n.jpg'],
    };
    const keys = Object.keys(names);
    const list = await Promise.all(keys.map((k) => texture(renderer, names[k][0], names[k][1])));
    const out = {};
    keys.forEach((k, i) => (out[k] = list[i]));
    out.hdr = await hdri(HDRI[theme] || 'forest');
    return out;
  };

  FF.ASSET_FILES = [
    'tex/grass.jpg', 'tex/grass_n.jpg', 'tex/dirt.jpg', 'tex/dirt_n.jpg', 'tex/gravel.jpg', 'tex/gravel_n.jpg',
    'tex/wood.jpg', 'tex/wood_n.jpg', 'tex/canopy.png', 'tex/water_n.jpg',
    ...Object.values(HDRI).map((n) => 'hdri/' + n + '.exr'),
  ];
})();
