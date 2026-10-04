#!/usr/bin/env python3
"""Genta and the Royal Oak in two parts, narrated in Gulf Arabic (voice-ar/).

  Part 1, before the Royal Oak: the famous Genta, back to 1954, the Polerouter, Omega's Constellation, his 1960s
          designs for Audemars Piguet, the tandem with Georges Golay, and the phone ringing on 10 April 1970.
  Part 2, the Royal Oak: the Three Musketeers in Basel, the 4 pm call, the night of 10-11 April, the original
          sketch, steel at 3,300 francs, Basel 1972, the doubters and the icon.

  python3 parts.py                 -> part1.json, part2.json, cover1.json, cover2.json
  node ../../.claude/skills/paper-story/scripts/render.mjs part1.json --check

Every watch on screen is a real photograph: Audemars Piguet's archive (AP Chronicles, assets/ap, (c) Audemars
Piguet, used at the user's direction and credited), Wikimedia Commons (assets/early). People are paper characters
made on Higgsfield (assets/gen) or archive portraits; Golay and the agents are seen from behind. A character or
photo whose file is not there yet shows a REAL PHOTO NEEDED panel. Facts: FACTS-AR.md."""
import json, os
from art import *

H = os.path.dirname(os.path.abspath(__file__))
ST = json.load(open(os.path.join(H, 'ro-style.json')))
VO = json.load(open(os.path.join(H, 'voice-ar', 'clips.json')))
ASP = {}
for f in ('assets/gen/aspects.json', 'assets/cut/aspects.json', 'assets/early/aspects.json'):
    p = os.path.join(H, f)
    if os.path.exists(p): ASP.update(json.load(open(p)))
VO_AT, TAIL = 0.12, 0.2
CAP = lambda s: s          # captions are the narration itself, split into short groups with |


def exists(rel):
    return any(os.path.exists(os.path.join(H, rel + e)) for e in ('', '.png', '.jpg', '.webp'))


def pic(rel):
    for e in ('', '.png', '.jpg', '.webp'):
        if os.path.exists(os.path.join(H, rel + e)) and os.path.isfile(os.path.join(H, rel + e)): return rel + e
    return None


class Part:
    def __init__(self): self.sc = []
    def S(self, key, theme, caption, els, tail=TAIL, voiceAt=VO_AT, **kw):
        d = VO[key]['seconds']
        sc = {"theme": theme, "floor": False, "elements": els, "dur": round(voiceAt + d + tail, 2), "silent": True,
              "captions": caption, "captionStart": voiceAt + 0.05, "captionEnd": voiceAt + d}
        if os.path.exists(os.path.join(H, 'voice-ar', VO[key]['file'])): sc["voice"] = 'voice-ar/' + VO[key]['file']; sc["voiceAt"] = voiceAt
        sc.update(kw); self.sc.append(sc); return sc


V = lambda t: round(VO_AT + t, 2)
E = lambda name, at, gain=-12: {"at": round(at, 2), "name": name, "gain": gain}
cam = lambda *keys: {"zoom": [[t, z, e] if e else [t, z] for t, z, x, y, e in keys], "x": [[t, x, e] if e else [t, x] for t, z, x, y, e in keys],
                     "y": [[t, y, e] if e else [t, y] for t, z, x, y, e in keys]}


def cutout(rel, x, y, h, at, z=20, kind='fade', dur=.3, until=None, person=False, aspect=None, desc='', edge=0, **kw):
    """A cut-out (person or watch), anchored at its bottom. A missing file shows a placeholder with desc."""
    name = os.path.basename(rel).replace('_cut', '')
    f = pic(rel)
    a = aspect or ASP.get(name) or ASP.get(os.path.basename(rel))
    if not a and f:
        from PIL import Image
        w_, h_ = Image.open(os.path.join(H, f)).size; a = w_ / h_
    d = {"type": "cutout", "x": x, "y": y, "h": h, "aspect": a or .6, "edge": edge, "z": z, "in": {"type": kind, "at": at, "dur": dur}}
    if f: d["src"] = f
    else: d["asset"] = rel[len('assets/'):] if rel.startswith('assets/') else rel; d["desc"] = desc
    if person: d["person"] = True; d["headBand"] = .2
    if until is not None: d["out"] = {"type": "fade", "at": until, "dur": .25}
    d.update(kw); return d


def polaroid(rel, x, y, w, at, label='', z=30, rot=0, until=None, kind='drop', desc='', aspect=None, **kw):
    """A real photograph on a taped paper print, anchored at its centre."""
    f = pic(rel)
    if f:
        from PIL import Image
        iw, ih = Image.open(os.path.join(H, f)).size; a = aspect or iw / ih
        d = {"type": "image", "src": f, "polaroid": True, "aspect": a, "label": label, "w": w}
    else:
        d = {"type": "photo", "asset": rel[len('assets/'):], "desc": desc, "label": label, "w": w, "aspect": aspect or 1.0}
    d.update({"x": x, "y": y, "z": z, "rot": rot, "in": {"type": kind, "at": at, "dur": .45}, "labelSize": 22})
    if until is not None: d["out"] = {"type": "fade", "at": until, "dur": .25}
    d.update(kw); return d


def macro(rel, at, out, z=50, zoom=(1.0, 1.12), pos='50% 50%'):
    return {"type": "image", "src": pic(rel), "x": 360, "y": 640, "w": 720, "h": 1280, "frame": False, "fit": "cover", "pos": pos, "depth": 0,
            "z": z, "scale": [[at, zoom[0]], [out, zoom[1]]], "in": {"type": "fade", "at": at, "dur": .25},
            "out": {"at": out, "type": "fade", "dur": .2}, "still": True}


def tag(text, x, y, at, size=30, z=35, rot=-2, until=None, ink='#16181D', paper='#EFE8D6', **kw):
    d = {"type": "text", "text": text, "x": x, "y": y, "font": "banner", "size": size, "color": ink, "paper": paper, "upper": False, "z": z, "rot": rot,
         "in": {"type": "pop", "at": at, "dur": .35}}
    if until is not None: d["out"] = {"type": "fade", "at": until, "dur": .2}
    d.update(kw); return d


