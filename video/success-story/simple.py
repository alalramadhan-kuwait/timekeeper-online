#!/usr/bin/env python3
"""ONE short film: the Time Keeper story with narration. Only founder-confirmed facts, no placeholders.

  Narration: voice/NN.mp3 (see voice/manifest.json). Scene timing follows the known clip lengths, so the cut is
             identical with or without the audio files; when the files exist they are mixed in.
  Figures:   assets/figures/{casual,formal,kuwaiti}.png  (all three founders in one transparent PNG per outfit),
             or casual_1.png / casual_2.png / casual_3.png for separate people. Scenes use them only when present.
             A photo on a plain background: python3 ../../.claude/skills/paper-motion/scripts/cutout.py in.jpg assets/figures/casual.png
  Build:     python3 simple.py && node ../../.claude/skills/paper-motion/scripts/render.mjs simple.json -o renders/time-keeper-story.mp4 --scale 1.5
"""
import json, os
from landmarks import boulder, los_angeles, kuwait_dusk, coffee_tray, geneva, bookcase, arabic_shelf, bulb, notebook, pen, camera_rig, ring_light, interview_set
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); ST = json.load(open(os.path.join(H, 'tk-style.json')))
# One clip per narration piece, cut from the Andre track by voice/cut-andre.py (lines 2, 3 and 10 are split at their pauses)
VO = json.load(open(os.path.join(H, 'voice', 'clips.json')))
LOGO = '../../public/icon-512.png'
MUSIC_GAIN = float(os.environ.get('MUSIC_GAIN', -24))   # -90 renders the sound-effects bed alone, for a separate music mix
FLOOR = 1020   # floor line: lower than the engine default (960) so the figures get more of the screen
V = lambda lon, lat, span: {"lon": lon, "lat": lat, "span": span}
BOU = dict(id='bou', lon=-105.27, lat=40.01, label='BOULDER'); LA = dict(id='la', lon=-118.24, lat=34.05, label='LOS ANGELES')
KW = dict(id='kw', lon=47.98, lat=29.37, label='KUWAIT'); GVA = dict(id='gva', lon=6.14, lat=46.20, label='GENEVA')
pin = lambda p, at: dict(p, at=at)
def MAP(view, pins=None, routes=None, y=580, h=680, **kw):
    d = {"type": "map", "x": 360, "y": y, "w": 660, "h": h, "view": view, "sea": "#CCC6B7", "land": "#F4F1E8", "pins": pins or [], "routes": routes or []}; d.update(kw); return d

# ---- paper-cut figures --------------------------------------------------------------------------------------------
FIGDIR = os.path.join(H, 'assets', 'figures')
PEOPLE = ['ali-alramadhan', 'mohammad-alyousifi', 'ali-alyousifi']   # left to right
# Relative heights, read from a group photo of the three standing in a row (eye level and headwear top):
# the tallest is 1.0. h in fig() is the tallest founder's height; the others stand on the same floor.
HEIGHT = {'ali-alramadhan': 1.0, 'mohammad-alyousifi': 0.955, 'ali-alyousifi': 0.905}
def fig(outfit, x=360, h=500, at=0.5, z=12):
    """Paper-cut figures for one outfit: a group PNG <outfit>.png, or one PNG per founder <person>_<outfit>.png."""
    def one(rel, xx, delay, zz, ph, k=1.0):
        w, hh = Image.open(os.path.join(H, rel)).size
        return {"type": "cutout", "src": rel, "x": xx, "y": FLOOR, "h": round(h * k), "aspect": w / hh, "z": zz, "edge": 0,
                "in": {"type": "rise", "at": at + delay}, "idle": {"type": "bob", "amp": 2, "speed": .5, "phase": ph}}
    if os.path.exists(os.path.join(FIGDIR, outfit + '.png')):
        return [one('assets/figures/%s.png' % outfit, x, 0, z, 0)]
    have = [p for p in PEOPLE if os.path.exists(os.path.join(FIGDIR, '%s_%s.png' % (p, outfit)))]
    gap = h * 0.46
    offs = {1: [0], 2: [-gap / 2, gap / 2], 3: [-gap, 0, gap]}.get(len(have), [])
    return [one('assets/figures/%s_%s.png' % (p, outfit), x + o, i * 0.2, z + (1 if o == 0 else 0), i * .3, HEIGHT.get(p, 1.0)) for i, (p, o) in enumerate(zip(have, offs))]
