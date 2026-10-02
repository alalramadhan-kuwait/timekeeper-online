#!/usr/bin/env python3
"""ONE short film: the Time Keeper story in about 80 seconds. Only founder-confirmed facts, no placeholders.
   python3 simple.py && node ../../.claude/skills/paper-motion/scripts/render.mjs simple.json -o renders/time-keeper-story.mp4"""
import json, os
H = os.path.dirname(os.path.abspath(__file__)); ST = json.load(open(os.path.join(H, 'tk-style.json')))
LOGO = '../../public/icon-512.png'
V = lambda lon, lat, span: {"lon": lon, "lat": lat, "span": span}
BOU = dict(id='bou', lon=-105.27, lat=40.01, label='BOULDER'); SD = dict(id='sd', lon=-117.16, lat=32.72, label='SAN DIEGO')
KW = dict(id='kw', lon=47.98, lat=29.37, label='KUWAIT'); GVA = dict(id='gva', lon=6.14, lat=46.20, label='GENEVA')
pin = lambda p, at: dict(p, at=at)
def MAP(view, pins=None, routes=None, y=580, h=680, **kw):
    d = {"type": "map", "x": 360, "y": y, "w": 660, "h": h, "view": view, "sea": "#CCC6B7", "land": "#F4F1E8", "pins": pins or [], "routes": routes or []}; d.update(kw); return d
def pup(i, x, size=.85, **kw):
    top = ['#43464D', '#6C7078', '#8D9198'][i % 3]; d = {"type": "puppet", "x": x, "y": 960, "size": size, "top": top}; d.update(kw); return d
def table(w=560):
    return [{"type": "watch", "x": 360, "y": 430, "size": 440, "strap": False, "numerals": "arabic", "date": False, "opacity": .2, "behind": True, "still": True, "time": [10, 9, 0]},
            {"type": "card", "x": 360, "y": 845, "w": w, "h": 34, "tex": "wood", "color": "#fff", "z": 20},
            {"type": "card", "x": 360 - w / 2 + 40, "y": 907, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19},
            {"type": "card", "x": 360 + w / 2 - 40, "y": 907, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}]
SC = []
def S(dur, theme, vo='', banner='', els=None, floor=False, sfx=None, silent=False, beds=None, cap=None, **kw):
    sc = {"dur": dur, "theme": theme, "banner": banner, "floor": floor, "elements": els or []}
    if vo: sc["captions"] = cap if cap is not None else vo.replace('… ', '… | ').replace('. ', '. | ')
    if sfx: sc["sfx"] = sfx
    if silent: sc["silent"] = True
    if beds: sc["beds"] = beds
    sc.update(kw); SC.append(sc)

S(4.2, 'tk-black', 'تايم كيبر… ما بدأ كمحل ساعات.', captionStart=1.6, silent=True, beds=[{"name": "watch_run", "from": 0, "to": 4.2, "gain": -14}],
  els=[{"type": "watch", "x": 360, "y": 640, "size": 560, "strap": False, "numerals": "arabic", "date": False, "scale": [[0, 1.75], [3.8, 1.0, "inOutCubic"]], "time": [10, 8, 40], "still": True}])
S(6.0, 'tk-ink', 'ثلاثة أصدقاء… التقوا وهم يدرسون في أمريكا.', sfx=[{"at": 0.2, "name": "paper_tear", "gain": -12}, {"at": 2.2, "name": "plane", "gain": -14}],
  els=[MAP([[0, V(-98, 38.5, 58)], [2.0, V(-111, 36.5, 30), "inOutCubic"]], pins=[pin(BOU, 1.2), pin(SD, 2.4)], routes=[{"from": "bou", "to": "sd", "at": 2.2, "dur": 1.2}], states=True, unfold={"at": 0.2, "dur": 1.2})])
S(5.0, 'tk-ink', 'ورجعوا الكويت.', banner='KUWAIT', sfx=[{"at": 0.9, "name": "plane", "gain": -12}],
  els=[MAP([[0, V(-60, 38, 150)], [2.6, V(48, 29.4, 30), "inOutCubic"]], pins=[pin(KW, 2.8)], highlight=[{"n": "Kuwait", "at": 2.6, "color": "#111111"}], y=560, h=620),
       {"type": "towers", "x": 560, "y": 960, "h": 330, "in": {"type": "rise", "at": 3.0, "dur": 0.8}, "z": 30}])