def flips(years, x, y, t0, step, z=20, scale=1.0, last_out=None):
    els = []
    for i, yr in enumerate(years):
        t = t0 + i * step
        c = calendar(x, y, yr, at=t, z=z + i, scale=scale)
        c["in"] = {"type": "flip", "at": t, "dur": min(.18, step * .6)}
        if i < len(years) - 1: c["out"] = {"type": "fade", "at": t + step + .02, "dur": .05}
        elif last_out: c["out"] = {"type": "fade", "at": last_out, "dur": .2}
        els.append(c)
    return els


def ringing_phone(x, y, t0, t1, z=10, scale=.7):
    out = [svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3'), x, y, z=z, kind='pop', at=t0 - .3, dur=.3, scale=scale,
                idle={"type": "shake", "amp": 3, "speed": 9, "from": t0, "until": t1}),
            svg(260, 80, ring_lines('#2A2C31'), x, y - 55 * scale / .7, z=z + 1, kind='pop', at=t0, dur=.2, scale=scale,
                idle={"type": "pulse", "amp": .08, "speed": 6}, **({"out": {"type": "fade", "at": t1, "dur": .15}} if t1 else {}))]
    if t1 is None: out[0]['idle'] = {"type": "shake", "amp": 3, "speed": 9, "from": t0}
    return out


def tandem_bike(w=520, h=230, c='#B23A2E'):
    """A tandem bicycle, side view: Genta's own image for his partnership with Golay."""
    wheel = lambda cx: ('<circle cx="%d" cy="160" r="62" fill="none" stroke="#2A2C31" stroke-width="9"/>' % cx +
                        ''.join('<line x1="%d" y1="160" x2="%.1f" y2="%.1f" stroke="#8A8F96" stroke-width="2"/>' % (cx, cx + 58 * math.cos(math.radians(a)), 160 + 58 * math.sin(math.radians(a))) for a in range(0, 360, 30)))
    frame = ('<path d="M 80 160 L 170 70 L 330 70 L 440 160 M 170 70 L 250 160 L 330 70 M 250 160 L 80 160 M 440 160 L 400 40" stroke="%s" stroke-width="11" fill="none" stroke-linejoin="round"/>' % c +
             '<rect x="150" y="52" width="46" height="12" rx="6" fill="#2A2C31"/><rect x="306" y="52" width="46" height="12" rx="6" fill="#2A2C31"/>' +
             '<path d="M 384 36 L 430 30" stroke="#2A2C31" stroke-width="9" stroke-linecap="round"/>')
    return wheel(80) + wheel(440) + frame


def rosette(text_lines, color='#B23A2E'):
    s = ''.join('<polygon points="%s" fill="%s"/>' % (pts([(110 + 100 * math.cos(math.radians(a)), 110 + 100 * math.sin(math.radians(a))) for a in (k * 15, k * 15 + 7.5, k * 15 + 15)] + [(110, 110)]), color if k % 2 else '#C7473A') for k in range(24))
    s += '<path d="M 70 190 L 50 290 L 85 270 L 105 300 L 110 200 Z" fill="%s"/><path d="M 150 190 L 170 290 L 135 270 L 115 300 L 110 200 Z" fill="%s"/>' % (color, color)
    s += '<circle cx="110" cy="110" r="70" fill="#EFE8D6"/>'
    for i, t in enumerate(text_lines):
        s += '<text x="110" y="%d" font-family="var(--f-banner)" font-weight="800" font-size="%d" fill="#16181D" text-anchor="middle">%s</text>' % (100 + i * 30 - (len(text_lines) - 1) * 12, 22 if i else 26, t)
    return s


def swords():
    blade = lambda rot: ('<g transform="rotate(%d 150 150)"><rect x="146" y="10" width="8" height="220" fill="#C9CED4"/><rect x="120" y="226" width="60" height="10" rx="4" fill="#C9A35F"/>'
                         '<rect x="144" y="236" width="12" height="44" rx="4" fill="#5A3A22"/></g>' % rot)
    return blade(-35) + blade(35) + blade(0)


CREDITS1 = ('Archive images: © Audemars Piguet (AP Chronicles). Polerouter, Omega Constellation and the 1954 SAS advertisement: Wikimedia Commons. '
            'Paper characters are AI illustrations (Higgsfield); the portrait of Gérald Genta is by Studio Luxury Griffes (CC BY-SA 3.0).')
CREDITS2 = ('Archive images and the original Royal Oak sketch: © Audemars Piguet (AP Chronicles) and the Gérald Genta Heritage Association. '
            'Paper characters are AI illustrations (Higgsfield); Golay and the agents are shown from behind. Portrait of Genta: Studio Luxury Griffes (CC BY-SA 3.0).')
PEND = 'paper character, waiting for Higgsfield credits'

# =================================================================================================================
# PART 1  Before the Royal Oak
P1 = Part()
# 0  The famous Genta, then back to 1954
t_back = V(6.25)
els = [svg(520, 1000, spotlight_cone(), 360, 0, anchor='t', z=2, kind='fade', at=0.0, dur=.6, shadow=False),
       cutout('assets/genta', 360, 1160, 760, .1, z=20, kind='rise', person=True, edge=4, until=V(1.6)),
       cutout('assets/gen/genta_think_cut', 360, 1160, 760, V(1.45), z=21, person=True, until=V(6.9)),
       cutout('assets/gen/young_think_cut', 360, 1160, 760, V(6.75), z=22, person=True, until=V(7.75), dur=.35)]
els += wall_clock(570, 300, 4, 0, z=6, d=150, at=t_back - .2, spin=(t_back, V(7.8), -8))
els += flips(['2000', '1990', '1980', '1970', '1960', '1954'], 160, 330, t_back + .05, .27, z=10, scale=.62)
els.append(svg(760, 1320, '<rect width="760" height="1320" fill="#8A6A3A"/>', 360, 640, z=30, kind=None, shadow=False, depth=0, still=True,
               opacity=[[t_back, 0], [V(7.0), .24], [V(7.9), .12]]))
