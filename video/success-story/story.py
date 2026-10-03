#!/usr/bin/env python3
"""The Time Keeper story, second cut: every scene keeps moving (a camera on each scene, depth layers, figures that
enter and act), the founders meet one by one, and every hero watch is a real watch photo.

  python3 story.py                      -> story.json (+ the voice clips from voice/clips.json)
  MUSIC_GAIN=-90 python3 story.py && node render.mjs story.json -o renders/X-nomusic.mp4 --scale 1.5
  python3 mix-music.py renders/X-nomusic.mp4 renders/X.mp4 story.json

Founders, by their own labelled cut-outs (assets/figures/<person>_<outfit>.png):
  ali-alramadhan      behind the scenes: research, writing, questions, the script, the monitor
  ali-alyousifi       the face on camera: hosts the podcast, sits with the guest
  mohammad-alyousifi  the visual and commercial side: designs, branding, the products
They meet in order: Ali Al-Ramadhan and Ali Al-Yousifi in Boulder, Ali Al-Yousifi and Mohammad in Los Angeles,
and the three are first seen together there. No names or titles on screen; roles show through what they do."""
import json, math, os
from PIL import Image
from landmarks import svg, balance_wheel, boulder, los_angeles, kuwait_dusk, coffee_tray, geneva, bookcase, arabic_shelf, bulb, notebook, pen, camera_rig, ring_light
from props_story import plate, rect, gear_el, monitor, papers, design_board, guest, plane, steam, viewfinder

H = os.path.dirname(os.path.abspath(__file__)); ST = json.load(open(os.path.join(H, 'tk-style.json')))
VO = json.load(open(os.path.join(H, 'voice', 'clips.json')))
LOGO = '../../public/icon-512.png'
MUSIC_GAIN = float(os.environ.get('MUSIC_GAIN', -24))
DROP, BAR = 31.55, 240 / 123.0          # where the music's drop hits, and one bar at 123 bpm (see mix-music.py)
F = 1020                                # landscape floor line used by the place art
V = lambda lon, lat, span: {"lon": lon, "lat": lat, "span": span}
BOU = dict(id='bou', lon=-105.27, lat=40.01, label='BOULDER'); LA = dict(id='la', lon=-118.24, lat=34.05, label='LOS ANGELES')
KW = dict(id='kw', lon=47.98, lat=29.37, label='KUWAIT'); GVA = dict(id='gva', lon=6.14, lat=46.20, label='GENEVA')
pin = lambda p, at: dict(p, at=at)
def MAP(view, **kw):
    d = {"type": "map", "x": 360, "y": 600, "w": 720, "h": 1180, "view": view, "sea": "#CCC6B7", "land": "#F4F1E8", "pins": [], "routes": []}; d.update(kw); return d

# ---- founders -------------------------------------------------------------------------------------------------------
HEIGHT = {'ali-alramadhan': 1.0, 'mohammad-alyousifi': 0.955, 'ali-alyousifi': 0.905}   # from a group photo
AR, MY, AY = 'ali-alramadhan', 'mohammad-alyousifi', 'ali-alyousifi'
SLIM = {AY: 0.93}                       # his cut-outs read broader than he is
def person(p, outfit, x, bottom, h, at=0.3, z=12, flip=False, depth=None, inn='rise', walk=None, **kw):
    """One founder. h is the tallest founder's height in this shot; walk=(t0, t1, x0, x1) walks him in."""
    rel = 'assets/figures/%s_%s.png' % (p, outfit); w, hh = Image.open(os.path.join(H, rel)).size
    d = {"type": "cutout", "src": rel, "x": x, "y": bottom, "h": round(h * HEIGHT[p]), "aspect": w / hh * SLIM.get(p, 1), "z": z, "edge": 0}
    if flip: d["flip"] = True
    if depth is not None: d["depth"] = depth
    if walk:
        t0, t1, x0, x1 = walk
        d["x"] = [[t0, x0], [t1, x1, "outSine"]]
        d["in"] = {"type": "fade", "at": t0, "dur": .15}
        d["idle"] = {"type": "bob", "amp": 7, "speed": 2.4, "from": t0, "until": t1}
    else:
        if inn: d["in"] = {"type": inn, "at": at}
        d["idle"] = {"type": "bob", "amp": 2, "speed": .5, "phase": hash(p) % 5 * .3}
    d.update(kw); return d

def pose(name, x, bottom, h, at=0.3, until=None, z=12, inn='fade', depth=None, **kw):
    """A generated pose of the founders (assets/gen/<name>_cut.png, made on Higgsfield from their own cut-outs and cut
    with .claude/skills/paper-motion/scripts/cut-poses.py assets/gen):
    shaking hands, sitting, at the mic. at/until swap it in and out with the single figures."""
    rel = 'assets/gen/%s_cut.png' % name; w, hh = Image.open(os.path.join(H, rel)).size
    d = {"type": "cutout", "src": rel, "x": x, "y": bottom, "h": round(h), "aspect": w / hh, "z": z, "edge": 0,
         "idle": {"type": "bob", "amp": 2, "speed": .5}}
    if inn: d["in"] = {"type": inn, "at": at, "dur": .2}
    if until is not None: d["out"] = {"at": until, "type": "fade", "dur": .2}
    if depth is not None: d["depth"] = depth
    d.update(kw); return d

def gone(d, t):
    """Fade a single figure out as its pose takes over."""
    d["out"] = {"at": t, "type": "fade", "dur": .2}; return d

def depths(els, table):
    """Parallax: give each place layer a depth from its z (0 = still sky, 1 = the figures' plane)."""
    for e in els:
        if 'depth' not in e and e.get('z') in table: e['depth'] = table[e['z']]
    return els

WATCH = {k: a for k, a in [('w1', 0.597), ('w2', 0.610), ('w3', 0.530), ('w4', 0.496), ('w5', 0.473)]}   # real product photos
def watch(k, *pos, **kw):
    """A real watch (product photo cut-out). pos = x, y (bottom), h; any of them can be overridden by keyframes in kw."""
    x, y, h = pos
    d = {"type": "cutout", "src": "assets/watches/%s.png" % k, "x": x, "y": y, "h": h, "aspect": WATCH[k], "edge": 3}; d.update(kw); return d
