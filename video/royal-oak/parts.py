#!/usr/bin/env python3
"""Genta and the Royal Oak in two parts, narrated in Gulf Arabic (voice-ar/).

  Part 1, before the Royal Oak: the famous Genta, back to 1954, the Polerouter, Omega's Constellation, his 1960s
          designs for Audemars Piguet, the tandem with Georges Golay, and the phone ringing on 10 April 1970.
  Part 2, the Royal Oak: the Three Musketeers in Basel, the 4 pm call, the night of 10-11 April, the original
          drawing, steel at 3,300 francs, Basel 1972, the doubters and the icon.

  python3 crops.py                 -> assets/crop (archive crops this file uses)
  python3 parts.py                 -> part1.json, part2.json, cover1.json, cover2.json
  node ../../.claude/skills/paper-story/scripts/render.mjs part1.json --check

Every watch on screen is a real photograph: Audemars Piguet's archive (AP Chronicles, assets/ap, (c) Audemars
Piguet, used at the user's direction and credited), Wikimedia Commons (assets/early). People are paper characters
made on Higgsfield (assets/gen) or archive portraits; Golay and the agents are seen from behind. A character or
photo whose file is not there yet shows a REAL PHOTO NEEDED panel. Facts: FACTS-AR.md.

Round 2 follows the expert review (motion, art, history, readability, watches): every person breathes, prints
settle, the camera never holds still for long, figures stand on something, one light from the upper left, captions
in groups of three words or fewer, and nothing sits in the caption band (y 960-1070) while captions are on."""
import json, os, random
from art import *

H = os.path.dirname(os.path.abspath(__file__))
ST = json.load(open(os.path.join(H, 'ro-style.json')))
NARRATOR = os.environ.get('NARRATOR', 'voice-ar')        # voice-ar: Andre (Higgsfield); voice-fahed: Azure ar-KW-FahedNeural (tts_azure.py)
VO = json.load(open(os.path.join(H, 'voice-ar', 'clips.json')))
if NARRATOR != 'voice-ar': VO.update(json.load(open(os.path.join(H, NARRATOR, 'clips.json'))))
ASP = {}
for f in ('assets/gen/aspects.json', 'assets/cut/aspects.json', 'assets/early/aspects.json'):
    p = os.path.join(H, f)
    if os.path.exists(p): ASP.update(json.load(open(p)))
VO_AT, TAIL = 0.12, 0.2


def exists(rel):
    return any(os.path.exists(os.path.join(H, rel + e)) for e in ('', '.png', '.jpg', '.webp'))


def pic(rel):
    for e in ('', '.png', '.jpg', '.webp'):
        if os.path.exists(os.path.join(H, rel + e)) and os.path.isfile(os.path.join(H, rel + e)): return rel + e
    return None


def at(key, cap, phrase):
    """When the captions reach `phrase` (the engine spreads words over the voice by character count)."""
    toks = [t for t in cap.split() if t != '|']
    wt = [len(t.replace('|', '')) + 2 for t in toks]
    words = phrase.split(); n = len(words)
    for i in range(len(toks)):
        if [t.strip('،.:…|') for t in toks[i:i + n]] == [w.strip('،.:…') for w in words]:
            t0, t1 = VO_AT + .05, VO_AT + VO[key]['seconds']
            return round(t0 + sum(wt[:i]) / sum(wt) * (t1 - t0), 2)
    raise KeyError('%s: %r not in captions' % (key, phrase))


class Part:
    def __init__(self): self.sc = []
    def S(self, key, theme, caption, els, tail=TAIL, voiceAt=VO_AT, **kw):
        d = VO[key]['seconds']
        dur = round(voiceAt + d + tail, 2)
        sc = {"theme": theme, "floor": False, "elements": els, "dur": dur, "silent": True,
              "captions": caption, "captionStart": voiceAt + 0.05, "captionEnd": voiceAt + d}
        if os.path.exists(os.path.join(H, NARRATOR, VO[key]['file'])): sc["voice"] = NARRATOR + '/' + VO[key]['file']; sc["voiceAt"] = voiceAt
        sc.update(kw)
        for e in els: life(e, dur)
        self.sc.append(sc); return sc


def life(e, dur):
    """People breathe (a slow pulse from the feet); taped prints settle a degree over the scene."""
    t_in = (e.get('in') or {}).get('at', 0) + (e.get('in') or {}).get('dur', 0)
    if e.get('person') and 'idle' not in e:
        e['idle'] = {"type": "pulse", "amp": .005, "speed": .22, "from": round(t_in, 2)}
    if e.get('polaroid') and not isinstance(e.get('rot'), list) and not e.get('fixed'):
        r = e.get('rot', 0); end = e['out']['at'] if 'out' in e else dur
        if end - t_in > .6: e['rot'] = [[round(t_in, 2), r], [round(end, 2), r + (1.2 if r >= 0 else -1.2)]]
        if 'scale' not in e and end - t_in > .6: e['scale'] = [[round(t_in, 2), 1], [round(end, 2), 1.006]]
    e.pop('fixed', None)


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
    """A real photograph on a taped paper print, anchored at its centre. The photo is (w-28) wide, its centre 22 px above y."""
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


def macro(rel, at, out, z=50, zoom=(1.0, 1.12), pos='50% 50%', scale=None):
    return {"type": "image", "src": pic(rel), "x": 360, "y": 640, "w": 720, "h": 1280, "frame": False, "fit": "cover", "pos": pos, "depth": 0,
            "z": z, "scale": scale or [[at, zoom[0]], [out, zoom[1]]], "in": {"type": "fade", "at": at, "dur": .25},
            "out": {"at": out, "type": "fade", "dur": .2}, "still": True}


def tag(text, x, y, at, size=30, z=35, rot=-2, until=None, ink='#16181D', paper='#EFE8D6', **kw):
    d = {"type": "text", "text": text, "x": x, "y": y, "font": "banner", "size": size, "color": ink, "paper": paper, "upper": False, "z": z, "rot": rot,
         "in": {"type": "pop", "at": at, "dur": .35}}
    if until is not None: d["out"] = {"type": "fade", "at": until, "dur": .2}
    d.update(kw); return d


def shadow(x, y, w, at=0.0, z=19, dur=.5, op=.32, kind='fade', **kw):
    """A contact shadow under a figure's feet (y = where the feet are)."""
    W, Hh, body = soft_ellipse(int(w * .42), 14, '#000', op, 6)
    return svg(W, Hh, body, x, y - 6, z=z, kind=kind, at=at, dur=dur, shadow=False, still=True, **kw)


def glint(x, y, w, h, at, rot=0, z=60, dur=.7, peak=.42, **kw):
    """One sweep of light across a print (x, y the photo's centre; w, h its size)."""
    bw = 130
    x0, x1 = x - w / 2 + bw / 2, x + w / 2 - bw / 2
    return svg(bw, h, glint_band(h, 90, 40, peak=peak), [[at, x0], [at + dur, x1, 'inOutCubic']], y, z=z, kind='none', at=at, shadow=False, rot=rot, still=True,
               opacity=[[at, 0], [at + .12, 1], [at + dur - .12, 1], [at + dur, 0]], out={"type": "fade", "at": at + dur, "dur": .01}, **kw)


def glint_on(p, at, **kw):
    pw = p['w'] - 28; ph = pw / p['aspect']
    r = p['rot'][0][1] if isinstance(p['rot'], list) else p.get('rot', 0)
    return glint(p['x'], p['y'] - 22, pw, ph * .94, at, rot=r, z=p['z'] + 1, **dict({'depth': p['depth']} if 'depth' in p else {}, **kw))


def motes(pts_, at=0.0, z=6, depth=1.25, seed=1):
    """Dust in a light beam: tiny cream specks that drift."""
    r = random.Random(seed); out = []
    for (x, y) in pts_:
        rr = round(r.uniform(1.5, 3), 1)
        out.append(svg(8, 8, mote(rr), x, y, z=z, kind='fade', at=at, dur=.8, shadow=False, depth=depth, still=True, opacity=round(r.uniform(.3, .55), 2),
                       idle={"type": "float", "amp": 14, "speed": round(r.uniform(.1, .16), 3), "phase": round(r.uniform(0, 6), 2)}))
    return out


def cone_points(cx, n, seed, y0=120, y1=980, spread=.45):
    r = random.Random(seed); out = []
    for _ in range(n):
        y = r.uniform(y0, y1); half = 30 + (y / 1000) * 240 * spread * 2
        out.append((round(cx + r.uniform(-half, half)), round(y)))
    return out


def flips(years, x, y, t0, step, z=20, scale=1.0, last_out=None, **kw):
    els = []
    for i, yr in enumerate(years):
        t = t0 + i * step
        c = calendar(x, y, yr, at=t, z=z + i, scale=scale, **kw)
        c["in"] = {"type": "flip", "at": t, "dur": min(.18, step * .6)}
        if i < len(years) - 1: c["out"] = {"type": "fade", "at": t + step + .02, "dur": .05}
        elif last_out: c["out"] = {"type": "fade", "at": last_out, "dur": .2}
        els.append(c)
    return els


def ringing_phone(x, y, windows, z=10, scale=.7, at=None, handset_=True):
    """A rotary phone that rings in bursts: windows = [(t0, t1), ...]; t1 None rings to the end."""
    out = []
    t_in = (at if at is not None else windows[0][0] - .3)
    for k, (t0, t1) in enumerate(windows):
        body = svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3') + (('<g transform="translate(0 -14)">%s</g>' % handset('#2A2C31')) if handset_ else ''),
                   x, y, z=z, kind='pop' if k == 0 else 'none', at=t_in if k == 0 else t0, dur=.3, scale=scale,
                   idle={"type": "shake", "amp": 3, "speed": 9, "from": t0, **({"until": t1} if t1 else {})})
        if k < len(windows) - 1: body["out"] = {"type": "fade", "at": windows[k + 1][0], "dur": .01}
        out.append(body)
        out.append(svg(260, 80, ring_lines('#EFE8D6' if z > 50 else '#2A2C31'), x, y - 70 * scale / .7, z=z + 1, kind='pop', at=t0, dur=.2, scale=scale,
                       idle={"type": "pulse", "amp": .08, "speed": 6}, **({"out": {"type": "fade", "at": t1, "dur": .15}} if t1 else {})))
    return out


def rosette(text_lines, color='#B23A2E'):
    s = ''.join('<polygon points="%s" fill="%s"/>' % (pts([(110 + 100 * math.cos(math.radians(a)), 110 + 100 * math.sin(math.radians(a))) for a in (k * 15, k * 15 + 7.5, k * 15 + 15)] + [(110, 110)]), color if k % 2 else '#C7473A') for k in range(24))
    s += '<path d="M 70 190 L 50 290 L 85 270 L 105 300 L 110 200 Z" fill="%s"/><path d="M 150 190 L 170 290 L 135 270 L 115 300 L 110 200 Z" fill="%s"/>' % (color, color)
    s += '<circle cx="110" cy="110" r="70" fill="#EFE8D6"/>'
    for i, t in enumerate(text_lines):
        s += '<text x="110" y="%d" font-family="var(--f-banner)" font-weight="800" font-size="%d" fill="#16181D" text-anchor="middle">%s</text>' % (100 + i * 30 - (len(text_lines) - 1) * 12, 22 if i else 30, t)
    return s