P1.S('p1-0', 'ro-black', 'هذا جيرالد جنتا… | من أشهر مصممي | الساعات بالتاريخ. | بس قبل لا يصير | اسمه أسطورة… | خلونا نرجع للبداية.', els,
     camera=cam((0, 1.0, 360, 700, None), (V(6.0), 1.12, 360, 660, 'inOutCubic'), (V(7.9), 1.0, 360, 640, 'inOutCubic')),
     sfx=[E('shutter', .15, -14), E('whoosh', t_back, -12), E('crown_wind', t_back + .1, -10)] + [E('paper_tear', t_back + .05 + i * .27, -17) for i in range(6)],
     beds=[{"name": "watch_run", "from": 0, "to": 8, "gain": -28}])

# 1  Geneva 1954: a young man of 23, a watch for SAS flights over the North Pole
CPH = dict(id='cph', lon=12.57, lat=55.68, label='KØBENHAVN'); LAX = dict(id='lax', lon=-118.24, lat=34.05, label='LOS ANGELES')
els = [svg(720, 760, lake(720, 760), 360, 380, z=1, kind='fade', at=0, dur=.4, depth=.6, shadow=False),
       calendar(560, 250, '1954', at=V(.7), z=10, scale=.6),
       svg(560, 250, drafting_table(), 380, 1150, z=3, kind=None, opacity=0),
       cutout('assets/gen/genta23_desk_cut', 330, 1180, 700, V(4.0), z=20, kind='rise', dur=.5, person=True, until=V(7.6)),
       {"type": "map", "x": 360, "y": 600, "w": 720, "h": 1180, "z": 40, "view": [[V(7.3), {"lon": -40, "lat": 62, "span": 210}], [V(13.9), {"lon": -40, "lat": 66, "span": 170}, "inOutCubic"]],
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(CPH, at=V(8.0)), dict(LAX, at=V(8.4))],
        "routes": [{"from": "cph", "to": "lax", "at": V(8.8), "dur": 2.4, "curve": .45, "plane": True, "keep": True}],
        "unfold": {"at": V(7.3), "dur": .8}, "in": {"type": "none", "at": V(7.3)}, "depth": 0},
       polaroid('assets/early/sas1954', 470, 880, 290, V(11.2), label='SAS · 1954', z=45, rot=4, desc='SAS advertisement for the polar route, 1954 (public domain)', aspect=.69)]
P1.S('p1-1', 'ro-alpine', 'جنيف، | سنة ألف وتسعمية | وأربعة وخمسين. | شاب عمره ثلاثة | وعشرين سنة بس، | يصمم لشركة | يونيفرسال جنيف | ساعة لرحلات طيران | إس إيه إس | فوق القطب الشمالي.', els,
     transition='fade', camera=cam((0, 1.0, 360, 640, None), (V(7.2), 1.08, 340, 760, 'inOutCubic'), (V(14.1), 1.0, 360, 640, 'inOutCubic')),
     sfx=[E('paper_tear', V(.7), -14), E('pencil', V(4.4), -10), E('paper_slide', V(7.3), -12), E('plane', V(8.8), -14), E('paper_place', V(11.2), -10)])

# 2  The Polerouter
els = [svg(520, 1000, spotlight_cone(), 360, 0, anchor='t', z=2, kind='fade', at=0, dur=.5, shadow=False),
       cutout('assets/early/polerouter_cut', 360, 1010, 620, .15, z=20, kind='rise', dur=.6, desc='Universal Genève Polerouter (Wikimedia Commons)', scale=[[.15, 1.0], [5.2, 1.06]]),
       tag('Universal Genève Polerouter · 1954', 360, 1110, V(.6), size=26)]
P1.S('p1-2', 'ro-night', 'اسمها البولروتر… | وهي اللي خلت اسمه | ينعرف عند | شركات الساعات.', els, transition='slide',
     camera=cam((0, 1.0, 360, 640, None), (5.2, 1.12, 360, 620, 'inOutCubic')), sfx=[E('shutter', .2, -12), E('tick', 1.8, -16)])

# 3  Omega asks him to refresh the Constellation
els = ringing_phone(560, 330, .2, V(1.3), z=10, scale=.6) + [
       tag('أوميغا', 560, 230, V(.3), size=34),
       cutout('assets/early/constellation_cut', 330, 1060, 600, V(1.4), z=20, kind='rise', dur=.5, desc='Omega Constellation, 1958 (Wikimedia Commons)'),
       tag('Omega Constellation · 1958', 330, 1120, V(2.0), size=24)]
P1.S('p1-3', 'ro-steel', 'بعدها جات أوميغا، | وطلبت منه يجدد | مجموعة الكونستليشن.', els, transition='slide',
     camera=cam((0, 1.0, 360, 640, None), (4.6, 1.06, 360, 660, 'inOutCubic')), sfx=[E('ring', .2, -12), E('paper_place', V(1.4), -10)])

# 4  The early 1960s at Audemars Piguet: 5179 and 5182
els = flips(['1960'], 170, 260, .1, .3, z=10, scale=.55) + [
       polaroid('assets/ap/lebrassus1969', 470, 380, 360, V(1.8), label='Le Brassus', z=12, rot=3),
       cutout('assets/cut/m5179', 220, 1060, 560, V(4.6), z=20, kind='rise', dur=.5),
       tag('5179 · 1961', 220, 1110, V(5.0), size=26),
       cutout('assets/cut/m5182', 520, 1060, 520, V(7.25), z=21, kind='rise', dur=.5),
       tag('5182 · 1962', 520, 1110, V(7.6), size=26, rot=2)]
P1.S('p1-4', 'ro-paper', 'ومع بداية الستينات، | يظهر اسمه في أرشيف | أوديمار بيغيه: | ساعة تجمع | الدائرة والمربع، | وساعة غير متناظرة…', els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (V(4.5), 1.0, 360, 700, 'inOutCubic'), (V(9.2), 1.04, 360, 720, None)),
     sfx=[E('paper_tear', .1, -15), E('paper_place', V(1.8), -10), E('shutter', V(4.6), -14), E('shutter', V(7.25), -14)])