def macro(name, at, out, z=50, zoom=(1.0, 1.12)):
    """A full-screen close-up cropped from a real watch photo, slowly pushing in."""
    return {"type": "image", "src": "assets/macro/%s.jpg" % name, "x": 360, "y": 640, "w": 720, "h": 1280, "frame": False, "fit": "cover", "depth": 0,
            "z": z, "scale": [[at, zoom[0]], [out, zoom[1]]], "in": {"type": "none", "at": at}, "out": {"at": out, "type": "fade", "dur": .04}, "still": True}
def bubble(text, x, y, at, out, tail='l', size=30, w=None):
    return {"type": "bubble", "text": text, "x": x, "y": y, "w": w or 60 + 22 * len(text), "h": 76, "size": size, "tail": tail, "z": 60,
            "in": {"type": "pop", "at": at, "dur": .35}, "out": {"at": out, "type": "fade", "dur": .2}}

SC = []
def S(n, dur, theme, caption='', banner='', els=None, sfx=None, voiceAt=0.15, camera=None, floor=False, **kw):
    sc = {"theme": theme, "banner": banner, "floor": floor, "elements": els or [], "dur": dur, "silent": True}
    if n:
        n = str(n); d = VO[n]['seconds']
        sc["dur"] = round(max(voiceAt + d + 0.5, dur), 2)
        sc["captions"] = caption; sc["captionStart"] = voiceAt + 0.05; sc["captionEnd"] = voiceAt + d
        f = os.path.join(H, 'voice', VO[n]['file'])
        if os.path.exists(f) and not os.environ.get('NO_VOICE'): sc["voice"] = 'voice/' + VO[n]['file']; sc["voiceAt"] = voiceAt
    if sfx: sc["sfx"] = sfx
    if camera: sc["camera"] = camera
    sc.update(kw); SC.append(sc); return sc

E = lambda name, at, gain=-11: {"at": at, "name": name, "gain": gain}

# ===================================================================================================================
# 1  Opening: extreme macro on a movement, pulling back through layers of gears
els = balance_wheel(360, 560, D=560, dur=5.0)
for e, dp in zip(els, [0.55, 0.85, 1.0, 1.0, 1.25]): e['depth'] = dp
els += [gear_el(150, 610, 250, 5.0, -.35, z=3, depth=.8, color='#B9BDC4', teeth=24),
        gear_el(110, 590, 1010, 5.0, .5, z=3, depth=.9, teeth=16),
        gear_el(240, 40, 1180, 5.0, .18, z=8, depth=1.7, blur=3, color='#8E7446', teeth=30),
        gear_el(170, 720, 60, 5.0, -.25, z=8, depth=1.6, blur=3, color='#6E7279', teeth=22)]
S(1, 4.98, 'tk-black', 'تايم كيبر… | ما بدأ كمحل ساعات.', voiceAt=1.4, els=els,
  beds=[{"name": "watch_run", "from": 0, "to": 5, "gain": -18}],
  camera={"zoom": [[0, 3.2], [4.7, 1.0, "inOutCubic"]], "x": [[0, 360], [4.7, 360]], "y": [[0, 520], [4.7, 600, "inOutCubic"]]})

# 2  America: the map sets the places, then dives into Boulder (no founders yet)
S('2a', 5.5, 'tk-ink', 'بدأ بثلاثة أصدقاء… | التقوا وهم يدرسون في أمريكا.', transition='slide',
  sfx=[E('paper_tear', .2, -14), E('plane', 2.4, -16), E('whoosh', 4.6, -9)],
  els=[MAP([[0, V(-98, 38.5, 58)], [2.0, V(-111, 37.5, 30), "inOutCubic"], [3.8, V(-111, 37.5, 30)], [5.5, V(-105.27, 40.01, 2.5), "inCubic"]],
           pins=[pin(BOU, 1.2), pin(LA, 2.4)], routes=[{"from": "bou", "to": "la", "at": 2.2, "dur": 1.2}], states=True, unfold={"at": 0.2, "dur": 1.0})])

# 3  Boulder: wide, then push in. Ali Al-Ramadhan is there; Ali Al-Yousifi walks in from the right; they meet.
els = depths(boulder(F), {1: .15, 2: .35, 3: .55, 4: .8, 5: .9, 6: 1.0})
els += [rect('#B0AA80', 360, 1150, 760, 280, z=6, depth=1.0)]
els += [gone(person(AR, 'casual', 250, 1170, 640, at=0.4, z=12), 2.6),
        gone(person(AY, 'casual', 440, 1170, 640, z=13, flip=True, walk=(1.0, 2.5, 900, 440)), 2.6),
        pose('boulder_handshake', 345, 1172, 690, at=2.5, z=14),
        bubble('هلا!', 540, 500, 2.6, 4.4, tail='r'), bubble('أهلين!', 200, 490, 3.1, 4.6)]
els[-4]['rot'] = [[2.5, 0], [2.9, 3], [4.4, 3], [4.9, 0]]
els[-3]['rot'] = [[2.5, 0], [2.8, -3], [4.4, -3], [4.9, 0]]
S('2b', 5.2, 'tk-linen', 'في بولدر…', banner='BOULDER', voiceAt=1.0, transition='cut', els=els,
  sfx=[E('paper_place', .3, -12), E('paper_slide', 1.0, -13), E('pin', 2.6, -12)],
  camera={"zoom": [[0, 1.0], [2.2, 1.32, "inOutCubic"], [5.2, 1.4]], "x": [[0, 360], [2.2, 360], [5.2, 380]], "y": [[0, 640], [2.2, 820, "inOutCubic"], [5.2, 830]]})

# 4  Los Angeles: Ali Al-Yousifi meets Mohammad (who comes in close, in the foreground), then Ali Al-Ramadhan joins:
#    the first time the three are together. The landmarks arrive as layers while the camera moves.
els = depths(los_angeles(F), {1: .15, 2: .35, 3: .5, 4: .7, 5: .9, 6: 1.0})
for e in els:
    if e.get('z') == 3 and e.get('w') == 330: e['in'] = {"type": "pop", "at": 3.3, "dur": .5}      # HOLLYWOOD arrives late
