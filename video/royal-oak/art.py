"""Paper-cut art for the Royal Oak origin story (film.py). Every piece is inline SVG on a 720x1280 stage.

Nothing here draws the Royal Oak itself as a finished product: the watch on screen is always a real photograph
(assets/ro_*.png|jpg, see ASSETS in film.py). The only drawn version is the designer's pencil sketch, which is an
illustration of the idea, not a copy of the original drawing. Generic watches (the gold dress watches of 1970, a steel
tool watch) are plain, unbranded shapes. People appear only as silhouettes and hands: no faces."""
import math, random

SHADOW = 'filter:drop-shadow(0 4px 3px rgba(0,0,0,.30))'
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


def diver_helmet(brass='#B9853F', dark='#6E4A1E', glass='#2C3F4E'):
    """A generic copper-and-brass diving helmet, front view: dome, front porthole held by bolts, two side ports,
    breastplate with its bolts. Illustrative, not a specific maker's helmet."""
    s = '<path d="M 60 300 Q 60 60 220 50 Q 380 60 380 300 Z" fill="%s"/>' % brass
    s += '<path d="M 90 280 Q 92 100 220 80 Q 260 84 290 100 Q 150 110 120 280 Z" fill="#D9A55A" opacity=".55"/>'
    s += '<path d="M 0 300 L 440 300 L 470 420 Q 220 470 -30 420 Z" fill="%s"/>' % dark
    s += '<path d="M 20 310 L 420 310 L 444 408 Q 220 450 -4 408 Z" fill="%s"/>' % brass
    s += ''.join('<circle cx="%.1f" cy="%.1f" r="9" fill="%s"/><circle cx="%.1f" cy="%.1f" r="4" fill="#E3BC7A"/>' % (x, y, dark, x, y)
                 for x, y in [(30 + k * 63, 330 + 40 * abs(math.sin(k * .45)) * 0) for k in range(7)])
    for sx in (90, 350):
        s += '<circle cx="%d" cy="190" r="34" fill="%s"/><circle cx="%d" cy="190" r="24" fill="%s"/>' % (sx, dark, sx, glass)
    s += '<circle cx="220" cy="185" r="96" fill="%s"/>' % dark
    s += '<circle cx="220" cy="185" r="80" fill="%s"/>' % brass
    s += '<circle cx="220" cy="185" r="62" fill="%s"/>' % glass
    s += '<path d="M 182 150 Q 200 132 230 134" stroke="#9FB8C8" stroke-width="7" fill="none" stroke-linecap="round" opacity=".7"/>'
    for k in range(8):
        a = math.radians(22.5 + 45 * k); bx, by = 220 + 71 * math.cos(a), 185 + 71 * math.sin(a)
        s += '<polygon points="%s" fill="%s"/><circle cx="%.1f" cy="%.1f" r="3" fill="#E3BC7A"/>' % (pts(hexagon(bx, by, 9, 30)), dark, bx, by)
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
    # the case: wider than the bezel, flat where the bracelet joins
    cw, ch = R * 1.18, R * 1.12
    case = 'M %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f Z' % (
        cx - cw * .62, cy - ch, cx + cw * .62, cy - ch, cx + cw * 1.12, cy, cx + cw * .62, cy + ch,
        cx - cw * .62, cy + ch, cx - cw * .62, cy + ch, cx - cw * 1.12, cy, cx - cw * .62, cy - ch)
    add(case, 3.3, 0.8, width=2.6, stroke=G)
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
            wt = cw * 1.24 - i * 9; wb = wt - 9
            d = 'M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z' % (cx - wt * .5, top, cx + wt * .5, top, cx + wb * .5, bot, cx - wb * .5, bot)
            add(d, 3.9 + i * 0.14 + (0.05 if sgn > 0 else 0), 0.25, width=2.2, stroke=G)
            add('M %.1f %.1f L %.1f %.1f' % (cx - wt * .16, top + sgn * 6, cx - wt * .16, bot - sgn * 6), 4.0 + i * 0.14, 0.2, width=1.4, stroke=G, opacity=.75)
            add('M %.1f %.1f L %.1f %.1f' % (cx + wt * .16, top + sgn * 6, cx + wt * .16, bot - sgn * 6), 4.0 + i * 0.14, 0.2, width=1.4, stroke=G, opacity=.75)
    # the dial: a fine grid, batons
    grid = ''.join('M %.1f %.1f L %.1f %.1f ' % (cx - R * .62, cy + v, cx + R * .62, cy + v) for v in range(-80, 81, 20))
    grid += ''.join('M %.1f %.1f L %.1f %.1f ' % (cx + v, cy - R * .62, cx + v, cy + R * .62) for v in range(-80, 81, 20))
    add(grid, 5.0, 0.7, width=0.9, stroke=LIGHT, opacity=.6)
    add('M %d %d L %d %d M %d %d L %d %d' % (cx, cy, cx - 38, cy - 70, cx, cy, cx + 76, cy + 22), 5.4, 0.35, width=3.2, stroke=G)
    # steel: a grey wash over the case and bezel
    add(case, 5.95, 0.01, width=0.1, stroke=G, fill=STEEL, fillAt=5.95 * K, fillDur=0.6, fillOpacity=.55)
    add(path(oc), 6.05, 0.01, width=0.1, stroke=G, fill='#D4D8DD', fillAt=6.05 * K, fillDur=0.6, fillOpacity=.6)
    T = [dict(text='8 vis', x=cx + R * 1.25, y=cy - R * .95, size=30, at=2.6 * K, dur=0.5 * K, rot=-6, color=G),
         dict(text='acier', x=cx - R * 1.75, y=cy + R * .2, size=34, at=6.1 * K, dur=0.5 * K, rot=-8, color=G)]
    # little leader lines for the notes
    add('M %.1f %.1f Q %.1f %.1f %.1f %.1f' % (cx + R * 1.22, cy - R * 1.02, cx + R * 1.0, cy - R * 1.1, screws[6][0] + 12, screws[6][1] - 4), 2.7, 0.35, width=1.4, stroke=G)
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
def hall(w=900, h=1100):
    s = '<rect width="%d" height="%d" fill="#2A221C"/>' % (w, h)
    for i in range(7):
        x = i * w / 6
        s += '<rect x="%d" y="0" width="22" height="%d" fill="#1B1611"/>' % (x - 11, h)
    s += '<rect x="0" y="0" width="%d" height="90" fill="#1B1611"/>' % w
    r = random.Random(9)
    for i in range(9):
        x = 50 + i * (w - 100) / 8
        s += '<path d="M %d 90 L %d 90 L %d 190 L %d 170 L %d 190 Z" fill="%s"/>' % (x - 26, x + 26, x + 26, x, x - 26, ['#B23A2E', '#EFE8D6', '#2F5E8A'][i % 3])
    return s


def booth(w=520, h=420):
    return ('<rect x="0" y="0" width="%d" height="%d" fill="#3A302A"/>' % (w, h) +
            '<rect x="0" y="0" width="%d" height="70" fill="#EFE8D6"/>' % w +
            '<rect x="20" y="90" width="%d" height="%d" fill="#2A221C"/>' % (w - 40, h - 110))


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