def sk(paths, z=30, depth=None, texts=None):
    """A sketch in stage coordinates (the box is the whole 720x1280 stage)."""
    d = {"type": "sketch", "x": 360, "y": 640, "w": 720, "h": 1280, "z": z, "pencil": False, "paths": paths, "texts": texts or []}
    if depth is not None: d["depth"] = depth
    return d


def dashed(x0, y0, x1, y1, n=9):
    return ' '.join('M %.1f %.1f L %.1f %.1f' % (x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, x0 + (x1 - x0) * (k + .55) / n, y0 + (y1 - y0) * (k + .55) / n) for k in range(n))


CREDITS1 = ('Archive images: © Audemars Piguet (AP Chronicles). Georges Golay, 1966: © Épreuves internationales de ski Le Brassus (J. Piguet, 2017). '
            'Polerouter (Watch15, CC BY-SA 4.0), Omega Constellation (Noop1958, CC BY-SA 3.0), SAS advertisement 1954: Wikimedia Commons. '
            'Portrait of Gérald Genta: Studio Luxury Griffes (CC BY-SA 3.0). Paper characters are AI illustrations (Higgsfield).')
CREDITS2 = ('Archive images: © Audemars Piguet (AP Chronicles). Carlo de Marchi: © Omega Archives. Seiko Quartz Astron and calibre 35A, 1969: '
            'Deutsches Uhrenmuseum, Wikimedia Commons (CC BY-SA 4.0, CC BY 3.0 DE). The original Royal Oak drawing: '
            '© Gérald Genta Heritage Association. Paper characters are AI illustrations (Higgsfield); Golay and the agents are shown from behind.')
PEND = 'paper character, waiting for Higgsfield credits'
credits = lambda text, t, y=1150: {"type": "text", "text": text, "x": 360, "y": y, "font": "ui", "size": 17, "color": "#CFC8B8", "upper": False, "w": 640,
                                    "z": 70, "depth": 0, "in": {"type": "fade", "at": t, "dur": .4}}

# =================================================================================================================
# PART 1  Before the Royal Oak
P1 = Part()
# H  The hook (a question, chosen by the user): "How did a 23-year-old end up behind the world's most famous watches?"
#    Frame 1 already carries the question; the film answers it.
C = 'كيف شاب | عمره ثلاثة وعشرين… | صار ورا | أشهر ساعات العالم؟'
t_famous = at('p1-h', C, 'أشهر ساعات')
hk = polaroid('assets/ap/ro5402_hero', 180, 340, 220, t_famous - .1, label='Royal Oak', z=30, rot=-6, kind='pop')
els = [svg(760, 520, floor_band('#8A7458', '#A48D6E', 520), 360, 1030, z=1, kind=None, depth=.9, shadow=False),
       svg(760, 1320, light_beam([(760, 0), (520, 0), (60, 1320), (520, 1320)], amt=.10), 360, 640, z=2, kind=None, shadow=False, depth=.9, still=True),
       shadow(330, 1180, 520, 0, z=19, kind=None),
       cutout('assets/gen/genta23_desk_cut', 330, 1180, 700, 0, z=20, kind='none', person=True),
       tag('كيف صار ورا أشهر ساعات العالم؟', 360, 150, 0, size=32, z=40, depth=0, rot=-1.5, **{"in": {"type": "none", "at": 0}}),
       hk, glint_on(hk, t_famous + .4)]
P1.S('p1-h', 'ro-paper', C, els, transition='cut',
     camera=cam((0, 1.18, 340, 820, None), (t_famous - .2, 1.0, 360, 640, 'inOutCubic'), (round(VO_AT + VO['p1-h']['seconds'] + TAIL, 2), 1.03, 330, 620, 'inOutCubic')),
     sfx=[E('pencil', .1, -12), E('click', t_famous - .1, -10), E('tick', t_famous + .4, -16)])

# 0  The famous Genta (the watch on his wrist first), then back to 1954
C = 'هذا جيرالد جنتا… | من أشهر | مصممي الساعات | بالتاريخ. | بس قبل لا | يصير اسمه | أسطورة… | خلونا نرجع للبداية.'
t_back = at('p1-0', C, 'خلونا'); t_leg = at('p1-0', C, 'أسطورة…')
portrait = polaroid('assets/src/genta', 360, 600, 500, 0, label='Gérald Genta', z=18, kind='none', until=V(1.55), fixed=True)
pw = 472; ph = pw / portrait['aspect']; wrist = (360 - pw / 2 + .37 * pw, 600 - 22 - ph / 2 + .77 * ph)
els = [svg(760, 1320, curtain(), [[0, 360], [t_back, 360], [V(7.7), 320, 'inOutCubic']], 640, z=0, kind=None, shadow=False, depth=.6, still=True),
       svg(520, 1000, spotlight_cone(), 360, 0, anchor='t', z=2, kind=None, shadow=False,
           opacity=[[0, 1], [3.5, .88], [5.5, 1], [t_back, 1], [t_back + .25, .5], [V(7.6), 1]]),
       svg(*soft_ellipse(260, 40, '#FFF1CF', .2, 10)[:2], soft_ellipse(260, 40, '#FFF1CF', .2, 10)[2], 360, 1160, z=3, kind=None, shadow=False, depth=.95),
       portrait,
       tag('الرجل اللي رسم الرويال أوك', 360, 150, 0.1, size=34, z=40, until=V(1.6), depth=0),
       cutout('assets/gen/genta_think_cut', 360, 1160, 760, V(1.45), z=21, kind='flip', dur=.4, person=True, scale=[[t_back, 1], [t_back + .6, .96]],
              out={"type": "fade", "at": t_back + .35, "dur": .35}),
       shadow(360, 1160, 300, V(1.45), z=20, out={"type": "fade", "at": t_back + .35, "dur": .35}),
       cutout('assets/gen/young_think_cut', 360, 1160, 760, t_back + .5, z=22, person=True, dur=.35, scale=[[t_back + .5, 1.04], [t_back + 1.05, 1]], until=V(7.75)),
       polaroid('assets/ap/ro5402_hero', 628, 650, 190, t_leg, label='Royal Oak', z=30, rot=6, kind='pop', fixed=True, out={"type": "slideR", "at": t_back + .05, "dur": .3})]
els += motes(cone_points(360, 10, 3), at=.3, z=5)
els += wall_clock(570, 300, 4, 0, z=6, d=150, at=t_back - .2, spin=(t_back, V(7.8), -8))
els += flips(['2000', '1990', '1980', '1970', '1960', '1954'], 160, 330, t_back + .05, .2, z=10, scale=.62)
els.append(svg(760, 1320, '<rect width="760" height="1320" fill="#8A6A3A"/>' + vignette(color='#3A2A14', amt=.6), 360, 640, z=30, kind=None, shadow=False, depth=0, still=True,
               opacity=[[t_back, 0], [t_back + 1.05, .26], [V(7.9), .16]]))
P1.S('p1-0', 'ro-black', C, els,
     camera=cam((0, 1.7, round(wrist[0]), round(wrist[1]), None), (V(1.2), 1.0, 360, 700, 'inOutCubic'), (V(4.0), 1.06, 385, 680, 'inOutCubic'),
                (t_back, 1.12, 360, 660, 'inOutCubic'), (V(7.9), 1.0, 360, 640, 'inOutCubic')),
     sfx=[E('shutter', .15, -14), E('paper_slide', V(1.45), -13), E('click', t_leg, -14), E('whoosh', t_back, -12), E('crown_wind', t_back + .1, -10)] +
         [E('paper_tear', t_back + .05 + i * .2, -17) for i in range(6)],
     beds=[{"name": "watch_run", "from": 0, "to": 8, "gain": -28}])

# 1  Geneva 1954: a young man of 23, a watch for SAS flights over the North Pole
C = 'جنيف، | سنة ألف وتسعمية | وأربعة وخمسين. | شاب | عمره ثلاثة وعشرين | سنة بس، | يصمم لشركة | يونيفرسال جنيف | ساعة لرحلات طيران | إس إيه إس | فوق القطب الشمالي.'
CPH = dict(id='cph', lon=12.57, lat=55.68, label='كوبنهاغن'); LAX = dict(id='lax', lon=-118.24, lat=34.05, label='لوس أنجلوس')
t_23, t_map, t_pole = at('p1-1', C, 'شاب'), V(7.3), at('p1-1', C, 'فوق القطب')
cal = calendar([[0, 160], [.6, 560, 'inOutCubic']], [[0, 330], [.6, 250, 'inOutCubic']], '1954', at=0, z=10, scale=[[0, .62], [.6, .6]], depth=.9)
cal["in"] = {"type": "none", "at": 0}
els = [svg(720, 760, geneva_sky(), 360, 380, z=1, kind=None, depth=.4, shadow=False),
       svg(200, 70, cloud_paper(), [[0, 160], [14.4, 230]], 150, z=1, kind=None, depth=.45, shadow=False),
       svg(200, 70, cloud_paper(), [[0, 560], [14.4, 500]], 90, z=1, kind=None, depth=.45, shadow=False, scale=.7),
       svg(720, 200, geneva_mountains(), 360, 340, z=2, kind=None, depth=.5, shadow=False),
       svg(720, 120, geneva_quay(), 360, 410, z=3, kind=None, depth=.6, shadow=False),
       svg(720, 300, geneva_lake(), 360, 620, z=4, kind=None, depth=.7, shadow=False),
       svg(60, 300, jet_d_eau(), 600, 480, anchor='b', z=5, kind='grow', at=.2, dur=1.0, depth=.7, shadow=False, idle={"type": "sway", "amp": 1.2, "speed": .3}),
       svg(160, 60, steamer(), [[0, 820], [7.2, -120]], 560, z=5, kind=None, depth=.75, idle={"type": "bob", "amp": 1.5, "speed": .6}),
       svg(760, 520, floor_band('#8A7458', '#A48D6E', 520), 360, 1030, z=6, kind=None, depth=.9, shadow=False),
       cal,
       shadow(330, 1180, 520, .2, z=19),
       cutout('assets/gen/genta23_desk_cut', 330, 1180, 700, .2, z=20, kind='rise', dur=.5, person=True, until=V(7.6)),
       {"type": "map", "x": 360, "y": 600, "w": 720, "h": 1180, "z": 40,
        "view": [[t_map, {"lon": 10, "lat": 58, "span": 120}], [V(8.8), {"lon": 0, "lat": 62, "span": 120}], [V(11.0), {"lon": -95, "lat": 58, "span": 130}, "inOutCubic"],
                 [V(13.9), {"lon": -40, "lat": 64, "span": 190}, "inOutCubic"]],
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(CPH, at=V(8.0)), dict(LAX, at=V(10.9)), dict(id='pole', lon=-40, lat=84, label='القطب الشمالي', at=t_pole)],
        "routes": [{"from": "cph", "to": "lax", "at": V(8.8), "dur": 2.4, "curve": .45, "plane": True, "keep": True}],
        "unfold": {"at": t_map, "dur": .8}, "in": {"type": "none", "at": t_map}, "depth": 0},
       {"type": "sparkles", "x": 360, "y": 600, "count": 8, "radius": 30, "life": .8, "color": "#B23A2E", "at": t_pole, "z": 41, "depth": 0},
       polaroid('assets/early/sas1954', 360, 800, 190, V(11.4), label='SAS · 1954', z=45, rot=-4, depth=0, desc='SAS advertisement for the polar route, 1954 (public domain)', aspect=.69)]
