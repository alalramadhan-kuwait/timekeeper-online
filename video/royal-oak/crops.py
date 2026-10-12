#!/usr/bin/env python3
"""Crops of the archive images used by parts.py (written to assets/crop, which is git-ignored like all assets).

  m8311_catalogue  the 1967 catalogue column: text and the closed handbag watch (ap/m8311_sketch.jpg is the
                   real catalogue page; ap/m8311.jpg is the design drawing, the file names are historical)
  m8311_open       the same page, the watch opened (the sapphire cabochon pressed)
  ad1972b          the 1972 "tribute to steel" advertisement without its black side bands
  gouache_head     Genta's signed gouache (ap/genta_gouache.jpg), the case and dial, for the sheet he holds at the end
  bauty1976_face   Charles Bauty, the man on the right of the 1976 Paris photo, his whole face; the neighbour's head
                   at the left edge is darkened so Bauty reads as the subject (he himself is untouched)"""
import os
import numpy as np
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__))
A = lambda *p: os.path.join(H, 'assets', *p)
os.makedirs(A('crop'), exist_ok=True)
CROPS = {'m8311_catalogue': ('ap/m8311_sketch.jpg', (552, 20, 1040, 1100)),
         'm8311_open': ('ap/m8311_sketch.jpg', (570, 1120, 1030, 1750)),
         'gouache_head': ('ap/genta_gouache.jpg', (260, 520, 1340, 1430)),
         'ad1972b': ('ap/ad1972b.jpg', (190, 0, 1425, 1844))}
for name, (src, box) in CROPS.items():
    Image.open(A(src)).convert('RGB').crop(box).save(A('crop', name + '.jpg'), quality=92)
    print(name, box)
im = Image.open(A('ap/bauty1976.jpg')).convert('RGB').crop((1110, 60, 1600, 670))
a = np.asarray(im).astype(float); g = np.clip(np.arange(a.shape[1]) / 110, 0, 1) * .45 + .55
Image.fromarray((a * g[None, :, None]).clip(0, 255).astype(np.uint8)).save(A('crop', 'bauty1976_face.jpg'), quality=93)
print('bauty1976_face', (1110, 60, 1600, 670))