# 5  1967: the bag watch and the Prix de la Ville de Genève
els = flips(['1967'], 170, 250, .1, .3, z=10, scale=.55) + [
       polaroid('assets/ap/m8311_sketch', 230, 640, 280, V(2.0), label='8311 · 1966', z=12, rot=-4),
       polaroid('assets/ap/m8311', 480, 760, 360, V(2.5), label='8311 · 1967', z=14, rot=3),
       svg(220, 300, rosette(['Prix de la Ville', 'de Genève', '1967']), 560, 330, z=20, kind='pop', at=V(4.1), dur=.4, rot=6)]
P1.S('p1-5', 'ro-alpine', 'وفي سنة سبعة وستين، | ساعة شنطة | من تصميمه | تاخذ تنويه | في جائزة مدينة جنيف.', els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (7.2, 1.06, 380, 600, 'inOutCubic')),
     sfx=[E('paper_tear', .1, -15), E('paper_place', V(2.0), -10), E('paper_place', V(2.5), -10), E('stamp', V(4.1), -10)])

# 6  Georges Golay: managing director, the first from outside the founding families
els = [polaroid('assets/ap/lebrassus1969', 360, 360, 560, .1, label='Audemars Piguet · Le Brassus · 1969', z=5, rot=-1, kind='fade'),
       polaroid('assets/ap/golay1966', 250, 820, 360, V(1.75), label='Georges Golay · 1966', z=20, rot=-3),
       cutout('assets/gen/golay_phone_cut', 540, 1240, 440, V(3.0), z=18, kind='rise', dur=.5),
       tag('المدير العام', 250, 1050, V(3.0), size=30),
       tag('أول مدير من خارج العائلتين', 400, 1130, V(4.4), size=26, rot=1)]
P1.S('p1-6', 'ro-alpine', 'وهناك لقى شريكه: | جورج غولاي، | المدير العام… | وأول واحد يدير الشركة | من برا العائلتين | المؤسستين.', els, transition='slide',
     camera=cam((0, 1.0, 360, 520, None), (V(1.6), 1.0, 360, 640, 'inOutCubic'), (V(8.6), 1.05, 360, 720, 'inOutCubic')),
     sfx=[E('paper_place', V(1.75), -10), E('pin', V(3.0), -14), E('pin', V(4.4), -14)])

# 7  "We were like a tandem"; both wore Model 5233
els = [cutout('assets/gen/young_think_cut', 200, 1130, 640, .1, z=20, person=True, kind='rise', dur=.5),
       cutout('assets/gen/golay_phone_cut', 540, 1130, 420, .3, z=18, kind='rise', dur=.5),
       svg(520, 230, tandem_bike(), 360, 340, z=10, kind='slideL', at=V(1.25), dur=.7),
       tag('"كنا مثل التاندم"', 360, 200, V(1.3), size=34),
       cutout('assets/cut/m5233', 360, 1060, 520, V(6.85), z=40, kind='pop', dur=.4),
       tag('5233', 360, 1110, V(7.1), size=28, z=41)]
P1.S('p1-7', 'ro-paper', 'جنتا يقول: | كنا مثل الدراجة | اللي يسوقها اثنين… | إذا واحد منا مو مقتنع، | ما نسوي الموديل. | وحتى كانوا يلبسون | نفس الساعة.', els, transition='slide',
     camera=cam((0, 1.0, 360, 640, None), (V(6.7), 1.0, 360, 640, None), (V(8.9), 1.1, 360, 760, 'inOutCubic')),
     sfx=[E('whoosh', V(1.25), -14), E('click', V(6.85), -10)])

# 8  April 1970: 38 years old, 16 years of designs; on the 10th at 4 pm, the phone rings
gallery = [('assets/early/polerouter_cut', 120, 520), ('assets/early/constellation_cut', 600, 520), ('assets/cut/m5179', 110, 860), ('assets/cut/m5182', 610, 860), ('assets/cut/m5233', 360, 380)]
els = flips(['1970'], 170, 250, .1, .3, z=10, scale=.55, last_out=V(7.5)) + [
       cutout('assets/gen/young_think_cut', 360, 1180, 700, V(2.3), z=20, person=True, kind='rise', dur=.5)]
for i, (rel, gx, gy) in enumerate(gallery):
    els.append(cutout(rel, gx, gy, 230, V(5.0) + i * .18, z=12, kind='pop', dur=.3, until=V(7.5), rot=(-6, 5, -3, 6, 0)[i]))
els += [tag('عشرة أبريل', 170, 250, V(7.6), size=34, until=V(11.4)),
        *wall_clock(560, 270, 4, 0, z=11, d=150, at=V(8.7)),
        *ringing_phone(580, 980, V(10.6), None, z=25, scale=.75),
        tag('يتبع…  الجزء الثاني: الرويال أوك', 360, 210, V(11.6), size=32, z=60, ink='#EFE8D6', paper='#16181D', depth=0)]
P1.S('p1-8', 'ro-night', 'أبريل ألف وتسعمية وسبعين. | جنتا عمره | ثمانية وثلاثين، | ووراه ستطعش سنة | من التصاميم. | وفي يوم عشرة، | الساعة أربعة العصر… | تلفونه يرن.', els,
     tail=2.0, transition='slide', captionClear=V(11.9),
     camera=cam((0, 1.0, 360, 640, None), (V(10.4), 1.0, 360, 640, None), (V(11.8), 1.15, 450, 760, 'inOutCubic'), (V(13.6), 1.15, 450, 760, None)),
     sfx=[E('paper_tear', .1, -15)] + [E('click', V(5.0) + i * .18, -16) for i in range(5)] + [E('tick', V(8.8), -12), E('ring', V(10.6), -8), E('ring', V(11.6), -10)])

