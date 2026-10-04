#!/usr/bin/env python3
"""A sketch overnight: Gerald Genta and the Audemars Piguet Royal Oak (1970-1972), a 9:16 paper story.

  python3 film.py                                   -> film.json (voice clips from voice/clips.json)
  node ../../.claude/skills/paper-story/scripts/render.mjs film.json --check
  node ../../.claude/skills/paper-story/scripts/render.mjs film.json -o renders/X-nomusic.mp4 --scale 1.5
  python3 score.py film.json music.wav && python3 mix.py renders/X-nomusic.mp4 music.wav renders/X.mp4

Facts on screen and in the narration are in FACTS.md with their sources. People appear only as silhouettes and
hands. The Royal Oak is shown only as real photographs, dropped into assets/ under the ids in ASSETS; until then the
render shows a loud REAL PHOTO NEEDED panel in its place (render.mjs --final refuses to run while any remain)."""
import json, os
from art import *

H = os.path.dirname(os.path.abspath(__file__))
ST = json.load(open(os.path.join(H, 'ro-style.json')))
VO = json.load(open(os.path.join(H, 'voice', 'clips.json')))
ASSETS = {
    'ro_front':  'Royal Oak 5402ST, straight-on front view with the whole bracelet, cut out (transparent PNG)',
    'ro_finish': 'Royal Oak 5402ST macro: brushed surfaces and polished bevels on the case and bracelet',
    'ro_bezel':  'Royal Oak 5402ST macro: the octagonal bezel and its hexagonal screws',
}
RO_ASPECT = float(os.environ.get('RO_ASPECT', 0.42))    # width / height of ro_front, set from the real photo
VO_AT, TAIL = 0.12, 0.18
SC = []


def S(n, theme, caption, els, tail=TAIL, voiceAt=VO_AT, **kw):
    d = VO[str(n)]['seconds']
    sc = {"theme": theme, "floor": False, "elements": els, "dur": round(voiceAt + d + tail, 2), "silent": True,
          "captions": caption, "captionStart": voiceAt + 0.05, "captionEnd": voiceAt + d}
    f = os.path.join(H, 'voice', VO[str(n)]['file'])
    if os.path.exists(f): sc["voice"] = 'voice/' + VO[str(n)]['file']; sc["voiceAt"] = voiceAt
    sc.update(kw); SC.append(sc); return sc


def V(n, t):
    """Scene time of a moment in narration clip n (clip-local seconds)."""
    return round(VO_AT + t, 2)


def photo(asset, x, y, h, at, z=30, kind='rise', **kw):
    """The real watch (a cut-out photo). Anchor at its bottom."""
    d = {"type": "cutout", "asset": asset, "desc": ASSETS[asset], "x": x, "y": y, "h": h, "aspect": RO_ASPECT, "edge": 0, "z": z,
         "in": {"type": kind, "at": at, "dur": 0.6}}
    d.update(kw); return d


def macro(asset, at, out, z=50, zoom=(1.0, 1.14)):
    """A full-screen close-up from a real photo, slowly pushing in."""
    return {"type": "image", "asset": asset, "desc": ASSETS[asset], "x": 360, "y": 640, "w": 720, "h": 1280, "frame": False, "fit": "cover",
            "depth": 0, "z": z, "scale": [[at, zoom[0]], [out, zoom[1]]], "in": {"type": "fade", "at": at, "dur": .25},
            "out": {"at": out, "type": "fade", "dur": .2}, "still": True}


E = lambda name, at, gain=-12: {"at": round(at, 2), "name": name, "gain": gain}
cam = lambda *keys: {"zoom": [[t, z, e] if e else [t, z] for t, z, x, y, e in keys], "x": [[t, x, e] if e else [t, x] for t, z, x, y, e in keys],
                     "y": [[t, y, e] if e else [t, y] for t, z, x, y, e in keys]}
GOLDW = dict(type="watch", caseColor=GOLD, dialColor='#F1EAD8', strapColor='#5A3A22', handColor='#2A2C31', markerColor='#9C7B3F', tick=False, rate=1)