HAVE = {o: bool(fig(o)) for o in ('casual', 'formal', 'kuwaiti')}

# Real Time Keeper posts (screenshots cropped by hand, git-ignored under assets/posts/)
ASPECT = lambda n: (lambda im: im.size[0] / im.size[1])(Image.open(os.path.join(H, 'assets', 'posts', n + '.jpg')))
def POST(name, x, y, w, rot=0, at=0.8, **kw):
    d = {"type": "igpost", "src": "assets/posts/%s.jpg" % name, "avatar": LOGO, "sub": "Time Keeper", "x": x, "y": y, "w": w, "imgH": round(w / ASPECT(name)), "rot": rot}
    if at is not None: d["in"] = {"type": "drop", "at": at}
    d.update(kw); return d

SC = []
def S(n, minDur, theme, caption='', banner='', els=None, floor=False, sfx=None, silent=False, beds=None, voiceAt=0.15, **kw):
    """n = narration clip id in voice/clips.json, e.g. 1 or '2b' (0 = no narration)."""
    sc = {"theme": theme, "banner": banner, "floor": floor, "elements": els or []}
    if n:
        n = str(n); d = VO[n]['seconds']
        sc["dur"] = round(max(voiceAt + d + 0.6, minDur), 2)
        sc["captions"] = caption; sc["captionStart"] = voiceAt + 0.05; sc["captionEnd"] = voiceAt + d
        f = os.path.join(H, 'voice', VO[n]['file'])
        if os.path.exists(f) and not os.environ.get('NO_VOICE'): sc["voice"] = 'voice/' + VO[n]['file']; sc["voiceAt"] = voiceAt
    else:
        sc["dur"] = minDur
    if sfx: sc["sfx"] = sfx
    if silent: sc["silent"] = True
    if beds: sc["beds"] = beds
    sc.update(kw); SC.append(sc)

S(1, 4.6, 'tk-black', 'تايم كيبر… | ما بدأ كمحل ساعات.', silent=True, voiceAt=1.4, beds=[{"name": "watch_run", "from": 0, "to": 5, "gain": -18}],
  els=[{"type": "watch", "x": 360, "y": 600, "size": 660, "strap": False, "numerals": "arabic", "date": False, "scale": [[0, 1.75], [3.8, 1.0, "inOutCubic"]], "time": [10, 8, 40], "still": True}])
cas = HAVE['casual']
S('2a', 6.0, 'tk-ink', 'بدأ بثلاثة أصدقاء… | التقوا وهم يدرسون في أمريكا.', floor=cas,
  sfx=[{"at": 0.2, "name": "paper_tear", "gain": -14}, {"at": 2.4, "name": "plane", "gain": -16}],
  els=[MAP([[0, V(-98, 38.5, 58)], [2.0, V(-111, 36.5, 30), "inOutCubic"]], pins=[pin(BOU, 1.2), pin(LA, 2.4)], routes=[{"from": "bou", "to": "la", "at": 2.2, "dur": 1.2}],
           states=True, unfold={"at": 0.2, "dur": 1.2}, y=390 if cas else 580, h=560 if cas else 680)] + fig('casual', h=540, at=1.0))
S('2b', 3.8, 'tk-linen', 'في بولدر…', banner='BOULDER', floor=True, voiceAt=1.0, sfx=[{"at": 0.3, "name": "paper_place", "gain": -12}],
  els=boulder(FLOOR) + fig('casual', h=420, at=0.7))
S('2c', 3.8, 'tk-linen', 'ولوس أنجلوس.', banner='LOS ANGELES', floor=True, voiceAt=0.9, sfx=[{"at": 0.3, "name": "paper_place", "gain": -12}],
  els=los_angeles(FLOOR) + fig('casual', h=420, at=0.6))
kw_ = HAVE['kuwaiti']
S('3a', 4.0, 'tk-ink', 'وبعد الدراسة… | رجعوا الكويت.', banner='KUWAIT', sfx=[{"at": 0.6, "name": "plane", "gain": -14}],
  els=[MAP([[0, V(-60, 38, 150)], [2.6, V(48, 29.4, 30), "inOutCubic"]], pins=[pin(LA, 0), pin(KW, 2.8)], routes=[{"from": "la", "to": "kw", "at": 0.4, "dur": 2.2, "curve": .18}],
           highlight=[{"n": "Kuwait", "at": 2.6, "color": "#111111"}], y=590, h=860)])