els += [rect('#BDB6AA', 360, 1150, 760, 280, z=6, depth=1.0)]
els += [gone(person(AY, 'casual', 400, 1160, 600, at=0.2, z=13, flip=True), 1.9),
        gone(person(MY, 'casual', 250, 1160, 600, z=16, walk=(0.4, 1.8, -220, 250)), 1.9),
        pose('la_greet', 320, 1162, 620, at=1.8, until=4.8, z=15),
        gone(person(AR, 'casual', 600, 1160, 600, z=14, flip=True, walk=(3.4, 4.6, 960, 600)), 4.8),
        pose('la_three', 400, 1164, 640, at=4.7, z=16),
        bubble('هلا والله!', 280, 520, 1.9, 3.2), bubble('حيّاك!', 470, 560, 2.3, 3.4, tail='r'),
        {"type": "sparkles", "x": 420, "y": 640, "radius": 300, "count": 14, "color": "#F4E3B0", "in": {"type": "fade", "at": 4.8}, "z": 40}]
S('2c', 6.2, 'tk-linen', 'ولوس أنجلوس.', banner='LOS ANGELES', voiceAt=0.6, transition='slide', els=els,
  sfx=[E('paper_place', .3, -12), E('paper_slide', .6, -12), E('paper_slide', 3.6, -12), E('clasp', 4.8, -10)],
  camera={"zoom": [[0, 1.0], [1.8, 1.3, "inOutCubic"], [3.2, 1.35], [4.6, 1.0, "inOutCubic"], [6.2, 1.15]], "x": [[0, 360], [1.8, 320], [3.2, 330], [4.6, 400], [6.2, 400]],
          "y": [[0, 700], [1.8, 800, "inOutCubic"], [3.2, 800], [4.6, 700], [6.2, 760]]})

# 5  Back to Kuwait: suitcases, the plane through the clouds (the camera follows it), the towers come up
cloud = lambda x, y, w, d, z: {"type": "cloud", "w": w, "color": "#F6F3EC", "x": x, "y": y, "z": z, "depth": d}
els = [plate('#C9D4D8'), svg(720, 1280, '<defs><linearGradient id="rt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9DB3BE"/><stop offset="1" stop-color="#E7D3B5"/></linearGradient></defs><rect width="720" height="1280" fill="url(#rt)"/>',
                                     360, 640, anchor='c', z=1, kind=None, shadow=False, depth=0, still=True)]
els += [cloud(x, y, w, d, z) for x, y, w, d, z in [(100, 300, 220, .4, 2), (600, 420, 180, .4, 2), (900, 260, 200, .4, 2), (1300, 380, 240, .4, 2),
                                                    (300, 900, 380, 1.6, 20), (1100, 1000, 420, 1.6, 20)]]
els += [plane(-200, 560, z=10, scale=1.9)]
els[-1]['x'] = [[0, -200], [2.4, 1250, "inOutSine"]]; els[-1]['y'] = [[0, 640], [2.4, 420]]; els[-1]['rot'] = [[0, -4], [2.4, -10]]
els += [{"type": "suitcase", "x": 170, "y": 1180, "w": 300, "h": 210, "z": 22, "depth": 1.4, "in": {"type": "slideL", "at": 0.1, "from": 600}, "out": {"at": 1.4, "type": "fade", "dur": .2}},
        {"type": "card", "x": 270, "y": 1010, "w": 150, "h": 64, "label": "KWI", "labelSize": 34, "color": "#F3F0E8", "rot": 8, "z": 23, "depth": 1.4, "in": {"type": "pop", "at": 0.4}, "out": {"at": 1.4, "type": "fade", "dur": .2}},
        {"type": "towers", "x": 1180, "y": 1200, "h": 700, "z": 6, "depth": .9, "color": "#F3F0E8", "in": {"type": "rise", "at": 2.0, "dur": .8}}]
S('3a', 3.4, 'tk-ink', 'وبعد الدراسة… | رجعوا الكويت.', banner='KUWAIT', voiceAt=0.3, transition='slide', els=els,
  sfx=[E('paper_slide', .1, -12), E('plane', .3, -10), E('whoosh', 2.0, -10)],
  camera={"zoom": [[0, 1.0], [2.2, 1.0], [3.4, 1.3, "inCubic"]], "x": [[0, 360], [2.4, 1100, "inOutSine"], [3.4, 1180]], "y": [[0, 640], [2.4, 600], [3.4, 760]]})

# 6  The diwaniya: the three close around the tray, coffee steaming, a real watch handed across; the camera comes
#    down to the watch on «والساعات…»
els = depths(kuwait_dusk(F), {1: 0, 2: .35, 3: .5, 4: .6, 5: .7, 6: 1.0})
els += [rect('#6B4E3A', 360, 1150, 760, 280, z=6, depth=1.0)]
DW = 860 / 1089                                     # diwaniya pose: 1089 px wide, shown 860 wide from x = -70
dx = lambda px: -70 + px * DW; dy = lambda py: 1240 - 536 * DW + py * DW
els += [pose('diwaniya', 360, 1240, 536 * DW, at=0.2, z=14, inn='rise')]
tray = coffee_tray(360, 1300, at=0.6, z=40); tray['scale'] = 1.2; tray['depth'] = 1.1
els += [tray] + steam(270, 1200, 5.6, at=0.6) + steam(355, 1200, 5.6, at=1.1)
els += [watch('w3', dx(530), dy(292), 42, z=42, rot=[[0, -70], [2.3, -70], [3.2, -25], [5.6, -20]],
              **{"in": {"type": "pop", "at": 1.2}, "x": [[0, dx(530)], [2.3, dx(530)], [3.2, dx(612), "inOutCubic"]],
                 "y": [[0, dy(292)], [2.3, dy(292)], [2.75, dy(240)], [3.2, dy(268)]]})]