P1.S('p1-1', 'ro-alpine', C, els, transition='cut',
     camera=cam((0, 1.0, 360, 640, None), (t_23, 1.0, 360, 620, 'inOutCubic'), (V(5.2), 1.15, 340, 880, 'inOutCubic'), (V(7.2), 1.6, 250, 750, 'inOutCubic')),
     sfx=[E('pencil', V(4.4), -10), E('paper_slide', t_map, -12), E('plane', V(8.8), -14), E('pin', t_pole, -14), E('paper_place', V(11.4), -10)])
# the pole pin sits where the map puts it; the sparkle is placed in the stills pass (see SPARK below)

# 2  The Polerouter (first named Polarouter): it made his name known to the watch companies
C = 'اسمها البولروتر… | وهي اللي خلت | اسمه ينعرف | عند شركات الساعات.'
t_known = at('p1-2', C, 'اسمه ينعرف')
pol = polaroid('assets/early/polerouter', 360, 600, 520, .0, label='Universal Genève Polerouter', z=20, kind='rise')
els = [svg(760, 360, aurora(), [[0, 340], [5.3, 380]], 230, z=1, kind='fade', at=0, dur=.6, depth=.5, shadow=False, idle={"type": "sway", "amp": 1, "speed": .2}),
       svg(720, 520, stars(), 360, 300, z=1, kind=None, depth=.4, shadow=False, idle={"type": "pulse", "amp": .02, "speed": .5}),
       svg(520, 1000, spotlight_cone(), 360, 0, anchor='t', z=2, kind='fade', at=0, dur=.5, shadow=False),
       pol, glint_on(pol, V(1.8)),
       tag('أول اسم لها: Polarouter', 360, 1130, V(2.2), size=24, z=30, rot=1.5, depth=0, until=V(4.9))]
els += motes(cone_points(360, 8, 5), at=.2, z=3)
for k, (ex, ey, fx, fy, r) in enumerate([(140, 880, -200, 880, -10), (590, 880, 900, 900, 8), (585, 330, 900, 250, 12)]):
    els.append(svg(150, 96, envelope(), [[t_known + k * .3, fx], [t_known + k * .3 + .5, ex, 'outCubic']], [[t_known + k * .3, fy], [t_known + k * .3 + .5, ey, 'outCubic']],
                   z=15, kind='none', at=t_known + k * .3, rot=r))
P1.S('p1-2', 'ro-night', C, els, transition='fade',
     camera=cam((0, 1.9, 360, 560, None), (V(1.6), 1.0, 360, 620, 'inOutCubic'), (5.3, 1.08, 360, 600, 'inOutCubic')),
     sfx=[E('shutter', .2, -12), E('tick', V(1.8), -16)] + [E('paper_slide', t_known + k * .3, -16) for k in range(3)])

# 3  Omega asks him to refresh the Constellation (the photo is a 1958 piece, before his refresh)
C = 'بعدها جات أوميغا، | وطلبت منه يجدد | مجموعة الكونستليشن.'
t_lift, t_con = V(1.3), at('p1-3', C, 'مجموعة')
con = polaroid('assets/early/constellation', 290, 600, 380, V(1.4), label='Omega Constellation 1958', z=20, rot=-2, kind='rise')
els = [svg(760, 360, aurora(), 360, 230, z=1, kind=None, depth=.5, shadow=False, opacity=.35),
       svg(720, 520, stars(seed=9), 360, 300, z=1, kind=None, depth=.4, shadow=False),
       svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3'), 560, 330, z=10, kind='pop', at=-.1, dur=.3, scale=.6,
           idle={"type": "shake", "amp": 3, "speed": 9, "from": .2, "until": t_lift}),
       svg(260, 50, handset('#2A2C31'), 560, [[t_lift, 290], [t_lift + .3, 240, 'outBack']], z=11, kind='pop', at=-.1, dur=.3, scale=.6,
           rot=[[t_lift, 0], [t_lift + .3, -18]], idle={"type": "shake", "amp": 3, "speed": 9, "from": .2, "until": t_lift}),
       svg(260, 80, ring_lines('#EFE8D6'), 560, 270, z=12, kind='pop', at=.2, dur=.2, scale=.6, idle={"type": "pulse", "amp": .08, "speed": 6},
           out={"type": "fade", "at": t_lift, "dur": .1}),
       tag('أوميغا', 560, 160, V(.3), size=34),
       con, glint_on(con, t_con + .2),
       tag('قبل ما يجددها', 290, 262, t_con, size=24, z=25, rot=-3)]
for k in range(8):
    a = math.radians(-60 + k * 30)
    els.append(svg(36, 36, star8(), round(300 + 300 * math.cos(a)), round(600 + 330 * math.sin(a)), z=8, kind='pop', at=V(2.4) + k * .15, dur=.3,
                   idle={"type": "pulse", "amp": .08, "speed": .7}))
P1.S('p1-3', 'ro-night', C, els, transition='slide',
     camera=cam((0, 1.05, 470, 470, None), (V(1.3), 1.0, 360, 640, 'inOutCubic'), (4.7, 1.15, 300, 600, 'inOutCubic')),
     sfx=[E('ring', .2, -12), E('click', t_lift, -9), E('paper_place', V(1.4), -10), E('tick', t_con + .2, -16)])

# 4  The early 1960s at Audemars Piguet: his name in the archives; 5179 (circle and square), 5182 (asymmetric)
C = 'ومع بداية الستينات، | يظهر اسمه | في أرشيف | أوديمار بيغيه: | ساعة تجمع | الدائرة والمربع، | وساعة غير متناظرة…'
t_name, t_cs, t_asym = at('p1-4', C, 'يظهر اسمه'), at('p1-4', C, 'الدائرة والمربع،'), at('p1-4', C, 'غير متناظرة…')
t_79, t_82 = at('p1-4', C, 'ساعة تجمع') - .2, at('p1-4', C, 'وساعة غير') - .2
JOUX = svg(760, 240, spruce_band(), 360, 1280, anchor='b', z=2, kind=None, depth=.85, shadow=False)
els = flips(['1955', '1958', '1960'], 170, 260, .05, .22, z=10, scale=.55, depth=.85) + [
       JOUX,
       svg(300, 180, index_card(), 300, 560, z=15, kind='slideU', at=t_name, dur=.5, rot=-3, out={"type": "fade", "at": t_79, "dur": .3}),
       svg(56, 52, tick_mark(), 410, 600, z=16, kind='slam', at=t_name + .7, dur=.25, out={"type": "fade", "at": t_79, "dur": .3}),
       polaroid('assets/ap/m5179', 200, 700, 330, t_79, label='Ref. 5179 · 1961', z=20, rot=-3, kind='rise', labelSize=24),
       polaroid('assets/ap/m5182', 515, 700, 330, t_82, label='Ref. 5182 · 1962', z=21, rot=3, kind='rise', labelSize=24),
       sk([{"d": circle_d(200, 668, 56), "at": t_cs, "dur": .4, "stroke": "#B23A2E", "width": 3, "opacity": .85},
           {"d": 'M 136 604 L 264 604 L 264 732 L 136 732 Z', "at": t_cs + .4, "dur": .4, "stroke": "#B23A2E", "width": 3, "opacity": .85}], z=24),
       sk([{"d": dashed(476, 590, 476, 790), "at": t_asym, "dur": .35, "stroke": "#B23A2E", "width": 3, "opacity": .85},
           {"d": dashed(508, 590, 480, 790), "at": t_asym + .45, "dur": .35, "stroke": "#B23A2E", "width": 3, "opacity": .6}], z=24)]
P1.S('p1-4', 'ro-paper', C, els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (t_79, 1.02, 340, 600, 'inOutCubic'), (t_cs - .2, 1.18, 210, 700, 'inOutCubic'), (t_82, 1.18, 230, 700, None),
                (t_asym, 1.18, 500, 700, 'inOutCubic'), (9.4, 1.06, 360, 700, 'inOutCubic')),
     sfx=[E('paper_tear', .05, -15), E('paper_tear', .27, -16), E('paper_tear', .49, -15), E('paper_slide', t_name, -12), E('stamp', t_name + .7, -10),
          E('shutter', t_79, -14), E('shutter', t_82, -14), E('pencil', t_cs, -10), E('pencil', t_asym, -10)])

# 5  1967: a handbag watch of his design gets an honourable mention at the Prix de la Ville de Genève
C = 'وفي سنة | سبعة وستين، | ساعة شنطة | من تصميمه | تاخذ تنويه | في جائزة | مدينة جنيف.'
t_bag, t_his, t_prize = at('p1-5', C, 'ساعة شنطة'), at('p1-5', C, 'من تصميمه'), at('p1-5', C, 'تاخذ تنويه')
catp = polaroid('assets/crop/m8311_catalogue', 480, 560, 300, t_bag - .1, label='Ref. 8311 · Handbag watch', z=14, rot=3, labelSize=20)
els = flips(['1962', '1964', '1966', '1967'], 170, 260, 0, .16, z=10, scale=.55, depth=.85) + [
       JOUX, catp, glint_on(catp, t_bag + .7),
       polaroid('assets/ap/m8311', 200, 560, 240, t_his, label='رسم التصميم', z=12, rot=-5),
       svg(220, 300, rosette(['تنويه', 'جائزة جنيف', '1967']), 190, 800, anchor='t', z=20, kind='drop', at=t_prize, dur=.45, rot=-6,
           idle={"type": "sway", "amp": 2, "speed": .45, "from": t_prize + .45}),
       {"type": "sparkles", "x": 190, "y": 900, "count": 6, "radius": 40, "life": .7, "color": "#EFE8D6", "at": t_prize + .4, "z": 21}]
P1.S('p1-5', 'ro-paper', C, els, transition='cut',
     camera=cam((0, 1.06, 360, 700, None), (t_bag, 1.0, 380, 640, 'inOutCubic'), (t_his + .6, 1.3, 480, 690, 'inOutCubic'), (t_prize - .1, 1.25, 460, 680, None),
                (7.37, 1.05, 330, 680, 'inOutCubic')),
     sfx=[E('paper_tear', 0, -15), E('paper_tear', .16, -16), E('paper_tear', .32, -15), E('paper_tear', .48, -16),
          E('paper_place', t_bag - .1, -10), E('paper_place', t_his, -10), E('stamp', t_prize, -10)])