S('3b', 4.8, 'tk-ink', 'والساعات… | دايماً حاضرة بقعداتهم.', floor=True, voiceAt=0.5, sfx=[{"at": 1.0, "name": "paper_place", "gain": -12}, {"at": 1.7, "name": "clasp", "gain": -12}],
  els=kuwait_dusk(FLOOR) + fig('kuwaiti', h=470, at=0.4) + [coffee_tray(360, FLOOR + 6, at=0.9)] + [
      {"type": "watch", "x": 438 + i * 50, "y": FLOOR - 40, "size": 64, "strap": False, "dialColor": ['#17171A', '#F1EEE6', '#B9BDC4'][i], "z": 41, "in": {"type": "pop", "at": 1.6 + i * 0.35}} for i in range(3)])
S(4, 7.0, 'tk-graphite', 'ولاحظوا شي… | المعلومات عن الساعات كثيرة، | بس أغلبها بالإنجليزي. | وبالعربي؟ | قليل.',
  sfx=[{"at": 1.0 + i * 0.55, "name": "paper_place", "gain": -13} for i in range(4)] + [{"at": 4.8, "name": "paper_place", "gain": -11}],
  els=[{"type": "text", "text": "ENGLISH", "x": 245, "y": 250, "size": 40, "font": "banner", "weight": 800, "color": "#F3F0E8", "ls": .12, "upper": False, "shadow": False, "in": {"type": "fade", "at": 0.8}},
       {"type": "text", "text": "عربي", "x": 590, "y": 700, "size": 40, "font": "banner", "weight": 800, "color": "#F3F0E8", "shadow": False, "in": {"type": "fade", "at": 4.5}}]
      + bookcase(245, FLOOR, rows=4, w=400, at=1.0, step=0.55) + arabic_shelf(590, FLOOR, at=4.6))
# "why don't we make it simple?" then the work (5b): writing, translating news, filming watches, interviews,
# until Time Keeper stands on its own. 5 + 5b together keep the 10.68 s the music drop was timed to.
S(5, 3.0, 'tk-ink', 'فقالوا… | ليش ما نبسطها؟', silent=True, floor=cas, sfx=[{"at": 1.5, "name": "pin", "gain": -10}],
  els=fig('casual', h=380, at=0.3) + [bulb(360, 430, 1.4, 3.2)])
steady = [dict(e, **{"in": None}) for e in fig('casual', h=380)]
S('5b', 7.61, 'tk-ink', 'فكتبوا… | وترجموا الأخبار… | وصوّروا الساعات… | وسوّوا مقابلات.', silent=True, floor=cas, transition='cut', voiceAt=0.1, captionClear=5.75,
  sfx=[{"at": 0.2, "name": "paper_place", "gain": -11}, {"at": 1.1, "name": "paper_slide", "gain": -11}, {"at": 1.8, "name": "paper_place", "gain": -11},
       {"at": 2.9, "name": "shutter", "gain": -8}, {"at": 3.4, "name": "shutter", "gain": -8}, {"at": 4.2, "name": "mic_tap", "gain": -10},
       {"at": 5.8, "name": "stamp", "gain": -7}, {"at": 6.3, "name": "paper_slide", "gain": -10}],
  els=steady + [notebook(300, 400, 0.05, 1.0), pen(220, 380, 470, 0.15, 1.0),
      {"type": "card", "x": 360, "y": 300, "w": 420, "h": 80, "label": "WATCH NEWS", "labelSize": 32, "color": "#F3F0E8", "rot": -2, "in": {"type": "drop", "at": 1.05, "dur": .4}, "out": {"at": 2.45, "type": "fade", "dur": .2}, "z": 32},
      {"type": "shape", "kind": "arrow", "x": 360, "y": 410, "w": 90, "h": 60, "color": "#C9A35F", "rot": 90, "in": {"type": "pop", "at": 1.45}, "out": {"at": 2.45, "type": "fade", "dur": .2}, "z": 32},
      {"type": "card", "x": 360, "y": 520, "w": 420, "h": 80, "label": "أخبار الساعات", "labelSize": 36, "color": "#F3F0E8", "rot": 2, "in": {"type": "flip", "at": 1.7, "dur": .4}, "out": {"at": 2.45, "type": "fade", "dur": .2}, "z": 32},
      camera_rig(190, 640, 2.5, 4.0), ring_light(600, 640, 2.55, 4.0),
      {"type": "watch", "x": 420, "y": 420, "size": 180, "strap": True, "dialColor": "#17171A", "in": {"type": "pop", "at": 2.6}, "out": {"at": 4.0, "type": "fade", "dur": .2}, "z": 31},
      {"type": "burst", "x": 420, "y": 420, "size": 260, "color": "#FFFFFF", "in": {"type": "pop", "at": 2.9, "dur": .2}, "out": {"at": 3.15, "type": "fade", "dur": .15}, "z": 29},
      {"type": "burst", "x": 420, "y": 420, "size": 260, "color": "#FFFFFF", "in": {"type": "pop", "at": 3.4, "dur": .2}, "out": {"at": 3.65, "type": "fade", "dur": .15}, "z": 29},
      {"type": "card", "x": 190, "y": 250, "w": 120, "h": 46, "style": "dark", "label": "● REC", "labelSize": 20, "ink": "#E8574B", "in": {"type": "pop", "at": 2.7}, "out": {"at": 4.0, "type": "fade", "dur": .2}, "idle": {"type": "pulse", "amp": .06, "speed": 1.5}, "z": 33},
      interview_set(360, 600, 4.05, 5.75),
      {"type": "card", "x": 360, "y": 330, "w": 260, "h": 60, "style": "dark", "label": "INTERVIEW", "labelSize": 24, "ink": "#EDE9E0", "in": {"type": "pop", "at": 4.3}, "out": {"at": 5.75, "type": "fade", "dur": .2}, "z": 33},
      {"type": "image", "x": 360, "y": 360, "w": 280, "h": 280, "src": LOGO, "pad": 14, "rot": -2, "in": {"type": "slam", "at": 5.8, "dur": 0.5}, "z": 40},
      {"type": "card", "x": 360, "y": 580, "w": 620, "h": 84, "style": "dark", "label": "أكبر منصة عربية للساعات", "labelSize": 38, "ink": "#F3F0E8", "in": {"type": "pop", "at": 6.3}, "z": 41}])
