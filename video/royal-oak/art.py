"""Paper-cut art for the Royal Oak origin story (film.py). Every piece is inline SVG on a 720x1280 stage.

Nothing here draws the Royal Oak itself as a finished product: the watch on screen is always a real photograph
(assets/ro_*.png|jpg, see ASSETS in film.py). The only drawn version is the designer's pencil sketch, which is an
illustration of the idea, not a copy of the original drawing. Generic watches (the gold dress watches of 1970, a steel
tool watch) are plain, unbranded shapes. People appear only as silhouettes and hands: no faces."""
import math, random

SHADOW = 'filter:drop-shadow(3px 5px 4px rgba(0,0,0,.32))'          # one key light, from the upper left
GOLD, GOLD_D, CREAM, INK, GRAPH, STEEL = '#C9A35F', '#9C7B3F', '#EFE8D6', '#16181D', '#3A3B3E', '#B9BEC4'


def svg(w, h, body, x, y, anchor='c', z=5, at=0.0, kind='rise', dur=0.5, shadow=True, **kw):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" style="overflow:visible;%s">%s</svg>'
         % (w, h, w, h, SHADOW if shadow else '', body))
    d = {"type": "svg", "w": w, "h": h, "svg": s, "x": x, "y": y, "anchor": anchor, "z": z}
    if kind: d["in"] = {"type": kind, "at": at, "dur": dur}
    d.update(kw)
    return d


def pts(p): return ' '.join('%.1f,%.1f' % xy for xy in p)


def jag(p, amt=1.8, seed=1):
    r = random.Random(seed)
    return [(x + r.uniform(-amt, amt), y + r.uniform(-amt, amt)) for x, y in p]


def plate(color, z=0, **kw):
    return svg(760, 1320, '<rect width="760" height="1320" fill="%s"/>' % color, 360, 640, z=z, kind=None, shadow=False, depth=0, still=True, **kw)


def octagon(cx, cy, r, rot=22.5):
    """Regular octagon with flats at top, bottom and sides (rot 22.5)."""
    return [(cx + r * math.cos(math.radians(rot + 45 * k)), cy + r * math.sin(math.radians(rot + 45 * k))) for k in range(8)]


def hexagon(cx, cy, r, rot=0):
    return [(cx + r * math.cos(math.radians(rot + 60 * k)), cy + r * math.sin(math.radians(rot + 60 * k))) for k in range(6)]


def path(p, close=True):
    return 'M' + ' L'.join('%.1f %.1f' % xy for xy in p) + (' Z' if close else '')


def circle_d(cx, cy, r):
    return 'M %.1f %.1f a %.1f %.1f 0 1 0 %.1f 0 a %.1f %.1f 0 1 0 %.1f 0' % (cx - r, cy, r, r, 2 * r, r, r, -2 * r)


# ---------------------------------------------------------------- 1970: a tear-off calendar and a tray of dress watches
def calendar(x, y, year='1970', at=0.2, z=20, **kw):
    w, h = 300, 330
    body = ('<rect x="0" y="18" width="%d" height="%d" rx="6" fill="#F3EEE1"/>' % (w, h - 18) +
            '<rect x="0" y="18" width="%d" height="74" rx="6" fill="#B23A2E"/><rect x="0" y="70" width="%d" height="22" fill="#B23A2E"/>' % (w, w) +
            ''.join('<rect x="%d" y="0" width="16" height="40" rx="7" fill="#2A2C31"/>' % xx for xx in (70, 214)) +
            '<text x="%d" y="262" font-family="var(--f-title)" font-size="150" fill="#16181D" text-anchor="middle">%s</text>' % (w / 2, year) +
            '<line x1="24" y1="292" x2="%d" y2="292" stroke="#CFC6B1" stroke-width="2"/>' % (w - 24))
    return svg(w, h, body, x, y, z=z, at=at, kind='drop', dur=0.55, **kw)


def tray(x, y, at=0.0, z=8, **kw):
    """A velvet display tray with three slots; the middle one stays empty."""
    w, h = 640, 300
    body = ('<rect x="0" y="0" width="%d" height="%d" rx="18" fill="#4A1F25"/>' % (w, h) +
            '<rect x="14" y="14" width="%d" height="%d" rx="12" fill="#5E2A31"/>' % (w - 28, h - 28) +
            ''.join('<rect x="%d" y="40" width="170" height="220" rx="14" fill="#4A1F25" opacity=".85"/>' % sx for sx in (40, 235, 430)) +
            '<rect x="243" y="48" width="154" height="204" rx="12" fill="none" stroke="#C9A35F" stroke-width="2.5" stroke-dasharray="10 8" opacity=".75"/>')
    return svg(w, h, body, x, y, z=z, at=at, kind='fade', dur=0.4, **kw)


# ---------------------------------------------------------------- the call: two offices joined by a phone line
def window(w, h, scene, frame='#E8E1CF'):
    return ('<rect x="-10" y="-10" width="%d" height="%d" rx="6" fill="%s"/>' % (w + 20, h + 20, frame) +
            '<svg x="0" y="0" width="%d" height="%d" viewBox="0 0 %d %d">%s</svg>' % (w, h, w, h, scene) +
            '<rect x="%d" y="0" width="8" height="%d" fill="%s"/><rect x="0" y="%d" width="%d" height="8" fill="%s"/>' % (w / 2 - 4, h, frame, h / 2 - 4, w, frame))


def alps(w, h, sky='#A9B9C6'):
    """Snowy ridges and dark pines: the Vallee de Joux above Le Brassus, where Audemars Piguet is."""
    s = '<rect width="%d" height="%d" fill="%s"/>' % (w, h, sky)
    s += '<polygon points="%s" fill="#E9EEF1"/>' % pts([(0, h * .55), (w * .25, h * .25), (w * .45, h * .5), (w * .7, h * .2), (w, h * .48), (w, h), (0, h)])
    s += '<polygon points="%s" fill="#7F93A0"/>' % pts([(0, h * .75), (w * .3, h * .55), (w * .6, h * .72), (w, h * .58), (w, h), (0, h)])
    r = random.Random(4)
    for i in range(14):
        px_, base, ht = i * w / 13 + r.uniform(-6, 6), h * (0.9 + r.uniform(-.05, .05)), r.uniform(40, 70)
        s += '<polygon points="%s" fill="#2F4038"/>' % pts([(px_, base - ht), (px_ - ht * .28, base), (px_ + ht * .28, base)])
    return s


def lake(w, h, sky='#9FB7C9', night=False):
    """Geneva from a studio window: the lake and the Jet d'Eau."""
    sky = '#1B2740' if night else sky
    s = '<rect width="%d" height="%d" fill="%s"/>' % (w, h, sky)
    if night: s += '<circle cx="%d" cy="%d" r="22" fill="#F2EBD3"/>' % (w * .74, h * .22)
    s += '<polygon points="%s" fill="%s"/>' % (pts([(0, h * .6), (w * .4, h * .5), (w, h * .58), (w, h * .66), (0, h * .66)]), '#2A3550' if night else '#6E8597')
    s += '<rect y="%d" width="%d" height="%d" fill="%s"/>' % (h * .66, w, h * .34, '#14203A' if night else '#5E7F98')
    s += '<path d="M %d %d C %d %d %d %d %d %d" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round" opacity=".9"/>' % (
        w * .35, h * .68, w * .34, h * .4, w * .36, h * .18, w * .38, h * .12, '#C9D4E0' if night else '#F4F7FA')
    return s


