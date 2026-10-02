"""Generated founder poses (assets/gen/*.png, Higgsfield nano_banana_2 with the founders' own cut-outs as references) -> *_cut.png.
Cuts them off their flat grey background: flood fill the grey from every edge, then clear any flat grey pocket the
figures enclose (between arms, legs, chair rungs), and keep the paper-bordered figures."""
import glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

for f in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'gen', '*.png'))):
    if f.endswith('_cut.png'): continue
    im = np.asarray(Image.open(f).convert('RGB')).astype(np.int16)
    h, w, _ = im.shape
    bg = np.median(np.concatenate([im[:4].reshape(-1, 3), im[:, :4].reshape(-1, 3), im[:, -4:].reshape(-1, 3)]), axis=0)
    m = Image.fromarray(np.where(np.abs(im - bg).max(axis=2) < 14, 255, 0).astype(np.uint8)).copy()   # copy: fromarray shares a read-only buffer
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    for y in range(0, h, 5):                      # enclosed pockets: any flat grey patch bigger than a few hundred pixels
        for x in range(0, w, 5):
            if m.getpixel((x, y)) == 255:
                ImageDraw.floodfill(m, (x, y), 100)
                k = np.asarray(m) == 100              # flat like the backdrop, not the soft shading of a white dishdasha
                ImageDraw.floodfill(m, (x, y), 128 if k.sum() > 400 and im[k].std(axis=0).max() < 2.5 else 0)
    mask = np.asarray(m) != 128
    a = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.8))
    rgba = Image.fromarray(im.astype(np.uint8)); rgba.putalpha(a)
    ys, xs = np.where(np.asarray(a) > 20)
    out = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    out.save(f[:-4] + '_cut.png'); print(os.path.basename(f), out.size)
