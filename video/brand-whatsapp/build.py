"""Storyboard for the team video announcing DSR 3.8.0: Customers by brand, and WhatsApp to a brand's customers.
Hook: a question from the floor ("a new Dennison delivery arrived... who do we tell?"), in frame 1.
Narration: OmniVoice (k2-fsa/OmniVoice, Gulf Arabic), the same cloned narrator as video/store-update; every scene
is timed by its clip (voice/sNN.wav).
Screens are the real DSR app (v3.8.0) run locally with masked data: brand counts and the Dennison amounts and dates
are the owner's real figures on 1 Nov 2026; customer names and numbers are replaced ("عميل ١", 0000 0001).
Usage: python3 build.py  ->  story.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'brand'))
from tk_endcard import endcard  # noqa: E402

STYLE = json.load(open(os.path.join(HERE, '..', 'success-story', 'tk-style.json')))
YELLOW, INK, CREAM, RED, GREEN, WA = '#F9BE2A', '#111111', '#F3F0E8', '#B3261E', '#2E7D4F', '#1F9D55'
SHOT_W, SHOT_H = 1170, 1992          # phone screenshots: 390 x 664 viewport at 3x
CREDIT = 'الراوي: صوت ذكاء اصطناعي (OmniVoice) · أسماء العملاء مخفية'


def phone(src, x=360, y=600, w=330, **kw):
    h = round((w - 24) * SHOT_H / SHOT_W + 28)
    return dict({"type": "phone", "src": src, "w": w, "h": h, "x": x, "y": y}, **kw)


def txt(t, x, y, size=44, color=INK, **kw):
    return dict({"type": "text", "text": t, "x": x, "y": y, "size": size, "color": color, "font": "banner"}, **kw)


def arrow(x, y, rot=180, at=1.0, color=RED):
    return {"type": "shape", "kind": "arrow", "w": 100, "h": 60, "color": color, "x": x, "y": y, "rot": rot,
            "in": {"type": "pop", "at": at}, "idle": {"type": "bob", "amp": 5}}


def v(n):
    return f"voice/s{n:02d}.wav"


scenes = []

# 1 HOOK: the question from the floor, readable in frame 1
scenes.append({"id": "s01", "voice": v(1), "theme": "tk-bone", "banner": "وصلت Dennison… منو نبلغ؟", "transition": "cut", "elements": [
    {"type": "card", "w": 420, "h": 250, "x": 360, "y": 520, "rot": -3, "tex": "card", "edge": "cut", "tape": True,
     "header": "شحنة جديدة", "headerColor": INK, "headerInk": CREAM, "headerSize": 40, "label": "Dennison", "titleSize": 64},
    {"type": "burst", "size": 210, "text": "؟", "color": YELLOW, "x": 560, "y": 760, "idle": "pulse"},
    {"type": "bubble", "text": "منو اشترى Dennison قبل؟", "w": 380, "h": 96, "x": 300, "y": 820, "size": 32, "tail": "l",
     "in": {"type": "pop", "at": 1.0}},
  ]})

# 2 THE BRAND PICKER: brands with how many customers bought each
scenes.append({"id": "s02", "voice": v(2), "theme": "tk-linen", "banner": "اختار الماركة", "transition": "slide", "elements": [
    phone("assets/1-picker.png", 360, 620, 400, **{"in": {"type": "rise", "at": 0.1}}),
    arrow(640, 772, at=1.6),
  ]})

# 3 ARABIC SEARCH: type it in Arabic, the brand comes up
scenes.append({"id": "s03", "voice": v(3), "theme": "tk-bone", "banner": "أو اكتبها بالعربي", "transition": "slide",
  "camera": {"zoom": [[0, 1], [0.8, 1], [1.8, 1.55, "inOutCubic"]], "y": [[0.8, 620], [1.8, 455, "inOutCubic"]], "x": [[0.8, 360]]},
  "floor": False, "elements": [
    phone("assets/2-search.png", 360, 620, 400),
    {"type": "sparkles", "count": 10, "radius": 120, "color": YELLOW, "at": 1.9, "x": 360, "y": 470, "depth": 1},
  ]})

# 4 THE LIST: 654 customers bought Dennison, biggest buyers first
scenes.append({"id": "s04", "voice": v(4), "theme": "tk-linen", "banner": "654 عميل اشتروا Dennison", "transition": "slide", "elements": [
    phone("assets/3-list.png", 250, [[0, 680], [1.0, 620, "outCubic"]], 330, rot=-3),
    {"type": "burst", "size": 200, "text": "654", "color": YELLOW, "x": 555, "y": 470, "in": {"type": "pop", "at": 0.6}, "idle": "pulse"},
    txt("عميل", 555, 610, 40, INK, **{"in": {"type": "pop", "at": 1.0}}),
    txt("226,244 د.ك", 560, 680, 30, "#333", **{"in": {"type": "fade", "at": 1.4}}),
    txt("على Dennison", 560, 722, 26, "#555", **{"in": {"type": "fade", "at": 1.4}}),
  ]})

# 5 THE MESSAGE: ready with your name and the brand, in Arabic
scenes.append({"id": "s05", "voice": v(5), "theme": "tk-bone", "banner": "الرسالة جاهزة", "transition": "slide",
  "camera": {"zoom": [[0, 1], [1.2, 1], [2.4, 1.45, "inOutCubic"]], "y": [[1.2, 620], [2.4, 610, "inOutCubic"]], "x": [[1.2, 360]]},
  "floor": False, "elements": [
    phone("assets/4-sheet.png", 360, 620, 420),
  ]})

# 6 ONE BY ONE: Next takes you on; whoever was messaged is skipped for a week
scenes.append({"id": "s06", "voice": v(6), "theme": "tk-linen", "banner": "واحد ورا الثاني", "transition": "slide", "elements": [
    phone("assets/5-sent.png", 320, [[0, 700], [1.0, 600, "outCubic"]], 370),
    arrow(610, 432, at=1.0, color=WA),
    {"type": "stamp", "text": "ما يتكرر", "color": GREEN, "size": 34, "x": 520, "y": 925, "rot": -6, "in": {"type": "slam", "at": 2.6}},
  ]})

# 7 THE CUSTOMER'S PAGE: the brands they bought, WhatsApp about each
scenes.append({"id": "s07", "voice": v(7), "theme": "tk-bone", "banner": "ماركات العميل", "transition": "slide", "elements": [
    phone("assets/6-profile.png", 360, 620, 400, **{"in": {"type": "rise", "at": 0.1}}),
    arrow(650, 462, at=1.4),
  ]})

# 8 CLOSE: everyone sees their own customers; update the app
scenes.append({"id": "s08", "voice": v(8), "theme": "tk-graphite", "banner": "حدّث التطبيق: 3.8.0", "transition": "slide", "elements": [
    phone("assets/3b-list-rows.png", 360, 620, 340, **{"in": {"type": "rise", "at": 0.1}}),
    {"type": "stamp", "text": "v3.8.0 ✓", "color": GREEN, "size": 52, "x": 520, "y": 330, "rot": -8, "in": {"type": "slam", "at": 1.6}},
    {"type": "sparkles", "count": 16, "radius": 220, "color": YELLOW, "at": 1.6, "x": 360, "y": 600},
  ]})

NARR = {k: t for k, t in json.load(open(os.path.join(HERE, 'narration.json'))).items() if not k.startswith('_')}
for sc in scenes:
    sc["captions"] = NARR[sc["id"]]
    sc.update({"voiceAt": 0.05 if sc["id"] == "s01" else 0.1, "pad": 0.2})
    if not os.path.exists(os.path.join(HERE, sc["voice"])):   # clip not made yet: estimate (about 11 characters a second)
        del sc["voice"]
        sc["dur"] = round(len(sc["captions"]) / 11 + 0.6, 1)
scenes[0]["bannerAt"] = -1                # the hook text is on screen in frame 1
scenes += endcard(HERE, theme='tk-ink')
scenes[-1]["dur"] = 0.7
scenes[-2]["banner"] = scenes[-1]["banner"] = ""
scenes[-2]["elements"].append(txt(CREDIT, 360, 840, 20, "#D8D3C8", z=40, **{"in": {"type": "fade", "at": 0.6}}))

story = {"width": 720, "height": 1280, "fps": 30, "dir": "rtl", "style": STYLE["style"], "themes": STYLE["themes"],
         "audio": {"musicGain": -20}, "scenes": scenes}
json.dump(story, open(os.path.join(HERE, 'story.json'), 'w'), ensure_ascii=False, indent=1)
print(len(scenes), 'scenes')