def wall_clock(x, y, hh, mm, at=0.0, z=6, d=120, spin=None, **kw):
    """Wall clock; spin=(t0, t1, turns) turns the hands (minute hand turns, hour hand follows)."""
    body = ('<circle cx="%d" cy="%d" r="%d" fill="#F3EEE1" stroke="#2A2C31" stroke-width="8"/>' % (d / 2, d / 2, d / 2 - 4) +
            ''.join('<rect x="%.1f" y="10" width="4" height="%d" fill="#2A2C31" transform="rotate(%d %d %d)"/>' % (d / 2 - 2, 14 if k % 3 == 0 else 8, k * 30, d / 2, d / 2) for k in range(12)))
    face = svg(d, d, body, x, y, z=z, at=at, kind='pop', dur=0.4, **kw)
    hands = []
    for L, wdt, base_deg, rate in ((d * .26, 6, (hh % 12 + mm / 60) * 30, 1 / 12), (d * .38, 4, mm * 6, 1.0)):
        hb = '<rect x="%.1f" y="%.1f" width="%d" height="%.1f" rx="2" fill="#16181D"/>' % (d / 2 - wdt / 2, d / 2 - L, wdt, L + 6)
        rot = base_deg if not spin else [[spin[0], base_deg], [spin[1], base_deg + 360 * spin[2] * rate, 'inOutCubic']]
        hands.append(svg(d, d, hb, x, y, z=z + 1, at=at, kind='pop', dur=0.4, shadow=False, rot=rot, **kw))
    return [face] + hands


def rotary_phone(color='#EDE6D3', dark='#2A2C31'):
    """Body only (the handset is separate so it can lift)."""
    b = '<path d="M 20 150 L 46 60 Q 50 46 66 46 L 194 46 Q 210 46 214 60 L 240 150 Q 242 162 228 162 L 32 162 Q 18 162 20 150 Z" fill="%s"/>' % color
    b += '<circle cx="130" cy="104" r="44" fill="%s"/>' % dark
    b += ''.join('<circle cx="%.1f" cy="%.1f" r="7" fill="%s"/>' % (130 + 30 * math.cos(math.radians(a)), 104 + 30 * math.sin(math.radians(a)), color) for a in range(-60, 241, 30))
    b += '<circle cx="130" cy="104" r="14" fill="%s"/>' % color
    b += '<rect x="56" y="30" width="22" height="22" rx="4" fill="%s"/><rect x="182" y="30" width="22" height="22" rx="4" fill="%s"/>' % (dark, dark)
    return b


def handset(color='#EDE6D3'):
    return ('<path d="M 10 30 Q 0 0 30 4 L 50 10 Q 62 14 70 14 L 190 14 Q 198 14 210 10 L 230 4 Q 260 0 250 30 L 236 44 Q 226 50 214 40 L 200 30 L 60 30 L 46 40 Q 34 50 24 44 Z" fill="%s"/>' % color)


def ring_lines(color='#F3EEE1'):
    return ''.join('<path d="M %d %d q %d %d %d %d" stroke="%s" stroke-width="5" fill="none" stroke-linecap="round"/>' % (x0, y0, dx, dy, ex, ey, color)
                   for x0, y0, dx, dy, ex, ey in ((10, 40, -14, 24, 0, 48), (-6, 26, -20, 38, 0, 76), (250, 40, 14, 24, 0, 48), (266, 26, 20, 38, 0, 76)))


def hand_holding(color='#D9B79A', cuff='#2A2C31', flip=False):
    """A paper hand in a dark sleeve, reaching in from the edge (no face anywhere)."""
    g = ('<rect x="0" y="40" width="190" height="78" rx="10" fill="%s"/>' % cuff +
         '<rect x="176" y="34" width="26" height="90" rx="6" fill="#F3EEE1"/>' +
         '<path d="M 200 40 Q 250 30 290 52 Q 312 66 300 92 Q 288 120 240 122 L 200 122 Z" fill="%s"/>' % color +
         '<path d="M 262 46 Q 292 20 310 30 Q 318 40 300 58" fill="%s"/>' % color)
    return '<g transform="%s">%s</g>' % ('translate(320 0) scale(-1 1)' if flip else '', g)


def cord(x0, y0, x1, y1, color='#2A2C31', loops=26):
    p = []
    for i in range(loops * 8 + 1):
        k = i / (loops * 8); x = x0 + (x1 - x0) * k; y = y0 + (y1 - y0) * k + 40 * math.sin(math.pi * k)
        a = k * loops * 2 * math.pi; p.append((x + 9 * math.cos(a), y + 9 * math.sin(a)))
    return '<path d="%s" stroke="%s" stroke-width="4" fill="none"/>' % (path(p, False), color)


# ---------------------------------------------------------------- the night studio
def drafting_table(w=560, h=250, paper='#F4EFE2'):
    return ('<polygon points="%s" fill="#5A4632"/>' % pts([(0, h * .36), (w, 0), (w, 40), (0, h * .36 + 40)]) +
            '<polygon points="%s" fill="%s"/>' % (pts([(40, h * .34), (w - 60, 22), (w - 40, 70), (60, h * .34 + 48)]), paper) +
            '<rect x="70" y="%d" width="14" height="%d" fill="#3D2F22"/><rect x="%d" y="40" width="14" height="%d" fill="#3D2F22"/>' % (h * .36 + 38, h * .64 - 38, w - 60, h - 40))


def desk_lamp(color='#2A2C31'):
    return ('<path d="M 20 300 L 120 300 L 112 288 L 28 288 Z" fill="%s"/>' % color +
            '<rect x="64" y="160" width="10" height="132" fill="%s" transform="rotate(-18 69 290)"/>' % color +
            '<rect x="90" y="60" width="10" height="130" fill="%s" transform="rotate(38 95 185)"/>' % color +
            '<path d="M 150 40 L 230 70 L 206 120 L 140 90 Z" fill="%s"/>' % color +
            '<ellipse cx="200" cy="104" rx="30" ry="12" fill="#FFE6A8" transform="rotate(24 200 104)"/>')


def lamp_glow(w=520, h=560):
    return ('<defs><radialGradient id="lg" cx="50%%" cy="20%%" r="80%%"><stop offset="0" stop-color="#FFE3A0" stop-opacity=".55"/>'
            '<stop offset=".55" stop-color="#FFD27A" stop-opacity=".14"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/></radialGradient></defs>'
            '<polygon points="%s" fill="url(#lg)"/>' % pts([(w * .42, 0), (w * .58, 0), (w, h), (0, h)]))


def silhouette(color='#0B0E14'):
    """A designer seen from behind at the table: head, neck, shoulders and an arm. No face."""
    return ('<ellipse cx="150" cy="70" rx="56" ry="66" fill="%s"/>' % color +
            '<rect x="126" y="120" width="48" height="40" fill="%s"/>' % color +
            '<path d="M 10 360 Q 10 190 90 160 L 210 160 Q 290 190 300 300 L 300 360 Z" fill="%s"/>' % color +
            '<path d="M 260 210 Q 330 230 380 200 L 392 222 Q 330 262 268 250 Z" fill="%s"/>' % color)