# =================================================================================================================
# 1  1970. The luxury watch was gold, small and round; the middle of the tray is empty.
els = [calendar(360, 360, '1970', at=0.05, z=30, out={"type": "slideU", "at": V(1, 1.35), "dur": 0.45})]
els.append(tray(360, 720, at=V(1, 1.0), z=8))
for i, x in enumerate((165, 555)):
    els.append(dict(GOLDW, x=x, y=720, size=104, time=[10, 8 + i * 3, 0], z=12, **{"in": {"type": "pop", "at": V(1, 1.25 + i * .18), "dur": .4}}))
els.append(svg(300, 520, lamp_glow(300, 520), 360, 470, z=14, kind='fade', at=V(1, 3.0), dur=0.8, shadow=False))
S(1, 'ro-night', 'Nineteen seventy. | Audemars Piguet needs | a watch the world | has never seen.', els,
  camera=cam((0, 1.0, 360, 620, None), (V(1, 1.4), 1.0, 360, 650, None), (V(1, 4.6), 1.75, 360, 705, 'inOutCubic')),
  sfx=[E('paper_place', 0.12, -10), E('paper_slide', V(1, 1.0), -14), E('tick', V(1, 3.1), -16), E('tick', V(1, 3.6), -18)],
  beds=[{"name": "watch_run", "from": 0, "to": 5.3, "gain": -26}])

# 2  The call: Le Brassus above, Geneva below, one phone line between them
TOPWALL, BOTWALL = '#D9D2C2', '#CDBFA6'
els = [svg(760, 660, '<rect width="760" height="660" fill="%s"/>' % BOTWALL, 360, 640 + 330, z=1, kind=None, shadow=False),
       svg(760, 18, '<polygon points="%s" fill="#F3EEE1"/>' % pts(jag([(0, 4)] + [(i * 38, 9 + (i % 2) * 7) for i in range(1, 20)] + [(760, 4), (760, 14), (0, 14)], 1.5, 5)), 360, 642, z=2, kind=None),
       # Le Brassus: the Vallee de Joux in the window, four o'clock, the desk phone
       svg(240, 180, window(240, 180, alps(240, 180)), 180, 250, z=3, kind=None),
       svg(760, 110, '<rect width="760" height="110" fill="#6B5038"/>', 360, 585, z=4, kind=None, shadow=False)]
els += wall_clock(540, 220, 4, 0, z=5)
els += [svg(260, 162, rotary_phone(), 420, 470, z=6, kind=None),
        svg(260, 52, handset(), 420, [[0, 405], [V(2, 0.9), 405], [V(2, 1.25), 330, 'outBack']], z=8, kind=None,
            rot=[[V(2, 0.9), 0], [V(2, 1.25), -14, 'outBack']])]
# the line runs from one phone to the other
els.append({"type": "sketch", "x": 360, "y": 640, "w": 720, "h": 1280, "z": 7, "pencil": False,
            "paths": [{"d": 'M 520 520 C 690 600 700 760 560 880 S 360 1000 250 1010', "at": V(2, 1.3), "dur": 1.4, "stroke": '#2A2C31', "width": 4, "opacity": 1}]})
# Geneva: the lake and the Jet d'Eau, a drafting table, the phone that rings
els += [svg(240, 180, window(240, 180, lake(240, 180)), 540, 840, z=3, kind=None),
        svg(240, 180, window(240, 180, lake(240, 180, night=True)), 540, 840, z=3, kind='fade', at=V(2, 7.0), dur=0.6)]
els += wall_clock(170, 800, 4, 0, z=5, spin=(V(2, 6.9), V(2, 7.7), 1.6))
els += [svg(560, 250, drafting_table(), 380, 1150, z=4, kind=None),
        svg(260, 162, rotary_phone('#2A2C31', '#EDE6D3'), 215, 1060, z=6, kind=None),
        svg(260, 52, handset('#2A2C31'), 215, [[0, 995], [V(2, 3.5), 995], [V(2, 3.85), 920, 'outBack']], z=8, kind=None,
            rot=[[V(2, 3.5), 0], [V(2, 3.85), 12, 'outBack']], idle={"type": "shake", "amp": 3, "speed": 9, "from": V(2, 2.6), "until": V(2, 3.5)}),
        svg(260, 80, ring_lines('#2A2C31'), 215, 985, z=9, kind='pop', at=V(2, 2.6), dur=.2, out={"type": "fade", "at": V(2, 3.5), "dur": .15},
            idle={"type": "pulse", "amp": .08, "speed": 6}),
        # the brief lands on the table: a plate of brushed steel next to the blank sheet
        svg(150, 96, steel_plate(150, 96),
            500, 1035, z=10, rot=-8, kind='drop', at=V(2, 4.2), dur=0.5)]