S('3b', 5.6, 'tk-ink', 'والساعات… | دايماً حاضرة بقعداتهم.', voiceAt=0.5, transition='cut', els=els,
  sfx=[E('paper_place', .6, -12), E('clasp', 2.4, -11), E('paper_place', 3.2, -13)],
  camera={"zoom": [[0, 1.3], [0.6, 1.3], [2.2, 2.1, "inOutCubic"], [4.4, 2.2], [5.6, 1.35, "inOutCubic"]],
          "x": [[0, 360], [0.6, 360], [2.2, dx(560)], [4.4, dx(580)], [5.6, 380]], "y": [[0, 980], [0.6, 990], [2.2, dy(250)], [4.4, dy(245)], [5.6, 900]]})

# 7  English shelves for days, then the Arabic shelf, almost empty (no founders)
els = [plate('#3A3D44')]
for k, x in enumerate([230, 690, 1150]):
    els += bookcase(x, 1250, rows=6, w=400, at=0.1 + k * 0.6, step=0.18)
els += arabic_shelf(1640, 1250, at=4.2)
els += [{"type": "text", "text": "ENGLISH", "x": 360, "y": 190, "size": 46, "font": "banner", "weight": 800, "color": "#F3F0E8", "ls": .14, "upper": False, "shadow": False, "depth": 0, "in": {"type": "fade", "at": .4}, "out": {"at": 4.6, "type": "fade", "dur": .3}},
        {"type": "text", "text": "عربي", "x": 1640, "y": 980, "size": 64, "font": "banner", "weight": 900, "color": "#F3F0E8", "shadow": False, "in": {"type": "pop", "at": 4.7}}]
mags = [('WATCH REVIEW', 120, 420, -8, .6), ('COLLECTOR', 600, 700, 6, 1.4), ('MOVEMENT', 300, 1000, -4, 2.2), ('HOROLOGY', 820, 380, 5, 2.8), ('THE DIAL', 1100, 900, -6, 3.4)]
els += [{"type": "card", "x": x, "y": y, "w": 260, "h": 340, "label": t, "labelSize": 28, "color": "#E9E2D2", "rot": r, "depth": 1.7, "z": 40, "in": {"type": "drop", "at": a, "dur": .4}}
        for t, x, y, r, a in mags]
S(4, 7.0, 'tk-graphite', 'ولاحظوا شي… | المعلومات عن الساعات كثيرة، | بس أغلبها بالإنجليزي. | وبالعربي؟ | قليل.', transition='slide', els=els,
  sfx=[E('paper_place', .1 + k * .6, -13) for k in range(3)] + [E('whoosh', 3.8, -11), E('paper_place', 4.4, -10)],
  camera={"zoom": [[0, 1.0], [4.0, 1.0], [5.0, 1.15, "inOutCubic"], [7.0, 1.22]], "x": [[0, 360], [3.8, 1060, "inOutSine"], [5.0, 1640, "inOutCubic"], [7.0, 1640]],
          "y": [[0, 640], [4.0, 640], [5.0, 900, "inOutCubic"], [7.0, 920]]})

# 8  «ليش ما نبسطها؟»: the three close, talking; questions come up between them and turn into the idea
els = [plate('#24262B'), {"type": "spotlight", "x": 360, "y": 0, "w": 720, "h": 1100, "z": 2, "depth": 0}]
els += [pose('brainstorm', 360, 1310, 760 * 957 / 873, at=0.1, z=20, inn='rise', idle={"type": "sway", "amp": 1.2, "speed": .5})]
qs = [('ليش؟', 250, 420, .5), ('بالعربي؟', 490, 340, 1.1), ('نبسطها؟', 330, 250, 1.7)]
els += [{"type": "text", "text": t, "x": [[a, x], [2.6, x], [3.0, 360]], "y": [[a, y], [2.6, y], [3.0, 300]], "size": 54, "font": "banner", "weight": 900, "color": "#111111", "paper": "#F3F0E8",
         "rot": (k - 1) * 5, "z": 40, "in": {"type": "pop", "at": a, "dur": .3}, "out": {"at": 2.95, "type": "fade", "dur": .1}} for k, (t, x, y, a) in enumerate(qs)]
els += [bulb(360, 300, 3.0, 99), {"type": "sparkles", "x": 360, "y": 300, "radius": 160, "count": 10, "color": "#F4E3A1", "in": {"type": "fade", "at": 3.05}, "z": 41}]
S(5, 4.3, 'tk-ink', 'فقالوا… | ليش ما نبسطها؟', transition='slide', els=els,
  sfx=[E('paper_place', .5, -12), E('paper_place', 1.1, -12), E('paper_place', 1.7, -12), E('whoosh', 2.7, -11), E('pin', 3.0, -9)],
  camera={"zoom": [[0, 1.0], [4.3, 1.1]], "x": [[0, 360], [4.3, 360]], "y": [[0, 640], [4.3, 560]]})

# 9  The work, full screen: a pen past the lens, a page turns, English news becomes Arabic, a flash, a real watch in
#    macro, a mic in the foreground, the interview. Roles show without titles. Ends on the logo and the claim.
M = []
# writing (Ali Al-Ramadhan)
M += [plate('#EFE9DC', z=1), pose('writer', 400, 1330, 1250, at=0.05, z=10, out={"at": 1.25, "type": "fade", "dur": .05})]
pn = pen(-100, 800, 900, 0.1, 1.25); pn['scale'] = 3.2; pn['depth'] = 1.6; pn['z'] = 35; M += [pn]
M += [{"type": "card", "x": 360, "y": 640, "w": 720, "h": 1280, "color": "#FBF9F3", "z": 40, "depth": 0, "in": {"type": "flip", "at": 1.05, "dur": .25}, "out": {"at": 1.3, "type": "fade", "dur": .05}}]
# translating the news (still Ali Al-Ramadhan, at the monitor)
M += [plate('#D9D3C5', at=1.3, out=2.75, z=2),
      {"type": "card", "x": 360, "y": 470, "w": 640, "h": 300, "label": "WATCH NEWS", "labelSize": 64, "color": "#FBF9F3", "rot": -2, "z": 30, "in": {"type": "drop", "at": 1.3, "dur": .35}, "out": {"at": 2.0, "type": "fade", "dur": .1}},
      {"type": "card", "x": 360, "y": 470, "w": 640, "h": 300, "label": "أخبار الساعات", "labelSize": 72, "color": "#111111", "ink": "#F3F0E8", "style": "dark", "rot": 2, "z": 31, "in": {"type": "flip", "at": 2.0, "dur": .3}, "out": {"at": 2.75, "type": "fade", "dur": .05}},
      monitor(500, 1250, at=1.4, z=20, w=360, out={"at": 2.75, "type": "fade", "dur": .05}),
      person(AR, 'formal', 170, 1700, 1150, at=1.35, z=18, inn='fade', out={"at": 2.75, "type": "fade", "dur": .05})]
