#!/usr/bin/env python3
"""Tidies watch cut-outs: removes thin stray lines left by the background remover (an opening on the alpha) and,
where a strap or bracelet runs off the original photo, fades it out softly instead of ending on a straight cut.
   python3 tidy_cuts.py          (edits the files listed in JOBS in place; keeps a copy as *_raw.png the first time)"""
import json, os, shutil
import numpy as np
from PIL import Image, ImageFilter

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets'))

# file: (fade top, fade bottom) as fractions of the cut-out's height; 0 = keep the edge as it is
JOBS = {'early/polerouter_cut.png': (.16, .16), 'early/constellation_cut.png': (0, .2), 'cut/m5179.png': (.3, .08),
        'cut/m5182.png': (.2, .14), 'cut/m5233.png': (.16, .2), 'cut/ro5402_front.png': (0, .16), 'cut/ro5402_hero.png': (0, .14)}
for f, (ft, fb) in JOBS.items():
    raw = f.replace('.png', '_raw.png')
    if not os.path.exists(raw): shutil.copy(f, raw)
    im = Image.open(raw).convert('RGBA'); a = im.split()[3]
    k = max(3, int(round(min(im.size) / 160)) | 1)                     # opening size scales with the image
    a = a.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))
    A = np.asarray(a).astype(float) / 255; h = A.shape[0]; y = np.arange(h)[:, None] / h
    rows = np.flatnonzero((A > .5).sum(1) > .2 * A.shape[1])          # drop thin bits that hang below or above the watch
    A[:max(0, rows[0] - 4)] = 0; A[rows[-1] + 4:] = 0
    if ft: A *= np.clip(y / ft, 0, 1) ** 1.4
    if fb: A *= np.clip((1 - y) / fb, 0, 1) ** 1.4
    im.putalpha(Image.fromarray((A * 255).astype(np.uint8)))
    bb = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox(); im = im.crop(bb); im.save(f)
    print(f, im.size)
for d in ('early', 'cut'):
    p = os.path.join(d, 'aspects.json'); asp = json.load(open(p)) if os.path.exists(p) else {}
    for f in JOBS:
        if f.startswith(d + '/'):
            n = os.path.basename(f)[:-4].replace('_cut', ''); w, h = Image.open(f).size; asp[n] = round(w / h, 4)
    json.dump(asp, open(p, 'w'), indent=1)
