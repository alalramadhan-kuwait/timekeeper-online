"""Paper-cut place scenes for simple.py: Boulder, San Diego, Kuwait at dusk, Geneva.

Each function returns paper-motion elements (inline SVG layers) for a 720x1280 stage whose floor line is at FLOOR.
Layers are separate elements so they can arrive one after another, back to front, like cut paper being laid down.
Colours stay muted so the founders' cutouts remain the brightest thing on screen."""
import math, random

SHADOW = 'filter:drop-shadow(0 4px 3px rgba(0,0,0,.28))'


def svg(w, h, body, x, y, anchor='b', z=2, at=0.0, kind='rise', dur=0.6, shadow=True, **kw):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" style="overflow:visible;%s">%s</svg>'
         % (w, h, w, h, SHADOW if shadow else '', body))
    d = {"type": "svg", "w": w, "h": h, "svg": s, "x": x, "y": y, "anchor": anchor, "z": z}
    if kind: d["in"] = {"type": kind, "at": at, "dur": dur}
    d.update(kw)
    return d


def pts(p):
    return ' '.join('%.1f,%.1f' % xy for xy in p)


def poly(p, fill, extra=''):
    return '<polygon points="%s" fill="%s" %s/>' % (pts(p), fill, extra)


def jag(p, amt=2.0, seed=1):
    """Hand-cut wobble on a polygon's vertices."""
    r = random.Random(seed)
    return [(x + r.uniform(-amt, amt), y + r.uniform(-amt, amt)) for x, y in p]


def sky(gid, top, bottom, extra=''):
    body = ('<defs><linearGradient id="%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s"/>'
            '<stop offset="1" stop-color="%s"/></linearGradient></defs><rect width="720" height="1040" fill="url(#%s)"/>%s'
            % (gid, top, bottom, gid, extra))
    return svg(720, 1040, body, 360, 0, anchor='t', z=1, kind='fade', dur=0.4, shadow=False)


def snowcap(px, py, dx=24, dy=30, fill='#F3F1EB'):
    return poly([(px, py), (px + dx, py + dy), (px + dx * .45, py + dy * .7), (px + dx * .1, py + dy * 1.05),
                 (px - dx * .35, py + dy * .72), (px - dx, py + dy)], fill)


def range_(w, h, peaks, fill, caps=True, seed=3):
    p = [(0, h)] + peaks + [(w, h)]
    body = poly(jag(p, 1.5, seed), fill)
    if caps:
        for i in range(1, len(peaks) - 1):
            x, y = peaks[i]
            if y < peaks[i - 1][1] and y < peaks[i + 1][1]: body += snowcap(x, y)
    return body


def pine(cx, base, hgt, wid, c='#3C4A3B', c2='#4A5A49'):
    b = '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#4A3B2E"/>' % (cx - wid * .06, base - hgt * .14, wid * .12, hgt * .14)
    for i in range(4):
        t = base - hgt * (.12 + i * .2); w2 = wid * (1 - i * .2) / 2
        b += poly([(cx, t - hgt * .32), (cx + w2, t), (cx - w2, t)], c if i % 2 == 0 else c2)
    return b


def birds(x, y, at=0.0, drift=60):
    body = ''.join('<path d="M%d %d q8 -9 16 0 q8 -9 16 0" stroke="#2F3134" stroke-width="3" fill="none" stroke-linecap="round"/>' % (dx, dy)
                   for dx, dy in [(0, 12), (42, 0), (26, 26)])
    return svg(80, 40, body, [[0, x], [5, x + drift]], y, anchor='c', z=3, at=at, kind='fade', dur=0.5, shadow=False,
               idle={"type": "bob", "amp": 4, "speed": .7})


