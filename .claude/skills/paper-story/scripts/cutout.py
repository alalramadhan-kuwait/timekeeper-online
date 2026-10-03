#!/usr/bin/env python3
"""Turn a paper-cut figure on a plain background into a transparent PNG, cropped to the figure.
Works when the background is one flat colour (white, grey, a studio sweep). A white dishdasha on a white background
can be eaten: keep --tol low (default 8) or, better, export a transparent PNG. For busy backgrounds,
export a transparent PNG from the image tool instead.
   python3 cutout.py in.jpg out.png [--tol 28] [--feather 1.5]"""
import sys, argparse
from collections import deque
from PIL import Image, ImageFilter
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--tol', type=float, default=8); ap.add_argument('--feather', type=float, default=1.5); ap.add_argument('--ntol', type=float, default=9); ap.add_argument('--checker', action='store_true')
a = ap.parse_args()
im = Image.open(a.src).convert('RGBA'); W, H = im.size; px = im.load()
if any(px[x, y][3] < 250 for x, y in [(0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)]):
    print('already transparent; cropping only')
    mask = im.split()[3]
else:
    border = [px[x, 0] for x in range(0, W, 7)] + [px[x, H - 1] for x in range(0, W, 7)] + [px[0, y] for y in range(0, H, 7)] + [px[W - 1, y] for y in range(0, H, 7)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    neutral = lambda c: max(c[:3]) - min(c[:3]) <= a.ntol
    lum = sorted(sum(c[:3]) / 3 for c in border)
    neut = [c for c in border if neutral(c)]
    nl = sorted(sum(c[:3]) / 3 for c in neut)
    checker = a.checker or (len(neut) >= .9 * len(border) and nl and nl[int(len(nl) * .95)] - nl[int(len(nl) * .05)] > 30)
    if checker:
        # a fake-transparency checkerboard baked into the pixels: every grey or white pixel connected to the edge is background;
        # the figure's coloured paper border stops the fill, so white clothing inside it is kept
        near = neutral
    else:
        near = lambda c: ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** .5 <= a.tol
    seen = bytearray(W * H); q = deque()
    for x in range(W):
        for y in (0, H - 1): q.append((x, y))
    for y in range(H):
        for x in (0, W - 1): q.append((x, y))
    while q:  # flood fill the background from the edges, so white inside the figure is kept
        x, y = q.popleft(); i = y * W + x
        if seen[i] or not near(px[x, y]): continue
        seen[i] = 1
        if x > 0: q.append((x - 1, y))
        if x < W - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < H - 1: q.append((x, y + 1))
    mask = Image.frombytes('L', (W, H), bytes(0 if v else 255 for v in seen)).filter(ImageFilter.GaussianBlur(a.feather))
    print('checkerboard background removed' if checker else 'background #%02X%02X%02X removed' % bg)
# keep only the largest connected piece, so slivers of a neighbouring figure at the edge are dropped
small = mask.point(lambda v: 255 if v > 24 else 0).resize((max(1, W // 4), max(1, H // 4)))
sw, sh = small.size; sp = small.load(); lab = [[0] * sw for _ in range(sh)]; sizes = {}; n = 0
for y0 in range(sh):
    for x0 in range(sw):
        if sp[x0, y0] and not lab[y0][x0]:
            n += 1; lab[y0][x0] = n; q = deque([(x0, y0)]); c = 0
            while q:
                x, y = q.popleft(); c += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < sw and 0 <= ny < sh and sp[nx, ny] and not lab[ny][nx]:
                        lab[ny][nx] = n; q.append((nx, ny))
            sizes[n] = c
if len(sizes) > 1:
    keep = max(sizes, key=sizes.get)
    keepmask = Image.new('L', (sw, sh), 0); kp = keepmask.load()
    for y in range(sh):
        for x in range(sw):
            if lab[y][x] == keep: kp[x, y] = 255
    keepmask = keepmask.resize((W, H)).filter(ImageFilter.MaxFilter(9))
    mask = Image.composite(mask, Image.new('L', (W, H), 0), keepmask)
    print('dropped', len(sizes) - 1, 'small piece(s) at the edges')
im.putalpha(mask)
box = mask.point(lambda v: 255 if v > 24 else 0).getbbox()
im = im.crop(box) if box else im
im.save(a.out); print('wrote', a.out, im.size, 'aspect %.3f' % (im.size[0] / im.size[1]))
