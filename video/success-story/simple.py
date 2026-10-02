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
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); ST = json.load(open(os.path.join(H, 'tk-style.json')))
VO = {l['n']: l for l in json.load(open(os.path.join(H, 'voice', 'manifest.json')))['lines']}
LOGO = '../../public/icon-512.png'
V = lambda lon, lat, span: {"lon": lon, "lat": lat, "span": span}
BOU = dict(id='bou', lon=-105.27, lat=40.01, label='BOULDER'); SD = dict(id='sd', lon=-117.16, lat=32.72, label='SAN DIEGO')
KW = dict(id='kw', lon=47.98, lat=29.37, label='KUWAIT'); GVA = dict(id='gva', lon=6.14, lat=46.20, label='GENEVA')
pin = lambda p, at: dict(p, at=at)
def MAP(view, pins=None, routes=None, y=580, h=680, **kw):
    d = {"type": "map", "x": 360, "y": y, "w": 660, "h": h, "view": view, "sea": "#CCC6B7", "land": "#F4F1E8", "pins": pins or [], "routes": routes or []}; d.update(kw); return d

# ---- paper-cut figures --------------------------------------------------------------------------------------------
FIGDIR = os.path.join(H, 'assets', 'figures')
PEOPLE = ['ali-alramadhan', 'mohammad-alyousifi', 'ali-alyousifi']   # left to right
def fig(outfit, x=360, h=340, at=0.5, z=12):
    """Paper-cut figures for one outfit: a group PNG <outfit>.png, or one PNG per founder <person>_<outfit>.png."""
    def one(rel, xx, delay, zz, ph):
        w, hh = Image.open(os.path.join(H, rel)).size
        return {"type": "cutout", "src": rel, "x": xx, "y": 960, "h": h, "aspect": w / hh, "z": zz, "edge": 0,
                "in": {"type": "rise", "at": at + delay}, "idle": {"type": "bob", "amp": 2, "speed": .5, "phase": ph}}
    if os.path.exists(os.path.join(FIGDIR, outfit + '.png')):
        return [one('assets/figures/%s.png' % outfit, x, 0, z, 0)]
    have = [p for p in PEOPLE if os.path.exists(os.path.join(FIGDIR, '%s_%s.png' % (p, outfit)))]
    gap = h * 0.46
    offs = {1: [0], 2: [-gap / 2, gap / 2], 3: [-gap, 0, gap]}.get(len(have), [])
    return [one('assets/figures/%s_%s.png' % (p, outfit), x + o, i * 0.2, z + (1 if o == 0 else 0), i * .3) for i, (p, o) in enumerate(zip(have, offs))]
HAVE = {o: bool(fig(o)) for o in ('casual', 'formal', 'kuwaiti')}

# Real Time Keeper posts (screenshots cropped by hand, git-ignored under assets/posts/)
ASPECT = lambda n: (lambda im: im.size[0] / im.size[1])(Image.open(os.path.join(H, 'assets', 'posts', n + '.jpg')))
def POST(name, x, y, w, rot=0, at=0.8, **kw):
    d = {"type": "igpost", "src": "assets/posts/%s.jpg" % name, "avatar": LOGO, "sub": "Time Keeper", "x": x, "y": y, "w": w, "imgH": round(w / ASPECT(name)), "rot": rot}
    if at is not None: d["in"] = {"type": "drop", "at": at}
    d.update(kw); return d

SC = []
def S(n, minDur, theme, caption='', banner='', els=None, floor=False, sfx=None, silent=False, beds=None, voiceAt=0.15, **kw):
    """n = narration line number in voice/manifest.json (0 = no narration)."""
    sc = {"theme": theme, "banner": banner, "floor": floor, "elements": els or []}
    if n:
        d = VO[n]['seconds']
        sc["dur"] = round(max(voiceAt + d + 0.6, minDur), 2)
        sc["captions"] = caption; sc["captionStart"] = voiceAt + 0.05; sc["captionEnd"] = voiceAt + d
        f = os.path.join(H, 'voice', VO[n]['file'])
        if os.path.exists(f): sc["voice"] = 'voice/' + VO[n]['file']; sc["voiceAt"] = voiceAt
    else:
        sc["dur"] = minDur
    if sfx: sc["sfx"] = sfx
    if silent: sc["silent"] = True
    if beds: sc["beds"] = beds
    sc.update(kw); SC.append(sc)