# =================================================================================================================
# PART 2  The Royal Oak
P2 = Part()
BSL = dict(id='bsl', lon=7.59, lat=47.56, label='BASEL'); TRN = dict(id='trn', lon=7.69, lat=45.07, label='TORINO')
LSN = dict(id='lsn', lon=6.63, lat=46.52, label='LAUSANNE'); PAR = dict(id='par', lon=2.35, lat=48.86, label='PARIS')
# 0  Basel, 10 April 1970: Golay and the three agents
els = [{"type": "map", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 1, "view": {"lon": 5.2, "lat": 47.0, "span": 9},
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(BSL, at=.2), dict(TRN, at=V(8.6)), dict(LSN, at=V(10.8)), dict(PAR, at=V(12.7))],
        "routes": [{"from": "trn", "to": "bsl", "at": V(8.8), "dur": 1.0, "keep": True}, {"from": "lsn", "to": "bsl", "at": V(11.0), "dur": .9, "keep": True},
                   {"from": "par", "to": "bsl", "at": V(12.9), "dur": 1.0, "keep": True}], "unfold": {"at": .05, "dur": .7}, "depth": 0,
        "out": {"type": "fade", "at": V(3.1), "dur": .3}},
       tag('بازل · ١٠ أبريل ١٩٧٠', 360, 180, V(.7), size=36, z=50, until=V(3.0)),
       svg(900, 1100, hall(), 360, 560, z=2, kind='fade', at=V(3.0), dur=.4, depth=.6, shadow=False),
       polaroid('assets/ap/basel1970', 360, 420, 520, V(3.2), label='Audemars Piguet · Basel 1970', z=8, rot=-2, until=V(6.0))]
for i, (rel, x, t, city) in enumerate([('assets/gen/golay_stand_cut', 130, V(6.1), None), ('assets/gen/demarchi_back_cut', 300, V(8.6), 'تورينو'),
                                       ('assets/gen/bauty_back_cut', 460, V(10.8), 'لوزان'), ('assets/gen/dorot_back_cut', 615, V(12.7), 'باريس')]):
    els.append(cutout(rel, x, 1240, 560, t, z=20 + i, kind='rise', dur=.45, desc=PEND, aspect=.42))
    if city: els.append(tag(city, x, 620, t + .2, size=28, z=40, rot=(-3, 2, -2)[i - 1]))
els.append(polaroid('assets/ap/demarchi1940s', 300, 470, 170, V(8.7), label='Carlo de Marchi', z=42, rot=-5, until=V(10.6)))
P2.S('p2-0', 'ro-hall', 'بازل، | عشرة أبريل | ألف وتسعمية وسبعين. | قبل لا يفتح | معرض الساعات، | جورج غولاي يجتمع | مع ثلاثة من الوكلاء: | كارلو دي ماركي | من تورينو، | وشارل بوتي من لوزان، | وشارل دورو من باريس.', els,
     camera=cam((0, 1.0, 360, 640, None), (V(6.0), 1.0, 360, 640, None), (V(14.6), 1.05, 380, 760, 'inOutCubic')),
     sfx=[E('paper_tear', .05, -14), E('paper_place', V(3.2), -11), E('crowd', V(3.0), -26)] + [E('paper_slide', t, -14) for t in (V(6.1), V(8.6), V(10.8), V(12.7))],
     beds=[{"name": "crowd", "from": V(3.0), "to": 15, "gain": -28}])

# 1  The brief: gold alone is not enough; a steel watch, sporty and elegant. AP calls them the Three Musketeers.
els = [cutout('assets/cut/m5182', 230, 760, 420, .1, z=10, kind='rise', dur=.4, opacity=[[V(1.3), 1], [V(2.6), .25]], rot=[[V(1.3), 0], [V(2.6), -10]]),
       tag('الذهب بروحه ما يكفي', 360, 230, V(1.3), size=32, until=V(3.0)),
       svg(300, 190, steel_plate(300, 190), 480, 640, z=12, kind='drop', at=V(3.0), dur=.5, rot=-6),
       tag('ستيل', 480, 460, V(3.1), size=40),
       tag('رياضية', 330, 860, V(4.4), size=32, rot=-4), tag('وأنيقة', 560, 900, V(5.0), size=32, rot=3)]
for i, (rel, x) in enumerate([('assets/gen/demarchi_back_cut', 170), ('assets/gen/bauty_back_cut', 360), ('assets/gen/dorot_back_cut', 550)]):
    els.append(cutout(rel, x, 1300, 600, V(8.3), z=30 + i, kind='rise', dur=.45, desc=PEND, aspect=.42))
els += [svg(300, 300, swords(), 360, 470, z=40, kind='pop', at=V(10.1), dur=.4), tag('الفرسان الثلاثة', 360, 230, V(10.2), size=40, z=41)]
P2.S('p2-1', 'ro-steel', 'طلبهم واضح: | الذهب بروحه ما يكفي. | يبون ساعة ستيل، | رياضية وأنيقة، | تناسب أسلوب | الحياة الجديد. | أوديمار بيغيه تسميهم: | الفرسان الثلاثة.', els, transition='slide',
     camera=cam((0, 1.0, 360, 640, None), (V(8.2), 1.0, 360, 640, None), (V(11.7), 1.05, 360, 600, 'inOutCubic')),
     sfx=[E('paper_place', .1, -12), E('stamp', V(3.0), -10), E('whoosh', V(8.3), -14), E('clasp', V(10.1), -8)])

# 2  4 pm: Golay calls Genta. "I need the sketch tomorrow morning."
TOPWALL, BOTWALL = '#D9D2C2', '#CDBFA6'
els = [svg(760, 660, '<rect width="760" height="660" fill="%s"/>' % BOTWALL, 360, 970, z=1, kind=None, shadow=False),
       svg(760, 18, '<polygon points="%s" fill="#F3EEE1"/>' % pts(jag([(0, 4)] + [(i * 38, 9 + (i % 2) * 7) for i in range(1, 20)] + [(760, 4), (760, 14), (0, 14)], 1.5, 5)), 360, 642, z=2, kind=None),
       svg(240, 180, window(240, 180, alps(240, 180)), 180, 250, z=3, kind=None),
       svg(760, 110, '<rect width="760" height="110" fill="#6B5038"/>', 360, 585, z=4, kind=None, shadow=False)]