def diver_helmet(brass='#B9853F', dark='#6E4A1E', glass='#2C3F4E', uid='dh'):
    """A generic copper-and-brass diving helmet, front view: dome, front porthole held by bolts over a dark rubber
    seal, two side ports, breastplate with its bolts. Illustrative, not a specific maker's helmet. Genta remembered
    the bolts and the seal; the octagon came later, from finding room for eight screws."""
    s = ('<defs><radialGradient id="%s" cx="30%%" cy="22%%" r="85%%"><stop offset="0" stop-color="#E2B46A"/><stop offset=".55" stop-color="%s"/>'
         '<stop offset="1" stop-color="#7A5222"/></radialGradient></defs>' % (uid, brass))
    s += '<path d="M 60 300 Q 60 60 220 50 Q 380 60 380 300 Z" fill="url(#%s)"/>' % uid
    s += ''.join('<path d="%s" stroke="#E3BC7A" stroke-width="1.5" opacity=".4" fill="none"/>' % d for d in
                 ('M 110 150 q 30 -40 70 -52', 'M 300 120 q 30 30 38 70', 'M 130 250 q 10 -30 30 -44', 'M 280 240 q 18 -10 30 -30'))
    s += '<path d="M 0 300 L 440 300 L 470 420 Q 220 470 -30 420 Z" fill="%s"/>' % dark
    s += '<path d="M 20 310 L 420 310 L 444 408 Q 220 450 -4 408 Z" fill="%s"/><path d="M 20 312 L 420 312" stroke="#4A3214" stroke-width="2"/>' % brass
    for k in range(7):
        x, y = 30 + k * 63, 330
        s += '<polygon points="%s" fill="%s"/><circle cx="%.1f" cy="%.1f" r="3" fill="#F2D49A"/>' % (pts(hexagon(x, y, 9, 30)), dark, x - 2, y - 2)
    for sx in (90, 350):
        s += '<circle cx="%d" cy="190" r="34" fill="%s"/><circle cx="%d" cy="190" r="24" fill="%s"/>' % (sx, dark, sx, glass)
    s += '<circle cx="220" cy="185" r="96" fill="%s"/>' % dark
    s += '<circle cx="220" cy="185" r="80" fill="%s"/>' % brass
    s += '<circle cx="220" cy="185" r="66" fill="#16171A"/>'                                        # the rubber seal
    s += '<circle cx="220" cy="185" r="60" fill="%s"/>' % glass
    s += '<ellipse cx="200" cy="160" rx="34" ry="18" fill="#9FB8C8" opacity=".35" transform="rotate(-30 200 160)"/>'
    s += '<path d="M 182 150 Q 200 132 230 134" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>'
    for k in range(8):
        a = math.radians(22.5 + 45 * k); bx, by = 220 + 73 * math.cos(a), 185 + 73 * math.sin(a)
        s += '<polygon points="%s" fill="%s"/><circle cx="%.1f" cy="%.1f" r="2.6" fill="#F2D49A"/>' % (pts(hexagon(bx, by, 9, 30)), dark, bx - 2, by - 2)
    return s


# ---------------------------------------------------------------- the sketch: from the porthole to the watch
def ro_sketch(cx=320, cy=440, R=150, k=1.0, ink=None, links=4):
    """The idea as pencil lines (sketch element paths, timed from 0). An illustration in the spirit of a design
    drawing; it is not the original drawing and not a technical copy of the watch."""
    """k scales every time (0.4 = the same drawing, faster); ink recolours it (cream on black for the ending)."""
    G, LIGHT = (ink, ink) if ink else ('#34363B', '#7C8088')
    P = []
    K = k
    add = lambda d, at, dur, **kw: P.append(dict(d=d, at=round(at * K, 3), dur=round(dur * K, 3), **kw))
    # construction lines
    add('M %d %d L %d %d' % (cx - R * 1.6, cy, cx + R * 1.6, cy), 0.0, 0.5, width=1.2, stroke=LIGHT, opacity=.7)
    add('M %d %d L %d %d' % (cx, cy - R * 2.4, cx, cy + R * 2.4), 0.1, 0.6, width=1.2, stroke=LIGHT, opacity=.7)
    add(circle_d(cx, cy, R * .78), 0.15, 0.7, width=2.4, stroke=G)                                   # the porthole
    oc = octagon(cx, cy, R * 1.0)
    add(path(oc), 1.0, 1.0, width=3.0, stroke=G)                                                    # it becomes an octagon
    add(path(octagon(cx, cy, R * .86)), 1.5, 0.8, width=1.6, stroke=G, opacity=.7)
    add(path(octagon(cx, cy, R * 1.05)), 1.9, 0.7, width=1.2, stroke=G, opacity=.85)               # the visible gasket
    # the case: wider than the bezel, flat where the bracelet joins (38.7 x 48 mm, so taller than wide)
    cw, ch = R * 1.18, R * 1.30
    case = 'M %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f Z' % (
        cx - cw * .62, cy - ch, cx + cw * .62, cy - ch, cx + cw * 1.12, cy, cx + cw * .62, cy + ch,
        cx - cw * .62, cy + ch, cx - cw * .62, cy + ch, cx - cw * 1.12, cy, cx - cw * .62, cy - ch)
    add(case, 3.3, 0.8, width=2.6, stroke=G)
    crx = cx + cw * .86                                                                              # the crown at 3
    add('M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f' % (crx, cy - R * .08, crx + R * .11, cy - R * .08, crx + R * .11, cy + R * .08, crx, cy + R * .08), 3.6, 0.3, width=2.2, stroke=G)
    # eight screws at the corners
    screws = []
    for j, (x, y) in enumerate(octagon(cx, cy, R * .93)):
        add(path(hexagon(x, y, 9.5, 0)), 2.0 + j * 0.11, 0.18, width=2.0, stroke=G, fill='#55585E', fillOpacity=.55)
        screws.append((x, y))
    # the bracelet: a tapering first link, then links flowing up and down off the page
    for sgn in (-1, 1):
        y0 = cy + sgn * ch
        for i in range(links):
            top = y0 + sgn * (i * 64); bot = top + sgn * 60
            wt = cw * 1.24 - i * 16; wb = wt - 16                                                  # 26 mm at the case, 16 at the clasp
            d = 'M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z' % (cx - wt * .5, top, cx + wt * .5, top, cx + wb * .5, bot, cx - wb * .5, bot)
            add(d, 3.9 + i * 0.14 + (0.05 if sgn > 0 else 0), 0.25, width=2.2, stroke=G)
            mid = (top + bot) / 2                                                                   # two small polished links
            for sx in (-1, 1):
                x0 = cx + sx * wt * .16
                add('M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z' % (x0 - 6, mid - 12, x0 + 6, mid - 12, x0 + 6, mid + 12, x0 - 6, mid + 12), 4.0 + i * 0.14, 0.2, width=1.4, stroke=G, opacity=.75)
    # the dial: a fine grid, batons
    grid = ''.join('M %.1f %.1f L %.1f %.1f ' % (cx - R * .62, cy + v, cx + R * .62, cy + v) for v in range(-80, 81, 20))
    grid += ''.join('M %.1f %.1f L %.1f %.1f ' % (cx + v, cy - R * .62, cx + v, cy + R * .62) for v in range(-80, 81, 20))
    add(grid, 5.0, 0.7, width=0.9, stroke=LIGHT, opacity=.6)
    add('M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z' % (cx + R * .42, cy - R * .05, cx + R * .55, cy - R * .05, cx + R * .55, cy + R * .05, cx + R * .42, cy + R * .05), 5.2, 0.25, width=1.8, stroke=G)   # date at 3
    add('M %.1f %.1f L %.1f %.1f M %.1f %.1f L %.1f %.1f' % (cx - 4, cy - R * .58, cx - 4, cy - R * .42, cx + 4, cy - R * .58, cx + 4, cy - R * .42), 5.3, 0.2, width=2.6, stroke=G)   # double baton
    add('M %d %d L %d %d M %d %d L %d %d' % (cx, cy, cx - 38, cy - 70, cx, cy, cx + 76, cy + 22), 5.4, 0.35, width=3.2, stroke=G)
    # steel: a grey wash over the case and bezel
    add(case, 5.95, 0.01, width=0.1, stroke=G, fill=STEEL, fillAt=5.95 * K, fillDur=0.6, fillOpacity=.55)
    add(path(oc), 6.05, 0.01, width=0.1, stroke=G, fill='#D4D8DD', fillAt=6.05 * K, fillDur=0.6, fillOpacity=.6)
    T = [dict(text='8 vis hexagonales', x=cx + R * .8, y=cy - R * 1.05, size=22, at=2.6 * K, dur=0.5 * K, rot=-6, color=G),
         dict(text='acier', x=cx - R * 1.75, y=cy + R * .2, size=34, at=6.1 * K, dur=0.5 * K, rot=-8, color=G)]
    # little leader lines for the notes
    add('M %.1f %.1f Q %.1f %.1f %.1f %.1f' % (cx + R * .95, cy - R * 1.0, cx + R * .85, cy - R * .95, screws[6][0] + 12, screws[6][1] - 4), 2.7, 0.35, width=1.4, stroke=G)
    add('M %.1f %.1f Q %.1f %.1f %.1f %.1f' % (cx - R * 1.3, cy + R * .1, cx - R * 1.2, cy - R * .2, cx - cw * .95, cy - R * .2), 6.2, 0.35, width=1.4, stroke=G)
    return P, T