# ------------------------------------------------------------------------------------------------ Boulder, Colorado
def boulder(FLOOR, t0=0.0):
    els = [sky('bdSky', '#BCC9CF', '#ECE6D8', '<circle cx="572" cy="300" r="52" fill="#F4EBD3" opacity=".95"/>')]
    els.append(svg(720, 330, range_(720, 330, [(0, 170), (70, 120), (120, 160), (190, 70), (250, 140), (300, 112), (372, 40), (430, 120),
                                              (482, 92), (540, 150), (604, 78), (662, 140), (720, 104)], '#A3AEB4', seed=5),
                   360, 770, z=2, at=t0 + .05, kind='rise'))
    # the Flatirons: tilted sandstone slabs above a pine ridge
    slabs = ''
    for i, (xl, ax, ay, xr) in enumerate([(20, 92, 236, 230), (120, 214, 58, 430), (360, 436, 138, 580), (520, 570, 228, 700)]):
        # the face leans back: long gentle right edge, short steep left edge, blunt rounded top
        face = 'M%d 470 L%d %d Q%d %d %d %d L%d 470Z' % (xl, ax - 10, ay + 22, ax, ay - 6, ax + 16, ay + 14, xr)
        slabs += '<path d="%s" fill="#AE7353"/>' % face
        slabs += '<path d="M%d %d L%d 470 L%d 470Z" fill="#8A5A42"/>' % (ax + 16, ay + 14, xr, xr - (xr - ax) * .22)
        for f in (.2, .42, .62, .8):
            x0 = ax - 10 + f * 30; x1 = xl + (xr - xl) * f * .9 + (xr - xl) * .05
            slabs += '<path d="M%.0f %.0f L%.0f 470" stroke="rgba(70,35,22,.28)" stroke-width="%d"/>' % (x0, ay + 30 + f * 20, x1, 3 if f % .4 else 2)
        slabs += '<path d="M%d 470 L%d %d Q%d %d %d %d" stroke="rgba(255,235,210,.35)" stroke-width="4" fill="none"/>' % (xl + 6, ax - 8, ay + 26, ax, ay, ax + 12, ay + 14)
    r = random.Random(7); ridge = [(0, 470), (0, 372)]
    for x in range(0, 744, 24):
        ridge += [(x, 372 + r.uniform(-14, 10)), (x + 12, 330 + r.uniform(-16, 12))]
    ridge += [(720, 372), (720, 470)]
    slabs += poly(ridge, '#55644F')
    els.append(svg(720, 470, slabs, 360, 830, z=3, at=t0 + .25, kind='rise'))
    # campus hall: sandstone walls, red tile roof, arched windows
    hall = ('<polygon points="105,30 150,-28 195,30" fill="#A44D36"/><rect x="115" y="28" width="70" height="90" fill="#CDA47C"/>'
            '<path d="M140 110 v-34 a10 10 0 0 1 20 0 v34z" fill="#4B3A30"/>'
            '<rect x="16" y="112" width="268" height="140" fill="#CFA67F"/>'
            '<polygon points="4,118 44,64 256,64 296,118" fill="#A44D36"/>'
            + ''.join('<line x1="%d" y1="66" x2="%d" y2="116" stroke="#8A3E2B" stroke-width="2"/>' % (x, x - (x - 150) * .3) for x in range(52, 252, 12))
            + ''.join('<path d="M%d 220 v-62 a14 14 0 0 1 28 0 v62z" fill="#4B3A30"/>' % x for x in (34, 82, 190, 238))
            + '<path d="M133 252 v-50 a17 17 0 0 1 34 0 v50z" fill="#3E3029"/>'
            + ''.join('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#B68D69" stroke-width="2"/>' % (x, y, x + 18, y)
                      for x, y in [(30, 132), (120, 140), (210, 128), (60, 236), (250, 240), (100, 190), (176, 170)]))
    els.append(svg(300, 252, hall, 572, 905, z=4, at=t0 + .5, kind='rise'))
    els.append(svg(220, 420, pine(60, 420, 380, 110) + pine(150, 420, 300, 90, '#45554A', '#3A4839') + pine(108, 420, 230, 80),
                   92, 1000, z=5, at=t0 + .65, kind='pop'))
    r = random.Random(4)
    grass = '<path d="M0 46 Q120 20 240 40 T480 36 T720 44 V210 H0Z" fill="#B0AA80"/>' + ''.join(
        '<path d="M%.0f %.0f q3 -14 6 0" stroke="#8F8B63" stroke-width="2" fill="none"/>' % (r.uniform(0, 720), r.uniform(60, 200)) for _ in range(40))
    els.append(svg(720, 210, grass, 360, FLOOR, z=6, at=t0, kind='fade', dur=.3, shadow=False))
    els += [{"type": "cloud", "w": 190, "color": "#F6F3EC", "x": [[0, 110], [5, 170]], "y": 250, "z": 2, "in": {"type": "fade", "at": t0 + .2}},
            {"type": "cloud", "w": 140, "color": "#F6F3EC", "x": [[0, 640], [5, 600]], "y": 420, "z": 2, "in": {"type": "fade", "at": t0 + .4}},
            birds(300, 300, at=t0 + .8)]
    return els


