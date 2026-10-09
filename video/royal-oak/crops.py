#!/usr/bin/env python3
"""Crops of the archive images used by parts.py (written to assets/crop, which is git-ignored like all assets).

  m8311_catalogue  the 1967 catalogue column: text and the closed handbag watch (ap/m8311_sketch.jpg is the
                   real catalogue page; ap/m8311.jpg is the design drawing, the file names are historical)
  m8311_open       the same page, the watch opened (the sapphire cabochon pressed)
  ad1972b          the 1972 "tribute to steel" advertisement without its black side bands
  gouache_head     Genta's signed gouache (ap/genta_gouache.jpg), the case and dial, for the sheet he holds at the end"""
import os
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