S(7.0, 'tk-graphite', 'لاحظوا إن أغلب المعلومات عن الساعات بالإنجليزي. وبالعربي… قليل.',
  sfx=[{"at": 2.0 + i * 0.45, "name": "paper_place", "gain": -13} for i in range(6)],
  els=[{"type": "text", "text": "ENGLISH", "x": 215, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "ls": .12, "upper": False, "shadow": False, "in": {"type": "fade", "at": 1.6}},
       {"type": "text", "text": "عربي", "x": 560, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "shadow": False, "in": {"type": "fade", "at": 1.6}}] + [
      {"type": "card", "x": 215 + (i % 2) * 14 - 7, "y": 880 - i * 62, "w": 270, "h": 56, "label": ["WATCH GUIDE", "MOVEMENTS", "REVIEWS", "HISTORY", "BUYING TIPS", "BRAND STORIES"][i], "labelSize": 20, "color": "#F3F0E8", "rot": ((i * 37) % 7 - 3) * 0.8, "in": {"type": "drop", "at": 2.0 + i * 0.45, "dur": 0.45}} for i in range(6)] + [
      {"type": "card", "x": 560, "y": 880, "w": 130, "h": 46, "label": "بالعربي", "labelSize": 18, "color": "#F3F0E8", "rot": 2, "in": {"type": "drop", "at": 5.2, "dur": 0.45}}])
S(4.5, 'tk-ink', 'فقرروا… يبسطونها.', silent=True, captionStart=0.4,
  els=[{"type": "image", "x": 360, "y": 560, "w": 210, "h": 210, "src": LOGO, "pad": 12, "rot": -2, "in": {"type": "pop", "at": 1.6, "dur": 0.7}}])
S(5.5, 'tk-bone', '٢٠١٨… بدأ تايم كيبر. نشرح الساعات بالعربي.', banner='2018', sfx=[{"at": 0.8, "name": "paper_place", "gain": -9}, {"at": 1.8, "name": "paper_place", "gain": -9}, {"at": 2.8, "name": "paper_place", "gain": -9}],
  els=[{"type": "igpost", "empty": True, "avatar": LOGO, "x": 200, "y": 600, "w": 300, "rot": -4, "in": {"type": "drop", "at": 0.8}},
       {"type": "igpost", "empty": True, "avatar": LOGO, "x": 500, "y": 680, "w": 300, "rot": 3, "in": {"type": "drop", "at": 1.8}},
       {"type": "igpost", "empty": True, "avatar": LOGO, "x": 330, "y": 800, "w": 300, "rot": -1, "likeAt": 3.6, "in": {"type": "drop", "at": 2.8}}])
S(6.0, 'tk-graphite', 'والناس بدت تسأل… وين أحصلها؟', sfx=[{"at": 1.4, "name": "notif", "gain": -9}, {"at": 3.0, "name": "notif", "gain": -9}, {"at": 4.6, "name": "notif", "gain": -9}],
  els=[{"type": "notif", "x": 360 + (i - 1) * 14, "y": 420 + i * 175, "w": 560, "name": "timekeeperkw", "initial": "؟", "text": t, "size": 30, "in": {"type": "slideD", "at": 1.4 + i * 1.6, "from": 600}, "z": 30 + i}
       for i, t in enumerate(['وين أحصلها؟', 'تقدرون توفرونها؟', 'من وين نشتريها؟'])])
S(4.5, 'tk-bone', 'فصرنا نوفر ساعات نحبها.', silent=True, sfx=[{"at": 0.8, "name": "fold", "gain": -8}, {"at": 1.6, "name": "paper_place", "gain": -8}, {"at": 2.4, "name": "clasp", "gain": -8}],
  els=[{"type": "igpost", "empty": True, "avatar": LOGO, "x": 360, "y": 600, "w": 340, "scale": [[0.4, 1], [1.4, 0.35, "inCubic"]], "rot": [[0.4, 0], [1.4, 8]], "out": {"at": 1.35, "type": "fade", "dur": 0.15}},
       {"type": "box", "x": 360, "y": 680, "w": 340, "h": 240, "lid": [[2.2, 0], [3.2, 1, "outBack"]], "in": {"type": "pop", "at": 1.4}},
       {"type": "watch", "x": 360, "y": 650, "size": 150, "strap": False, "numerals": "arabic", "in": {"type": "pop", "at": 3.0}, "z": 40}])
S(5.0, 'tk-ink', '٢٠١٩… جاء البودكاست.', banner='2019', sfx=[{"at": 0.6, "name": "mic_tap", "gain": -6}],
  els=[{"type": "mic", "x": 360, "y": 960, "size": 1.1, "in": {"type": "drop", "at": 0.3}, "z": 30}, {"type": "waves", "x": 360, "y": 450, "bars": 25, "h": 150, "color": "#F3F0E8", "level": [[1.0, 0], [1.6, 1]]}])
