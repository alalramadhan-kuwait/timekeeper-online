"""Small story props for story.py: full-screen colour plates, gears, a monitor with a script, design boards, an
anonymous guest silhouette, a plane, coffee steam and a camera viewfinder. All inline SVG (see landmarks.svg)."""
import math
from landmarks import svg


def plate(color, at=0.0, out=None, z=1, opacity=None, **kw):
    """A flat full-screen colour, pinned to the screen (camera does not move it)."""
    d = svg(720, 1280, '<rect width="720" height="1280" fill="%s"/>' % color, 360, 640, anchor='c', z=z, at=at, kind='none' if at else None,
            shadow=False, depth=0, still=True, **kw)
    if at: d['in'] = {"type": "none", "at": at}
    if out is not None: d['out'] = {"at": out, "type": "fade", "dur": .05}
    if opacity is not None: d['opacity'] = opacity
    return d


def rect(color, x, y, w, h, z=5, **kw):
    return svg(w, h, '<rect width="%d" height="%d" fill="%s"/>' % (w, h, color), x, y, anchor='c', z=z, kind=None, shadow=False, still=True, **kw)


def gear(r, teeth=18, color='#C9A35F', hole='#3A3B3F', spokes=5):
    D = 2 * r + 20; c = D / 2; pts = []
    for k in range(teeth * 2):
        a = math.pi * k / teeth; rr = r + 8 if k % 2 == 0 else r - 4
        for da in (-.09, .09): pts.append('%.1f,%.1f' % (c + math.cos(a + da) * rr, c + math.sin(a + da) * rr))
    b = '<polygon points="%s" fill="%s"/>' % (' '.join(pts), color)
    b += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (c, c, r * .72, hole)
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        b += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%.1f"/>' % (c, c, c + math.cos(a) * r * .75, c + math.sin(a) * r * .75, color, r * .12)
    b += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/><circle cx="%.1f" cy="%.1f" r="%.1f" fill="#9C2A35"/>' % (c, c, r * .2, color, c, c, r * .08)
    return D, b


def gear_el(r, x, y, dur, turns, z=3, depth=1.0, blur=0, color='#C9A35F', teeth=18, at=0.0):
    D, b = gear(r, teeth, color)
    style = 'filter:blur(%dpx);' % blur if blur else ''
    d = svg(D, D, '<g style="%s">%s</g>' % (style, b), x, y, anchor='c', z=z, at=at, kind='fade', dur=.3, still=True, depth=depth,
            rot=[[0, 0], [dur, 360 * turns]])
    return d


def monitor(x, y, at=0.0, z=20, w=300, lines=('Q1  بداية الفكرة', 'Q2  أول ساعة', 'Q3  جنيف'), **kw):
    h = w * .62
    b = ('<rect x="0" y="0" width="%d" height="%d" rx="10" fill="#1E1F23"/><rect x="10" y="10" width="%d" height="%d" fill="#EFECE4"/>' % (w, h, w - 20, h - 26)
         + '<rect x="%d" y="%d" width="40" height="40" fill="#2A2B30"/><rect x="%d" y="%d" width="120" height="10" rx="5" fill="#2A2B30"/>' % (w / 2 - 20, h, w / 2 - 60, h + 38))
    for k, t in enumerate(lines):
        b += '<text x="%d" y="%d" font-family="Cairo,sans-serif" font-size="%d" font-weight="700" fill="#2A2A2A" text-anchor="end">%s</text>' % (w - 26, 44 + k * 36, int(w / 13), t)
        b += '<rect x="26" y="%d" width="%d" height="6" rx="3" fill="#CFCBC0"/>' % (36 + k * 36, w * .32)
    return svg(w, int(h + 50), b, x, y, anchor='b', z=z, at=at, kind='rise', **kw)


def papers(x, y, at=0.0, z=21, **kw):
    b = ''
    for k, (dx, r) in enumerate([(0, -6), (30, 4), (60, -2)]):
        b += '<g transform="translate(%d 0) rotate(%d 90 60)"><rect width="180" height="120" fill="#FBF9F3"/>' % (dx, r)
        b += ''.join('<rect x="16" y="%d" width="%d" height="6" rx="3" fill="#BDB6A6"/>' % (18 + i * 18, 150 - (i * 23) % 60) for i in range(5)) + '</g>'
    return svg(260, 140, b, x, y, anchor='b', z=z, at=at, kind='drop', **kw)


