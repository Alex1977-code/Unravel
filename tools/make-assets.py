#!/usr/bin/env python3
"""Bereitet Foto-Texturen und HDRIs für die 3D-Grafik auf.

Quellen:
  - Texturen: Babylon.js Assets (CC BY 4.0), https://github.com/BabylonJS/Assets
  - HDRIs:    Poly Haven (CC0), über das npm-Paket @pmndrs/assets

Aufruf:  python3 tools/make-assets.py <ordner-mit-babylon-texturen> <ordner-mit-pmndrs-hdri-js>
Ergebnis: assets/tex/*.jpg|png und assets/hdri/*.exr

Die Texturen werden verkleinert, gleichmäßiger ausgeleuchtet und bekommen aus der Helligkeit
berechnete, kachelbare Normal-Maps.
"""
import base64
import os
import re
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT_T = os.path.join(ROOT, 'assets', 'tex')
OUT_H = os.path.join(ROOT, 'assets', 'hdri')


def load(src, name, size, mode='RGB'):
    im = Image.open(os.path.join(src, name)).convert(mode)
    return im.resize((size, size), Image.LANCZOS) if size else im


def flatten(im, radius):
    """Großflächige Helligkeitsunterschiede entfernen, damit Kacheln nicht als Muster auffallen."""
    a = np.asarray(im).astype(np.float32)
    low = np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)
    mean = a.reshape(-1, 3).mean(0)
    out = a - low + mean
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def normal_from(im, strength, blur=1.2):
    """Kachelbare Normal-Map aus der Helligkeit (OpenGL-Konvention, grün nach oben)."""
    g = im.convert('L').filter(ImageFilter.GaussianBlur(blur))
    h = np.asarray(g).astype(np.float32) / 255.0
    dx = (np.roll(h, 1, axis=1) - np.roll(h, -1, axis=1)) * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    nz = np.ones_like(h)
    n = np.stack([dx, dy, nz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgb = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
    return Image.fromarray(rgb)


def save(im, name, q=86):
    path = os.path.join(OUT_T, name)
    if name.endswith('.png'):
        im.save(path, optimize=True)
    else:
        im.convert('RGB').save(path, quality=q, optimize=True, progressive=True)
    print(f'{name:22s} {os.path.getsize(path) // 1024:5d} KB')


def main(bab, hdri):
    os.makedirs(OUT_T, exist_ok=True)
    os.makedirs(OUT_H, exist_ok=True)

    grass = flatten(load(bab, 'grass.png', 1024), 90)
    save(grass, 'grass.jpg')
    save(normal_from(grass, 6), 'grass_n.jpg', 90)

    dirt = flatten(load(bab, 'dirt.jpg', 1024), 120)
    save(dirt, 'dirt.jpg')
    save(normal_from(dirt, 9, 1.0), 'dirt_n.jpg', 90)

    gravel = flatten(load(bab, 'rockyGround_basecolor.png', 1024), 120)
    save(gravel, 'gravel.jpg')
    save(load(bab, 'rockyGround_normal.png', 1024), 'gravel_n.jpg', 90)

    wood = load(bab, 'woodAlbedo.png', 512)
    save(wood, 'wood.jpg')
    save(normal_from(wood, 4), 'wood_n.jpg', 90)

    canopy = load(bab, 'tree.png', 512, 'RGBA')
    save(canopy, 'canopy.png')

    save(load(bab, 'waterbump.png', 256), 'water_n.jpg', 90)

    for name in ['forest', 'sunrise', 'sunset', 'night']:
        src = open(os.path.join(hdri, f'{name}.exr.js')).read()
        b64 = re.search(r"base64,([A-Za-z0-9+/=]+)", src).group(1)
        path = os.path.join(OUT_H, f'{name}.exr')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(b64))
        print(f'hdri/{name}.exr       {os.path.getsize(path) // 1024:5d} KB')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
