#!/usr/bin/env python3
"""Puts a pencil watch-design sketch on the blank sheet Mohammad holds in the generated designer pose
(assets/gen/designer_cut.png -> assets/gen/designer_sketch_cut.png). The sketch is a design drawing, not a product:
case outline, lugs, crown, indices, hands and dimension lines, warped into the sheet's corners."""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageChops

H = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(H, '..', '..', '.claude', 'skills', 'paper-story', 'assets', 'fonts')
W0, H0 = 400, 640
INK = (70, 72, 78)

def sketch():
    im = Image.new('RGB', (W0, H0), 'white'); d = ImageDraw.Draw(im)
    cx, cy, R = 200, 300, 120
    for dx, dy in ((-1, 0), (1, 0)):                                   # strap stubs
        d.rounded_rectangle((cx - 62, cy - R - 150 if dy == 0 else 0, cx + 62, cy - R + 10), 10, outline=INK, width=3)
    d.rounded_rectangle((cx - 62, cy + R - 10, cx + 62, cy + R + 150), 10, outline=INK, width=3)
    for sx in (-1, 1):                                                 # lugs
        for sy in (-1, 1):
            x0 = cx + sx * 70; y0 = cy + sy * (R - 6)
            d.line((x0, y0, x0 + sx * 6, y0 + sy * 52), fill=INK, width=4)
    d.ellipse((cx - R - 6, cy - R - 6, cx + R + 6, cy + R + 6), fill='white', outline=INK, width=5)   # case
    d.ellipse((cx - R + 12, cy - R + 12, cx + R - 12, cy + R - 12), outline=INK, width=2)             # dial
    d.rounded_rectangle((cx + R + 4, cy - 16, cx + R + 22, cy + 16), 4, outline=INK, width=3)        # crown
    for k in range(60):
        a = math.radians(k * 6); r1 = R - 18; r2 = r1 - (16 if k % 5 == 0 else 6)
        d.line((cx + r1 * math.sin(a), cy - r1 * math.cos(a), cx + r2 * math.sin(a), cy - r2 * math.cos(a)), fill=INK, width=4 if k % 5 == 0 else 1)
    for ang, ln, wd in ((300, 58, 7), (60, 88, 5)):                    # hands at 10:10
        a = math.radians(ang); d.line((cx, cy, cx + ln * math.sin(a), cy - ln * math.cos(a)), fill=INK, width=wd)
    d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=INK)
    f = ImageFont.truetype(os.path.join(FONT, 'cairo-latin-700-normal.woff2'), 24) if False else ImageFont.load_default()
    y = cy + R + 175                                                    # dimension line under the case
    d.line((cx - R - 6, y, cx + R + 6, y), fill=INK, width=2)
    for x in (cx - R - 6, cx + R + 6): d.line((x, y - 10, x, y + 10), fill=INK, width=2)
    try: f = ImageFont.truetype('DejaVuSans-Bold.ttf', 26)
    except OSError: f = ImageFont.load_default()
    d.text((cx, y - 8), '40 mm', fill=INK, font=f, anchor='md')
    for i, w in enumerate((150, 110, 130)):                             # notes
        d.line((40, 40 + i * 22, 40 + w, 40 + i * 22), fill=(150, 150, 155), width=4)
    return im

def coeffs(src, dst):
    """Perspective coefficients mapping output (dst) points back to input (src) points, for Image.transform."""
    import numpy as np
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]; B += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()

pose = Image.open(os.path.join(H, 'assets/gen/designer_cut.png')).convert('RGBA')
quad = [(48, 122), (158, 110), (232, 372), (112, 402)]                # the sheet's corners inside its edges (tl, tr, br, bl)
sk = sketch().transform(pose.size, Image.PERSPECTIVE, coeffs([(0, 0), (W0, 0), (W0, H0), (0, H0)], quad), Image.BICUBIC, fillcolor='white')
mask = Image.new('L', pose.size, 0); ImageDraw.Draw(mask).polygon(quad, fill=255)
rgb = pose.convert('RGB'); drawn = ImageChops.multiply(rgb, sk)        # pencil on paper: darken only
rgb.paste(drawn, (0, 0), mask); rgb.putalpha(pose.split()[3])
rgb.save(os.path.join(H, 'assets/gen/designer_sketch_cut.png')); print('wrote assets/gen/designer_sketch_cut.png')