els += wall_clock(630, 200, 4, 0, z=5)
els += [svg(260, 162, rotary_phone(), 200, 478, z=6, kind=None, scale=.8), cutout('assets/gen/golay_phone_cut', 420, 640, 430, .05, z=8),
        {"type": "sketch", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 7, "pencil": False,
         "paths": [{"d": 'M 250 540 C 690 600 700 760 560 880 S 300 1000 270 1090', "at": V(1.5), "dur": 1.2, "stroke": '#2A2C31', "width": 4, "opacity": 1}]},
        svg(240, 180, window(240, 180, lake(240, 180)), 540, 840, z=3, kind=None),
        svg(240, 180, window(240, 180, lake(240, 180, night=True)), 540, 840, z=3, kind='fade', at=V(7.6), dur=.6),
        svg(560, 250, drafting_table(), 380, 1150, z=4, kind=None)]
els += wall_clock(330, 760, 4, 0, z=5, spin=(V(7.5), V(8.8), 1.6))
els += [svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3'), 275, 1105, z=6, kind=None, scale=.62, out={"type": "fade", "at": V(3.0), "dur": .15},
            idle={"type": "shake", "amp": 3, "speed": 9, "from": V(2.6), "until": V(3.0)}),
        cutout('assets/gen/young_phone_cut', 240, 1290, 560, V(2.95), z=12, person=True, until=V(6.8)),
        cutout('assets/gen/young_think_cut', 240, 1290, 560, V(6.7), z=12, person=True),
        tag('"والرسم أبيه باچر الصبح"', 470, 700, V(6.85), size=28, z=30)]
P2.S('p2-2', 'ro-alpine', 'الساعة أربعة العصر، | غولاي يتصل بجنتا: | نبي ساعة رياضية | من الستيل، | ما انسوت مثلها قبل… | والرسم أبيه | باچر الصبح.', els, transition='slide',
     camera=cam((0, 1.55, 360, 360, None), (V(1.9), 1.55, 360, 360, None), (V(2.5), 1.0, 360, 640, 'inOutCubic'), (V(3.1), 1.5, 330, 960, 'inOutCubic'), (V(8.9), 1.55, 340, 940, 'inOutCubic')),
     sfx=[E('click', V(.4), -8), E('ring', V(2.5), -10), E('click', V(3.0), -8), E('tick_pair', V(7.5), -14)])

# 3  The night: the diver's helmet
els = [svg(260, 220, window(260, 220, lake(260, 220, night=True)), 520, 300, z=3, kind=None, depth=.7)]
els += wall_clock(160, 270, 11, 0, z=5, spin=(0.1, V(6.4), 2.4), depth=.75)
els += [svg(420, 640, lamp_glow(420, 640), 190, 930, z=7, kind=None, shadow=False, opacity=.85, depth=1.1),
        cutout('assets/gen/young_table_cut', 205, 1255, 600, 0.0, z=20, kind='none', person=True, depth=1.1),
        svg(500, 500, '<circle cx="250" cy="250" r="240" fill="#C9B38A"/><circle cx="250" cy="250" r="226" fill="#D8C49B"/>', 470, 520, z=12, kind='grow', at=V(1.1), dur=.5),
        svg(440, 470, diver_helmet(), 470, 540, z=13, kind='rise', at=V(1.3), dur=.6, scale=.82)]
P2.S('p2-3', 'ro-night', 'وطول الليل، | جنتا يتذكر | خوذة الغواص: | نافذة دائرية، | مثبتة بالبراغي.', els, transition='fade',
     camera=cam((0, 1.05, 360, 660, None), (V(3.4), 1.15, 400, 620, 'inOutCubic'), (V(6.6), 3.6, 470, 499, 'inCubic')),
     sfx=[E('tick_pair', .2, -16), E('whoosh', V(1.1), -16), E('clasp', V(5.1), -12), E('clasp', V(5.5), -14)],
     beds=[{"name": "room", "from": 0, "to": 7, "gain": -24}])

# 4  The porthole becomes an octagon (the sketch draws itself)
P_, T_ = ro_sketch(k=1.05)
els = [svg(640, 960, drafting_sheet(), 360, 600, z=3, kind=None),
       {"type": "sketch", "x": 360, "y": 600, "w": 640, "h": 960, "z": 5, "paths": P_, "texts": T_},
       svg(300, 20, pencil(), [[0, 700], [0.25, 500], [1.05, 485], [2.0, 440], [3.0, 500], [3.5, 520], [4.1, 470], [4.8, 450], [5.6, 420], [6.3, 160], [7.6, 170]],
           [[0, 760], [0.25, 560], [1.05, 410], [2.0, 300], [3.0, 380], [3.5, 690], [4.1, 210], [4.8, 960], [5.6, 560], [6.3, 640], [7.6, 650]],
           anchor='l', z=20, kind=None, rot=-38, depth=1.15, idle={"type": "wiggle", "amp": 2, "speed": 5})]
P2.S('p2-4', 'ro-paper', 'النافذة | تصير شكل ثماني. | ثمان براغي واضحة. | سوار يطلع | من قلب الهيكل… | وكلها ستيل.', els, transition='cut',
     camera=cam((0, 2.4, 360, 560, None), (V(1.5), 1.45, 360, 570, 'inOutCubic'), (V(3.8), 1.3, 360, 580, None), (V(6.0), 1.06, 360, 600, 'inOutCubic'), (V(7.6), 1.1, 360, 600, None)),
     sfx=[E('pencil', .15, -8), E('pencil', V(1.0), -8)] + [E('click', V(2.1 + j * .12), -14) for j in range(8)] + [E('pencil', V(3.5), -9), E('pencil', V(4.2), -9), E('crown_wind', V(6.3), -14)])

# 5  "And this is his original drawing"
els = [macro('assets/ap/sketch_original', .05, V(4.6), z=10, zoom=(1.0, 1.08)),
       tag('الرسم الأصلي · ليلة ١٠–١١ أبريل ١٩٧٠', 360, 1000, V(2.1), size=26, z=20),
       {"type": "text", "text": "© Gérald Genta Heritage Association", "x": 360, "y": 1060, "font": "ui", "size": 14, "color": "#EFE8D6", "upper": False, "z": 20, "in": {"type": "fade", "at": V(2.3), "dur": .3}}]