# 6  Georges Golay: managing director, the first from outside the founding families
C = 'وهناك لقى شريكه: | جورج غولاي، | المدير العام… | وأول واحد | يدير الشركة | من برا | العائلتين المؤسستين.'
t_first, t_out = at('p1-6', C, 'وأول واحد'), at('p1-6', C, 'من برا')
GOLAY = dict(x=540, y=1250, h=500)
els = [polaroid('assets/ap/lebrassus1969', 360, 340, 460, .1, label='Audemars Piguet · Le Brassus · 1969', z=5, rot=-1, kind='fade',
                opacity=[[t_first - .2, 1], [t_first + .4, .3]]),
       polaroid('assets/ap/golay1966', 220, 770, 320, V(1.75), label='جورج غولاي، 1966', z=20, rot=-3, labelSize=24),
       svg(760, 150, desk_edge(), 360, 1205, z=16, kind=None, depth=.95),
       svg(120, 150, bankers_lamp(), 100, 1070, z=17, kind=None, depth=.95),
       shadow(GOLAY['x'], GOLAY['y'] - 20, 330, V(3.0), z=17),
       cutout('assets/gen/golay_phone_cut', GOLAY['x'], GOLAY['y'], GOLAY['h'], V(3.0), z=18, kind='rise', dur=.5,
              rot=[[V(3.5), 0], [8.9, .6]]),
       tag('أوديمار', 210, 210, t_first + .1, size=30, z=30, rot=-2),
       tag('بيغيه', 510, 210, t_first + .3, size=30, z=30, rot=2),
       sk([{"d": 'M 210 240 L 210 300 L 510 300 L 510 240 M 360 300 L 360 380', "at": t_first + .4, "dur": .6, "stroke": "#EFE8D6", "width": 4, "opacity": .95}], z=29),
       tag('غولاي', 600, 470, t_out, size=30, z=31, rot=3, paper='#F6F1E3', ink='#B23A2E'),
       sk([{"d": dashed(560, 500, 300, 640, 8), "at": t_out + .3, "dur": .6, "stroke": "#B23A2E", "width": 4, "opacity": .95}], z=29)]
P1.S('p1-6', 'ro-alpine', C, els, transition='slide',
     camera=cam((0, 1.0, 360, 520, None), (V(1.6), 1.0, 360, 620, 'inOutCubic'), (t_first, 1.02, 360, 600, None), (t_first + .4, 1.04, 360, 480, 'inOutCubic'),
                (t_out + .2, 1.04, 400, 540, 'inOutCubic'), (8.91, 1.1, 420, 820, 'inOutCubic')),
     sfx=[E('paper_place', V(1.75), -10), E('pin', V(3.0), -14), E('pin', t_first + .1, -14), E('pin', t_first + .3, -14), E('pencil', t_first + .4, -12),
          E('stamp', t_out, -12)])

# 7  "We were like a tandem": if one of us wasn't convinced, we didn't make the model; both wore the 5233
C = 'جنتا يقول: | كنا مثل الدراجة | اللي يسوقها اثنين… | إذا واحد منا | مو مقتنع، | ما نسوي الموديل. | وحتى كانوا يلبسون | نفس الساعة.'
t_ride, t_stop, t_same = V(1.0), at('p1-7', C, 'ما نسوي'), at('p1-7', C, 'وحتى كانوا')
t_watch = at('p1-7', C, 'نفس الساعة.')
BX = [[t_ride, -300], [t_stop, 420, 'outCubic']]; BY = 363
bike_out = {"type": "fade", "at": t_same, "dur": .35}
els = [svg(760, 260, floor_band('#C9BBA0', '#DCD0B8', 260), 360, 1250, z=2, kind=None, depth=.95, shadow=False),
       svg(760, 140, road_and_hills(), 360, 420, z=4, kind='fade', at=.2, dur=.4, depth=.8, shadow=False, out=bike_out),
       svg(520, 230, tandem_frame(), BX, BY, z=10, kind='none', at=t_ride, out=bike_out,
           rot=[[t_stop, 0], [t_stop + .15, 3], [t_stop + .45, 0, 'outBack']], idle={"type": "bob", "amp": 1.5, "speed": 1.2, "until": t_stop})]
for off in (-180, 180):
    els.append(svg(134, 134, wheel(), [[t, x + off] + rest for t, x, *rest in BX], BY + 45, z=9, kind='none', at=t_ride, shadow=False, out=bike_out,
                   rot=[[t_ride, 0], [t_stop, 650, 'outCubic']]))
els += [tag('«دراجة لاثنين»', 360, 200, V(1.3), size=34, until=t_same - .1, paper='#F6F1E3', depth=0),
        shadow(190, 1200, 260, .1, z=19),
        cutout('assets/gen/young_think_cut', 190, 1200, 680, .1, z=20, person=True, kind='rise', dur=.5),
        cutout('assets/gen/golay_phone_cut', GOLAY['x'], GOLAY['y'], GOLAY['h'], 0, z=18, kind='none'),
        polaroid('assets/ap/m5233', 255, 330, 200, t_watch - .1, label='جنتا', z=40, rot=-4, kind='pop'),
        polaroid('assets/ap/m5233', 475, 330, 200, t_watch + .15, label='غولاي', z=40, rot=4, kind='pop'),
        sk([{"d": 'M 352 316 L 378 316 M 352 336 L 378 336', "at": t_watch + .45, "dur": .3, "stroke": "#B23A2E", "width": 4, "opacity": 1}], z=41),
        tag('Ref. 5233', 365, 520, t_watch + .55, size=24, z=42, rot=1)]
P1.S('p1-7', 'ro-paper', C, els, transition='fade',
     camera=cam((0, 1.1, 420, 820, None), (t_ride, 1.0, 300, 600, 'inOutCubic'), (t_stop, 1.06, 420, 600, 'inOutCubic'), (t_same, 1.0, 360, 560, 'inOutCubic'),
                (9.23, 1.04, 365, 520, 'inOutCubic')),
     sfx=[E('whoosh', t_ride, -14), E('clasp', t_stop, -12), E('click', t_watch - .1, -10), E('click', t_watch + .15, -10)])

# 8  April 1970: 38 years old, 16 years of designs behind him; on the 10th at 4 pm, the phone rings
C = 'أبريل | ألف وتسعمية وسبعين. | جنتا عمره | ثمانية وثلاثين، | ووراه ستطعش سنة | من التصاميم. | وفي يوم عشرة، | الساعة أربعة العصر… | تلفونه يرن.'
t_g, t_board, t_day, t_four = at('p1-8', C, 'جنتا عمره'), at('p1-8', C, 'ووراه ستطعش'), at('p1-8', C, 'وفي يوم'), at('p1-8', C, 'الساعة أربعة')
r1, r2 = (V(10.6), V(11.6)), (V(12.3), V(13.3))
board = [('assets/early/polerouter', 200, 245), ('assets/ap/m5179', 360, 245), ('assets/ap/m5182', 520, 245), ('assets/crop/m8311_open', 280, 385), ('assets/ap/m5233', 440, 385)]
els = flips(['1968', '1969', '1970'], 170, 250, .05, .2, z=10, scale=.55, last_out=t_board - .2) + [
       svg(760, 1320, light_beam([(760, 0), (560, 0), (40, 1320), (560, 1320)], amt=.10), 360, 640, z=3, kind='fade', at=0, dur=.8, shadow=False, depth=.9, still=True),
       svg(760, 260, floor_band('#141B28', '#22304A', 260), 360, 1250, z=2, kind=None, depth=.95, shadow=False),
       svg(560, 300, cork_board(560, 300), 360, 315, z=6, kind='drop', at=t_board, dur=.5, depth=.85, out={"type": "fade", "at": t_day, "dur": .4})]
for i, (rel, gx, gy) in enumerate(board):
    tb = t_board + .45 + i * .15
    els.append(polaroid(rel, gx, gy, 130, tb, z=7 + i, kind='pop', until=t_day, rot=(-5, 3, -2, 5, -3)[i], bottom=12, depth=.85))
    els.append(svg(16, 16, pin_head(), gx, gy - 70, z=13, kind='pop', at=tb + .1, dur=.2, shadow=False, depth=.85, out={"type": "fade", "at": t_day, "dur": .4}))
els += [sk([{"d": 'M 200 175 L 360 175 L 520 175 L 280 315 L 440 315', "at": t_board + 1.3, "dur": 1.0, "stroke": "#B23A2E", "width": 2, "opacity": .9}], z=14, depth=.85) | {"out": {"type": "fade", "at": t_day, "dur": .4}},
        shadow(360, 1180, 260, t_g, z=19),
        cutout('assets/gen/young_think_cut', 360, [[0, 1180], [r1[0] + .05, 1180], [r1[0] + .2, 1172], [r1[0] + .4, 1180]], 700, t_g, z=20, person=True, kind='rise', dur=.5),
        tag('10 أبريل', 170, 250, t_day, size=34, until=V(11.4)),
        *wall_clock(590, 520, 3, 50, z=11, d=150, at=t_four - .3, spin=(t_four, V(10.4), 1 / 6)),
        *ringing_phone(580, 980, [r1, (r2[0], None)], z=59, scale=.75, at=V(10.3)),
        svg(760, 1320, '<rect width="760" height="1320" fill="#000"/>', 360, 640, z=58, kind=None, shadow=False, depth=0, still=True, opacity=[[V(11.7), 0], [V(12.4), .55]]),
        tag('يتبع…', 360, 1010, V(12.0), size=46, z=61, depth=0),
        tag('الجزء الثاني: الرويال أوك', 360, 1080, V(12.2), size=30, z=61, depth=0, rot=1),
        credits(CREDITS1, V(12.6), y=110)]
P1.S('p1-8', 'ro-night', C, els, tail=2.6, transition='fade', captionClear=V(11.9),
     camera=cam((0, 1.0, 360, 640, None), (t_board, 1.0, 360, 560, 'inOutCubic'), (t_day - .2, 1.06, 360, 500, 'inOutCubic'), (t_four, 1.0, 400, 620, 'inOutCubic'),
                (V(10.4), 1.0, 420, 640, None), (V(11.8), 1.12, 440, 720, 'inOutCubic'), (14.48, 1.16, 450, 740, 'inOutCubic')),
     sfx=[E('paper_tear', .05, -15), E('paper_tear', .25, -16), E('paper_tear', .45, -15), E('paper_place', t_board, -11)] +
         [E('click', t_board + .45 + i * .15, -16) for i in range(5)] + [E('tick', t_four + k * .4, -14) for k in range(4)] +
         [E('ring', r1[0], -8), E('ring', r2[0], -9)])

# =================================================================================================================
# PART 2  The Royal Oak
P2 = Part()
BSL = dict(id='bsl', lon=7.59, lat=47.56, label='بازل'); TRN = dict(id='trn', lon=7.69, lat=45.07, label='تورينو')
LSN = dict(id='lsn', lon=6.63, lat=46.52, label='لوزان'); PAR = dict(id='par', lon=2.35, lat=48.86, label='باريس')
# H  The hook (stakes, chosen by the user): "1970... quartz is coming to take everything. And AP bet on steel."
#    The quartz scene (1b) pays it off.
C = 'سنة سبعين… | الكوارتز جاي | ياخذ كل شي. | وأوديمار بيغيه | راهنت على الستيل.'
t_bet = at('p2-h', C, 'وأوديمار بيغيه')
END_H = round(VO_AT + VO['p2-h']['seconds'] + TAIL, 2)
ast = polaroid('assets/early/astron1969', [[t_bet - .1, 360], [t_bet + .5, 150, 'inOutCubic']], 600, 420, 0, label='Seiko Quartz Astron · 1969', z=20, rot=-3,
               kind='none', fixed=True, opacity=[[t_bet - .1, 1], [t_bet + .5, .3]], scale=[[0, 1.0], [t_bet, 1.04]])