# ------------------------------------------------------------------------------------------------ San Diego, California
def palm(w, h, flip=False, lean=50):
    tx, ty = w / 2 + lean, 40
    trunk = 'M%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f L%.0f %.0f C%.0f %.0f %.0f %.0f %.0f %.0f Z' % (
        w / 2 - 16, h, w / 2 - 10, h * .55, tx - 30, h * .3, tx - 6, ty, tx + 6, ty, tx - 14, h * .3, w / 2 + 10, h * .55, w / 2 + 16, h)
    b = '<path d="%s" fill="#7A6450"/>' % trunk
    for k in range(9):
        yy = h - k * (h - ty) / 9
        b += '<line x1="%.0f" y1="%.0f" x2="%.0f" y2="%.0f" stroke="#5E4B3B" stroke-width="2"/>' % (w / 2 - 14 + lean * (1 - yy / h), yy, w / 2 + 12 + lean * (1 - yy / h), yy - 4)
    for i, a in enumerate([-170, -140, -110, -70, -40, -10, 20, 200]):
        ra = math.radians(a); L = 120 + (i % 3) * 18
        ex, ey = tx + math.cos(ra) * L, ty + math.sin(ra) * L * .55 + 40
        cx, cy = tx + math.cos(ra) * L * .5, ty + math.sin(ra) * L * .5 - 24
        b += '<path d="M%.0f %.0f Q%.0f %.0f %.0f %.0f Q%.0f %.0f %.0f %.0f Z" fill="%s"/>' % (
            tx, ty, cx, cy - 14, ex, ey, cx + 6, cy + 14, tx, ty + 6, '#42584A' if i % 2 else '#536B5A')
    b += ''.join('<circle cx="%.0f" cy="%.0f" r="7" fill="#6B4A2E"/>' % (tx + dx, ty + 10 + dy) for dx, dy in [(-8, 0), (6, 4), (0, 12)])
    return '<g transform="translate(%d 0) scale(-1 1)">%s</g>' % (w, b) if flip else b