S(5.0, 'tk-ink', 'وسافرنا… لجنيف، بسويسرا.', banner='GENEVA', sfx=[{"at": 0.6, "name": "plane", "gain": -12}],
  els=[MAP([[0, V(48, 29.4, 30)], [1.2, V(26, 38, 70), "inOutCubic"], [3.0, V(10, 44, 26), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 2.8)], routes=[{"from": "kw", "to": "gva", "at": 0.6, "dur": 2.2, "curve": .14}],
           highlight=[{"n": "Kuwait", "color": "#111111"}, {"n": "Switzerland", "at": 3.0, "color": "#111111"}], y=580, h=640)])
S(5.5, 'tk-graphite', '٢٠٢٢… فتحنا صالة تايم كيبر. بموعد… وفيها ناس.', banner='2022', sfx=[{"at": 1.4, "name": "paper_place", "gain": -8}, {"at": 3.6, "name": "door_chime", "gain": -10}],
  els=[{"type": "door", "x": 360, "y": 620, "w": 300, "h": 540, "sign": "TIME KEEPER LOUNGE", "open": [[2.6, 0], [4.2, 1, "outBack"]], "in": {"type": "rise", "at": 0.5, "dur": 0.7}}])
S(5.0, 'tk-linen', 'وبعدها… تايم غاليري.', floor=True, banner='TIME GALLERY', sfx=[{"at": 1.0, "name": "paper_place", "gain": -8}],
  els=[{"type": "photo", "src": "assets/ep3_timegallery_store.jpg", "x": 360, "y": 560, "w": 560, "aspect": 1.589, "label": "تايم غاليري", "rot": [[0, -8], [0.9, -2.5, "outBack"]], "in": {"type": "drop", "at": 0.5, "dur": 0.6}}])
S(4.5, 'tk-bone', 'والأفنيوز.', floor=True, banner='THE AVENUES', sfx=[{"at": 0.6, "name": "paper_slide", "gain": -10}, {"at": 2.6, "name": "door_chime", "gain": -10}],
  els=[{"type": "building", "x": 360, "y": 960, "w": 380, "h": 600, "color": "#D2CABA", "cols": 3, "rows": 7, "lit": .25, "glass": "#C9CDD2", "litColor": "#EFE8D5", "in": {"type": "rise", "at": 0.3, "dur": 1.0}},
       {"type": "card", "x": 360, "y": 410, "w": 280, "h": 58, "style": "dark", "label": "TIME KEEPER", "labelSize": 22, "ink": "#EDE9E0", "in": {"type": "pop", "at": 1.4}, "z": 40}])
S(8.0, 'tk-bone', 'القصة ما بدأت بمحل… ولا بخطة عمل. بدأت بثلاثة أصدقاء… يحبون الساعات.', floor=True,
  sfx=[{"at": 1.0, "name": "paper_place", "gain": -10}, {"at": 5.0, "name": "clasp", "gain": -9}],
  els=table() + [pup(0, 150, 1.1, pose='sitTalk', talk=True, initial="ع ر"), pup(1, 360, 1.1, pose='sit', initial="م ي"), pup(2, 570, 1.1, pose='sit', flip=True, initial="ع ي")] + [
      {"type": "cup", "x": 200 + i * 160, "y": 832, "size": .6, "z": 25} for i in range(3)] + [
      {"type": "watch", "x": 270 + i * 90, "y": 828, "size": 96, "strap": False, "anchor": "b", "z": 25, "dialColor": ['#17171A', '#F1EEE6', '#B9BDC4'][i], "in": {"type": "pop", "at": 5.0 + i * 0.5}} for i in range(3)])
S(4.5, 'tk-ink', 'والوقت… كان مجرد البداية.', silent=True, tr='fade', sfx=[{"at": 3.4, "name": "tick_pair", "gain": -8}], captionStart=0.4,
  els=[{"type": "image", "x": 360, "y": 560, "w": 230, "h": 230, "src": LOGO, "pad": 14, "rot": -2, "in": {"type": "pop", "at": 0.3, "dur": 0.8}}])
S(2.5, 'tk-black', silent=True, tr='fade', sfx=[{"at": 0.8, "name": "tick_pair", "gain": -8}])
total = sum(s['dur'] for s in SC)
json.dump({"title": "قصة تايم كيبر", "width": 720, "height": 1280, "fps": 30, "maxWords": 4, "style": ST['style'], "themes": ST['themes'],
           "audio": {"autoSfx": True, "music": "renders/simple_score.wav", "musicGain": -17}, "scenes": SC}, open(os.path.join(H, 'simple.json'), 'w'), ensure_ascii=False, indent=1)
print('simple.json  %d scenes  %.1fs' % (len(SC), total))