S(2, 'ro-alpine', 'One afternoon, | Georges Golay calls | designer Gérald Genta. | A steel watch, | unlike any before. | By morning.', els,
  transition='slide',
  camera=cam((0, 1.55, 360, 360, None), (V(2, 2.4), 1.55, 360, 360, None), (V(2, 3.0), 1.0, 360, 640, 'inOutCubic'), (V(2, 3.6), 1.5, 360, 960, 'inOutCubic'),
             (V(2, 7.8), 1.62, 380, 975, 'inOutCubic')),
  sfx=[E('click', V(2, 1.0), -8), E('ring', V(2, 2.55), -10), E('click', V(2, 3.55), -8), E('paper_place', V(2, 4.25), -10), E('tick_pair', V(2, 6.9), -14)])

# 3  Night. A diver's helmet: a porthole, bolted shut.
els = [svg(260, 220, window(260, 220, lake(260, 220, night=True)), 520, 300, z=3, kind=None, depth=.7)]
els += wall_clock(160, 270, 11, 0, z=5, spin=(0.1, V(3, 4.6), 2.2), depth=.75)
els += [svg(240, 300, desk_lamp(), 600, 640, z=6, kind=None, depth=.9),
        svg(560, 250, drafting_table(), 360, 1010, z=6, kind=None, depth=.95),
        svg(520, 560, lamp_glow(520, 560), 520, 900, z=7, kind=None, shadow=False, opacity=.8, depth=.95),
        svg(400, 360, silhouette(), 170, 1150, z=20, kind=None, depth=1.3),
        # the memory: a torn sepia disc, the helmet inside it
        svg(500, 500, '<circle cx="250" cy="250" r="240" fill="#C9B38A"/><circle cx="250" cy="250" r="226" fill="#D8C49B"/>', 390, 540, z=12, kind='grow',
            at=V(3, 0.85), dur=0.5),
        svg(440, 470, diver_helmet(), 390, 560, z=13, kind='rise', at=V(3, 1.1), dur=0.6, scale=.82)]
S(3, 'ro-night', 'Overnight, | Genta thinks of | a diver\'s helmet: | a porthole, | bolted shut.', els, transition='fade',
  camera=cam((0, 1.05, 360, 660, None), (V(3, 2.6), 1.2, 380, 600, 'inOutCubic'), (V(3, 4.95), 3.6, 390, 519, 'inCubic')),
  sfx=[E('tick_pair', 0.2, -16), E('whoosh', V(3, 0.9), -16), E('clasp', V(3, 4.0), -12), E('clasp', V(3, 4.3), -14)],
  beds=[{"name": "room", "from": 0, "to": 5.4, "gain": -24}])

# 4  The sketch: the porthole becomes an octagon, eight screws, the bracelet, steel
P, T = ro_sketch()
SHEET = (360, 600)
els = [svg(640, 960, drafting_sheet(), *SHEET, z=3, kind=None),
       {"type": "sketch", "x": SHEET[0], "y": SHEET[1], "w": 640, "h": 960, "z": 5, "paths": P, "texts": T},
       svg(300, 20, pencil(), [[0, 700], [0.25, 500], [1.0, 485], [1.9, 440], [2.9, 500], [3.4, 520], [3.9, 470], [4.6, 450], [5.3, 420], [6.0, 160], [7.2, 170]],
           [[0, 760], [0.25, 560], [1.0, 410], [1.9, 300], [2.9, 380], [3.4, 690], [3.9, 210], [4.6, 960], [5.3, 560], [6.0, 640], [7.2, 650]],
           anchor='l', z=20, kind=None, rot=-38, depth=1.15, idle={"type": "wiggle", "amp": 2, "speed": 5})]