S(1, 4.6, 'tk-black', 'تايم كيبر… | ما بدأ كمحل ساعات.', silent=True, voiceAt=1.4, beds=[{"name": "watch_run", "from": 0, "to": 5, "gain": -18}],
  els=[{"type": "watch", "x": 360, "y": 640, "size": 560, "strap": False, "numerals": "arabic", "date": False, "scale": [[0, 1.75], [3.8, 1.0, "inOutCubic"]], "time": [10, 8, 40], "still": True}])
cas = HAVE['casual']
S(2, 6.0, 'tk-ink', 'بدأ بثلاثة أصدقاء… | التقوا وهم يدرسون في أمريكا. | في بولدر… | وسان دييغو.', floor=cas,
  sfx=[{"at": 0.2, "name": "paper_tear", "gain": -14}, {"at": 2.4, "name": "plane", "gain": -16}],
  els=[MAP([[0, V(-98, 38.5, 58)], [2.0, V(-111, 36.5, 30), "inOutCubic"]], pins=[pin(BOU, 1.2), pin(SD, 2.4)], routes=[{"from": "bou", "to": "sd", "at": 2.2, "dur": 1.2}],
           states=True, unfold={"at": 0.2, "dur": 1.2}, y=450 if cas else 580, h=460 if cas else 680)] + fig('casual', at=1.0))
kw_ = HAVE['kuwaiti']
S(3, 5.0, 'tk-ink', 'وبعد الدراسة… | رجعوا الكويت. | والساعات، دايماً حاضرة بجلساتهم.', banner='KUWAIT', floor=kw_, sfx=[{"at": 0.9, "name": "plane", "gain": -14}],
  els=[MAP([[0, V(-60, 38, 150)], [2.6, V(48, 29.4, 30), "inOutCubic"]], pins=[pin(KW, 2.8)], highlight=[{"n": "Kuwait", "at": 2.6, "color": "#111111"}], y=470 if kw_ else 560, h=460 if kw_ else 620),
       {"type": "towers", "x": 610 if kw_ else 560, "y": 960, "h": 300 if kw_ else 330, "in": {"type": "rise", "at": 3.0, "dur": 0.8}, "z": 30}] + fig('kuwaiti', x=300, at=3.4))
S(4, 7.0, 'tk-graphite', 'ولاحظوا شي… | المعلومات عن الساعات كثيرة، | بس أغلبها بالإنجليزي. | وبالعربي؟ | قليل.',
  sfx=[{"at": 2.0 + i * 0.45, "name": "paper_place", "gain": -15} for i in range(6)],
  els=[{"type": "text", "text": "ENGLISH", "x": 215, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "ls": .12, "upper": False, "shadow": False, "in": {"type": "fade", "at": 1.6}},
       {"type": "text", "text": "عربي", "x": 560, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "shadow": False, "in": {"type": "fade", "at": 1.6}}] + [
      {"type": "card", "x": 215 + (i % 2) * 14 - 7, "y": 880 - i * 62, "w": 270, "h": 56, "label": ["WATCH GUIDE", "MOVEMENTS", "REVIEWS", "HISTORY", "BUYING TIPS", "BRAND STORIES"][i], "labelSize": 20, "color": "#F3F0E8", "rot": ((i * 37) % 7 - 3) * 0.8, "in": {"type": "drop", "at": 2.0 + i * 0.45, "dur": 0.45}} for i in range(6)] + [
      {"type": "card", "x": 560, "y": 880, "w": 130, "h": 46, "label": "بالعربي", "labelSize": 18, "color": "#F3F0E8", "rot": 2, "in": {"type": "drop", "at": 5.6, "dur": 0.45}}])
S(5, 4.2, 'tk-ink', 'فقالوا… | ليش ما نبسطها؟', silent=True,
  els=[{"type": "image", "x": 360, "y": 560, "w": 210, "h": 210, "src": LOGO, "pad": 12, "rot": -2, "in": {"type": "pop", "at": 2.0, "dur": 0.7}}])
S(6, 5.5, 'tk-bone', 'وفي ٢٠١٨… | بدأ تايم كيبر. | بوست بعد بوست… | نشرح الساعات بالعربي.', banner='2018',
  sfx=[{"at": 0.8, "name": "paper_place", "gain": -11}, {"at": 1.8, "name": "paper_place", "gain": -11}, {"at": 2.8, "name": "paper_place", "gain": -11}],
  els=[POST('auction', x=200, y=560, w=290, rot=-4, at=0.8), POST('interview', x=510, y=640, w=290, rot=3, at=1.8),
       POST('reel', x=345, y=760, w=290, rot=-1, at=2.8, likeAt=4.2)])