def watch_sketch(cx, cy, R, ink='#46484E'):
    """A pencil design drawing of a watch: case, lugs, crown, indices, hands at 10:10 and a dimension line.
    A drawing of a design in progress, not a product (real watches are always real photos)."""
    b = '<g fill="none" stroke="%s" stroke-linecap="round">' % ink
    b += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" stroke-width="2"/>' % (cx - R * .5, cy - R * 2.1, R, R * 1.2)
    b += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="6" stroke-width="2"/>' % (cx - R * .5, cy + R * .9, R, R * 1.2)
    b += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#FBF9F3" stroke-width="3.5"/>' % (cx, cy, R)
    b += '<circle cx="%.1f" cy="%.1f" r="%.1f" stroke-width="1.5"/>' % (cx, cy, R * .86)
    b += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="2" stroke-width="2"/>' % (cx + R, cy - R * .13, R * .14, R * .26)
    for k in range(12):
        a = math.radians(k * 30); r1, r2 = R * .8, R * (.64 if k % 3 == 0 else .7)
        b += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%.1f"/>' % (cx + r1 * math.sin(a), cy - r1 * math.cos(a), cx + r2 * math.sin(a), cy - r2 * math.cos(a), 3 if k % 3 == 0 else 1.5)
    for ang, ln, wd in ((300, .45, 4), (60, .68, 3)):
        a = math.radians(ang); b += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%d"/>' % (cx, cy, cx + R * ln * math.sin(a), cy - R * ln * math.cos(a), wd)
    y = cy + R * 2.35
    b += '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="1.5"/>' % (cx - R, y, cx + R, y)
    b += ''.join('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="1.5"/>' % (x, y - 6, x, y + 6) for x in (cx - R, cx + R)) + '</g>'
    b += '<text x="%.1f" y="%.1f" font-family="Inter,sans-serif" font-size="%d" font-weight="700" fill="%s" text-anchor="middle">40 mm</text>' % (cx, y - 6, max(10, int(R * .3)), ink)
    return b


def design_board(x, y, at=0.0, z=22, w=230, **kw):
    """A pinned board with a watch being designed: the pencil drawing and the dial colours being tried."""
    h = int(w * 1.25)
    b = ('<rect width="%d" height="%d" fill="#F4F1EA"/><rect x="0" y="0" width="%d" height="14" fill="#C9A35F"/>' % (w, h, w)
         + watch_sketch(w / 2, h * .42, w * .2)
         + ''.join('<circle cx="%.1f" cy="%d" r="%.1f" fill="%s" stroke="#46484E" stroke-width="1"/>' % (24 + k * (w - 48) / 3, h - 30, w * .06, c)
                   for k, c in enumerate(['#111111', '#F3F0E8', '#1F4E46', '#7E848B'])))
    return [svg(w, h, b, x, y, anchor='b', z=z, at=at, kind='rise', **kw)]


def guest(x, y, at=0.0, z=14, scale=1.0, flip=True, **kw):
    """An anonymous podcast guest: a dark paper silhouette, no face."""
    b = ('<ellipse cx="110" cy="70" rx="52" ry="60" fill="#3D3F45"/><path d="M10 330 Q10 170 110 150 Q210 170 210 330Z" fill="#3D3F45"/>'
         '<path d="M70 165 L110 230 L150 165" fill="none" stroke="#F3F0E8" stroke-width="6"/>')
    if flip: b = '<g transform="translate(220 0) scale(-1 1)">%s</g>' % b
    return svg(220, 330, b, x, y, anchor='b', z=z, at=at, kind='rise', scale=scale, **kw)


def plane(x, y, at=0.0, z=30, **kw):
    b = ('<path d="M10 70 L260 52 Q300 50 300 66 Q300 82 260 82 L10 80Z" fill="#F4F1EA"/><path d="M140 64 L80 4 L110 4 L190 62Z" fill="#DCD6C8"/>'
         '<path d="M140 76 L80 136 L110 136 L190 78Z" fill="#CFC8B8"/><path d="M20 70 L0 30 L22 30 L50 68Z" fill="#DCD6C8"/>'
         + ''.join('<circle cx="%d" cy="64" r="4" fill="#5E6B78"/>' % cx for cx in range(150, 260, 16)))
    return svg(300, 140, b, x, y, anchor='c', z=z, at=at, kind='fade', dur=.2, **kw)


def steam(x, y, dur, at=0.0, n=3, z=45, period=1.6):
    """Coffee steam: thin wisps that rise and fade, on a loop for the length of the scene."""
    out = []
    for i in range(n):
        ph = i * period / n; ys, ops = [], []
        t = at - ph
        while t < dur + period:
            for f, dy, o in ((0, 0, 0), (.25, -18, .55), (.75, -54, .35), (1, -70, 0)):
                tt = round(t + f * period, 3)
                if tt >= 0: ys.append([tt, y + dy]); ops.append([tt, o])
            t += period
        b = '<path d="M14 80 q-12 -14 0 -28 q12 -14 0 -28 q-12 -12 0 -24" stroke="#F4F1EA" stroke-width="5" fill="none" stroke-linecap="round"/>'
        out.append(svg(28, 84, b, x + (i - 1) * 14, ys, anchor='b', z=z, kind=None, shadow=False, opacity=ops, still=True))
    return out


def viewfinder(at=0.0, out=None, z=60):
    b = ''.join('<path d="%s" stroke="#F4F1EA" stroke-width="6" fill="none"/>' % d for d in
                ['M60 160 V100 H120', 'M600 100 H660 V160', 'M60 1060 V1120 H120', 'M600 1120 H660 V1060'])
    b += '<circle cx="360" cy="610" r="18" fill="none" stroke="#F4F1EA" stroke-width="3"/><circle cx="96" cy="200" r="10" fill="#E8574B"/>'
    b += '<text x="116" y="208" font-family="Inter,sans-serif" font-size="26" font-weight="800" fill="#F4F1EA">REC</text>'
    d = svg(720, 1280, b, 360, 640, anchor='c', z=z, kind=None, shadow=False, depth=0, still=True)
    d['in'] = {"type": "none", "at": at}
    if out is not None: d['out'] = {"at": out, "type": "fade", "dur": .05}
    return d
