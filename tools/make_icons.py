"""Rasterize the Sliced Fruit app icon (watermelon slice + blade streak).

Writes icons/icon-192.png and icons/icon-512.png relative to the repo root.
Requires Pillow: pip install pillow
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def make(size):
    s = size / 512  # design space is 512
    img = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(img)

    def rr(box, r, fill):
        d.rounded_rectangle([c * s for c in box], radius=r * s, fill=fill)

    def half_disc(cx, cy, r, fill):
        d.pieslice([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], 0, 180, fill=fill)

    def dot(cx, cy, r, fill):
        d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=fill)

    rr((0, 0, 512, 512), 112, (23, 18, 51, 255))
    cx, cy = 256, 236
    half_disc(cx, cy, 170, (47, 158, 68, 255))
    half_disc(cx, cy, 150, (216, 245, 201, 255))
    half_disc(cx, cy, 132, (255, 93, 93, 255))
    for sx, sy in [(-58, 62), (0, 88), (58, 62), (-20, 48), (30, 40)]:
        dot(cx + sx, cy + sy, 11, (35, 35, 35, 255))
    d.line([96 * s, 96 * s, 416 * s, 236 * s], fill=(255, 255, 255, 230), width=max(2, round(26 * s)))
    return img

for size in (192, 512):
    out = os.path.join(ROOT, 'icons', f'icon-{size}.png')
    make(size).save(out)
    print('wrote', out)