S(7, 5.5, 'tk-graphite', 'والناس بدت تتابع… | وتسأل: | وين أحصل هالساعة؟', sfx=[{"at": 1.2, "name": "notif", "gain": -11}, {"at": 2.6, "name": "notif", "gain": -11}, {"at": 4.0, "name": "notif", "gain": -11}],
  els=[{"type": "image", "src": "assets/posts/profile.jpg", "x": 360, "y": 330, "w": 600, "h": round(600 / ASPECT('profile')), "pad": 10, "rot": -1.5, "in": {"type": "drop", "at": 0.3, "dur": 0.6}, "z": 20}] +
      [{"type": "notif", "x": 360 + (i - 1) * 14, "y": 590 + i * 135, "w": 560, "name": "timekeeperkw", "initial": "؟", "text": t, "size": 30, "in": {"type": "slideD", "at": 1.2 + i * 1.4, "from": 600}, "z": 30 + i}
       for i, t in enumerate(['وين أحصلها؟', 'تقدرون توفرونها؟', 'من وين نشتريها؟'])])
S(8, 4.5, 'tk-bone', 'فبدينا نوفر ساعات نحبها… | ونثق فيها.', silent=True, sfx=[{"at": 0.8, "name": "fold", "gain": -10}, {"at": 1.6, "name": "paper_place", "gain": -10}, {"at": 2.4, "name": "clasp", "gain": -10}],
  els=[{**POST('geraldcharles', x=360, y=600, w=340, at=None), "scale": [[0.4, 1], [1.4, 0.35, "inCubic"]], "rot": [[0.4, 0], [1.4, 8]], "out": {"at": 1.35, "type": "fade", "dur": 0.15}},
       {"type": "box", "x": 360, "y": 680, "w": 340, "h": 240, "lid": [[2.2, 0], [3.2, 1, "outBack"]], "in": {"type": "pop", "at": 1.4}},
       {"type": "watch", "x": 360, "y": 650, "size": 150, "strap": False, "numerals": "arabic", "in": {"type": "pop", "at": 3.0}, "z": 40}])
fo = HAVE['formal']
S(9, 5.0, 'tk-ink', 'وفي ٢٠١٩… | جاء البودكاست. | وصرنا نتكلم مع ناس | من قلب عالم الساعات.', banner='2019', floor=fo, sfx=[{"at": 0.6, "name": "mic_tap", "gain": -8}],
  els=[{"type": "mic", "x": 520 if fo else 360, "y": 960, "size": 1.0 if fo else 1.1, "in": {"type": "drop", "at": 0.3}, "z": 30},
       {"type": "waves", "x": 360, "y": 430, "bars": 25, "h": 150, "color": "#F3F0E8", "level": [[1.0, 0], [1.6, 1]]}] + fig('formal', x=250, at=1.2))
S(10, 5.0, 'tk-ink', 'ووصلنا جنيف… | قلب صناعة الساعات.', banner='GENEVA', floor=fo, sfx=[{"at": 0.6, "name": "plane", "gain": -14}],
  els=[MAP([[0, V(48, 29.4, 30)], [1.2, V(26, 38, 70), "inOutCubic"], [3.0, V(10, 44, 26), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 2.8)], routes=[{"from": "kw", "to": "gva", "at": 0.6, "dur": 2.2, "curve": .14}],
           highlight=[{"n": "Kuwait", "color": "#111111"}, {"n": "Switzerland", "at": 3.0, "color": "#111111"}], y=450 if fo else 580, h=460 if fo else 640)] + fig('formal', at=2.6))
S(11, 5.5, 'tk-graphite', 'وفي ٢٠٢٢… | فتحنا صالة تايم كيبر. | مكان يجتمع فيه | محبين الساعات.', banner='2022', floor=fo,
  sfx=[{"at": 1.4, "name": "paper_place", "gain": -10}, {"at": 3.6, "name": "door_chime", "gain": -12}],
  els=[{"type": "door", "x": 535 if fo else 360, "y": 620 if fo else 620, "w": 220 if fo else 300, "h": 420 if fo else 540, "sign": "TIME KEEPER LOUNGE", "open": [[2.6, 0], [4.2, 1, "outBack"]], "in": {"type": "rise", "at": 0.5, "dur": 0.7}}] + fig('formal', x=215, h=280, at=3.4))