els = [sk([{"d": sine_path(0, 720, 1100, 22, 7), "at": 0, "dur": 1.6, "stroke": "#7FD3F0", "width": 3, "opacity": .8}], z=5, depth=0),
       ast, glint(360, 578, 392, 392 / ast['aspect'] * .94, .5, rot=-3, z=21),
       tag('الكوارتز جاي ياخذ كل شي', 360, 160, 0, size=34, z=40, depth=0, rot=-1.5, until=t_bet, **{"in": {"type": "none", "at": 0}}),
       svg(320, 200, steel_plate(320, 200), 420, 640, z=25, kind='drop', at=t_bet, dur=.5, rot=-5),
       glint(420, 640, 310, 190, t_bet + .6, rot=-5, z=26),
       tag('ستيل', 420, 470, t_bet + .2, size=44, z=30)]
P2.S('p2-h', 'ro-night', C, els, transition='cut',
     camera=cam((0, 1.12, 360, 560, None), (t_bet, 1.0, 360, 620, 'inOutCubic'), (END_H, 1.05, 400, 640, 'inOutCubic')),
     sfx=[E('tick', .1, -12)] + [E('tick', .1 + k * .5, -18) for k in range(1, 5)] + [E('stamp', t_bet, -9), E('tick', t_bet + .6, -16)])

# 0  Basel, 10 April 1970: Golay and the three agents (the day before the fair opened)
C = 'بازل، | عشرة أبريل | ألف وتسعمية وسبعين. | قبل لا يفتح | معرض الساعات، | جورج غولاي يجتمع | مع ثلاثة | من الوكلاء: | كارلو دي ماركي | من تورينو، | وشارل بوتي | من لوزان، | وشارل دورو | من باريس.'
t_hall, t_three = V(3.0), at('p2-0', C, 'مع ثلاثة')
t_trn, t_lsn, t_par = at('p2-0', C, 'من تورينو،'), at('p2-0', C, 'من لوزان،'), at('p2-0', C, 'من باريس.')
hero0 = polaroid('assets/ap/ro5402_hero', 360, 600, 380, 0, label='Royal Oak', z=45, kind='none', fixed=True, out={"type": "slideR", "at": V(1.5), "dur": .35})
els = [{"type": "map", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 1, "view": [[0, {"lon": 7.6, "lat": 47.0, "span": 11}], [V(1.6), {"lon": 7.6, "lat": 47.0, "span": 9}],
                                                                                 [V(3.1), {"lon": 7.59, "lat": 47.56, "span": 1.6}, "inCubic"]],
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(BSL, at=.2)], "highlight": [{"n": "Switzerland", "at": 0, "color": "#E3CF9E"}], "unfold": {"at": .0, "dur": .01}, "depth": 0,
        "out": {"type": "fade", "at": V(3.1), "dur": .3}},
       hero0, glint_on(hero0, .4),
       tag('الجزء الثاني: الرويال أوك', 360, 150, 0.0, size=36, z=50, until=V(1.5), depth=0),
       tag('بازل، 10 أبريل 1970', 360, 180, V(1.6), size=36, z=50, until=t_hall, depth=0),
       svg(900, 1100, hall(), 360, 560, z=2, kind='fade', at=t_hall, dur=.4, depth=.6, shadow=False),
       svg(760, 300, carpet(), 360, 1130, z=3, kind='fade', at=t_hall, dur=.4, depth=.9, shadow=False),
       svg(900, 220, bunting_(), 360, 120, z=4, kind='fade', at=t_hall, dur=.4, depth=.65, shadow=False, idle={"type": "sway", "amp": .8, "speed": .35})]
for k, lx in enumerate((150, 360, 570)):
    els.append(svg(120, 110, pendant_lamp(), lx, 225, anchor='t', z=4, kind='fade', at=t_hall, dur=.4, depth=.65, idle={"type": "sway", "amp": .6, "speed": .25, "phase": k}))
els += [tag('معرض بازل 1970', 200, 300, t_hall + .2, size=28, z=5, rot=-1, depth=.7, until=t_trn - .3, idle={"type": "sway", "amp": .6, "speed": .3}),
        polaroid('assets/ap/basel1970', 360, 470, 520, V(3.2), label='Audemars Piguet · Basel 1970', z=8, rot=-2, until=V(6.0))]
for i, (rel, x, t, city) in enumerate([('assets/gen/golay_stand_cut', 130, V(6.1), None), ('assets/gen/demarchi_back_cut', 300, t_trn - .3, 'تورينو'),
                                       ('assets/gen/bauty_back_cut', 460, t_lsn - .3, 'لوزان'), ('assets/gen/dorot_back_cut', 615, t_par - .3, 'باريس')]):
    els.append(cutout(rel, x, 1240, 560, t, z=20 + i, kind='rise', dur=.45, desc=PEND, aspect=.42))
    if city: els.append(tag(city, x, 640, t + .2, size=28, z=40, rot=(-3, 2, -2)[i - 1]))
els += [svg(306, 306, '<rect width="306" height="306" rx="4" fill="#EFE8D6"/>', 545, 330, z=40, kind='drop', at=t_three, dur=.45, depth=0, rot=3),
        {"type": "map", "x": 545, "y": 330, "w": 284, "h": 284, "z": 41, "view": {"lon": 5.0, "lat": 47.0, "span": 7.5}, "sea": "#CCC6B7", "land": "#F4F1E8",
         "highlight": [{"n": "Switzerland", "at": 0, "color": "#E3CF9E"}, {"n": "Italy", "at": 0, "color": "#E8DCC0"}],
         "pins": [dict(BSL, at=t_three + .3), dict(TRN, at=t_trn), dict(LSN, at=t_lsn), dict(PAR, at=t_par)],
         "routes": [{"from": "trn", "to": "bsl", "at": t_trn + .1, "dur": .8, "keep": True}, {"from": "lsn", "to": "bsl", "at": t_lsn + .1, "dur": .8, "keep": True},
                    {"from": "par", "to": "bsl", "at": t_par + .1, "dur": .8, "keep": True}],
         "in": {"type": "drop", "at": t_three, "dur": .45}, "rot": 3, "depth": 0},
        svg(84, 30, '<rect width="84" height="30" fill="rgb(214,190,128)" opacity=".9"/>', 545, 180, z=42, kind='drop', at=t_three, dur=.45, depth=0, rot=-2, shadow=False),
        polaroid('assets/ap/demarchi1940s', 165, 430, 190, t_trn - .1, label='كارلو دي ماركي، الأربعينات', z=42, rot=-5, until=t_lsn - .3, labelSize=17)]
P2.S('p2-0', 'ro-hall', C, els,
     camera=cam((0, 1.0, 360, 640, None), (t_hall, 1.0, 360, 640, None), (V(6.0), 1.03, 350, 660, 'inOutCubic'), (t_trn, 1.05, 330, 700, 'inOutCubic'),
                (t_lsn, 1.07, 380, 720, 'inOutCubic'), (t_par, 1.08, 420, 740, 'inOutCubic'), (14.94, 1.06, 380, 760, 'inOutCubic')),
     sfx=[E('shutter', .1, -14), E('whoosh', V(1.5), -16), E('paper_place', V(3.2), -11), E('crowd', t_hall, -26), E('paper_place', t_three, -12)] +
         [E('paper_slide', t, -14) for t in (V(6.1), t_trn - .3, t_lsn - .3, t_par - .3)],
     beds=[{"name": "crowd", "from": t_hall, "to": 15, "gain": -28}])

# 1  The brief: gold alone is not enough; a steel watch, sporty and elegant, for the new way of life. The Three Musketeers.
C = 'طلبهم واضح: | الذهب بروحه | ما يكفي. | يبون ساعة ستيل، | رياضية وأنيقة، | تناسب | أسلوب الحياة الجديد. | أوديمار بيغيه تسميهم: | الفرسان الثلاثة.'
t_gold, t_steel, t_life, t_mus = at('p2-1', C, 'الذهب بروحه'), at('p2-1', C, 'يبون ساعة'), at('p2-1', C, 'تناسب'), at('p2-1', C, 'الفرسان الثلاثة.')
t_ag = at('p2-1', C, 'أوديمار بيغيه')
els = [polaroid('assets/ap/m5182', [[t_gold, 230], [t_gold + 1.4, 130, 'inOutCubic']], 700, 320, .1, label='ذهب · Ref. 5182', z=10, kind='rise', labelSize=20,
                opacity=[[t_gold, 1], [t_gold + 1.4, .35]], rot=[[t_gold, 0], [t_gold + 1.4, -10]]),
       svg(300, 190, steel_plate(300, 190), 450, 640, z=12, kind='drop', at=t_steel - .3, dur=.5, rot=-6),
       glint(450, 640, 290, 180, t_steel + .4, rot=-6, z=13),
       tag('ستيل', 450, 470, t_steel - .2, size=40, until=t_ag - .2)]
for k, (body, w, h, x, y) in enumerate([(icon_yacht(), 150, 160, 130, 330), (icon_skis(), 120, 175, 330, 300), (icon_racket(), 130, 170, 590, 330),
                                        (icon_sunglasses(), 140, 55, 190, 890), (icon_car(), 200, 92, 540, 885)]):
    els.append(svg(w, h, body, x, y, z=14, kind='pop', at=t_life + k * .3, dur=.35, out={"type": "fade", "at": t_ag - .1, "dur": .3},
                   idle={"type": "float", "amp": 5, "speed": .5, "phase": k}))
for i, (rel, x) in enumerate([('assets/gen/demarchi_back_cut', 170), ('assets/gen/bauty_back_cut', 360), ('assets/gen/dorot_back_cut', 550)]):
    els.append(cutout(rel, x, 1300, 600, t_ag - .1, z=30 + i, kind='rise', dur=.45, desc=PEND, aspect=.42))
for k, r in enumerate((-35, 35, 0)):
    els.append(svg(60, 300, rapier('rp%d' % k), 360, 470, z=40 + k, kind='grow', at=t_mus - .2 + (.2 if k == 2 else 0), dur=.35,
                   rot=[[t_mus - .2, 0], [t_mus + .15, r, 'outBack']] if r else 0))
els += [svg(220, 100, cavalier_hat(), 360, 300, z=44, kind='drop', at=t_mus + .25, dur=.4),
        tag('الفرسان الثلاثة', 360, 170, t_mus, size=40, z=45)]
P2.S('p2-1', 'ro-steel', C, els, transition='slide',
     camera=cam((0, 1.0, 360, 640, None), (t_life, 1.04, 420, 640, 'inOutCubic'), (t_ag - .2, 1.06, 380, 620, 'inOutCubic'), (t_mus - .3, 1.0, 360, 620, 'inOutCubic'),
                (11.93, 1.06, 360, 520, 'inOutCubic')),
     sfx=[E('paper_place', .1, -12), E('whoosh', t_gold, -16), E('stamp', t_steel - .3, -10), E('tick', t_steel + .4, -16)] +
         [E('pin', t_life + k * .3, -16) for k in range(5)] + [E('whoosh', t_ag - .1, -14), E('clasp', t_mus + .1, -8), E('paper_place', t_mus + .3, -12)])