def san_diego(FLOOR, t0=0.0):
    els = [sky('sdSky', '#E3C7A2', '#F4E8D4', '<circle cx="505" cy="600" r="88" fill="#F0C27E" opacity=".95"/>')]
    r = random.Random(11); city = ''
    for x, wd, ht in [(10, 40, 120), (54, 34, 170), (92, 46, 230), (142, 30, 150), (176, 52, 260), (232, 36, 190), (272, 44, 140), (320, 30, 210), (354, 50, 120)]:
        city += '<rect x="%d" y="%d" width="%d" height="%d" fill="#A2A7AA"/>' % (x, 260 - ht, wd, ht)
        city += ''.join('<rect x="%d" y="%d" width="5" height="7" fill="#C8C7BF"/>' % (x + 6 + c * 11, 270 - ht + rr * 18)
                        for rr in range(ht // 22) for c in range(wd // 12) if r.random() < .35)
    els.append(svg(400, 260, city, 210, 650, z=2, at=t0 + .1, kind='rise'))
    waves = ''.join('<path d="M%.0f %.0f q12 -6 24 0" stroke="#A9C4C2" stroke-width="3" fill="none"/>' % (r.uniform(0, 700), r.uniform(20, 210)) for _ in range(26))
    glint = ''.join('<rect x="%d" y="%d" width="%d" height="5" rx="2" fill="#F2D39B" opacity=".85"/>' % (505 - w2 / 2, y, w2) for y, w2 in [(10, 120), (30, 80), (52, 54), (76, 30)])
    els.append(svg(720, 230, '<rect width="720" height="230" fill="#7EA2A3"/>' + glint + waves, 360, 640, anchor='t', z=3, at=t0, kind='fade', dur=.3, shadow=False))
    # Coronado Bridge: a long rising curve on slender piers
    deck = 'M-10 120 C150 80 260 34 360 34 S600 70 730 104'
    piers = ''
    for i in range(-1, 26):
        x = i * 29; t = min(1, max(0, (x + 10) / 740))
        y = (120 * (1 - t) ** 3 + 3 * 80 * (1 - t) ** 2 * t + 3 * 34 * (1 - t) * t * t + 34 * t ** 3) if x < 360 else 34 + (x - 360) / 370 * 70
        piers += '<rect x="%d" y="%.0f" width="9" height="%.0f" fill="#8D99A4"/>' % (x, y + 6, 175 - y)
    els.append(svg(720, 175, piers + '<path d="%s" stroke="#6F7D8A" stroke-width="14" fill="none"/>' % deck, 360, 600, anchor='t', z=4, at=t0 + .3, kind='rise'))
    boat = ('<path d="M6 92 H84 L72 108 H18Z" fill="#3F4A55"/><polygon points="44,6 44,88 8,88" fill="#F4F1EA"/>'
            '<polygon points="50,20 50,88 80,88" fill="#E7E1D3"/><rect x="43" y="4" width="3" height="88" fill="#3F4A55"/>')
    els.append(svg(90, 110, boat, 620, 800, z=5, at=t0 + .5, kind='pop', idle={"type": "bob", "amp": 4, "speed": .8}))
    sand = ('<path d="M0 40 Q180 18 360 34 T720 30 V240 H0Z" fill="#DCC59E"/>'
            '<path d="M0 40 Q180 18 360 34 T720 30" stroke="#F6F2E8" stroke-width="7" fill="none"/>'
            + ''.join('<ellipse cx="%.0f" cy="%.0f" rx="4" ry="3" fill="#C9AF84"/>' % (r.uniform(0, 720), r.uniform(70, 230)) for _ in range(30)))
    els.append(svg(720, 240, sand, 360, FLOOR, z=6, at=t0, kind='fade', dur=.3, shadow=False))
    els.append(svg(260, 720, palm(260, 720, lean=46), 105, FLOOR + 6, z=7, at=t0 + .55, kind='rise', idle={"type": "sway", "amp": 1.2, "speed": .5}))
    els.append(svg(260, 620, palm(260, 620, flip=True, lean=40), 625, FLOOR + 6, z=7, at=t0 + .7, kind='rise', idle={"type": "sway", "amp": 1.2, "speed": .45, "phase": .4}))
    board = '<rect x="4" y="4" width="56" height="220" rx="28" fill="#E3B56A"/><rect x="28" y="10" width="8" height="208" fill="#C46F4E"/>'
    els.append(svg(64, 228, board, 676, FLOOR + 4, z=9, at=t0 + .9, kind='pop', rot=9))
    els.append(birds(250, 330, at=t0 + .6, drift=-50))
    return els


# ------------------------------------------------------------------------------------------------ Kuwait at dusk
def kuwait_dusk(FLOOR, t0=0.0):
    els = [sky('kwSky', '#2E3340', '#9A8A74')]
    els.append({"type": "moon", "x": 600, "y": 240, "size": 70, "z": 2, "in": {"type": "fade", "at": t0 + .2}})
    sea = '<rect width="720" height="80" fill="#3B5059"/>' + ''.join('<path d="M%d %d q10 -5 20 0" stroke="#5D7680" stroke-width="3" fill="none"/>' % (x, y) for x, y in [(40, 30), (160, 54), (300, 26), (420, 60), (560, 34), (650, 58)])
    els.append(svg(720, 80, sea, 360, 700, anchor='t', z=2, at=t0, kind='fade', dur=.3, shadow=False))
    lib = ('<polygon points="40,520 52,120 58,120 70,520" fill="#23262C"/><ellipse cx="55" cy="150" rx="26" ry="16" fill="#2B2F36"/>'
           '<rect x="44" y="160" width="22" height="30" fill="#2B2F36"/><rect x="54" y="0" width="3" height="122" fill="#23262C"/>'
           + ''.join('<rect x="52" y="%d" width="6" height="4" fill="#E8C77A"/>' % y for y in range(210, 500, 26)))
    els.append(svg(110, 520, lib, 140, 705, z=3, at=t0 + .1, kind='rise'))
    hamra = ('<path d="M10 440 V70 Q40 10 80 0 V440Z" fill="#262A31"/><path d="M80 0 Q60 120 70 440 H80Z" fill="#30353D"/>'
             + ''.join('<rect x="%d" y="%d" width="5" height="4" fill="#E8C77A"/>' % (x, y) for x in (22, 40, 58) for y in range(90, 420, 34)))
    els.append(svg(90, 440, hamra, 660, 705, z=3, at=t0 + .2, kind='rise'))
    els.append({"type": "towers", "x": 430, "y": 712, "h": 470, "z": 4, "in": {"type": "rise", "at": t0 + .3, "dur": .8}})
    dhow = ('<path d="M4 70 Q80 96 156 60 L144 88 Q80 104 16 90Z" fill="#6E4E36"/><rect x="74" y="8" width="4" height="70" fill="#4A3526"/>'
            '<polygon points="76,8 140,62 30,64" fill="#E9E1CF"/>')
    els.append(svg(160, 104, dhow, 285, 742, z=5, at=t0 + .5, kind='pop', idle={"type": "bob", "amp": 3, "speed": .7}))
    floor = '<rect width="720" height="320" fill="#6B4E3A"/>' + ''.join(
        '<rect x="0" y="%d" width="720" height="10" fill="%s"/>' % (y, c) for y, c in [(18, '#8C2F2A'), (34, '#E8DCC4'), (50, '#2E2A27'), (66, '#8C2F2A')])
    floor += ''.join('<polygon points="%d,42 %d,34 %d,42 %d,50" fill="#8C2F2A"/>' % (x, x + 8, x + 16, x + 8) for x in range(0, 720, 24))
    els.append(svg(720, 320, floor, 360, FLOOR, z=6, at=t0, kind='fade', dur=.3, shadow=False))
    return els


def coffee_tray(x, y, at=0.0, z=40):
    """Brass tray with a dallah and finjan cups, sits in front of the founders; watches are added by the caller."""
    b = ('<ellipse cx="190" cy="150" rx="186" ry="30" fill="#8E6F3E"/><ellipse cx="190" cy="144" rx="178" ry="26" fill="#C29B5C"/>'
         '<path d="M70 140 C52 112 56 74 74 58 L70 40 H96 L92 58 C110 74 114 112 96 140Z" fill="#C9A35F"/>'
         '<path d="M70 70 C40 64 26 40 14 22 L22 18 C36 34 50 52 72 60Z" fill="#B48A4C"/>'
         '<path d="M74 40 Q83 18 92 40Z" fill="#B48A4C"/><circle cx="83" cy="16" r="5" fill="#B48A4C"/>'
         '<path d="M98 70 C122 78 122 116 98 122" stroke="#9C7840" stroke-width="7" fill="none"/>'
         + ''.join('<path d="M%d 132 h26 l-4 14 h-18z" fill="#F2EFE6"/><rect x="%d" y="130" width="26" height="4" fill="#C9A35F"/>' % (cx, cx) for cx in (140, 178)))
    return svg(380, 180, b, x, y, z=z, at=at, kind='rise')


# ------------------------------------------------------------------------------------------------ Geneva
def geneva(FLOOR, t0=0.0):
    els = [sky('gvSky', '#C3CFD6', '#EEEADF')]
    alps = range_(720, 300, [(0, 190), (60, 150), (130, 175), (210, 96), (290, 150), (360, 60), (430, 40), (500, 70), (570, 140), (640, 100), (720, 150)], '#A6B0B6', seed=8)
    # Mont Blanc: a broad white dome over the range, snow following its own outline
    alps += '<path d="M250 300 L300 150 Q380 30 450 26 Q520 30 600 140 L660 300Z" fill="#B4BEC3"/>'
    alps += '<path d="M318 132 Q385 32 450 28 Q515 32 586 124 L560 118 L535 140 L505 112 L470 136 L440 108 L410 138 L380 114 L350 140Z" fill="#F4F3EF"/>'
    els.append(svg(720, 300, alps, 360, 700, z=2, at=t0 + .05, kind='rise'))
    town = ('<path d="M0 210 Q90 120 220 110 Q290 112 300 210Z" fill="#7E8E78"/>'
            '<rect x="96" y="70" width="110" height="60" fill="#8B877C"/><polygon points="92,72 151,40 210,72" fill="#7A6F64"/>'
            '<rect x="100" y="20" width="26" height="60" fill="#8B877C"/><rect x="176" y="20" width="26" height="60" fill="#8B877C"/>'
            '<polygon points="140,44 151,-24 162,44" fill="#6F8F84"/>'
            + ''.join('<rect x="%d" y="%d" width="22" height="22" fill="#9A9488"/><polygon points="%d,%d %d,%d %d,%d" fill="#9E6B57"/>'
                      % (x, y, x - 3, y, x + 11, y - 12, x + 25, y) for x, y in [(36, 128), (66, 116), (214, 112), (244, 124)]))
    els.append(svg(300, 210, town, 560, 700, z=3, at=t0 + .2, kind='rise'))
    r = random.Random(5)
    lake = '<rect width="720" height="110" fill="#8EA9B1"/>' + ''.join('<path d="M%.0f %.0f q10 -5 20 0" stroke="#B3C7CC" stroke-width="3" fill="none"/>' % (r.uniform(0, 700), r.uniform(10, 100)) for _ in range(18))
    els.append(svg(720, 110, lake, 360, 696, anchor='t', z=3, at=t0, kind='fade', dur=.3, shadow=False))
    jet = ('<defs><linearGradient id="jetG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".8" stop-color="#FFFFFF" stop-opacity=".9"/>'
           '<stop offset="1" stop-color="#FFFFFF" stop-opacity=".35"/></linearGradient></defs>'
           '<filter id="jetB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>'
           '<path d="M50 470 C44 300 44 150 58 50 Q76 0 112 18 Q120 40 100 52 Q84 70 82 110 C76 230 72 350 70 470Z" fill="url(#jetG)" filter="url(#jetB)"/>'
           '<path d="M56 470 C52 300 54 150 64 60 Q78 22 100 30 Q88 46 80 96 C74 220 68 350 64 470Z" fill="#FFFFFF" opacity=".9"/>'
           '<ellipse cx="96" cy="40" rx="44" ry="26" fill="#FFFFFF" opacity=".55" filter="url(#jetB)"/>'
           '<ellipse cx="60" cy="466" rx="34" ry="9" fill="#FFFFFF" opacity=".7" filter="url(#jetB)"/><rect x="30" y="470" width="62" height="10" fill="#9A9488"/>')
    els.append(svg(130, 480, jet, 120, 768, z=4, at=t0 + .35, kind='rise', dur=.9, idle={"type": "sway", "amp": .8, "speed": .6}))
    lawn = '<rect y="0" width="720" height="8" fill="#B6AFA1"/><rect y="8" width="720" height="210" fill="#9DAA80"/>'
    els.append(svg(720, 218, lawn, 360, FLOOR, z=5, at=t0, kind='fade', dur=.3, shadow=False))
    # the Flower Clock in the Jardin Anglais, seen in perspective
    dots = ''
    for i in range(48):
        a = 2 * math.pi * i / 48
        dots += '<circle cx="%.1f" cy="%.1f" r="5" fill="%s"/>' % (150 + math.cos(a) * 128, 64 + math.sin(a) * 48, ['#D98A73', '#E8CF7A', '#F3EFE7', '#B888B0'][i % 4])
    marks = ''.join('<ellipse cx="%.1f" cy="%.1f" rx="7" ry="4" fill="#F3EFE7"/>' % (150 + math.cos(2 * math.pi * k / 12) * 104, 64 + math.sin(2 * math.pi * k / 12) * 38) for k in range(12))
    clock = ('<ellipse cx="150" cy="70" rx="148" ry="58" fill="#56704C"/><ellipse cx="150" cy="64" rx="140" ry="54" fill="#7F9B67"/>'
             + dots + '<ellipse cx="150" cy="64" rx="112" ry="40" fill="#6E8B5B"/>' + marks
             + '<line x1="150" y1="64" x2="214" y2="44" stroke="#2B2B2B" stroke-width="8" stroke-linecap="round"/>'
             '<line x1="150" y1="64" x2="104" y2="46" stroke="#2B2B2B" stroke-width="10" stroke-linecap="round"/>'
             '<circle cx="150" cy="64" r="8" fill="#2B2B2B"/>')
    els.append(svg(300, 130, clock, 160, FLOOR - 8, z=30, at=t0 + .6, kind='pop', dur=.7))
    els.append(birds(330, 260, at=t0 + .5))
    return els