S(6, 5.5, 'tk-bone', 'وفي ٢٠١٨… | بدأ تايم كيبر. | بوست بعد بوست… | نشرح الساعات بالعربي.', banner='2018',
  sfx=[{"at": 0.8, "name": "paper_place", "gain": -11}, {"at": 1.8, "name": "paper_place", "gain": -11}, {"at": 2.8, "name": "paper_place", "gain": -11}],
  els=[POST('auction', x=205, y=520, w=330, rot=-4, at=0.8), POST('interview', x=515, y=600, w=330, rot=3, at=1.8),
       POST('reel', x=350, y=740, w=330, rot=-1, at=2.8, likeAt=4.2)])
S(7, 5.5, 'tk-graphite', 'والناس بدت تتابع… | وتسأل: | وين أحصل هالساعة؟', sfx=[{"at": 1.2, "name": "notif", "gain": -11}, {"at": 2.6, "name": "notif", "gain": -11}, {"at": 4.0, "name": "notif", "gain": -11}],
  els=[{"type": "image", "src": "assets/posts/profile.jpg", "x": 360, "y": 300, "w": 660, "h": round(660 / ASPECT('profile')), "pad": 10, "rot": -1.5, "in": {"type": "drop", "at": 0.3, "dur": 0.6}, "z": 20}] +
      [{"type": "notif", "x": 360 + (i - 1) * 14, "y": 600 + i * 150, "w": 620, "name": "timekeeperkw", "initial": "؟", "text": t, "size": 30, "in": {"type": "slideD", "at": 1.2 + i * 1.4, "from": 600}, "z": 30 + i}
       for i, t in enumerate(['وين أحصلها؟', 'تقدرون توفرونها؟', 'من وين نشتريها؟'])])
S(8, 4.5, 'tk-bone', 'فبدينا نوفر ساعات نحبها… | ونثق فيها.', silent=True, sfx=[{"at": 0.8, "name": "fold", "gain": -10}, {"at": 1.6, "name": "paper_place", "gain": -10}, {"at": 2.4, "name": "clasp", "gain": -10}],
  els=[{**POST('geraldcharles', x=360, y=560, w=420, at=None), "scale": [[0.4, 1], [1.4, 0.35, "inCubic"]], "rot": [[0.4, 0], [1.4, 8]], "out": {"at": 1.35, "type": "fade", "dur": 0.15}},
       {"type": "box", "x": 360, "y": 720, "w": 540, "h": 380, "lid": [[2.2, 0], [3.2, 1, "outBack"]], "in": {"type": "pop", "at": 1.4}},
       {"type": "watch", "x": 360, "y": 660, "size": 270, "strap": False, "numerals": "arabic", "in": {"type": "pop", "at": 3.0}, "z": 40}])