# 1b  The quartz shock: months earlier Seiko sold the first quartz wristwatch (Tokyo, Christmas 1969). Some saw the
#     future in it, others the end of mechanical watches: the start of the quartz crisis. Golay decided to gamble.
#     (AP Chronicles, "Birth of an Icon": "Some people saw the quartz watch as the future of luxury watchmaking and others
#     as the death knell of mechanical watchmaking ... Within such a context, it was worth taking a gamble.")
C = 'والتوقيت كان حساس: | قبلها بأشهر، | سيكو طرحت أول | ساعة يد كوارتز. | ناس شافوها | المستقبل… | وناس شافوها | نهاية الميكانيك. | كانت بداية | أزمة الكوارتز… | وغولاي قرر يخاطر.'
t_seiko, t_fut, t_end_m = at('p2-q', C, 'سيكو طرحت أول'), at('p2-q', C, 'المستقبل…'), at('p2-q', C, 'وناس شافوها')
t_crisis, t_gamble = at('p2-q', C, 'كانت بداية'), at('p2-q', C, 'وغولاي قرر يخاطر.')
END_Q = round(VO_AT + VO['p2-q']['seconds'] + TAIL, 2)
dim = lambda t: {"opacity": [[t, 1], [t + .5, .25]]}
astron = polaroid('assets/early/astron1969', 470, 560, 380, t_seiko - .1, label='Seiko Quartz Astron · 1969', z=20, rot=3, kind='rise', until=t_gamble - .2, **dim(t_end_m))
els = flips(['1969'], 170, 250, .05, .3, z=10, scale=.55, last_out=t_crisis) + [
       tag('طوكيو، ديسمبر 1969', 190, 400, t_seiko + .3, size=26, z=22, rot=-3, until=t_crisis),
       astron, glint_on(astron, t_seiko + .6),
       *wall_clock(500, 560, 3, 0, z=12, d=200, at=.2, spin=(.3, t_seiko, 2), out={"type": "fade", "at": t_seiko - .2, "dur": .3}),
       polaroid('assets/early/astron_35a', 210, 720, 240, t_fut - .5, label='Cal. 35A · 8,192 Hz', z=24, rot=-5, kind='pop', labelSize=18,
                until=t_gamble - .2, **dim(t_end_m)),
       sk([{"d": sine_path(40, 680, 160, 18, 9), "at": t_fut - .3, "dur": 1.0, "stroke": "#7FD3F0", "width": 3, "opacity": .9}], z=8, depth=0) |
       {"out": {"type": "fade", "at": t_end_m + .3, "dur": .4}}]
for k, (gx, gy, r, n, turns) in enumerate([(300, 600, 110, 16, 1), (468, 700, 70, 10, -1.6), (440, 470, 52, 8, -2.1)]):
    els.append(svg(2 * r + 20, 2 * r + 20, gear(r, n), gx, gy, z=30 + k, kind='pop', at=t_end_m + k * .12, dur=.3, still=True,
                   rot=[[t_end_m, 0], [t_crisis + .3, 300 * turns, 'outCubic']],
                   opacity=[[t_crisis, 1], [t_crisis + .6, .55]], out={"type": "fade", "at": t_gamble - .1, "dur": .3}))
els += [sk([{"d": 'M 180 420 L 260 520 L 230 560 L 330 690 L 300 730 L 400 860', "at": t_crisis + .1, "dur": .4, "stroke": "#B23A2E", "width": 5, "opacity": 1}], z=34) |
        {"out": {"type": "fade", "at": t_gamble - .1, "dur": .3}},
        tag('أزمة الكوارتز', 360, 300, t_crisis + .35, size=52, z=40, rot=-3, ink='#EFE8D6', paper='#B23A2E', **{"in": {"type": "slam", "at": t_crisis + .35, "dur": .3}}),
        svg(760, 150, desk_edge(), 360, 1205, z=16, kind='fade', at=t_gamble - .2, dur=.4, depth=.95),
        shadow(GOLAY['x'], GOLAY['y'] - 20, 330, t_gamble - .1, z=17),
        cutout('assets/gen/golay_phone_cut', GOLAY['x'], GOLAY['y'], GOLAY['h'], t_gamble - .1, z=18, kind='rise', dur=.5)]
P2.S('p2-q', 'ro-night', C, els, transition='fade',
     camera=cam((0, 1.0, 360, 640, None), (t_seiko, 1.0, 420, 600, 'inOutCubic'), (t_fut, 1.06, 330, 660, 'inOutCubic'), (t_end_m, 1.0, 360, 640, 'inOutCubic'),
                (t_crisis + .3, 1.04, 360, 520, 'inOutCubic'), (t_gamble, 1.0, 400, 760, 'inOutCubic'), (END_Q, 1.06, 440, 840, 'inOutCubic')),
     sfx=[E('paper_tear', .05, -15), E('shutter', t_seiko - .1, -12), E('tick', t_seiko + .6, -16), E('click', t_fut - .5, -12)] +
         [E('tick', t_fut + k * .25, -18) for k in range(6)] + [E('crown_wind', t_end_m, -12), E('paper_tear', t_crisis + .1, -10), E('stamp', t_crisis + .35, -8),
          E('paper_slide', t_gamble - .1, -12)])

# 2  4 pm (as Genta remembered it): Golay calls Genta. "I need the sketch tomorrow morning."
C = 'الساعة أربعة العصر، | غولاي يتصل بجنتا: | نبي ساعة رياضية | من الستيل، | ما انسوت | مثلها قبل… | والرسم أبيه | باچر الصبح.'
t_we, t_never, t_draw = at('p2-2', C, 'نبي ساعة'), at('p2-2', C, 'ما انسوت'), at('p2-2', C, 'والرسم أبيه')
t_ring = V(2.3)
TOPWALL, BOTWALL = '#D9D2C2', '#CDBFA6'
neutral = '<rect width="240" height="180" fill="#A9B9C6"/>' + '<g transform="translate(30 40) scale(.6)">%s</g><g transform="translate(130 90) scale(.45)">%s</g>' % (cloud_paper(), cloud_paper())
els = [svg(760, 660, '<rect width="760" height="660" fill="%s"/>' % BOTWALL, 360, 970, z=1, kind=None, shadow=False),
       svg(760, 18, '<polygon points="%s" fill="#F3EEE1"/>' % pts(jag([(0, 4)] + [(i * 38, 9 + (i % 2) * 7) for i in range(1, 20)] + [(760, 4), (760, 14), (0, 14)], 1.5, 5)), 360, 642, z=2, kind=None),
       svg(240, 180, window(240, 180, neutral), 180, 250, z=3, kind=None),
       svg(760, 640, light_beam([(60, 160), (300, 160), (520, 640), (200, 640)], amt=.12), 360, 320, z=3, kind=None, shadow=False),
       svg(760, 110, '<rect width="760" height="110" fill="#6B5038"/>', 360, 585, z=4, kind=None, shadow=False)]
els += wall_clock(600, 220, 3, 59, z=5, spin=(V(.45), V(.6), 1 / 60))
els += [svg(260, 162, rotary_phone() + '<g transform="translate(0 -14)">%s</g>' % handset(), 200, 478, z=6, kind=None, scale=.8),
        cutout('assets/gen/golay_phone_cut', 420, 640, 430, .05, z=8, kind='none'),
        sk([{"d": 'M 250 540 C 520 560 420 700 380 760 S 300 900 300 1060', "at": V(1.5), "dur": 1.0, "stroke": '#2A2C31', "width": 4, "opacity": 1}], z=7),
        svg(240, 180, window(240, 180, lake(240, 180, sky='#E9C79A')), 540, 840, z=3, kind=None),
        svg(240, 180, window(240, 180, lake(240, 180, night=True)), 540, 840, z=3, kind='fade', at=V(7.6), dur=.6),
        svg(760, 640, light_beam([(420, 750), (660, 750), (560, 1280), (160, 1280)], amt=.12), 360, 960, z=3, kind=None, shadow=False,
            opacity=[[V(7.6), 1], [V(8.2), 0]]),
        svg(330, 345, drafting_board(), 520, 1110, z=4, kind=None),
        svg(150, 105, jar_brushes(), 650, 1010, z=5, kind=None),
        svg(420, 640, lamp_glow(420, 640), 560, 1060, z=9, kind='fade', at=V(7.6), dur=.8, shadow=False, opacity=.6),
        svg(760, 640, '<rect width="760" height="640" fill="#1B2740"/>', 360, 960, z=9, kind=None, shadow=False, opacity=[[V(7.6), 0], [V(8.4), .25]])]
els += wall_clock(330, 760, 4, 0, z=5, spin=(V(7.5), V(8.8), 1.6))
els += [svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3') + '<g transform="translate(0 -14)">%s</g>' % handset('#2A2C31'), 275, 1105, z=6, kind=None, scale=.62,
            out={"type": "fade", "at": t_we, "dur": .1}, idle={"type": "shake", "amp": 3, "speed": 9, "from": t_ring, "until": t_we}),
        svg(260, 80, ring_lines('#2A2C31'), 275, 1050, z=7, kind='pop', at=t_ring, dur=.2, scale=.62, idle={"type": "pulse", "amp": .08, "speed": 6},
            out={"type": "fade", "at": t_we, "dur": .1}),
        cutout('assets/gen/young_phone_cut', 240, 1290, 560, t_we - .05, z=12, person=True, until=t_draw - .1),
        cutout('assets/gen/young_think_cut', 240, 1290, 560, t_draw - .2, z=12, person=True),
        tag('«والرسم أبيه باچر الصبح»', 450, 200, t_draw, size=30, z=30, depth=0)]
P2.S('p2-2', 'ro-alpine', C, els, transition='slide',
     camera=cam((0, 1.8, 600, 230, None), (V(.7), 1.8, 600, 230, None), (V(1.6), 1.55, 380, 380, 'inOutCubic'), (t_ring, 1.5, 330, 960, 'inOutCubic'),
                (t_never - .3, 1.5, 330, 960, None), (t_never + .3, 1.55, 380, 380, 'inOutCubic'), (t_draw - .5, 1.55, 380, 380, None),
                (t_draw, 1.5, 330, 960, 'inOutCubic'), (9.2, 1.55, 340, 940, 'inOutCubic')),
     sfx=[E('tick', V(.5), -10), E('click', V(.8), -8), E('ring', t_ring, -10), E('ring', t_ring + .5, -12), E('click', t_we, -8), E('tick_pair', V(7.5), -14)])

# 3  The night: the diver he saw as a boy, the helmet held by bolts over a seal
C = 'وطول الليل، | جنتا يتذكر | خوذة الغواص: | نافذة دائرية، | مثبتة بالبراغي.'
t_bolts = at('p2-3', C, 'مثبتة بالبراغي.')
els = [svg(260, 220, window(260, 220, lake(260, 220, night=True) + stars(260, 110, 8, 3)), 520, 300, z=3, kind=None, depth=.7)]
els += wall_clock(160, 270, 11, 0, z=5, spin=(0.1, V(6.4), 2.4), depth=.75)
els += [svg(240, 300, desk_lamp(), 95, 660, z=8, kind=None, depth=1.05),
        svg(420, 640, lamp_glow(420, 640), 190, 930, z=7, kind=None, shadow=False, depth=1.1, opacity=[[0, .85], [2.5, .76], [4.5, .87], [6.93, .8]]),
        cutout('assets/gen/young_table_cut', 205, 1255, 600, 0.0, z=20, kind='none', person=True, depth=1.1),
        svg(504, 504, bubble_sea(), 470, 520, z=12, kind='grow', at=V(1.1), dur=.5),
        svg(440, 470, diver_helmet(uid='dh1'), 470, 540, z=13, kind='rise', at=V(1.3), dur=.6, scale=.82),
        svg(100, 100, '<circle cx="50" cy="50" r="49" fill="#F6F1E3"/>', 470, 499, z=14, kind=None, shadow=False, still=True, opacity=[[6.3, 0], [6.93, 1]])]