P2.S('p2-5', 'ro-black', 'وهذا رسمه الأصلي… | من ليلة عشرة | على إحدعش أبريل.', els, transition='fade', sfx=[E('paper_slide', .1, -12)])

# 6  Steel was for tools; finished like a precious watch; 3,300 francs, the costliest steel watch in the world
t_mac = V(2.1)
els = [svg(620, 520, pegboard(), 360, 600, z=3, kind=None, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       svg(300, 70, wrench(), 260, 470, z=5, kind='drop', at=0.15, dur=.4, rot=-12, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       svg(270, 58, screwdriver(), 470, 720, z=5, kind='drop', at=0.35, dur=.4, rot=10, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       macro('assets/ap/bracelet1972', t_mac, V(4.3), zoom=(1.6, 1.8)),
       macro('assets/ap/cal_macro', V(4.2), V(5.6), zoom=(1.0, 1.1)),
       polaroid('assets/ap/ad1972b', 360, 600, 470, V(5.5), label='Audemars Piguet · 1972', z=20, rot=-2, kind='fade'),
       svg(260, 120, '<path d="M 30 0 L 260 0 L 260 120 L 30 120 L 0 60 Z" fill="#EFE8D6"/><circle cx="34" cy="60" r="9" fill="#3B4048"/>'
           '<text x="150" y="78" font-family="var(--f-title)" font-size="50" fill="#16181D" text-anchor="middle">3,300 CHF</text>', 520, 980, z=30, kind='pop', at=V(6.4), dur=.4, rot=-8),
       tag('أغلى ساعة ستيل في العالم', 360, 200, V(9.5), size=34, z=40)]
P2.S('p2-6', 'ro-steel', 'الستيل كان | للساعات العملية. | بس هذي انشغلت | مثل الساعات الثمينة، | وانطرحت بثلاثة آلاف | وثلاثمية فرنك… | أغلى ساعة ستيل | في العالم.', els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (V(5.4), 1.0, 360, 640, None), (V(11.5), 1.08, 380, 640, 'inOutCubic')),
     sfx=[E('clasp', .2, -12), E('clasp', .5, -13), E('whoosh', t_mac, -14), E('paper_place', V(5.5), -10), E('stamp', V(6.4), -8)])

# 7  Basel 1972: the Royal Oak 5402, 39 mm
WH = 420; WX, WY = 470, 960
els = [svg(900, 1100, hall(), 360, 560, z=1, kind=None, depth=.55, shadow=False),
       svg(520, 420, booth(), 360, 640, z=3, kind=None, depth=.8),
       tag('BASEL · 1972', 360, 300, .15, size=54, z=30, rot=-1.5, depth=.9),
       svg(520, 900, spotlight_cone(), WX, 380, anchor='t', z=4, kind='fade', at=V(2.4), dur=.5, shadow=False, depth=.9),
       svg(260, 300, pedestal(), WX, 1160, anchor='b', z=6, kind=None, depth=1.0),
       cutout('assets/cut/ro5402_front', WX, WY, WH, V(2.6), z=10, kind='rise', dur=.6, depth=1.0),
       cutout('assets/gen/young_present_cut', 165, 1200, 560, V(2.9), z=12, kind='rise', dur=.5, person=True, depth=1.0),
       tag('5402', WX, WY + 40, V(4.3), size=34, z=22),
       macro('assets/ap/techdrawing', V(4.4), V(6.0), zoom=(1.0, 1.1)),
       {"type": "sketch", "x": WX, "y": WY - WH * .52, "w": 400, "h": 120, "z": 20, "pencil": False, "depth": 1.0,
        "paths": [{"d": 'M 60 60 L 340 60 M 60 48 L 60 72 M 340 48 L 340 72', "at": V(6.1), "dur": .5, "stroke": "#EFE8D6", "width": 3, "opacity": 1}],
        "texts": [{"text": "39 mm", "x": 200, "y": 40, "size": 34, "at": V(6.4), "dur": .4, "anchor": "middle", "color": "#EFE8D6", "font": "var(--f-banner)"}]},
       cutout('assets/gen/crowd_back_cut', 360, 1300, 380, .3, z=40, kind='rise', dur=.6, desc=PEND, aspect=1.78, depth=1.3)]
for fx, fy, t in [(640, 820, V(2.7)), (680, 560, V(3.0)), (330, 470, V(3.3))]:
    els.append(svg(240, 240, flash(), fx, fy, z=45, kind='pop', at=t, dur=.08, shadow=False, depth=1.2, out={"type": "fade", "at": t + .18, "dur": .15}))
P2.S('p2-7', 'ro-hall', 'بازل، | ألف وتسعمية | واثنين وسبعين. | الرويال أوك، | الموديل خمسة أربعة | صفر اثنين، | بقطر تسعة وثلاثين ملم… | ضخمة بمقاييس وقتها.', els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (V(2.3), 1.0, 360, 640, None), (V(6.0), 1.15, 360, 720, 'inOutCubic'), (V(10.2), 1.2, 360, 720, 'inOutCubic')),
     sfx=[E('stamp', .4, -12)] + [E('shutter', t, -11) for t in (V(2.7), V(3.0), V(3.3))] + [E('paper_slide', V(4.4), -14)],
     beds=[{"name": "crowd", "from": 0, "to": 11, "gain": -22}])

# 8  The doubters; the Shah of Iran; time proved them wrong; back to the famous Genta and the icon
TEH = dict(id='teh', lon=51.39, lat=35.69, label='TEHRAN')
els = [cutout('assets/gen/crowd_doubt_cut', 360, 1150, 520, .05, z=10, kind='fade', desc=PEND, aspect=1.78, until=V(1.6), person=True),
       {"type": "map", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 15, "view": [[V(1.6), {"lon": 30, "lat": 42, "span": 50}], [V(5.9), {"lon": 40, "lat": 40, "span": 36}, "inOutCubic"]],
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(BSL, at=V(1.9)), dict(TEH, at=V(3.0))], "routes": [{"from": "bsl", "to": "teh", "at": V(3.2), "dur": 1.6, "keep": True}],
        "highlight": [{"n": "Iran", "at": V(2.9), "color": "#D9C08A"}], "unfold": {"at": V(1.6), "dur": .6}, "in": {"type": "none", "at": V(1.6)},
        "out": {"type": "fade", "at": V(6.2), "dur": .3}, "depth": 0},
       tag('النموذج الأول · ذهب أبيض', 360, 200, V(3.2), size=30, z=30, until=V(6.2))]