fo = HAVE['formal']
S(9, 5.0, 'tk-ink', 'وفي ٢٠١٩… | جاء البودكاست. | وصرنا نتكلم مع ناس | من قلب عالم الساعات.', banner='2019', floor=fo, sfx=[{"at": 0.6, "name": "mic_tap", "gain": -8}],
  els=[{"type": "mic", "x": 360, "y": 470 if fo else FLOOR, "size": 0.8 if fo else 1.1, "in": {"type": "drop", "at": 0.3}, "z": 30},
       {"type": "waves", "x": 360, "y": 300, "bars": 25, "h": 170, "color": "#F3F0E8", "level": [[1.0, 0], [1.6, 1]]},
       {"type": "card", "x": 610, "y": 205, "w": 150, "h": 50, "style": "dark", "label": "ON AIR", "labelSize": 22, "ink": "#EDE9E0", "rot": 3, "in": {"type": "pop", "at": 0.9}, "idle": {"type": "pulse", "amp": .04, "speed": 1.2}, "z": 40}] + fig('formal', h=520, at=1.2))
S('10a', 3.8, 'tk-ink', 'ووصلنا جنيف…', sfx=[{"at": 0.6, "name": "plane", "gain": -14}],
  els=[MAP([[0, V(48, 29.4, 30)], [1.2, V(26, 38, 70), "inOutCubic"], [3.0, V(10, 44, 26), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 2.8)], routes=[{"from": "kw", "to": "gva", "at": 0.6, "dur": 2.2, "curve": .14}],
           highlight=[{"n": "Kuwait", "color": "#111111"}, {"n": "Switzerland", "at": 3.0, "color": "#111111"}], y=590, h=860)])
S('10b', 4.4, 'tk-linen', 'قلب صناعة الساعات.', banner='GENEVA', floor=True, voiceAt=0.9, sfx=[{"at": 0.3, "name": "paper_place", "gain": -12}, {"at": 1.3, "name": "tick_pair", "gain": -12}],
  els=geneva(FLOOR) + fig('formal', x=500, h=330, at=0.5))
S(11, 5.5, 'tk-graphite', 'وفي ٢٠٢٢… | فتحنا صالة تايم كيبر. | مكان يجتمع فيه | محبين الساعات.', banner='2022', floor=fo,
  sfx=[{"at": 1.4, "name": "paper_place", "gain": -10}, {"at": 3.6, "name": "door_chime", "gain": -12}],
  els=[{"type": "door", "x": 360, "y": 560, "w": 340 if fo else 300, "h": 560 if fo else 540, "z": 5, "sign": "TIME KEEPER LOUNGE", "open": [[2.6, 0], [4.2, 1, "outBack"]], "in": {"type": "rise", "at": 0.5, "dur": 0.7}}] + fig('formal', h=520, at=3.4, z=20))
S(12, 4.4, 'tk-linen', 'وبعدها… | تايم غاليري.', floor=True, banner='TIME GALLERY', sfx=[{"at": 1.0, "name": "paper_place", "gain": -10}],
  els=[{"type": "photo", "src": "assets/ep3_timegallery_store.jpg", "x": 360, "y": 560, "w": 660, "aspect": 1.589, "label": "تايم غاليري", "rot": [[0, -8], [0.9, -2.5, "outBack"]], "in": {"type": "drop", "at": 0.5, "dur": 0.6}}])
S(13, 4.0, 'tk-bone', 'والأفنيوز.', floor=True, banner='THE AVENUES', sfx=[{"at": 0.6, "name": "paper_slide", "gain": -12}, {"at": 2.4, "name": "door_chime", "gain": -12}],
  els=[{"type": "photo", "src": "assets/avenues_store.jpg", "x": 360, "y": 560, "w": 430, "aspect": 0.5628, "rot": [[0, 6], [0.9, 1.5, "outBack"]], "in": {"type": "drop", "at": 0.3, "dur": 0.6}, "z": 5}]
      + fig('formal', h=360, at=1.4, z=20))