r_ = random.Random(4)
for k in range(12):
    t0 = V(1.8) + k * .35; bx = 470 + r_.uniform(-110, 110)
    els.append(svg(36, 36, ring(r_.choice((5, 7, 9, 12))), bx, [[t0, 330], [t0 + 2.6, 160]], z=15, kind='fade', at=t0, dur=.3, shadow=False,
                   opacity=[[t0 + 1.8, 1], [t0 + 2.6, 0]], out={"type": "fade", "at": t0 + 2.6, "dur": .01}))
for k in range(8):
    a = math.radians(22.5 + 45 * k)
    els.append(svg(14, 14, '<circle cx="7" cy="7" r="6" fill="#FFF1CF"/>', round(470 + 60 * math.cos(a), 1), round(499 + 60 * math.sin(a), 1), z=15, kind='pop',
                   at=t_bolts + k * .08, dur=.1, shadow=False, opacity=[[t_bolts + k * .08 + .2, 1], [t_bolts + k * .08 + .6, .35]]))
P2.S('p2-3', 'ro-night', C, els, transition='fade',
     camera=cam((0, 1.05, 360, 660, None), (V(3.4), 1.15, 400, 620, 'inOutCubic'), (V(6.6), 3.6, 470, 499, 'inCubic')),
     sfx=[E('tick_pair', .2, -16), E('whoosh', V(1.1), -16)] + [E('click', t_bolts + k * .16, -15) for k in range(4)],
     beds=[{"name": "room", "from": 0, "to": 7, "gain": -24}])

# 4  The porthole becomes an octagon: the sketch draws itself under the lamp
C = 'النافذة تصير | شكل ثماني. | ثمان براغي واضحة. | سوار يطلع | من قلب الهيكل… | وكلها ستيل.'
t_eight = at('p2-4', C, 'ثمان براغي')
P_, T_ = ro_sketch(k=1.05)
P_[2]['at'] = 0.0; P_[2]['dur'] = 0.01                                          # the porthole circle is there from the cut
els = [svg(640, 960, drafting_sheet(paper='#F6EEDC'), 360, 600, z=3, kind=None),
       {"type": "sketch", "x": 360, "y": 600, "w": 640, "h": 960, "z": 5, "paths": P_, "texts": T_},
       svg(300, 20, pencil(), [[0, 700], [0.25, 500], [1.05, 485], [2.0, 440], [3.0, 500], [3.5, 520], [4.1, 470], [4.8, 450], [5.6, 420], [6.3, 160], [7.6, 170]],
           [[0, 760], [0.25, 560], [1.05, 410], [2.0, 300], [3.0, 380], [3.5, 690], [4.1, 210], [4.8, 960], [5.6, 560], [6.3, 640], [7.6, 650]],
           anchor='l', z=20, kind=None, rot=-38, depth=1.15, idle={"type": "wiggle", "amp": 2, "speed": 5}),
       polaroid('assets/ap/ro5402_black', 545, 245, 180, t_eight + .3, label='Réf. 5402', z=22, rot=6, labelSize=18),
       svg(760, 1320, radial_light(760, 1320, 200, 300, 760, amt=.2) + vignette(color='#14203A', amt=.5), 360, 640, z=30, kind=None, shadow=False, depth=0, still=True)]
P2.S('p2-4', 'ro-night', C, els, transition='fade', transitionDur=.3,
     camera=cam((0, 1.5, 360, 560, None), (V(1.5), 1.4, 360, 570, 'inOutCubic'), (V(3.8), 1.3, 380, 560, 'inOutCubic'), (V(6.0), 1.06, 360, 600, 'inOutCubic'), (V(7.6), 1.1, 360, 600, None)),
     sfx=[E('pencil', .15, -8), E('pencil', V(1.0), -8)] + [E('click', V(2.1 + j * .12), -14) for j in range(8)] + [E('paper_place', t_eight + .3, -12), E('pencil', V(3.5), -9), E('pencil', V(4.2), -9), E('crown_wind', V(6.3), -14)])

# 5  "And this is his original drawing" (gouache and pencil, the night of 10-11 April 1970; signed)
C = 'وهذا رسمه الأصلي… | من ليلة عشرة | على إحدعش أبريل.'
els = [macro('assets/ap/genta_gouache', .05, V(4.6), z=10, pos='62% 50%', scale=[[.05, 1.4], [V(2.4), 1.04, 'inOutCubic'], [V(4.6), 1.02]]),
       svg(380, 1400, glint_band(1400, 260, 120, peak=.12), [[V(2.6), -100], [V(4.0), 820, 'inOutCubic']], 640, z=12, kind='none', at=V(2.6), shadow=False, depth=0, still=True),
       tag('الرسم الأصلي، ليلة 10 على 11 أبريل 1970', 360, 170, V(1.2), size=28, z=20, depth=0),
       {"type": "text", "text": "© Gérald Genta Heritage Association", "x": 360, "y": 254, "font": "ui", "size": 16, "color": "#CFC8B8", "upper": False, "z": 20,
        "depth": 0, "in": {"type": "fade", "at": V(1.5), "dur": .3}}]
P2.S('p2-5', 'ro-black', C, els, transition='fade', transitionDur=.7, sfx=[E('paper_slide', .1, -12)])

# 6  Steel was for tools; finished like a precious watch; 3,300 francs, "the costliest steel watch in the world" (the 1972 ad)
C = 'الستيل كان | للساعات العملية. | بس هذي انشغلت | مثل الساعات الثمينة، | وانطرحت بثلاثة آلاف | وثلاثمية فرنك… | أغلى ساعة ستيل | في العالم.'
t_mac = V(2.1); t_ad = V(5.5); t_price = at('p2-6', C, 'وانطرحت بثلاثة')
ad = polaroid('assets/crop/ad1972b', 360, 560, 420, t_ad, label='Audemars Piguet · 1972', z=20, rot=-2, kind='fade')
peg_out = {"type": "fade", "at": t_mac + .3, "dur": .1}
els = [svg(620, 520, pegboard(), 360, 600, z=3, kind=None, out=peg_out),
       svg(300, 70, wrench(), 260, 470, z=5, kind='drop', at=0.15, dur=.4, out=peg_out, rot=[[.55, -12], [.9, -6], [1.3, -12, 'outBack']]),
       svg(270, 58, screwdriver(), 470, 720, z=5, kind='drop', at=0.35, dur=.4, out=peg_out, rot=[[.75, 10], [1.1, 5], [1.5, 10, 'outBack']]),
       macro('assets/ap/watchmaker1972', t_mac, t_mac + 1.3, zoom=(1.0, 1.08), pos='45% 40%'),
       macro('assets/ap/bracelet1972', t_mac + 1.2, V(4.4), zoom=(1.6, 1.8)),
       macro('assets/ap/cal2121_1971', V(4.3), V(5.6), zoom=(1.15, 1.0)),
       tag('Calibre 2121 · 1971', 360, 200, V(4.45), size=28, z=55, depth=0, until=V(5.5)),
       ad, glint_on(ad, V(7.2)),
       sk([{"d": 'M 585 832 Q 560 860 444 878', "at": t_price + .05, "dur": .3, "stroke": "#B23A2E", "width": 2.5, "opacity": 1}], z=29),
       svg(230, 112, swing_tag(), 540, 885, z=30, kind='pop', at=t_price + .2, dur=.4, rot=-6, idle={"type": "sway", "amp": 1.5, "speed": .4},
           out={"type": "fade", "at": V(9.2), "dur": .3}),
       tag('الأغلى في العالم، إعلان 1972', 360, 190, V(9.6), size=30, z=40, depth=0)]
P2.S('p2-6', 'ro-steel', C, els, transition='slide',
     camera=cam((0, 1.0, 360, 620, None), (t_mac, 1.03, 360, 600, 'inOutCubic'), (t_ad, 1.0, 360, 640, None), (V(6.6), 1.02, 360, 630, 'inOutCubic'),
                (V(9.3), 1.1, 360, 560, 'inOutCubic'), (11.78, 1.04, 370, 600, 'inOutCubic')),
     sfx=[E('clasp', .2, -12), E('clasp', .5, -13), E('whoosh', t_mac, -14), E('shutter', t_mac + .1, -16), E('paper_place', t_ad, -10), E('stamp', t_price + .2, -8),
          E('tick', V(7.2), -16)])

# 7  Basel 1972: the Royal Oak, Ref. 5402ST, 39 mm, huge for its time. (Genta was there too, but on his own stand: he is not shown at AP's.)
C = 'بازل، | ألف وتسعمية | واثنين وسبعين. | الرويال أوك، | الموديل | خمسة أربعة | صفر اثنين، | بقطر | تسعة وثلاثين ملم… | ضخمة بمقاييس وقتها.'
t_ro, t_39, t_big = at('p2-7', C, 'الرويال أوك،'), at('p2-7', C, 'تسعة وثلاثين'), at('p2-7', C, 'ضخمة بمقاييس')
WX = 360
front = polaroid('assets/ap/ro5402_front', WX, 650, 340, 0, label='Royal Oak · Réf. 5402ST', z=10, kind='none', depth=1.0, fixed=True)
els = [svg(900, 1100, hall(), 360, 560, z=1, kind=None, depth=.55, shadow=False),
       svg(900, 220, bunting_(), 360, 120, z=2, kind=None, depth=.6, shadow=False, idle={"type": "sway", "amp": .8, "speed": .35}),
       svg(760, 300, carpet(), 360, 1180, z=2, kind=None, depth=.9, shadow=False),
       tag('معرض بازل 1972', 360, 280, .15, size=46, z=30, rot=-1.5, depth=.7),
       svg(520, 420, booth(name='AUDEMARS PIGUET'), 360, 640, z=3, kind=None, depth=.8),
       polaroid('assets/ap/ro5402_showcase', 360, 690, 400, 0, z=4, kind='none', depth=.8, opacity=.4, fixed=True, frame=True),
       svg(520, 900, spotlight_cone(), WX, 320, anchor='t', z=5, kind='fade', at=t_ro - .05, dur=.12, shadow=False, depth=.9,
           opacity=[[t_ro + .2, 1], [t_ro + 2, .94], [t_ro + 4, 1], [10.5, .95]]),
       svg(260, 300, pedestal(), WX, 1160, anchor='b', z=6, kind=None, depth=1.0),
       svg(240, 40, velvet_riser(), WX, 878, z=7, kind=None, depth=1.0),
       front,
       svg(380, 470, drape(), WX, [[0, 650], [t_ro, 650], [t_ro + .6, 60, 'inCubic']], z=12, kind=None, depth=1.0, rot=[[t_ro, 0], [t_ro + .6, -12]],
           out={"type": "fade", "at": t_ro + .5, "dur": .15}),
       glint_on(front, t_ro + .6, peak=.35),
       macro('assets/ap/techdrawing', V(4.4), V(6.0), zoom=(1.0, 1.3), pos='19% 27%'),
       # the case flanks in ro5402_front are at 24% and 76.5% of the photo, its top at 10%: the bar spans the case, not the crown
       sk([{"d": 'M 361 470 L 279 470', "at": t_39, "dur": .4, "stroke": "#EFE8D6", "width": 3, "opacity": 1},
           {"d": 'M 361 470 L 443 470', "at": t_39, "dur": .4, "stroke": "#EFE8D6", "width": 3, "opacity": 1},
           {"d": 'M 279 460 L 279 480 M 443 460 L 443 480', "at": t_39 + .4, "dur": .15, "stroke": "#EFE8D6", "width": 3, "opacity": 1}],
          z=20, depth=1.0, texts=[{"text": "39 mm", "x": 240, "y": 477, "size": 20, "at": t_39 + .3, "dur": .4, "anchor": "middle", "color": "#EFE8D6", "font": "var(--f-banner)"}]),
       tag('وسماكتها 7 ملم بس', 360, 1130, t_big + .6, size=26, z=46, rot=1, depth=0),
       polaroid('assets/ap/firstpub1972', 125, 640, 190, t_big, label='أول ظهور، فبراير 1972', z=24, rot=-5, labelSize=16),
       cutout('assets/gen/crowd_back_cut', 360, 1300, 380, .3, z=40, kind='rise', dur=.6, desc=PEND, aspect=1.78, depth=1.3)]