S(4, 'ro-paper', 'It becomes an octagon. | Eight screws | in plain sight. | A bracelet | flowing from the case. | All in steel.', els, transition='cut',
  camera=cam((0, 2.4, 360, 560, None), (V(4, 1.4), 1.45, 360, 570, 'inOutCubic'), (V(4, 3.6), 1.3, 360, 580, None), (V(4, 5.6), 1.06, 360, 600, 'inOutCubic'),
             (V(4, 7.2), 1.1, 360, 600, None)),
  sfx=[E('pencil', 0.15, -8), E('pencil', V(4, 0.9), -8)] + [E('click', V(4, 1.9 + j * .11), -14) for j in range(8)] +
      [E('pencil', V(4, 3.2), -9), E('pencil', V(4, 3.9), -9), E('pencil', V(4, 4.9), -11), E('crown_wind', V(4, 5.85), -14)])

# 5  Steel was for tools. This one was finished like a precious watch, and cost more than many gold ones.
t_mac, t_scale = V(5, 1.75), V(5, 4.05)
els = [svg(620, 520, pegboard(), 360, 600, z=3, kind=None, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       svg(300, 70, wrench(), 220, 420, z=5, kind='drop', at=0.15, dur=.4, rot=-12, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       svg(270, 58, screwdriver(), 520, 800, z=5, kind='drop', at=0.3, dur=.4, rot=10, out={"type": "fade", "at": t_mac + .3, "dur": .1}),
       dict(type="watch", x=420, y=590, size=150, caseColor='#A9AFB6', dialColor='#1E2024', strapColor='#2A2C31', handColor='#EDE6D3', markerColor='#EDE6D3',
            time=[2, 50, 0], rate=1, z=6, rot=6, **{"in": {"type": "drop", "at": 0.45, "dur": .45}, "out": {"type": "fade", "at": t_mac + .3, "dur": .1}}),
       macro('ro_finish', t_mac, t_scale + .05)]
beam_rot = [[t_scale + .35, 0], [t_scale + 1.1, 8, 'outElastic']]
import math as _m
HB = 220; dy = HB * _m.sin(_m.radians(8)); hx = HB * _m.cos(_m.radians(8))       # beam half-length; the hooks drop and rise as it tips
yl = [[t_scale + .35, 560], [t_scale + 1.1, 560 - dy, 'outElastic']]; yr = [[t_scale + .35, 560], [t_scale + 1.1, 560 + dy, 'outElastic']]
sk = lambda v, off: [[t, y + off] + e for k in v for t, y, *e in [k]]
XL, XR = 360 - hx, 360 + hx
els += [svg(560, 330, scale_post(), 360, 1000, anchor='b', z=10, kind='fade', at=t_scale, dur=.2),
        svg(2 * HB, 14, scale_beam(2 * HB), 360, 560, z=12, kind='fade', at=t_scale, dur=.2, rot=beam_rot),
        svg(240, 190, pan(), XL + 100, sk(yl, 95), z=11, kind='fade', at=t_scale, dur=.2),     # the pan's hook is 100 px left of its box centre
        svg(240, 190, pan(), XR + 100, sk(yr, 95), z=11, kind='fade', at=t_scale, dur=.2),
        dict(GOLDW, x=XL - 34, y=sk(yl, 112), size=78, time=[10, 10, 0], z=13, rot=-6, **{"in": {"type": "drop", "at": t_scale + .1, "dur": .3}}),
        dict(GOLDW, x=XL + 36, y=sk(yl, 116), size=74, time=[1, 50, 0], z=13, rot=8, **{"in": {"type": "drop", "at": t_scale + .2, "dur": .3}}),
        photo('ro_front', XR, sk(yr, 152), 300, t_scale + .1, z=13, kind='drop')]
S(5, 'ro-steel', 'Steel was for | tool watches. | This one was finished | like a precious watch, | and cost more | than many gold ones.', els, transition='slide',
  camera=cam((0, 1.0, 360, 620, None), (t_mac, 1.12, 360, 620, 'inOutCubic'), (t_scale, 1.0, 360, 640, None), (V(5, 6.2), 1.1, 400, 640, 'inOutCubic')),
  sfx=[E('clasp', 0.2, -12), E('clasp', 0.5, -13), E('whoosh', t_mac, -14), E('shutter', t_mac + .05, -18), E('paper_place', t_scale + .1, -10), E('stamp', t_scale + 1.0, -16)])

# 6  Basel, 1972: the Royal Oak on its stand. Thirty-nine millimetres, huge for its time.
WH = 520; WX, WY = 360, 980                     # the watch: height on screen, centre x, bottom y
case_y = WY - WH * 0.5; case_w = WH * RO_ASPECT * 0.92
els = [svg(900, 1100, hall(), 360, 560, z=1, kind=None, depth=.55, shadow=False),
       svg(520, 420, booth(), 360, 640, z=3, kind=None, depth=.8),
       {"type": "text", "text": "BASEL · 1972", "x": 360, "y": 300, "font": "banner", "size": 54, "color": "#16181D", "paper": "#EFE8D6", "z": 30, "depth": .9,
        "rot": -1.5, "in": {"type": "drop", "at": 0.15, "dur": .55}},
       svg(520, 900, spotlight_cone(), 360, 380, anchor='t', z=4, kind='fade', at=V(6, 1.9), dur=.5, shadow=False, depth=.9),
       svg(260, 300, pedestal(), WX, 1160, anchor='b', z=6, kind=None, depth=1.0),
       photo('ro_front', WX, WY, WH, V(6, 1.95), z=10, depth=1.0)]
for i, (fx, fy, t) in enumerate([(160, 820, V(6, 2.25)), (590, 760, V(6, 2.55)), (250, 700, V(6, 2.85)), (520, 860, V(6, 4.85))]):
    els.append(svg(240, 240, flash(), fx, fy, z=45, kind='pop', at=t, dur=.08, shadow=False, depth=1.2, out={"type": "fade", "at": t + .18, "dur": .15}))
els += [svg(760, 300, crowd(), 360, 1290, anchor='b', z=40, kind='rise', at=0.25, dur=.6, depth=1.35, shadow=False),
        {"type": "sketch", "x": WX, "y": case_y, "w": 400, "h": 120, "z": 20, "pencil": False, "depth": 1.0,
         "paths": [{"d": 'M %.1f 60 L %.1f 60 M %.1f 48 L %.1f 72 M %.1f 48 L %.1f 72' % (200 - case_w / 2, 200 + case_w / 2, 200 - case_w / 2, 200 - case_w / 2, 200 + case_w / 2, 200 + case_w / 2),
                    "at": V(6, 4.95), "dur": .5, "stroke": "#EFE8D6", "width": 3, "opacity": 1}],
         "texts": [{"text": "39 mm", "x": 200, "y": 40, "size": 34, "at": V(6, 5.2), "dur": .4, "anchor": "middle", "color": "#EFE8D6", "font": "var(--f-banner)"}]},
        macro('ro_bezel', V(6, 3.0), V(6, 4.75)),
        svg(2 * 88 * 34 / 39 + 8, 2 * 88 * 34 / 39 + 8, ghost_watch(88 * 34 / 39), 120, case_y, z=20, kind='pop', at=V(6, 6.3), dur=.35, shadow=False, depth=1.0)]
S(6, 'ro-hall', 'Basel, | nineteen seventy-two. | The Royal Oak, | reference 5402. | Thirty-nine millimetres, | huge for its time.', els, transition='slide',
  camera=cam((0, 1.0, 360, 620, None), (V(6, 1.8), 1.0, 360, 640, None), (V(6, 4.6), 1.28, 360, 760, 'inOutCubic'), (V(6, 7.6), 1.34, 330, 760, 'inOutCubic')),
  sfx=[E('stamp', 0.4, -12), E('shutter', V(6, 2.25), -10), E('shutter', V(6, 2.55), -12), E('shutter', V(6, 2.85), -11), E('whoosh', V(6, 3.0), -16), E('shutter', V(6, 4.85), -13)],
  beds=[{"name": "crowd", "from": 0, "to": 8, "gain": -22}])

# 7  Many doubted it. Time proved them wrong. A sketch overnight. An icon for generations.
END = 1.45
els = [svg(760, 300, crowd(seed=5), 360, 1100, anchor='b', z=10, kind='fade', at=0, dur=.2, shadow=False, out={"type": "fade", "at": V(7, 1.3), "dur": .25})]
for i, (qx, qy, t) in enumerate([(170, 640, V(7, 0.1)), (380, 600, V(7, 0.3)), (560, 660, V(7, 0.5))]):
    els.append(svg(60, 90, question(), qx, qy, z=12, kind='pop', at=t, dur=.3, shadow=False, rot=(-8, 6, -4)[i], out={"type": "fade", "at": V(7, 1.3), "dur": .2}))
years = ['1972', '1982', '1992', '2002', '2012', '2022']
for i, y in enumerate(years):            # pages flipping: each year replaces the last on the same spot
    t = V(7, 1.35) + i * 0.24
    els.append(calendar(360, 560, y, at=t, z=20 + i, out={"type": "fade", "at": t + 0.26 if i < len(years) - 1 else V(7, 2.95), "dur": .05}))
    els[-1]["in"] = {"type": "flip", "at": t, "dur": .16}
P, T = ro_sketch(k=0.22, ink='#EFE8D6', links=3)
sk_t = V(7, 3.05)
for p in P: p['at'] = round(p['at'] + sk_t, 2); p['fillAt'] = round(p['fillAt'] + sk_t, 2) if 'fillAt' in p else p.get('fillAt')
for t_ in T: t_['at'] = round(t_['at'] + sk_t, 2)
P = [{k: v for k, v in p.items() if v is not None} for p in P]
els.append({"type": "sketch", "x": 360, "y": 590, "w": 640, "h": 960, "z": 25, "paths": P, "texts": [], "scale": .78,
            "out": {"type": "fade", "at": V(7, 4.75), "dur": .5}})
els.append(photo('ro_front', 360, 1000, 760, V(7, 4.45), z=30, kind='fade', scale=[[V(7, 4.45), 1.0], [V(7, 6.5) + END, 1.05]]))
for txt, y, t in (('A sketch overnight.', 180, V(7, 3.1)), ('An icon for generations.', 1110, V(7, 4.5))):
    els.append({"type": "text", "text": txt, "x": 360, "y": y, "font": "banner", "size": 46, "color": "#EFE8D6", "upper": False, "z": 40, "depth": 0,
                "in": {"type": "fade", "at": t, "dur": .5}})
S(7, 'ro-black', 'Many doubted it. | Time proved them wrong.', els, tail=END, transition='fade', captionEnd=V(7, 2.75), captionClear=V(7, 3.0),
  camera=cam((0, 1.0, 360, 640, None), (V(7, 6.5) + END, 1.0, 360, 640, None)),
  sfx=[E('paper_slide', V(7, 1.35), -12)] + [E('paper_tear', V(7, 1.35) + i * .24, -16) for i in range(6)] + [E('pencil', sk_t, -10), E('tick', V(7, 4.5), -12)])

total = sum(s['dur'] for s in SC)
sb = {"width": 720, "height": 1280, "fps": 30, "title": "A sketch overnight", "style": ST['style'], "themes": ST['themes'],
      "audio": {"musicGain": -90}, "scenes": SC}
json.dump(sb, open(os.path.join(H, 'film.json'), 'w'), indent=1, ensure_ascii=False)
missing = [a for a in ASSETS if not any(os.path.exists(os.path.join(H, 'assets', a + e)) for e in ('.png', '.jpg', '.jpeg', '.webp'))]
print('film.json: %d scenes, %.2f s; real photos still needed: %s' % (len(SC), total, ', '.join(missing) or 'none'))

# ---- cover: the finished drawing on the drafting sheet, with the title (render.mjs cover.json --still 7.6)
P, T = ro_sketch()
cover = {"width": 720, "height": 1280, "fps": 30, "style": ST['style'], "themes": ST['themes'], "scenes": [{
    "dur": 8, "theme": "ro-paper", "floor": False, "silent": True, "elements": [
        svg(640, 960, drafting_sheet(), 360, 700, z=3, kind=None),
        {"type": "sketch", "x": 360, "y": 700, "w": 640, "h": 960, "z": 5, "paths": P, "texts": T, "scale": .92},
        {"type": "text", "text": "A SKETCH OVERNIGHT", "x": 360, "y": 120, "font": "title", "size": 78, "color": "#16181D", "z": 10},
        {"type": "text", "text": "Gérald Genta · the Royal Oak · 1972", "x": 360, "y": 190, "font": "cap", "size": 30, "color": "#3A3B3E", "upper": False, "z": 10}]}]}
json.dump(cover, open(os.path.join(H, 'cover.json'), 'w'), indent=1, ensure_ascii=False)