table = [{"type": "watch", "x": 360, "y": 400, "size": 560, "strap": False, "numerals": "arabic", "date": False, "opacity": .2, "behind": True, "still": True, "time": [10, 9, 0]},
         {"type": "card", "x": 360, "y": 905, "w": 640, "h": 36, "tex": "wood", "color": "#fff", "z": 20},
         {"type": "card", "x": 80, "y": 968, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}, {"type": "card", "x": 640, "y": 968, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}]
people = fig('kuwaiti', h=600, at=0.4, z=10) or [{"type": "puppet", "x": x, "y": 960, "size": 1.1, "top": t, "pose": p, "flip": f, "initial": ini}
         for x, t, p, f, ini in [(150, '#43464D', 'sitTalk', False, 'ع ر'), (360, '#6C7078', 'sit', False, 'م ي'), (570, '#8D9198', 'sit', True, 'ع ي')]]
S(14, 8.0, 'tk-bone', 'بس القصة ما بدأت بمحل… | ولا بخطة عمل. | بدأت بثلاثة أصدقاء… | يحبون الساعات.', floor=True,
  sfx=[{"at": 1.0, "name": "paper_place", "gain": -12}, {"at": 6.0, "name": "clasp", "gain": -11}],
  els=table + people + [{"type": "cup", "x": 170 + i * 190, "y": 892, "size": .6, "z": 25} for i in range(3)] + [
      {"type": "watch", "x": 255 + i * 105, "y": 888, "size": 110, "strap": False, "anchor": "b", "z": 25, "dialColor": ['#17171A', '#F1EEE6', '#B9BDC4'][i], "in": {"type": "pop", "at": 6.0 + i * 0.4}} for i in range(3)])
S(15, 4.5, 'tk-ink', 'والوقت… | كان مجرد البداية.', silent=True, transition='fade', sfx=[{"at": 3.6, "name": "tick_pair", "gain": -9}],
  els=[{"type": "image", "x": 360, "y": 560, "w": 320, "h": 320, "src": LOGO, "pad": 16, "rot": -2, "in": {"type": "pop", "at": 0.3, "dur": 0.8}}])
S(0, 2.5, 'tk-black', silent=True, transition='fade', sfx=[{"at": 0.8, "name": "tick_pair", "gain": -9}])
total = sum(s['dur'] for s in SC)
json.dump({"title": "قصة تايم كيبر", "width": 720, "height": 1280, "fps": 30, "floorY": FLOOR, "captionY": FLOOR + 38, "bannerY": 110, "maxWords": 4, "style": ST['style'], "themes": ST['themes'],
           "audio": {"autoSfx": True, "music": "renders/simple_score.wav", "musicGain": MUSIC_GAIN, "voiceGain": 0}, "scenes": SC}, open(os.path.join(H, 'simple.json'), 'w'), ensure_ascii=False, indent=1)
nv = sum(1 for s in SC if 'voice' in s)
print('simple.json  %d scenes  %.1fs  narration clips present: %d/15  figures: %s' % (len(SC), total, nv, ', '.join(k for k, v in HAVE.items() if v) or 'none yet'))

# ---- cover (Reel thumbnail): python3 simple.py && node render.mjs cover.json --still 1.6 -o renders/cover/
cover = {"theme": "tk-black", "banner": "", "floor": True, "dur": 2.0, "elements": [
    {"type": "watch", "x": 360, "y": 560, "size": 700, "strap": False, "numerals": "arabic", "date": False, "opacity": .14, "behind": True, "still": True, "time": [10, 9, 0]},
    {"type": "image", "x": 360, "y": 190, "w": 170, "h": 170, "src": LOGO, "pad": 10, "rot": -2},
    {"type": "text", "text": "قصة تايم كيبر", "x": 360, "y": 360, "size": 96, "font": "banner", "weight": 800, "color": "#F3F0E8", "shadow": False},
    {"type": "card", "x": 360, "y": 470, "w": 600, "h": 70, "label": "من ثلاثة أصدقاء… لأكبر منصة عربية للساعات", "labelSize": 28, "color": "#F3F0E8", "rot": -1.5}]
    + fig('kuwaiti', h=520, at=0)}
for e in cover["elements"]: e.pop("in", None)
json.dump({"title": "غلاف قصة تايم كيبر", "width": 720, "height": 1280, "fps": 30, "floorY": FLOOR, "captionY": FLOOR + 38, "style": ST['style'], "themes": ST['themes'],
           "audio": {"autoSfx": False}, "scenes": [cover]}, open(os.path.join(H, 'cover.json'), 'w'), ensure_ascii=False, indent=1)