# filming a real watch (Mohammad on the visual side), through a flash
M += [plate('#FFFFFF', at=2.75, out=2.95, z=70),
      macro('m1', 2.95, 3.6, z=45), macro('m5', 3.6, 4.2, z=45), viewfinder(2.95, 4.2, z=62),
      pose('designer', 520, 1700, 1300, at=3.6, z=58, out={"at": 4.2, "type": "fade", "dur": .05}),
      ] + design_board(140, 1180, LOGO, at=3.65, z=59, w=220, out={"at": 4.2, "type": "fade", "dur": .05})
# the interview (Ali Al-Yousifi on camera, with a guest)
M += [plate('#2B2D32', at=4.2, out=6.35, z=3),
      pose('presenter', 240, 1650, 1250, at=4.25, z=20, out={"at": 6.35, "type": "fade", "dur": .05}),
      guest(560, 1120, at=4.35, z=19, scale=1.5, out={"at": 6.35, "type": "fade", "dur": .05}),
      rect('#5C4632', 360, 1180, 760, 220, z=25, depth=1.0, **{"in": {"type": "none", "at": 4.2}, "out": {"at": 6.35, "type": "fade", "dur": .05}}),
      {"type": "card", "x": 560, "y": 260, "w": 190, "h": 60, "style": "dark", "label": "ON AIR", "labelSize": 26, "ink": "#E8574B", "z": 41, "in": {"type": "pop", "at": 4.6}, "out": {"at": 6.35, "type": "fade", "dur": .05}, "idle": {"type": "pulse", "amp": .05, "speed": 1.4}}]
# the result
M += [plate('#111111', at=6.35, z=4),
      {"type": "image", "x": 360, "y": 470, "w": 330, "h": 330, "src": LOGO, "pad": 14, "rot": -2, "in": {"type": "slam", "at": 6.4, "dur": 0.5}, "z": 80},
      {"type": "card", "x": 360, "y": 760, "w": 660, "h": 96, "style": "dark", "label": "أكبر منصة عربية للساعات", "labelSize": 44, "ink": "#F3F0E8", "in": {"type": "pop", "at": 6.9}, "z": 81}]
montage = S('5b', 7.6, 'tk-ink', 'فكتبوا… | وترجموا الأخبار… | وصوّروا الساعات… | وسوّوا مقابلات.', voiceAt=0.1, transition='cut', captionClear=6.3, els=M,
  sfx=[E('paper_place', .1), E('paper_slide', .3, -12), E('fold', 1.05, -9), E('paper_place', 1.35), E('paper_slide', 2.0, -10), E('shutter', 2.8, -6),
       E('shutter', 3.6, -8), E('mic_tap', 4.4, -9), E('stamp', 6.4, -6), E('paper_slide', 6.9, -10)],
  camera={"zoom": [[0, 1.0], [1.2, 1.12], [1.3, 1.0], [2.7, 1.08], [4.2, 1.0], [6.3, 1.1], [6.35, 1.0], [7.6, 1.08]], "x": [[0, 360]], "y": [[0, 640]]})

# -- line the music's drop up with 2018: pad the montage so the 2018 scene starts on a bar
pre = sum(s['dur'] for s in SC)
INSERT_BARS = math.ceil((pre - DROP) / BAR)
montage['dur'] = round(montage['dur'] + DROP + INSERT_BARS * BAR - pre, 2)

# 10  2018: one post full screen, swipe, swipe, reactions rising; then pull back to a whole grid of posts
P = lambda n: 'assets/posts/%s.jpg' % n
def post(n, at_in, at_out, x_in=900, cut=False):
    w = 640; a = Image.open(os.path.join(H, P(n))).size; ih = round(w * a[1] / a[0])
    d = {"type": "igpost", "src": P(n), "avatar": LOGO, "sub": "Time Keeper", "x": [[at_in, x_in], [at_in + .35, 360, "outCubic"], [at_out, 360], [at_out + .35, -420, "inCubic"]],
         "y": 600, "w": w, "imgH": ih, "z": 30, "in": {"type": "none", "at": at_in}, "likeAt": at_in + 1.0}
    d["out"] = {"at": at_out if cut else at_out + .35, "type": "fade", "dur": .05}
    return d
els = [plate('#EEEAE0'), post('auction', .2, 2.4, 360), post('interview', 2.4, 4.4), post('reel', 4.4, 6.2, cut=True)]
for k in range(12):
    t = 1.0 + k * .38
    els.append({"type": "card", "x": 520 + (k % 3) * 60, "y": [[t, 1150], [t + 1.4, 760]], "w": 110, "h": 52, "label": ['♥ 1.2K', '♥ 980', '⤴ 354', '♥ 2.1K'][k % 4], "labelSize": 22,
                "color": "#F3F0E8", "rot": (k % 5 - 2) * 4, "z": 40, "opacity": [[t, 0], [t + .2, 1], [t + 1.2, 1], [t + 1.4, 0]], "in": {"type": "none", "at": t}, "out": {"at": t + 1.4, "type": "fade", "dur": .05}})