els += motes(cone_points(WX, 9, 11, y0=380, y1=1000, spread=.35), at=t_ro, z=8, depth=.95)
for fx, fy, t, s_ in [(640, 820, t_ro + .2, 1), (680, 560, t_ro + .45, 1), (330, 470, t_ro + .75, 1), (60, 520, V(9.4), .6)]:
    els.append(svg(240, 240, flash(), fx, fy, z=45, kind='pop', at=t, dur=.08, shadow=False, depth=1.2, scale=s_, out={"type": "fade", "at": t + .18, "dur": .15}))
P2.S('p2-7', 'ro-hall', C, els, transition='slide',
     camera=cam((0, 1.0, 360, 600, None), (t_ro - .2, 1.06, 370, 640, 'inOutCubic'), (t_ro + .8, 1.18, 360, 660, 'inOutCubic'), (V(6.0), 1.15, 360, 640, 'inOutCubic'),
                (t_big - .3, 1.15, 330, 640, 'inOutCubic'), (10.52, 1.2, 320, 650, 'inOutCubic')),
     sfx=[E('stamp', .4, -12), E('paper_slide', t_ro, -12)] + [E('shutter', t, -11) for t in (t_ro + .2, t_ro + .45, t_ro + .75, V(9.4))] + [E('paper_slide', V(4.4), -14),
          E('pencil', t_39, -12), E('paper_place', t_big, -12)],
     beds=[{"name": "crowd", "from": 0, "to": 11, "gain": -22}])

# 8  The doubters; the Shah of Iran ordered the first in white gold; time proved them wrong; the famous Genta again, and the icon
C = 'كثيرين شكّوا فيها… | بس شاه إيران | طلب النموذج الأول | من الذهب الأبيض. | والزمن | أثبت كل شي:'
TEH = dict(id='teh', lon=51.39, lat=35.69, label='طهران')
t_shah, t_first_wg, t_time = at('p2-8', C, 'بس شاه'), at('p2-8', C, 'طلب النموذج'), at('p2-8', C, 'والزمن')
sk_t = V(8.0); END = round(VO_AT + VO['p2-8']['seconds'] + 2.6, 2); t_dim = V(12.9)
els = [cutout('assets/gen/crowd_doubt_cut', 360, 1150, 520, .05, z=10, kind='fade', desc=PEND, aspect=1.78, until=V(1.6), person=True),
       {"type": "map", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 15,
        "view": [[V(1.6), {"lon": 10, "lat": 46, "span": 26}], [V(3.2), {"lon": 12, "lat": 45, "span": 30}], [V(4.8), {"lon": 44, "lat": 37, "span": 30}, "inOutCubic"],
                 [V(5.9), {"lon": 46, "lat": 36, "span": 22}]],
        "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [dict(BSL, at=V(1.9)), dict(TEH, at=V(4.5))], "routes": [{"from": "bsl", "to": "teh", "at": V(3.2), "dur": 1.6, "plane": True, "keep": True}],
        "highlight": [{"n": "Iran", "at": V(4.6), "color": "#D9C08A"}], "unfold": {"at": V(1.6), "dur": .6}, "in": {"type": "none", "at": V(1.6)},
        "out": {"type": "fade", "at": V(6.2), "dur": .3}, "depth": 0},
       tag('النموذج الأول، ذهب أبيض', 360, 200, t_first_wg, size=30, z=30, until=V(6.2), depth=0)]
els += flips(['1972', '1982', '1992', '2002', '2012', '2026'], 360, 520, V(6.3), .26, z=40, last_out=V(8.0))
els += wall_clock(360, 820, 10, 10, z=40, d=170, at=V(6.3), spin=(V(6.3), V(8.0), 6), out={"type": "fade", "at": V(8.0), "dur": .2})
GS = dict(x=200, y=1290, h=780)
gw = GS['h'] * ASP.get('genta_sheet', .43)
sheet = dict(x=GS['x'] - gw / 2 + gw * .502, y=GS['y'] - GS['h'] + GS['h'] * .427, w=gw * .84, h=GS['h'] * .31)
hero = polaroid('assets/ap/ro5402_hero', 545, 720, 300, V(11.2), label='Royal Oak · Réf. 5402', z=59, kind='fade', rot=3, scale=[[V(11.2), 1.0], [END, 1.04]])
els += [svg(760, 1320, curtain(), 360, 640, z=44, kind='fade', at=sk_t - .3, dur=.6, shadow=False, depth=.6, still=True),
        svg(520, 1000, spotlight_cone(), 300, 0, anchor='t', z=45, kind='fade', at=sk_t, dur=.5, shadow=False, depth=.8),
        svg(*soft_ellipse(260, 40, '#FFF1CF', .18, 10)[:2], soft_ellipse(260, 40, '#FFF1CF', .18, 10)[2], 300, 1190, z=46, kind='fade', at=sk_t, dur=.5, shadow=False, depth=.95),
        cutout('assets/gen/genta_sheet_cut', GS['x'], GS['y'], GS['h'], sk_t, z=48, kind='rise', dur=.45, person=True),
        {"type": "image", "src": pic('assets/crop/gouache_head'), "x": round(sheet['x'], 1), "y": round(sheet['y'], 1), "w": round(sheet['w']), "h": round(sheet['h']),
         "frame": False, "fit": "cover", "pos": "50% 45%", "z": 49, "in": {"type": "fade", "at": sk_t + .5, "dur": .6}},
        hero, glint_on(hero, V(11.9)),
        {"type": "sparkles", "x": 530, "y": 640, "count": 7, "radius": 26, "life": .8, "color": "#FFF6DD", "at": V(12.2), "z": 61},
        svg(760, 1320, '<rect width="760" height="1320" fill="#000"/>', 360, 640, z=58, kind=None, shadow=False, depth=0, still=True, opacity=[[t_dim, 0], [END, .75]]),
        {"type": "text", "text": "رسمة بليلة وحدة…", "x": 360, "y": 160, "font": "banner", "size": 46, "color": "#EFE8D6", "upper": False, "z": 60, "depth": 0, "in": {"type": "fade", "at": V(8.1), "dur": .5}},
        {"type": "text", "text": "صارت أيقونة للأجيال", "x": 360, "y": 230, "font": "banner", "size": 46, "color": "#EFE8D6", "upper": False, "z": 60, "depth": 0, "in": {"type": "fade", "at": V(11.2), "dur": .5}},
        credits(CREDITS2, t_dim + .1, y=1150)]
els += motes(cone_points(300, 9, 21, y0=300, y1=1000, spread=.35), at=sk_t, z=47, depth=.95)
P2.S('p2-8', 'ro-black', C, els, tail=2.6, transition='fade', captionEnd=V(7.8), captionClear=V(8.0),
     camera=cam((0, 1.0, 360, 640, None), (sk_t, 1.0, 360, 640, None), (V(11.2), 1.04, 380, 660, 'inOutCubic'), (END, 1.1, 440, 700, 'inOutCubic')),
     sfx=[E('paper_slide', V(1.6), -12), E('plane', V(3.2), -16)] + [E('paper_tear', V(6.3) + i * .26, -16) for i in range(6)] +
         [E('pencil', sk_t + .5, -12), E('tick', V(11.2), -12), E('tick', V(11.9), -18)])

import sys
sys.path.insert(0, os.path.join(H, '..', 'brand'))
from tk_endcard import endcard          # every Time Keeper film ends on the logo card with the ticks
for part in (P1, P2): part.sc += endcard(H, theme='ro-black')

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
band = '<polygon points="%s" fill="#EFE8D6"/>' % pts(jag([(0, 0), (720, 0), (720, 300)] + [(720 - i * 40, 300 + (6 if i % 2 else -4)) for i in range(1, 18)] + [(0, 300)], 2, 7))
cover('cover1', [svg(720, 760, geneva_sky(), 360, 380, z=1, kind=None, shadow=False), svg(720, 200, geneva_mountains(), 360, 420, z=2, kind=None, shadow=False),
                 svg(720, 120, geneva_quay(), 360, 490, z=3, kind=None, shadow=False), svg(720, 300, geneva_lake(), 360, 700, z=4, kind=None, shadow=False),
                 svg(60, 300, jet_d_eau(), 630, 560, anchor='b', z=5, kind=None, shadow=False),
                 svg(760, 520, floor_band('#8A7458', '#A48D6E', 520), 360, 1110, z=6, kind=None, shadow=False),
                 svg(720, 320, band, 360, 160, z=25, kind=None),
                 shadow(230, 1240, 520, 0, z=9, kind=None),
                 cutout('assets/gen/genta23_desk_cut', 230, 1240, 700, 0, z=10, kind='none', person=True),
                 polaroid('assets/early/polerouter', 545, 1000, 300, 0, label='Polerouter', z=12, kind='none', rot=6),
                 title('جيرالد جنتا', 130, 76), title('قبل الرويال أوك · الجزء الأول', 230, 34)])
cover('cover2', [macro('assets/ap/genta_gouache', 0, 2, z=1, zoom=(1.0, 1.0), pos='62% 50%'),
                 svg(760, 420, '<defs><linearGradient id="cv2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D3B5E" stop-opacity=".55"/><stop offset="1" stop-color="#1D3B5E" stop-opacity="0"/></linearGradient></defs><rect width="760" height="420" fill="url(#cv2)"/>',
                     360, 210, z=2, kind=None, shadow=False),
                 svg(760, 120, '<rect width="760" height="120" fill="#132A45"/>', 360, 1240, z=3, kind=None, shadow=False),
                 shadow(170, 1200, 280, 0, z=9, kind=None),
                 cutout('assets/gen/young_present_cut', 170, 1200, 680, 0, z=10, kind='none', person=True),
                 title('الرويال أوك', 150, 80, paper='#EFE8D6'), title('رسمة بليلة وحدة · الجزء الثاني', 240, 34, paper='#EFE8D6')])