def drafting_sheet(w=640, h=960, paper='#F6F1E3', line='#C9D6DD'):
    g = ''.join('<line x1="0" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>' % (y, w, y, line) for y in range(0, h, 32))
    g += ''.join('<line x1="%d" y1="0" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>' % (x, x, h, line) for x in range(0, w, 32))
    return '<rect width="%d" height="%d" fill="%s"/>%s<rect x="14" y="14" width="%d" height="%d" fill="none" stroke="#8A9AA6" stroke-width="2"/>' % (w, h, paper, g, w - 28, h - 28)


def pencil(len_=300):
    return ('<polygon points="0,10 40,0 40,20" fill="#E7C89B"/><polygon points="0,10 12,7 12,13" fill="#2A2C31"/>' +
            '<rect x="40" y="0" width="%d" height="20" fill="#2E5D3A"/><rect x="%d" y="0" width="26" height="20" fill="#B9BEC4"/>'
            '<rect x="%d" y="0" width="22" height="20" rx="4" fill="#C77A7A"/>' % (len_ - 90, len_ - 50, len_ - 24))


# ---------------------------------------------------------------- steel was for tools
def pegboard(w=620, h=520):
    s = '<rect width="%d" height="%d" rx="8" fill="#8B6A45"/>' % (w, h)
    s += ''.join('<circle cx="%d" cy="%d" r="4" fill="#5E4630"/>' % (x, y) for x in range(30, w, 40) for y in range(30, h, 40))
    return s


def wrench(color='#9BA2AB'):
    return ('<rect x="40" y="22" width="220" height="26" rx="10" fill="%s"/>' % color +
            '<path d="M 0 35 Q 0 0 36 0 L 60 0 L 46 22 L 46 48 L 60 70 L 36 70 Q 0 70 0 35 Z" fill="%s"/>' % color +
            '<circle cx="270" cy="35" r="28" fill="%s"/><circle cx="270" cy="35" r="13" fill="#8B6A45"/>' % color)


def screwdriver():
    return '<rect x="0" y="12" width="110" height="34" rx="12" fill="#C2452F"/><rect x="104" y="22" width="150" height="14" fill="#9BA2AB"/><rect x="250" y="24" width="18" height="10" fill="#9BA2AB"/>'


def scale_beam(w=560):
    return ('<rect x="0" y="0" width="%d" height="14" rx="7" fill="#B08A4A"/>' % w +
            '<circle cx="%d" cy="7" r="16" fill="#8C6B34"/>' % (w / 2))


def scale_post():
    return ('<rect x="270" y="0" width="20" height="300" fill="#8C6B34"/><path d="M 180 330 L 380 330 L 340 296 L 220 296 Z" fill="#6F5427"/>')


def pan(color='#B08A4A'):
    return ('<line x1="20" y1="0" x2="-70" y2="150" stroke="%s" stroke-width="3"/><line x1="20" y1="0" x2="110" y2="150" stroke="%s" stroke-width="3"/>' % (color, color) +
            '<path d="M -100 150 L 140 150 Q 120 190 20 190 Q -80 190 -100 150 Z" fill="%s"/>' % color)


# ---------------------------------------------------------------- Basel 1972: the fair
def hall(w=900, h=1100, bunting=False):
    """The fair hall: dark wall, columns, a top beam. The bunting is its own piece (bunting()) so it can sway."""
    s = '<rect width="%d" height="%d" fill="#2A221C"/>' % (w, h)
    for i in range(7):
        x = i * w / 6
        s += '<rect x="%d" y="0" width="22" height="%d" fill="#1B1611"/><rect x="%d" y="0" width="3" height="%d" fill="#3A3029"/>' % (x - 11, h, x - 11, h)
    s += '<rect x="0" y="0" width="%d" height="90" fill="#1B1611"/><rect x="0" y="88" width="%d" height="3" fill="#3A3029"/>' % (w, w)
    s += ''.join('<rect x="%d" y="%d" width="150" height="40" fill="#1B1611"/>' % (40 + i * 215, 300) + ''.join(
        '<rect x="%d" y="318" width="%d" height="5" fill="#EFE8D6" opacity=".35"/>' % (58 + i * 215 + j * 20, 12) for j in range(6)) for i in range(4))
    return s + (bunting_(w) if bunting else '')


def bunting_(w=900, y=90, n=9, colors=('#B23A2E', '#EFE8D6', '#16181D')):
    """Pennants on a cord: Swiss red and white, with the black of Basel's crest."""
    s = '<path d="M 0 %d Q %d %d %d %d" stroke="#16181D" stroke-width="2" fill="none"/>' % (y, w / 2, y + 26, w, y)
    for i in range(n):
        x = 50 + i * (w - 100) / (n - 1); yy = y + 13 * (1 - ((x - w / 2) / (w / 2)) ** 2)
        s += '<path d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z" fill="%s"/><path d="M %.1f %.1f L %.1f %.1f" stroke="#00000033" stroke-width="2"/>' % (
            x - 26, yy, x + 26, yy, x, yy + 92, colors[i % 3], x - 26, yy + 2, x + 26, yy + 2)
    return s


def booth(w=520, h=420, name=''):
    s = ('<rect x="0" y="0" width="%d" height="%d" fill="#3A302A"/>' % (w, h) +
         '<rect x="0" y="0" width="%d" height="70" fill="#2A221C"/><rect x="0" y="66" width="%d" height="4" fill="#C9A35F"/>' % (w, w) +
         '<rect x="20" y="90" width="%d" height="%d" fill="#2A221C"/>' % (w - 40, h - 110))
    if name: s += '<text x="%d" y="46" font-family="var(--f-cap)" font-weight="700" font-size="22" letter-spacing="4" fill="#EFE8D6" text-anchor="middle">%s</text>' % (w / 2, name)
    return s


def pedestal(w=260, h=300):
    return ('<rect x="0" y="0" width="%d" height="30" fill="#EFE8D6"/><rect x="18" y="30" width="%d" height="%d" fill="#D9D1BE"/>' % (w, w - 36, h - 30) +
            '<rect x="18" y="30" width="22" height="%d" fill="#C3BAA4"/>' % (h - 30))


def spotlight_cone(w=520, h=900, color='#FFF1CF'):
    return ('<defs><linearGradient id="sc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s" stop-opacity=".55"/>'
            '<stop offset="1" stop-color="%s" stop-opacity=".05"/></linearGradient></defs><polygon points="%s" fill="url(#sc)"/>' % (color, color, pts([(w * .44, 0), (w * .56, 0), (w, h), (0, h)])))