grid = ['auction', 'interview', 'geraldcharles', 'm2', 'reel', 'm6', 'm1', 'profile', 'm4', 'm5', 'auction', 'm3']
for k, n in enumerate(grid):
    gx, gy = 120 + (k % 3) * 240, 230 + (k // 3) * 290
    src = 'assets/macro/%s.jpg' % n if n.startswith('m') else P(n)
    els.append({"type": "image", "src": src, "x": gx, "y": gy, "w": 222, "h": 276, "frame": False, "fit": "cover", "z": 20, "in": {"type": "none", "at": 6.2}})
S(6, 9.0, 'tk-bone', 'وفي ٢٠١٨… | بدأ تايم كيبر. | بوست بعد بوست… | نشرح الساعات بالعربي.', banner='2018', transition='slide', els=els,
  sfx=[E('paper_place', .2), E('whoosh', 2.4, -10), E('whoosh', 4.4, -10), E('paper_slide', 6.2, -9)],
  camera={"zoom": [[0, 1.0], [6.2, 1.0], [6.21, 2.9], [8.2, 1.0, "inOutCubic"], [9.0, 1.0]], "x": [[0, 360], [6.2, 360], [6.21, 360], [9, 360]],
          "y": [[0, 640], [6.2, 640], [6.21, 520], [8.2, 640, "inOutCubic"]]})

# 11  «وين أحصل هالساعة؟»: messages pile up until they fill the screen; the biggest is the question itself
msgs = [('وين أحصلها؟', 200, 260, 26, 420, -3), ('تقدرون توفرونها؟', 470, 380, 28, 460, 2), ('من وين نشتريها؟', 260, 520, 24, 400, -2), ('عندكم هالموديل؟', 500, 640, 30, 470, 3),
        ('كم سعرها؟', 220, 760, 26, 360, -4), ('أبي وحدة!', 520, 870, 32, 380, 2), ('توصلون؟', 200, 970, 24, 320, -1), ('متى توفرونها؟', 470, 1080, 26, 420, 3)]
els = [plate('#3A3D44'), {"type": "image", "src": "assets/posts/profile.jpg", "x": 360, "y": 160, "w": 600, "h": round(600 * 498 / 1170), "pad": 8, "z": 5, "in": {"type": "drop", "at": 0.1, "dur": .5}}]
els += [{"type": "notif", "x": x, "y": y, "w": w, "name": "timekeeperkw", "initial": "؟", "text": t, "size": s, "rot": r, "z": 20 + k, "in": {"type": "slideD", "at": .5 + k * .32, "from": 500}}
        for k, (t, x, y, s, w, r) in enumerate(msgs)]
els += [{"type": "notif", "x": 360, "y": 640, "w": 690, "h": 170, "name": "timekeeperkw", "initial": "؟", "text": "وين أحصل هالساعة؟", "size": 56, "rot": -2, "z": 60, "in": {"type": "slam", "at": 3.1, "dur": .35}}]
S(7, 5.5, 'tk-graphite', 'والناس بدت تتابع… | وتسأل: | وين أحصل هالساعة؟', transition='slide', els=els,
  sfx=[E('notif', .5 + k * .32, -14) for k in range(8)] + [E('stamp', 3.1, -7)],
  camera={"zoom": [[0, 1.0], [3.0, 1.06], [3.4, 1.14, "outBack"], [5.5, 1.18]], "x": [[0, 360]], "y": [[0, 640]]})

# 12  Selling begins: close on the box, it opens, the first real watch comes at the lens, macro cuts, then the five
els = [plate('#EEEAE0'), {"type": "box", "x": 360, "y": 900, "w": 600, "h": 300, "lid": [[0.5, 0], [1.0, 1, "outBack"]], "z": 40}]
els += [watch('w3', 360, 980, 400, z=45, **{"in": {"type": "rise", "at": 1.0, "dur": .5}, "scale": [[1.0, .7], [2.0, 2.4, "inCubic"]], "y": [[1.0, 980], [2.0, 1260]], "out": {"at": 2.0, "type": "fade", "dur": .05}})]
els += [macro(n, 2.0 + k * .38, 2.38 + k * .38, zoom=(1.0, 1.1)) for k, n in enumerate(['m1', 'm2', 'm4', 'm3', 'm5', 'm6'])]
fan = [watch(k, 360 + (i - 2) * 118, 935 + abs(i - 2) * 14, 450 - abs(i - 2) * 38, rot=(i - 2) * 3, z=30 - abs(i - 2),
             **{"in": {"type": "rise", "at": 4.35 + i * .12, "dur": .4}, "idle": {"type": "bob", "amp": 3, "speed": .6, "phase": i * .4}}) for i, k in enumerate(WATCH)]
els += fan + [{"type": "sparkles", "x": 360, "y": 480, "radius": 300, "count": 14, "color": "#C9A35F", "in": {"type": "fade", "at": 5.0}, "z": 45}]
S(8, 6.2, 'tk-bone', 'فبدينا نوفر ساعات نحبها… | ونثق فيها.', transition='slide', els=els,
  sfx=[E('fold', .5, -9), E('paper_slide', 1.0, -11)] + [E('shutter', 2.0 + k * .38, -12) for k in range(6)] + [E('paper_slide', 4.35, -12), E('clasp', 5.0, -9)],
  camera={"zoom": [[0, 2.1], [1.0, 2.1], [2.0, 1.4, "inOutCubic"], [4.3, 1.4], [4.31, 1.15], [6.2, 1.0, "inOutCubic"]], "x": [[0, 360]],
          "y": [[0, 900], [1.0, 880], [2.0, 760, "inOutCubic"], [4.3, 760], [4.31, 720], [6.2, 640, "inOutCubic"]]})

# 13  The podcast, as a set the camera travels across: Ali Al-Ramadhan's questions and monitor -> Mohammad on the look
#     of the episode -> Ali Al-Yousifi at the mic with the guest
wood = lambda x, w: rect('#7A5C42', x, 1170, w, 260, z=25)
els = [plate('#2B2D32'), rect('#3A3C42', 750, 420, 1700, 700, z=2, depth=1.0)]
els += [pose('writer', 190, 1310, 860, at=0.1, z=18), wood(250, 520), papers(150, 1060, at=0.2), monitor(370, 1060, at=0.3, w=300)]
els += [pose('designer', 720, 1380, 880, at=0.2, z=18)] + design_board(560, 1000, LOGO, at=1.2, w=200) + [
        camera_rig(880, 1100, 1.0, 99), ring_light(970, 1050, 1.0, 99)]
els += [pose('podcast', 1250, 1560, 1150, at=0.3, z=18), guest(1580, 1110, at=0.4, scale=1.4), wood(1420, 760),
        {"type": "mic", "x": 1520, "y": 1060, "size": 1.0, "z": 30, "in": {"type": "drop", "at": 0.6}},
        {"type": "card", "x": 1370, "y": 300, "w": 190, "h": 60, "style": "dark", "label": "ON AIR", "labelSize": 26, "ink": "#E8574B", "z": 30, "in": {"type": "pop", "at": 0.5}, "idle": {"type": "pulse", "amp": .05, "speed": 1.4}},
        {"type": "waves", "x": 1380, "y": 470, "bars": 21, "h": 120, "color": "#F3F0E8", "z": 29, "level": [[4.0, 0], [4.6, 1]]}]
S(9, 9.0, 'tk-ink', 'وفي ٢٠١٩… | جاء البودكاست. | وصرنا نتكلم مع ناس | من قلب عالم الساعات.', banner='2019', transition='slide', els=els,
  sfx=[E('paper_place', .2), E('paper_slide', 2.6, -12), E('shutter', 4.0, -12), E('mic_tap', 5.6, -9)],
  camera={"zoom": [[0, 1.45], [2.2, 1.3, "inOutCubic"], [4.6, 1.2], [6.8, 1.3, "inOutCubic"], [9.0, 1.45]], "x": [[0, 270], [2.4, 330], [4.6, 820, "inOutCubic"], [6.8, 1330, "inOutCubic"], [9.0, 1330]],
          "y": [[0, 720], [2.2, 740, "inOutCubic"], [4.6, 740], [6.8, 720, "inOutCubic"], [9.0, 700]]})   # heads stay clear of the 2019 banner

# 14  Kuwait to Geneva, short: the line runs and the map dives into Geneva
S('10a', 2.2, 'tk-ink', 'ووصلنا جنيف…', transition='slide', sfx=[E('plane', .2, -12), E('whoosh', 1.8, -10)],
  els=[MAP([[0, V(26, 38, 70)], [1.3, V(10, 44, 26), "inOutCubic"], [2.2, V(6.14, 46.2, 2.5), "inCubic"]], pins=[pin(KW, 0), pin(GVA, 1.1)],
           routes=[{"from": "kw", "to": "gva", "at": 0.1, "dur": 1.1, "curve": .14}], highlight=[{"n": "Switzerland", "at": 1.2, "color": "#111111"}])])

# 15  Geneva: open on the Flower Clock, rise to the lake and the Jet d'Eau, then the three walk into the place
els = depths(geneva(F), {1: .1, 2: .35, 3: .55, 4: .7, 5: 1.0})
els += [rect('#9DAA80', 360, 1150, 760, 280, z=5, depth=1.0)]
for e in els:
    if e.get('z') == 30: e.update(x=360, y=1250, scale=1.8, depth=1.1)
els += [person(MY, 'formal', 170, 1130, 600, z=14, walk=(2.4, 3.4, -150, 170)),
        person(AY, 'formal', 370, 1110, 600, z=13, walk=(2.6, 3.6, 860, 380)),
        person(AR, 'formal', 560, 1130, 600, z=14, walk=(2.8, 3.8, 900, 570))]
S('10b', 5.8, 'tk-linen', 'قلب صناعة الساعات.', banner='GENEVA', voiceAt=0.9, transition='cut', els=els,
  sfx=[E('tick_pair', .3, -10), E('paper_slide', 2.4, -12), E('paper_slide', 2.8, -12)],
  camera={"zoom": [[0, 2.6], [2.4, 1.0, "inOutCubic"], [5.8, 1.08]], "x": [[0, 360], [2.4, 360], [4.2, 330], [5.8, 400]],
          "y": [[0, 1180], [2.4, 640, "inOutCubic"], [5.8, 700]]})

# 16  2022: walk to the Lounge door, it opens, light, and the camera goes through
els = [plate('#3A3D44'), rect('#2E3036', 360, 1160, 760, 280, z=2, depth=1.0),
       {"type": "door", "x": 360, "y": 600, "w": 340, "h": 560, "z": 5, "sign": "TIME KEEPER LOUNGE", "interior": "radial-gradient(circle at 50% 60%,#FFF6DD,#E9C98A 70%,#B98E50)",
        "open": [[4.0, 0], [5.2, 1, "outBack"]], "in": {"type": "rise", "at": 0.3, "dur": .6}}]
for k, (p, x0, x1) in enumerate([(MY, 160, 280), (AY, 380, 360), (AR, 600, 450)]):
    d = person(p, 'formal', x0, 1500, 900, at=0.2 + k * .2, z=20 - k)
    d["x"] = [[0, x0], [1.2, x0], [4.6, x1, "inOutSine"]]; d["y"] = [[0, 1500], [1.2, 1500], [4.6, 900, "inOutSine"]]
    d["scale"] = [[0, 1.0], [1.2, 1.0], [4.6, .5, "inOutSine"]]; d["idle"] = {"type": "bob", "amp": 6, "speed": 2.2, "from": 1.2, "until": 4.6}
    d["out"] = {"at": 6.6, "type": "fade", "dur": .3}
    els.append(d)
els += [plate('#FFF6DD', at=7.9, z=90, opacity=[[7.9, 0], [8.6, 1]])]
S(11, 8.7, 'tk-graphite', 'وفي ٢٠٢٢… | فتحنا صالة تايم كيبر. | مكان يجتمع فيه | محبين الساعات.', banner='2022', transition='slide', els=els,
  sfx=[E('paper_place', .3), E('door_chime', 4.0, -10), E('whoosh', 7.6, -9)],
  camera={"zoom": [[0, 1.0], [4.0, 1.25, "inOutSine"], [6.4, 1.6], [8.7, 4.5, "inCubic"]], "x": [[0, 360]], "y": [[0, 760], [4.0, 680], [8.7, 640]]})

# 17  Time Gallery: the polaroid comes in big, the camera goes into it until it is the whole screen; real watches drift by
els = [plate('#FFF6DD'), {"type": "photo", "src": "assets/ep3_timegallery_store.jpg", "x": 360, "y": 600, "w": 660, "aspect": 1.589, "label": "تايم غاليري",
                          "rot": [[0, -6], [0.8, -2, "outBack"], [2.2, 0]], "in": {"type": "drop", "at": 0.1, "dur": .5}, "z": 10}]
els += [watch('w2', -40, 1100, 380, z=30, depth=1.8, rot=-12, **{"x": [[1.4, -260], [4.4, 120]], "in": {"type": "none", "at": 1.4}}),
        watch('w4', 760, 520, 360, z=30, depth=1.8, rot=10, **{"x": [[1.6, 980], [4.4, 600]], "in": {"type": "none", "at": 1.6}})]
S(12, 4.4, 'tk-linen', 'وبعدها… | تايم غاليري.', banner='TIME GALLERY', transition='fade', transitionDur=.3, els=els,
  sfx=[E('paper_place', .2), E('whoosh', 1.6, -12)],
  camera={"zoom": [[0, 1.0], [1.0, 1.0], [3.2, 3.0, "inOutCubic"], [4.4, 3.2]], "x": [[0, 360]], "y": [[0, 600]]})

# 18  The Avenues: close on the TIME KEEPER sign, pull out to the store, the three walk in
sign_y = 178 + 0.455 * 764
els = [plate('#EEEAE0'), rect('#D8D1C4', 360, 1180, 760, 240, z=2, depth=1.0),
       {"type": "photo", "src": "assets/avenues_store.jpg", "x": 360, "y": 560, "w": 430, "aspect": 0.5628, "z": 5}]
els += [person(MY, 'formal', 170, 1170, 520, z=20, walk=(1.8, 2.9, -150, 170)),
        person(AY, 'formal', 360, 1150, 520, z=19, walk=(2.0, 3.1, 870, 370)),
        person(AR, 'formal', 550, 1170, 520, z=20, walk=(2.2, 3.3, 900, 560))]
S(13, 4.2, 'tk-bone', 'والأفنيوز.', banner='THE AVENUES', transition='slide', els=els,
  sfx=[E('paper_slide', .2, -12), E('door_chime', 1.4, -12), E('paper_slide', 2.0, -12)],
  camera={"zoom": [[0, 3.0], [1.8, 1.0, "inOutCubic"], [4.2, 1.06]], "x": [[0, 360]], "y": [[0, sign_y], [1.8, 640, "inOutCubic"]]})

# 19  Back to the three: start on real watches on the table, rise to them, then a slow push in on «بدأت بثلاثة أصدقاء…»
els = [plate('#E6DFD0'), rect('#D9CFBC', 360, 420, 760, 900, z=1)]
TOP = 1330 - 1000 + 0.68 * 1000                     # where things stand on the table pose's tabletop (0.62-0.70 of its height)
els += [pose('table', 360, 1330, 1000, z=10, inn=None)]
els += [watch('w3', 225, TOP, 125, z=25, rot=-6), watch('w1', 362, TOP + 4, 120, z=25, rot=3), watch('w5', 500, TOP, 115, z=25, rot=-3)]
els += [{"type": "cup", "x": x, "y": TOP + 2, "size": .45, "z": 24, "anchor": "b"} for x in (95, 630)] + steam(95, TOP - 40, 8.6) + steam(630, TOP - 40, 8.6, at=.5)
S(14, 8.6, 'tk-bone', 'بس القصة ما بدأت بمحل… | ولا بخطة عمل. | بدأت بثلاثة أصدقاء… | يحبون الساعات.', transition='slide', els=els,
  sfx=[E('paper_place', .2, -12), E('clasp', 1.0, -11)],
  camera={"zoom": [[0, 2.0], [1.0, 2.1], [3.4, 1.0, "inOutCubic"], [4.6, 1.0], [8.6, 1.25, "inOutSine"]], "x": [[0, 362], [3.4, 360]],
          "y": [[0, TOP - 60], [1.0, TOP - 60], [3.4, 640, "inOutCubic"], [8.6, 620]]})

# 20  The logo, drawn by a sweeping hand, then into black on the last tick
hand = svg(40, 300, '<rect x="16" y="0" width="8" height="300" rx="4" fill="#C9A35F"/><circle cx="20" cy="290" r="14" fill="#C9A35F"/>', 360, 560, anchor='b', z=30, kind=None, shadow=False,
           rot=[[0.3, 0], [2.3, 360, "inOutSine"]], opacity=[[0.3, 0], [0.4, 1], [2.3, 1], [2.6, 0]])
hand['y'] = 560
els = [plate('#111111'), {"type": "reveal", "src": LOGO, "x": 360, "y": 560, "w": 380, "h": 380, "z": 20, "reveal": [[0.3, 0], [2.3, 1, "inOutSine"]]}, hand,
       plate('#000000', at=3.6, z=90, opacity=[[3.6, 0], [4.5, 1]])]
S(15, 4.5, 'tk-ink', 'والوقت… | كان مجرد البداية.', transition='fade', els=els, sfx=[E('tick', .3, -12), E('tick_pair', 3.6, -8)],
  camera={"zoom": [[0, 1.0], [4.5, 1.08]], "x": [[0, 360]], "y": [[0, 600]]})
S(0, 1.3, 'tk-black', transition='cut')

total = sum(s['dur'] for s in SC)
json.dump({"title": "قصة تايم كيبر", "width": 720, "height": 1280, "fps": 30, "floorY": F, "captionY": F + 38, "bannerY": 110, "maxWords": 4, "style": ST['style'], "themes": ST['themes'],
           "musicInsertBars": INSERT_BARS, "audio": {"autoSfx": True, "music": "renders/simple_score.wav", "musicGain": MUSIC_GAIN, "voiceGain": 0}, "scenes": SC},
          open(os.path.join(H, 'story.json'), 'w'), ensure_ascii=False, indent=1)
t2018 = sum(s['dur'] for s in SC[:[i for i, s in enumerate(SC) if s.get('banner') == '2018'][0]])
print('story.json  %d scenes  %.1fs  2018 at %.2fs  drop at %.2fs (%d bars inserted)' % (len(SC), total, t2018, DROP + INSERT_BARS * BAR, INSERT_BARS))