S(12, 4.4, 'tk-linen', 'وبعدها… | تايم غاليري.', floor=True, banner='TIME GALLERY', sfx=[{"at": 1.0, "name": "paper_place", "gain": -10}],
  els=[{"type": "photo", "src": "assets/ep3_timegallery_store.jpg", "x": 360, "y": 560, "w": 560, "aspect": 1.589, "label": "تايم غاليري", "rot": [[0, -8], [0.9, -2.5, "outBack"]], "in": {"type": "drop", "at": 0.5, "dur": 0.6}}])
S(13, 4.0, 'tk-bone', 'والأفنيوز.', floor=True, banner='THE AVENUES', sfx=[{"at": 0.6, "name": "paper_slide", "gain": -12}, {"at": 2.4, "name": "door_chime", "gain": -12}],
  els=[{"type": "building", "x": 525 if fo else 360, "y": 960, "w": 290 if fo else 380, "h": 600, "color": "#D2CABA", "cols": 3, "rows": 7, "lit": .25, "glass": "#C9CDD2", "litColor": "#EFE8D5", "in": {"type": "rise", "at": 0.3, "dur": 1.0}},
       {"type": "card", "x": 525 if fo else 360, "y": 410, "w": 250, "h": 58, "style": "dark", "label": "TIME KEEPER", "labelSize": 22, "ink": "#EDE9E0", "in": {"type": "pop", "at": 1.4}, "z": 40}] + fig('formal', x=205, h=280, at=1.8))
table = [{"type": "watch", "x": 360, "y": 430, "size": 440, "strap": False, "numerals": "arabic", "date": False, "opacity": .2, "behind": True, "still": True, "time": [10, 9, 0]},
         {"type": "card", "x": 360, "y": 845, "w": 560, "h": 34, "tex": "wood", "color": "#fff", "z": 20},
         {"type": "card", "x": 120, "y": 907, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}, {"type": "card", "x": 600, "y": 907, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}]
people = fig('kuwaiti', h=440, at=0.4, z=10) or [{"type": "puppet", "x": x, "y": 960, "size": 1.1, "top": t, "pose": p, "flip": f, "initial": ini}
         for x, t, p, f, ini in [(150, '#43464D', 'sitTalk', False, 'ع ر'), (360, '#6C7078', 'sit', False, 'م ي'), (570, '#8D9198', 'sit', True, 'ع ي')]]
S(14, 8.0, 'tk-bone', 'بس القصة ما بدأت بمحل… | ولا بخطة عمل. | بدأت بثلاثة أصدقاء… | يحبون الساعات.', floor=True,
  sfx=[{"at": 1.0, "name": "paper_place", "gain": -12}, {"at": 6.0, "name": "clasp", "gain": -11}],
  els=table + people + [{"type": "cup", "x": 200 + i * 160, "y": 832, "size": .6, "z": 25} for i in range(3)] + [
      {"type": "watch", "x": 270 + i * 90, "y": 828, "size": 96, "strap": False, "anchor": "b", "z": 25, "dialColor": ['#17171A', '#F1EEE6', '#B9BDC4'][i], "in": {"type": "pop", "at": 6.0 + i * 0.4}} for i in range(3)])
S(15, 4.5, 'tk-ink', 'والوقت… | كان مجرد البداية.', silent=True, transition='fade', sfx=[{"at": 3.6, "name": "tick_pair", "gain": -9}],
  els=[{"type": "image", "x": 360, "y": 560, "w": 230, "h": 230, "src": LOGO, "pad": 14, "rot": -2, "in": {"type": "pop", "at": 0.3, "dur": 0.8}}])
S(0, 2.5, 'tk-black', silent=True, transition='fade', sfx=[{"at": 0.8, "name": "tick_pair", "gain": -9}])
total = sum(s['dur'] for s in SC)
json.dump({"title": "قصة تايم كيبر", "width": 720, "height": 1280, "fps": 30, "maxWords": 4, "style": ST['style'], "themes": ST['themes'],
           "audio": {"autoSfx": True, "music": "renders/simple_score.wav", "musicGain": -24, "voiceGain": 2}, "scenes": SC}, open(os.path.join(H, 'simple.json'), 'w'), ensure_ascii=False, indent=1)
nv = sum(1 for s in SC if 'voice' in s)
print('simple.json  %d scenes  %.1fs  narration clips present: %d/15  figures: %s' % (len(SC), total, nv, ', '.join(k for k, v in HAVE.items() if v) or 'none yet'))