def crowd(w=760, n=7, seed=3, color='#0D0B09', h=300):
    """Backs of heads and shoulders, from behind: a crowd watching. No faces."""
    r = random.Random(seed); s = ''
    for i in range(n):
        x = (i + .5) * w / n + r.uniform(-18, 18); hh = r.uniform(.85, 1.1); y = h - 20
        s += '<path d="M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f Z" fill="%s"/>' % (
            x - 70 * hh, y + 30, x - 64 * hh, y - 100 * hh, x, y - 112 * hh, x, y + 30, x + 64 * hh, y - 100 * hh, x + 70 * hh, y + 30, color)
        s += '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s"/>' % (x, y - 150 * hh, 36 * hh, 44 * hh, color)
        if r.random() < .35: s += '<path d="M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f Z" fill="%s"/>' % (
            x - 52 * hh, y - 168 * hh, x, y - 236 * hh, x + 52 * hh, y - 168 * hh, x, y - 160 * hh, color)   # a hat
    return s


def flash(r=120):
    return ('<defs><radialGradient id="fl"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".35" stop-color="#FFF6DD" stop-opacity=".5"/>'
            '<stop offset="1" stop-color="#FFF6DD" stop-opacity="0"/></radialGradient></defs><circle cx="%d" cy="%d" r="%d" fill="url(#fl)"/>' % (r, r, r))


def question(color='#EFE8D6'):
    return '<text x="30" y="70" font-family="var(--f-title)" font-size="84" fill="%s" text-anchor="middle">?</text>' % color


def ghost_watch(R=88, color='#EFE8D6'):
    """A dashed outline of a typical round dress watch of the time, for scale."""
    return ('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-width="3" stroke-dasharray="9 7" opacity=".8"/>' % (R + 4, R + 4, R, color))


def steel_plate(w=150, h=96):
    """A small plate of brushed steel with a polished bevel: the material of the brief."""
    lines = ''.join('<line x1="6" y1="%d" x2="%d" y2="%d" stroke="#9DA4AC" stroke-width="1.4" opacity=".7"/>' % (y, w - 6, y) for y in range(10, h - 6, 5))
    return ('<defs><linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D5DADF"/><stop offset=".45" stop-color="#9EA5AD"/>'
            '<stop offset=".55" stop-color="#E4E8EC"/><stop offset="1" stop-color="#8C939B"/></linearGradient></defs>'
            '<rect width="%d" height="%d" rx="5" fill="#6F767E"/><rect x="5" y="5" width="%d" height="%d" rx="3" fill="url(#st)"/>%s' % (w, h, w - 10, h - 10, lines))


# ---------------------------------------------------------------- review round 2: depth, light and life
_uid = [0]
def uid(p='u'):
    _uid[0] += 1
    return '%s%d' % (p, _uid[0])


def soft_ellipse(rx, ry, color='#000', opacity=.30, blur=6):
    """A blurred ellipse in a (2rx+4blur) x (2ry+4blur) box: contact shadows, pools of light."""
    i = uid('se'); W, H = 2 * rx + 8 * blur, 2 * ry + 8 * blur
    return W, H, ('<defs><filter id="%s" x="-50%%" y="-50%%" width="200%%" height="200%%"><feGaussianBlur stdDeviation="%s"/></filter></defs>'
                  '<ellipse cx="%d" cy="%d" rx="%d" ry="%d" fill="%s" opacity="%s" filter="url(#%s)"/>' % (i, blur, W / 2, H / 2, rx, ry, color, opacity, i))


def floor_band(color, top='#00000000', h=260, w=760):
    return '<rect width="%d" height="%d" fill="%s"/><rect width="%d" height="3" fill="%s"/>' % (w, h, color, w, top)


def glint_band(h, w=90, skew=40, color='#FFFAEB', peak=.42):
    i = uid('gl')
    return ('<defs><linearGradient id="%s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="%s" stop-opacity="0"/>'
            '<stop offset=".5" stop-color="%s" stop-opacity="%s"/><stop offset="1" stop-color="%s" stop-opacity="0"/></linearGradient></defs>'
            '<polygon points="%s" fill="url(#%s)"/>' % (i, color, color, peak, color, pts([(skew, 0), (w + skew, 0), (w, h), (0, h)]), i))


def mote(r=2.5, color='#FFF1CF'):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (r, r, r, color)


def curtain(w=760, h=1320, n=9, a='#14100C', b='#1D1712', hi='#2A221B'):
    """Theatre curtain in paper: tapered vertical pleats with a thin highlight edge."""
    s = '<rect width="%d" height="%d" fill="%s"/>' % (w, h, a)
    pw = w / n
    for k in range(n):
        x = k * pw
        s += '<path d="M %.1f 0 L %.1f 0 L %.1f %d L %.1f %d Z" fill="%s"/><path d="M %.1f 0 L %.1f %d" stroke="%s" stroke-width="2"/>' % (
            x + 6, x + pw - 6, x + pw - 16, h, x + 16, h, b if k % 2 else a, x + 6, x + 16, h, hi)
    return s


def vignette(w=760, h=1320, color='#000', amt=.55, inner=.55):
    i = uid('vg')
    return ('<defs><radialGradient id="%s" cx="50%%" cy="48%%" r="75%%"><stop offset="%s" stop-color="%s" stop-opacity="0"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="%s"/></radialGradient></defs><rect width="%d" height="%d" fill="url(#%s)"/>' % (i, inner, color, color, amt, w, h, i))


def radial_light(w, h, cx, cy, r, color='#FFE3A0', amt=.22):
    i = uid('rl')
    return ('<defs><radialGradient id="%s" gradientUnits="userSpaceOnUse" cx="%s" cy="%s" r="%s"><stop offset="0" stop-color="%s" stop-opacity="%s"/>'
            '<stop offset="1" stop-color="%s" stop-opacity="0"/></radialGradient></defs><rect width="%d" height="%d" fill="url(#%s)"/>' % (i, cx, cy, r, color, amt, color, w, h, i))


def light_beam(pts_, color='#FFE3A0', amt=.12):
    i = uid('lb')
    return ('<defs><linearGradient id="%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s" stop-opacity="%s"/><stop offset="1" stop-color="%s" stop-opacity="%s"/></linearGradient></defs>'
            '<polygon points="%s" fill="url(#%s)"/>' % (i, color, amt, color, amt * .35, pts(pts_), i))


# Geneva from the studio, in layers (each its own svg so the camera move becomes parallax)
def geneva_sky(w=720, h=760, top='#B9C9D6', bot='#DCE4EA'):
    i = uid('gs')
    return ('<defs><linearGradient id="%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs>'
            '<rect width="%d" height="%d" fill="url(#%s)"/>' % (i, top, bot, w, h, i))


def geneva_mountains(w=720, h=200):
    """Mont Blanc's snow far off, the Saleve ridge in front of it."""
    s = '<polygon points="%s" fill="#F2F5F7"/>' % pts([(0, h * .55), (w * .18, h * .35), (w * .3, h * .45), (w * .52, h * .05), (w * .62, h * .25), (w * .7, h * .18), (w * .85, h * .4), (w, h * .3), (w, h), (0, h)])
    s += '<polygon points="%s" fill="#C9D4DE"/>' % pts([(w * .52, h * .05), (w * .56, h * .5), (w * .62, h * .25), (w * .66, h * .6), (w * .52, h * .7), (w * .45, h * .4)])
    s += '<polygon points="%s" fill="#7F93A0"/>' % pts(jag([(0, h * .8), (w * .15, h * .62), (w * .4, h * .55), (w * .65, h * .66), (w * .85, h * .6), (w, h * .7), (w, h), (0, h)], 2, 3))
    return s