els += flips(['1972', '1982', '1992', '2002', '2012', '2022'], 360, 560, V(6.3), .26, z=40, last_out=V(8.0))
GS = dict(x=200, y=1290, h=780)
gw = GS['h'] * ASP.get('genta_sheet', .43); gx0, gy0 = GS['x'] - gw / 2, GS['y'] - GS['h']
sheet_c = (gx0 + gw * .501, gy0 + GS['h'] * .446); k_ = GS['h'] * .249 * .8 / 464
sk_t = V(8.0)
P_, T_ = ro_sketch(k=0.2, links=1)
for p in P_: p['at'] = round(p['at'] + sk_t + .3, 2); p['fillAt'] = round(p['fillAt'] + sk_t + .3, 2) if 'fillAt' in p else p.get('fillAt')
P_ = [{k: v for k, v in p.items() if v is not None} for p in P_]
els += [cutout('assets/gen/genta_sheet_cut', GS['x'], GS['y'], GS['h'], sk_t, z=48, kind='rise', dur=.45, person=True),
        {"type": "sketch", "x": round(sheet_c[0], 1), "y": round(sheet_c[1] + 40 * k_, 1), "w": 640, "h": 960, "z": 49, "paths": P_, "texts": [], "scale": round(k_, 3), "pencil": False},
        cutout('assets/cut/ro5402_hero', 548, 1000, 470, V(11.2), z=50, kind='fade', scale=[[V(11.2), 1.0], [V(13.5) + 1.6, 1.04]]),
        {"type": "text", "text": "رسمة بليلة وحدة…", "x": 360, "y": 160, "font": "banner", "size": 46, "color": "#EFE8D6", "upper": False, "z": 60, "depth": 0, "in": {"type": "fade", "at": V(8.1), "dur": .5}},
        {"type": "text", "text": "صارت أيقونة للأجيال", "x": 360, "y": 230, "font": "banner", "size": 46, "color": "#EFE8D6", "upper": False, "z": 60, "depth": 0, "in": {"type": "fade", "at": V(11.2), "dur": .5}},
        {"type": "text", "text": CREDITS2, "x": 360, "y": 1255, "font": "ui", "size": 10, "color": "#9A9488", "upper": False, "w": 690, "z": 61, "depth": 0, "in": {"type": "fade", "at": V(12.0), "dur": .4}}]
P2.S('p2-8', 'ro-black', 'كثيرين شكّوا فيها… | بس شاه إيران | طلب النموذج الأول | من الذهب الأبيض. | والزمن أثبت كل شي:', els, tail=1.6, transition='fade',
     captionEnd=V(7.8), captionClear=V(8.0),
     camera=cam((0, 1.0, 360, 640, None), (V(13.5) + 1.6, 1.0, 360, 640, None)),
     sfx=[E('paper_slide', V(1.6), -12), E('plane', V(3.2), -16)] + [E('paper_tear', V(6.3) + i * .26, -16) for i in range(6)] + [E('pencil', sk_t + .3, -10), E('tick', V(11.2), -12)])

# credits line for part 1 on its last scene
P1.sc[-1]['elements'].append({"type": "text", "text": CREDITS1, "x": 360, "y": 1255, "font": "ui", "size": 10, "color": "#9A9488", "upper": False, "w": 690, "z": 61, "depth": 0,
                              "in": {"type": "fade", "at": V(11.8), "dur": .4}})

for name, part in (('part1', P1), ('part2', P2)):
    sb = {"width": 720, "height": 1280, "fps": 30, "dir": "rtl", "style": ST['style'], "themes": ST['themes'], "audio": {"musicGain": -90}, "scenes": part.sc}
    json.dump(sb, open(os.path.join(H, name + '.json'), 'w'), indent=1, ensure_ascii=False)
    missing = sorted({e.get('asset') for s in part.sc for e in s['elements'] if e.get('asset')})
    print('%s.json: %d scenes, %.1f s; waiting on: %s' % (name, len(part.sc), sum(s['dur'] for s in part.sc), ', '.join(missing) or 'nothing'))

# ---- covers (render.mjs coverN.json --still 1 --scale 1.5)
def cover(name, els):
    sb = {"width": 720, "height": 1280, "fps": 30, "dir": "rtl", "style": ST['style'], "themes": ST['themes'],
          "scenes": [{"dur": 2, "theme": "ro-paper", "floor": False, "silent": True, "elements": els}]}
    json.dump(sb, open(os.path.join(H, name + '.json'), 'w'), indent=1, ensure_ascii=False)
title = lambda t, y, size, ink='#16181D', paper=None: dict({"type": "text", "text": t, "x": 360, "y": y, "font": "banner", "size": size, "color": ink, "upper": False, "z": 30}, **({"paper": paper} if paper else {}))
cover('cover1', [svg(720, 760, lake(720, 760), 360, 380, z=1, kind=None, shadow=False),
                 cutout('assets/gen/genta23_desk_cut', 250, 1240, 700, 0, z=10, kind='none', person=True),
                 cutout('assets/early/polerouter_cut', 540, 900, 440, 0, z=12, kind='none', rot=6),
                 title('جيرالد جنتا', 150, 76, paper='#EFE8D6'), title('قبل الرويال أوك · الجزء الأول', 240, 34, paper='#EFE8D6')])
cover('cover2', [macro('assets/ap/genta_gouache', 0, 2, z=1, zoom=(1.0, 1.0)),
                 cutout('assets/gen/young_present_cut', 150, 1290, 620, 0, z=10, kind='none', person=True),
                 title('الرويال أوك', 150, 80, paper='#EFE8D6'), title('رسمة بليلة وحدة · الجزء الثاني', 240, 34, paper='#EFE8D6')])
