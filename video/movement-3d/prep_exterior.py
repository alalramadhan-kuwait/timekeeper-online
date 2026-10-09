#!/usr/bin/env python3
"""Turns the reference watch photograph into layers for a 2.5D exterior, without changing a pixel of the watch:
  assets/ext_base.png    the photograph (2x, Lanczos), with the dial continued under the hands and a 4-unit opening
                         at the centre (under the hands' boss) for the camera to pass through
  assets/ext_hands.png   the hands alone (2x, transparent elsewhere), to sit just above the dial
  assets/ext_depth.bin   float32 relief in px (towards the viewer) on a 1/4 grid: flat dial, domed bezel, case with
                         rounded edges, bracelet curving away; background behind everything
  assets/ext_metal.png   where the metal is, for moving reflections (1/2 scale)
Seen from the hero camera the layers rebuild the photograph exactly; away from it they give real parallax."""
import numpy as np
from PIL import Image

SRC = 'assets/exterior.png'
im = Image.open(SRC).convert('RGB'); W, H = im.size
a = np.asarray(im).astype(np.float32)
CX, CY, RD = 725.0, 1080.5, 216.0                        # dial centre and radius (measured from the green)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); r = np.hypot(xx - CX, yy - CY); dy = np.abs(yy - CY)
lum = a.mean(2); sil = lum > 14
green = (a[..., 1] > a[..., 0] + 12) & (a[..., 1] > a[..., 2] + 12)

# hands: non-green pixels inside the dial that connect to the centre
cand = (~green) & (r < RD - 4)
hand = np.zeros_like(cand); stack = [(int(CY), int(CX))]
while stack:
    y, x = stack.pop()
    if y < 0 or x < 0 or y >= H or x >= W or hand[y, x] or not cand[y, x]: continue
    hand[y, x] = True; stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
# the seconds hand runs over the 6 o'clock index: beyond r 140 keep only a thin band along the hand's own line
lo = hand & (yy > CY) & (r > 60) & (r < 140)
py, px = np.where(lo); k = np.polyfit(py - CY, px - CX, 1)                      # x = k0*(y-cy) + k1
off = np.abs((xx - CX) - (k[0] * (yy - CY) + k[1])) / np.hypot(1, k[0])
hand &= ~((r > 140) & (off > 2.5))
print('hand pixels', int(hand.sum()), 'seconds-hand slope', round(float(k[0]), 4))
def dilate(m, k=1):
    o = m.copy()
    for dy_ in range(-k, k + 1):
        for dx_ in range(-k, k + 1): o |= np.roll(np.roll(m, dy_, 0), dx_, 1)
    return o
handm = dilate(hand, 2)

# the dial under the hands: its own smooth green, averaged from nearby clean green pixels only
def blur(m, k):
    c = np.cumsum(np.cumsum(np.pad(m.astype(np.float32), k + 1, mode='edge'), 0), 1)
    s_ = c[2 * k + 1:, 2 * k + 1:] - c[:-2 * k - 1, 2 * k + 1:] - c[2 * k + 1:, :-2 * k - 1] + c[:-2 * k - 1, :-2 * k - 1]
    return (s_ / (2 * k + 1) ** 2)[: m.shape[0], : m.shape[1]]
clean = green & ~dilate(handm, 3)
wgt = blur(clean, 34); smooth = np.dstack([blur(a[..., c] * clean, 34) for c in range(3)]) / np.maximum(wgt, 1e-3)[..., None]
base = a.copy(); fillm = dilate(handm, 1); base[fillm] = smooth[fillm]
alpha = np.where(r < 4.5, 0, 255).astype(np.uint8)        # the opening under the boss
Image.fromarray(np.dstack([base.clip(0, 255).astype(np.uint8), alpha])).resize((W * 2, H * 2), Image.LANCZOS).save('assets/ext_base.png')
hands_rgba = np.dstack([a.astype(np.uint8), (handm * 255).astype(np.uint8)])
Image.fromarray(hands_rgba).resize((W * 2, H * 2), Image.LANCZOS).save('assets/ext_hands.png')

# relief (px towards the viewer)
edge = np.sqrt(np.clip(blur(sil, 16) * 2 - 1, 0, 1))      # 0 at the silhouette's edge, 1 inside: rounded sides
d = np.zeros((H, W), np.float32)
reh = np.clip((r - RD) / 10, 0, 1) * 4                    # rehaut up to the crystal's level
bez = np.where((r > RD + 10) & (r < 282), 4 + 10 * np.sin(np.pi * np.clip((r - RD - 10) / (282 - RD - 10), 0, 1)), 0)
case = 5 * edge
brac = np.where(dy > 300, -((dy - 300) ** 2) / 1500, 0)
d = np.where(r < RD, 0, np.where(r < RD + 10, reh, np.where(r < 282, bez, case))) + brac
d = np.where(sil | (r < 290), d, 5 + brac - 25)            # background sits behind whatever is next to it
g = d[::4, ::4]; g.astype('<f4').tofile('assets/ext_depth.bin'); print('depth grid', g.shape[1], g.shape[0])
metal = (sil & (r > RD + 2)).astype(np.float32) * np.clip(lum / 255 + 0.2, 0, 1)
Image.fromarray((metal * 255).astype(np.uint8)).resize((W // 2, H // 2), Image.BILINEAR).save('assets/ext_metal.png')
print('ok', W, H)