def geneva_quay(w=720, h=120, seed=5):
    r = random.Random(seed); s = ''; x = -10
    while x < w:
        bw, bh = r.uniform(60, 110), r.uniform(50, 100); c = r.choice(['#B8AE98', '#A39880', '#BFB59E'])
        s += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s"/>' % (x, h - bh, bw, bh, c)
        s += ''.join('<rect x="%.1f" y="%.1f" width="7" height="10" fill="#8C826E"/>' % (x + 8 + j * 16, h - bh + 12 + q * 22) for j in range(int((bw - 10) // 16)) for q in range(int((bh - 20) // 22)))
        x += bw + r.uniform(2, 8)
    s += '<path d="M 300 %d q 30 -48 60 0 Z" fill="#9C9078"/>' % (h - 70)      # one dome
    return s


def geneva_lake(w=720, h=300):
    s = ''
    for k, c in enumerate(('#6F8FA8', '#5E7F98', '#557590', '#4C6A84')):
        y = k * h / 4
        s += '<polygon points="%s" fill="%s"/>' % (pts(jag([(0, y)] + [(i * w / 12, y + (3 if i % 2 else -2)) for i in range(1, 12)] + [(w, y), (w, h), (0, h)], 1.5, 11 + k)), c)
    return s


def jet_d_eau(h=300):
    """The Jet d'Eau: a tapered plume with its mist at the top. Anchor at the bottom."""
    return ('<path d="M 28 %d L 22 40 Q 30 10 38 40 L 32 %d Z" fill="#F4F7FA"/>' % (h, h) +
            ''.join('<circle cx="%d" cy="%d" r="%d" fill="#F4F7FA" opacity=".35"/>' % c for c in ((30, 34, 22), (44, 48, 16), (16, 52, 14))))


def steamer(w=160, h=60):
    """A paddle steamer on the lake (generic: white hull, two funnels)."""
    return ('<path d="M 0 36 L 160 36 L 146 58 L 12 58 Z" fill="#EFE8D6"/><rect x="24" y="22" width="112" height="14" fill="#EFE8D6"/>'
            '<rect x="30" y="26" width="100" height="4" fill="#8C826E"/><rect x="56" y="2" width="12" height="22" fill="#B23A2E"/><rect x="90" y="2" width="12" height="22" fill="#16181D"/>'
            '<circle cx="80" cy="44" r="12" fill="#C9C1AE"/>')


def cloud_paper(w=200, h=70, color='#F2F5F7'):
    return '<path d="M 10 60 Q 0 30 40 32 Q 50 4 90 14 Q 120 0 140 24 Q 190 20 190 60 Z" fill="%s" opacity=".9"/>' % color


def aurora(w=760, h=360):
    s = ''
    for k, (c, o) in enumerate((('#2F6F6A', .35), ('#3E8A78', .25), ('#5E9E8A', .18))):
        y = 60 + k * 70
        s += '<path d="M -20 %d C 180 %d 320 %d 520 %d S 740 %d 780 %d L 780 %d C 600 %d 420 %d 240 %d S 40 %d -20 %d Z" fill="%s" opacity="%s"/>' % (
            y, y - 50, y + 60, y, y - 40, y + 10, y + 70, y + 40, y + 120, y + 60, y + 100, y + 80, c, o)
    return s


def stars(w=720, h=520, n=30, seed=7, color='#EFE8D6'):
    r = random.Random(seed)
    return ''.join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s" opacity="%.2f"/>' % (r.uniform(0, w), r.uniform(0, h), r.uniform(1, 2.2), color, r.uniform(.35, .8)) for _ in range(n))


def star8(r=18, color='#C9A35F', under='#9C7B3F'):
    p = [(r + (r if k % 2 == 0 else r * .42) * math.cos(math.radians(k * 22.5 - 90)), r + (r if k % 2 == 0 else r * .42) * math.sin(math.radians(k * 22.5 - 90))) for k in range(16)]
    return '<polygon points="%s" fill="%s" transform="translate(1.5 2)"/><polygon points="%s" fill="%s"/>' % (pts(p), under, pts(p), color)


def envelope(w=150, h=96, seal='#9E2B22'):
    """A letter (no logo): cream envelope, flap, a wax dot."""
    return ('<rect width="%d" height="%d" rx="4" fill="#EFE8D6"/><path d="M 0 0 L %d %d L %d 0" fill="#E2D9C3" stroke="#CFC6B1" stroke-width="1.5"/>' % (w, h, w / 2, h * .55, w) +
            '<circle cx="%d" cy="%d" r="10" fill="%s"/>' % (w / 2, h * .55, seal))


def index_card(name='GENTA, G.', w=300, h=180):
    """An archive index card: a red header rule, typed lines."""
    return ('<rect width="%d" height="%d" rx="3" fill="#F6F1E3"/><rect x="0" y="34" width="%d" height="3" fill="#B23A2E"/>' % (w, h, w) +
            ''.join('<rect x="18" y="%d" width="%d" height="1.5" fill="#B9B2A2"/>' % (y, w - 36) for y in range(66, h - 10, 26)) +
            '<text x="18" y="26" font-family="var(--f-mono)" font-size="15" fill="#8A8478">AUDEMARS PIGUET · ARCHIVES</text>'
            '<text x="18" y="62" font-family="var(--f-mono)" font-size="22" font-weight="700" fill="#16181D">%s</text>'
            '<text x="18" y="88" font-family="var(--f-mono)" font-size="16" fill="#3A3B3E">1960 · dessins</text>' % name)


def tick_mark(color='#B23A2E'):
    return '<path d="M 4 30 L 18 46 L 52 6" stroke="%s" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' % color


def spruce_band(w=760, h=240, seed=8):
    """The Vallee de Joux: Risoud spruce, a meadow, a sliver of the lake."""
    r = random.Random(seed)
    s = '<rect y="%d" width="%d" height="%d" fill="#8EA07A"/><rect y="%d" width="%d" height="%d" fill="#7E97A6"/>' % (h * .55, w, h * .45, h * .78, w, h * .22)
    for i in range(44):
        x, ht = r.uniform(-20, w + 20), r.uniform(50, 95); base = h * .6 + r.uniform(-8, 8)
        s += '<polygon points="%s" fill="%s"/>' % (pts([(x, base - ht), (x - ht * .26, base), (x + ht * .26, base)]), r.choice(['#2F4038', '#3B5046']))
    return s


def cork_board(w=600, h=360):
    r = random.Random(12)
    s = '<rect width="%d" height="%d" rx="6" fill="#5A4632"/><rect x="12" y="12" width="%d" height="%d" fill="#B08A5A"/>' % (w, h, w - 24, h - 24)
    s += ''.join('<circle cx="%.1f" cy="%.1f" r="1.6" fill="#9C7A4C"/>' % (r.uniform(14, w - 14), r.uniform(14, h - 14)) for _ in range(260))
    return s


def pin_head(color='#B23A2E'):
    return '<circle cx="8" cy="8" r="7" fill="%s"/><circle cx="6" cy="6" r="2" fill="#FFFFFF" opacity=".6"/>' % color


def ribbon_timeline(years, w=560, h=34):
    s = '<rect width="%d" height="%d" fill="#EFE8D6"/>' % (w, h)
    for k, y in enumerate(years):
        x = 30 + k * (w - 60) / (len(years) - 1)
        s += '<rect x="%.1f" y="0" width="2" height="9" fill="#16181D"/><text x="%.1f" y="27" font-family="var(--f-banner)" font-weight="800" font-size="15" fill="#16181D" text-anchor="middle">%s</text>' % (x - 1, x, y)
    return s


def road_and_hills(w=760, h=140):
    s = '<polygon points="%s" fill="#9FAF8E"/>' % pts([(0, 60), (120, 30), (260, 52), (420, 20), (560, 46), (760, 28), (760, 110), (0, 110)])
    s += '<polygon points="%s" fill="#8EA07A"/>' % pts([(0, 84), (200, 64), (380, 80), (600, 62), (760, 76), (760, 112), (0, 112)])
    s += '<rect y="110" width="%d" height="26" fill="#B8AE98"/>' % w
    s += ''.join('<rect x="%d" y="121" width="22" height="3" fill="#EFE8D6"/>' % x for x in range(10, w, 46))
    return s


def tandem_frame(c='#B23A2E'):
    """The tandem without its wheels (wheel() spins separately). Same 520x230 box as tandem_bike()."""
    return ('<path d="M 80 160 L 170 70 L 330 70 L 440 160 M 170 70 L 250 160 L 330 70 M 250 160 L 80 160 M 440 160 L 400 40" stroke="%s" stroke-width="11" fill="none" stroke-linejoin="round"/>' % c +
            '<rect x="150" y="52" width="46" height="12" rx="6" fill="#2A2C31"/><rect x="306" y="52" width="46" height="12" rx="6" fill="#2A2C31"/>' +
            '<path d="M 384 36 L 430 30" stroke="#2A2C31" stroke-width="9" stroke-linecap="round"/><path d="M 172 50 L 150 30 L 176 40 Z" fill="%s"/>' % c)


def wheel(r=62):
    return ('<circle cx="%d" cy="%d" r="%d" fill="none" stroke="#2A2C31" stroke-width="9"/>' % (r + 5, r + 5, r) +
            ''.join('<line x1="%d" y1="%d" x2="%.1f" y2="%.1f" stroke="#8A8F96" stroke-width="2"/>' % (r + 5, r + 5, r + 5 + (r - 4) * math.cos(math.radians(a)), r + 5 + (r - 4) * math.sin(math.radians(a))) for a in range(0, 360, 30)) +
            '<circle cx="%d" cy="%d" r="6" fill="#2A2C31"/>' % (r + 5, r + 5))


# lifestyle, 1970: what a steel sports watch is for (generic shapes, no brands)
def icon_yacht():
    return ('<path d="M 70 10 L 70 120 L 10 120 Z" fill="#EFE8D6"/><path d="M 78 20 Q 140 70 120 120 L 78 120 Z" fill="#B23A2E"/>'
            '<path d="M 0 130 L 150 130 L 130 156 L 18 156 Z" fill="#EFE8D6"/><rect x="72" y="8" width="4" height="124" fill="#3A3B3E"/>')


def icon_racket():
    return ('<ellipse cx="50" cy="50" rx="40" ry="48" fill="none" stroke="#EFE8D6" stroke-width="8"/>' +
            ''.join('<line x1="%d" y1="6" x2="%d" y2="94" stroke="#A9B0B8" stroke-width="1.5"/>' % (x, x) for x in range(22, 80, 10)) +
            ''.join('<line x1="12" y1="%d" x2="88" y2="%d" stroke="#A9B0B8" stroke-width="1.5"/>' % (y, y) for y in range(18, 90, 10)) +
            '<rect x="44" y="96" width="12" height="70" rx="5" fill="#EFE8D6"/><circle cx="104" cy="150" r="14" fill="#D9E06A"/>')


def icon_skis():
    return ('<rect x="40" y="0" width="14" height="170" rx="7" fill="#EFE8D6" transform="rotate(-18 47 85)"/>'
            '<rect x="66" y="0" width="14" height="170" rx="7" fill="#B23A2E" transform="rotate(18 73 85)"/>')


def icon_car():
    return ('<path d="M 0 60 L 20 40 Q 60 14 110 18 L 150 36 L 190 44 Q 200 48 200 60 L 200 72 L 0 72 Z" fill="#EFE8D6"/>'
            '<path d="M 50 38 Q 70 24 104 24 L 128 38 Z" fill="#2A2C31"/><circle cx="46" cy="74" r="16" fill="#2A2C31"/><circle cx="160" cy="74" r="16" fill="#2A2C31"/>'
            '<circle cx="46" cy="74" r="6" fill="#A9B0B8"/><circle cx="160" cy="74" r="6" fill="#A9B0B8"/>')


def icon_sunglasses():
    return ('<path d="M 0 10 L 140 10" stroke="#EFE8D6" stroke-width="6"/><path d="M 6 12 L 60 12 Q 60 50 34 50 Q 8 50 6 12 Z" fill="#2A2C31" stroke="#EFE8D6" stroke-width="4"/>'
            '<path d="M 80 12 L 134 12 Q 132 50 106 50 Q 80 50 80 12 Z" fill="#2A2C31" stroke="#EFE8D6" stroke-width="4"/>')


def rapier(uid_='rp'):
    """One rapier, hilt at the bottom of a 60x300 box."""
    return ('<defs><linearGradient id="%s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E4E8EC"/><stop offset="1" stop-color="#9EA5AD"/></linearGradient></defs>'
            '<path d="M 27 0 L 33 0 L 34 220 L 26 220 Z" fill="url(#%s)"/><path d="M 30 4 L 30 218" stroke="#FFFFFF66" stroke-width="1.5"/>'
            '<path d="M 4 222 Q 30 196 56 222 Q 30 250 4 222 Z" fill="#9C7B3F"/><path d="M 8 220 Q 30 200 52 220 Q 30 244 8 220 Z" fill="#C9A35F"/>'
            '<rect x="25" y="236" width="10" height="44" rx="4" fill="#5A3A22"/><circle cx="30" cy="284" r="7" fill="#C9A35F"/>' % (uid_, uid_))


def cavalier_hat():
    return ('<ellipse cx="110" cy="70" rx="110" ry="22" fill="#16181D"/><path d="M 50 70 Q 54 14 110 12 Q 166 14 170 70 Z" fill="#16181D"/>'
            '<rect x="52" y="54" width="116" height="12" fill="#B23A2E"/>' +
            ''.join('<path d="M 150 56 Q %d %d %d %d" stroke="#EFE8D6" stroke-width="7" fill="none" stroke-linecap="round"/>' % (180 + k * 6, 10 - k * 4, 214 - k * 6, 30 + k * 10) for k in range(5)))


def bubble_sea(r=240):
    """The memory: an underwater paper diorama in a deckled circle."""
    i = uid('sea'); c = r + 12
    edge = [(c + (r + 8 + random.Random(k).uniform(-3, 3)) * math.cos(2 * math.pi * k / 64), c + (r + 8 + random.Random(k + 99).uniform(-3, 3)) * math.sin(2 * math.pi * k / 64)) for k in range(64)]
    s = '<defs><clipPath id="%s"><circle cx="%d" cy="%d" r="%d"/></clipPath></defs>' % (i, c, c, r)
    s += '<polygon points="%s" fill="#EFE8D6"/>' % pts(edge)
    s += '<g clip-path="url(#%s)">' % i
    for k, col in enumerate(('#2C6A80', '#1E4A63', '#143246')):
        s += '<rect x="0" y="%d" width="%d" height="%d" fill="%s"/>' % (k * 2 * c / 3, 2 * c, 2 * c / 3 + 2, col)
    s += ''.join('<polygon points="%s" fill="#FFFFFF" opacity=".08"/>' % pts([(x, 0), (x + 40, 0), (x + 140, 2 * c), (x + 60, 2 * c)]) for x in (60, 200, 330))
    s += '<path d="M 0 %d Q %d %d %d %d L %d %d L 0 %d Z" fill="#C9B38A"/>' % (2 * c - 60, c, 2 * c - 100, 2 * c, 2 * c - 70, 2 * c, 2 * c, 2 * c)
    s += '<g transform="translate(70 %d)">%s</g><g transform="translate(%d %d) scale(.8)">%s</g>' % (2 * c - 260, kelp(220), 2 * c - 110, 2 * c - 240, kelp(220, '#2A5444'))
    s += '</g>'
    return s


def kelp(h=200, color='#2F5E4A'):
    return '<path d="M 20 %d Q 0 %d 22 %d Q 44 %d 20 %d Q 0 %d 18 0 Q 30 %d 34 %d Q 50 %d 34 %d Q 22 %d 32 %d Z" fill="%s"/>' % (
        h, h * .75, h * .5, h * .3, h * .15, h * .05, h * .2, h * .4, h * .62, h * .8, h * .9, h, color)


def ring(r=8, color='#CFE3EE'):
    return '<circle cx="%d" cy="%d" r="%d" fill="none" stroke="%s" stroke-width="2"/>' % (r + 2, r + 2, r, color)


def drape(w=380, h=460, color='#4A1F25'):
    """A velvet cloth over the showcase: three soft folds."""
    i = uid('dr')
    return ('<defs><linearGradient id="%s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3A161B"/><stop offset=".2" stop-color="%s"/>'
            '<stop offset=".35" stop-color="#5E2A31"/><stop offset=".5" stop-color="#3A161B"/><stop offset=".68" stop-color="#5E2A31"/><stop offset=".85" stop-color="%s"/>'
            '<stop offset="1" stop-color="#3A161B"/></linearGradient></defs><path d="M 20 0 Q %d -14 %d 0 L %d %d Q %d %d %d %d Q %d %d 0 %d Z" fill="url(#%s)"/>'
            % (i, color, color, w / 2, w - 20, w, h, w * .75, h + 18, w / 2, h, w * .25, h + 18, h, i))


def swing_tag(text='3,300 CHF', w=230, h=112):
    return ('<rect width="%d" height="%d" rx="9" fill="#F6F1E3"/><rect x="2" y="2" width="%d" height="%d" rx="8" fill="none" stroke="#D9CFB8" stroke-width="2"/>' % (w, h, w - 4, h - 4) +
            '<circle cx="24" cy="%d" r="8" fill="#3B4048"/><rect x="50" y="34" width="%d" height="2" fill="#C9A35F"/>' % (h / 2, w - 74) +
            '<text x="%d" y="84" font-family="var(--f-cap)" font-weight="700" font-size="38" fill="#16181D" text-anchor="middle">%s</text>' % (w / 2 + 12, text))


def pendant_lamp():
    return ('<rect x="58" y="0" width="4" height="60" fill="#16181D"/><path d="M 20 100 L 40 60 L 80 60 L 100 100 Z" fill="#2A2C31"/>'
            '<ellipse cx="60" cy="100" rx="40" ry="7" fill="#FFE6A8"/>')


def banner_cloth(w=600, h=70):
    return '<rect x="0" y="0" width="%d" height="%d" fill="#EFE8D6"/><rect x="0" y="%d" width="%d" height="4" fill="#B23A2E"/>' % (w, h, h - 6, w) + \
           '<line x1="40" y1="-60" x2="40" y2="0" stroke="#16181D" stroke-width="2"/><line x1="%d" y1="-60" x2="%d" y2="0" stroke="#16181D" stroke-width="2"/>' % (w - 40, w - 40)


def carpet(w=760, h=300):
    return '<polygon points="%s" fill="#7A2A26"/><polygon points="%s" fill="#5E1F1C"/>' % (pts([(w * .3, 0), (w * .7, 0), (w, h), (0, h)]), pts([(w * .3, 0), (w * .32, 0), (w * .04, h), (0, h)]))


def velvet_riser(w=240, h=40):
    return '<rect width="%d" height="%d" rx="6" fill="#4A1F25"/><rect x="0" y="0" width="%d" height="6" rx="3" fill="#6B323A"/>' % (w, h, w)


def desk_edge(w=760, h=150):
    return '<rect width="%d" height="%d" fill="#4A3828"/><rect width="%d" height="26" fill="#5A4632"/><rect width="%d" height="3" fill="#7A6046"/>' % (w, h, w, w)


def nameplate(text, w=200, h=40):
    return ('<rect width="%d" height="%d" rx="3" fill="#9C7B3F"/><rect x="3" y="3" width="%d" height="%d" rx="2" fill="#C9A35F"/>' % (w, h, w - 6, h - 6) +
            '<text x="%d" y="%d" font-family="var(--f-cap)" font-weight="700" font-size="15" fill="#16181D" text-anchor="middle">%s</text>' % (w / 2, h / 2 + 5, text))


def bankers_lamp():
    return ('<rect x="56" y="70" width="8" height="70" fill="#C9A35F"/><ellipse cx="60" cy="142" rx="40" ry="8" fill="#9C7B3F"/>'
            '<path d="M 4 70 Q 60 30 116 70 Z" fill="#2E5D3A"/><rect x="4" y="66" width="112" height="6" fill="#244A2E"/>')


def drafting_board():
    """Genta's tilted drafting board, 1970: wood board on an iron stand, a pinned sheet, a parallel rule."""
    return ('<rect x="150" y="150" width="14" height="190" fill="#2A2C31"/><rect x="100" y="330" width="120" height="12" fill="#2A2C31"/>'
            '<polygon points="0,140 300,40 320,90 20,190" fill="#8B6A45"/><polygon points="6,136 296,40 314,84 22,182" fill="#C8A46A"/>'
            '<polygon points="60,128 230,72 246,110 76,166" fill="#F6F1E3"/><polygon points="20,160 306,64 308,70 22,166" fill="#9BA2AB"/>')


def jar_brushes():
    return ('<rect x="10" y="40" width="50" height="60" rx="6" fill="#C9D4DE" opacity=".6"/>' +
            ''.join('<rect x="%d" y="%d" width="5" height="%d" fill="%s" transform="rotate(%d %d 90)"/>' % (x, y, 90 - y, c, a, x)
                    for x, y, c, a in ((22, 0, '#B23A2E', -8), (32, 6, '#2E5D3A', 4), (42, 12, '#C9A35F', 12))) +
            ''.join('<rect x="%d" y="88" width="22" height="14" rx="3" fill="#EFE8D6"/><rect x="%d" y="84" width="22" height="6" rx="2" fill="%s"/>' % (x, x, c)
                    for x, c in ((70, '#2F5E8A'), (96, '#B23A2E'), (122, '#C9C1AE'))))



def gear(r=80, teeth=12, color='#B9BEC4', dark='#6F767E'):
    """A plain paper cog (generic mechanics, not a watch part from any maker). Box 2r+20 square."""
    c = r + 10; p = []
    for k in range(teeth * 4):
        a = 2 * math.pi * k / (teeth * 4); rr = r + 9 if (k % 4) in (1, 2) else r - 2
        p.append((c + rr * math.cos(a), c + rr * math.sin(a)))
    return ('<polygon points="%s" fill="%s" transform="translate(2 3)"/><polygon points="%s" fill="%s"/>' % (pts(p), dark, pts(p), color) +
            '<circle cx="%d" cy="%d" r="%d" fill="%s"/>' % (c, c, r * .55, dark) +
            ''.join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (c + r * .32 * math.cos(math.radians(a)), c + r * .32 * math.sin(math.radians(a)), r * .11, color) for a in range(0, 360, 60)) +
            '<circle cx="%d" cy="%d" r="%d" fill="#2A2C31"/>' % (c, c, r * .1))


def sine_path(x0, x1, y, amp, waves):
    n = 160
    return 'M ' + ' L '.join('%.1f %.1f' % (x0 + (x1 - x0) * i / n, y + amp * math.sin(2 * math.pi * waves * i / n)) for i in range(n + 1))
