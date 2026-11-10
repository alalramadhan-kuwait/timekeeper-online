"""Storyboard for the team video on the website changes (draft theme «TK Mobile Review», 28-29 Oct 2026).
Hook: before and after (Ali's choice), the product page as it is next to the new one, in frame 1.
Narration: OmniVoice (k2-fsa/OmniVoice, Gulf Arabic), one cloned voice; every scene is timed by its clip (voice/sNN.wav).
Screens are real phone screenshots of time-keeper.com (live) and of the draft theme preview.
Figures: 88% of sessions on mobile (Shopify analytics, last 30 days to 28 Oct 2026).
Usage: python3 build.py  ->  story.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'brand'))
from tk_endcard import endcard  # noqa: E402

STYLE = json.load(open(os.path.join(HERE, '..', 'success-story', 'tk-style.json')))
YELLOW, INK, CREAM, RED, GREEN = '#F9BE2A', '#111111', '#F3F0E8', '#B3261E', '#2E7D4F'
SHOT_W, SHOT_H = 1170, 1992          # phone screenshots: 390 x 664 viewport at 3x
CREDIT = 'الراوي: صوت ذكاء اصطناعي (OmniVoice)'


def phone(src, x=360, y=600, w=330, **kw):
    h = round((w - 24) * SHOT_H / SHOT_W + 28)
    return dict({"type": "phone", "src": src, "w": w, "h": h, "x": x, "y": y}, **kw)


def label(text, x, y, color, ink=CREAM, at=0.0, rot=0, **kw):
    return dict({"type": "shape", "kind": "pill", "w": 150, "h": 58, "color": color, "text": text, "font": "banner", "size": 28,
                 "ink": ink, "x": x, "y": y, "rot": rot, "in": {"type": "pop", "at": at}}, **kw)


def txt(t, x, y, size=44, color=INK, **kw):
    return dict({"type": "text", "text": t, "x": x, "y": y, "size": size, "color": color, "font": "banner"}, **kw)


def v(n):
    return f"voice/s{n:02d}.wav"


scenes = []

# 1 HOOK: before and after side by side from frame 1; the new page drops in on top
scenes.append({"id": "s01", "voice": v(1), "theme": "tk-bone", "banner": "نفس الموقع… شوف الفرق", "transition": "cut", "elements": [
    phone("assets/3-product-before.png", 195, 640, 340, rot=-4),
    label("قبل", 195, 320, RED, rot=-4),
    phone("assets/3-product-after.png", 525, 620, 340, rot=4, **{"in": {"type": "drop", "at": 0.5}}),
    label("بعد", 525, 300, GREEN, at=0.8, rot=4),
    {"type": "sparkles", "count": 12, "radius": 170, "color": YELLOW, "at": 0.8, "x": 520, "y": 560},
  ]})

# 2 WHY: 88% of visitors come on the phone, so the phone is the shop
scenes.append({"id": "s02", "voice": v(2), "theme": "tk-linen", "banner": "الجوال هو المحل", "transition": "slide", "elements": [
    phone("assets/1-home-after.png", 230, 620, 300, **{"in": {"type": "rise", "at": 0.1}}),
    {"type": "burst", "size": 230, "text": "88%", "color": YELLOW, "x": 520, "y": 470, "in": {"type": "pop", "at": 0.3}, "idle": "pulse"},
    txt("من زوارنا", 520, 650, 40, INK, **{"in": {"type": "pop", "at": 0.8}}),
    txt("من الجوال", 520, 710, 40, INK, **{"in": {"type": "pop", "at": 1.1}}),
    txt("آخر 30 يوم", 520, 790, 24, "#555", **{"in": {"type": "fade", "at": 1.4}}),
  ]})

# 3 PRODUCT PAGE: the WhatsApp button now sits under Add to cart; the message carries the watch name
scenes.append({"id": "s03", "voice": v(3), "theme": "tk-bone", "banner": "الواتساب تحت زر الشراء", "transition": "slide",
  "camera": {"zoom": [[0, 1], [1.2, 1], [2.4, 1.45, "inOutCubic"]], "y": [[1.2, 640], [2.4, 560, "inOutCubic"]], "x": [[1.2, 360]]},
  "floor": False, "elements": [
    phone("assets/3-product-after.png", 360, 640, 420),
    {"type": "shape", "kind": "arrow", "w": 100, "h": 60, "color": RED, "x": 665, "y": 540, "rot": 180, "depth": 0,
     "in": {"type": "pop", "at": 2.5}, "idle": {"type": "bob", "amp": 5}},
    {"type": "bubble", "text": "مرحبا، أبي أستفسر عن…", "w": 320, "h": 80, "x": 400, "y": 790, "tail": "t", "size": 26, "depth": 0,
     "in": {"type": "pop", "at": 3.4}},
  ]})

# 4 STICKY BUY BAR: scrolling the specs, the buy bar stays with the customer
scenes.append({"id": "s04", "voice": v(4), "theme": "tk-linen", "banner": "زر الشراء ينزل وياك", "transition": "slide", "elements": [
    phone("assets/4-product-sticky-after.png", 330, [[0, 720], [1.2, 630, "outCubic"]], 420),
    {"type": "shape", "kind": "arrow", "w": 110, "h": 64, "color": RED, "x": 625, "y": 900, "rot": 180,
     "in": {"type": "pop", "at": 1.3}, "idle": {"type": "bob", "amp": 6}},
  ]})

# 5 LUXURY: from 1,000 KD, a «book a viewing at The Avenues» button replaces the vague contact link
scenes.append({"id": "s05", "voice": v(5), "theme": "tk-graphite", "banner": "فوق 1,000 د.ك: موعد مشاهدة", "transition": "slide", "elements": [
    phone("assets/5-luxury-before.png", 200, 640, 290, rot=-4, **{"out": {"type": "fade", "at": 2.4}}),
    label("قبل", 200, 340, RED, rot=-4, **{"out": {"type": "fade", "at": 2.4}}),
    phone("assets/5-luxury-after.png", [[2.4, 520], [3.0, 360, "inOutCubic"]], 620, 290,
          **{"in": {"type": "drop", "at": 0.6}, "scale": [[2.4, 1], [3.0, 1.15, "inOutCubic"]], "rot": [[2.4, 4], [3.0, 0]]}),
    label("بعد", 520, 320, GREEN, at=0.9, rot=4, **{"out": {"type": "fade", "at": 2.4}}),
  ]})

# 6 HOME: shop by budget, newest arrivals one per brand, the brand grid
scenes.append({"id": "s06", "voice": v(6), "theme": "tk-bone", "banner": "تسوق حسب الميزانية", "transition": "slide", "elements": [
    phone("assets/2-home-new-after.png", 220, 620, 300, rot=-3, **{"in": {"type": "rise", "at": 0.1}}),
    phone("assets/6-brand-after.png", 510, 640, 280, rot=4, **{"in": {"type": "drop", "at": 1.6}}),
    {"type": "sparkles", "count": 10, "radius": 140, "color": YELLOW, "at": 0.6, "x": 220, "y": 420},
  ]})

# 7 ARABIC: some prices did not show in Arabic; now they do
scenes.append({"id": "s07", "voice": v(7), "theme": "tk-linen", "banner": "السعر رجع بالعربي", "transition": "slide", "elements": [
    {"type": "image", "src": "assets/ar-price-before.png", "w": 320, "h": 416, "x": 190, "y": 600, "rot": -3, "in": {"type": "pop", "at": 0.1}},
    {"type": "stamp", "text": "✗", "color": RED, "size": 80, "x": 110, "y": 440, "in": {"type": "slam", "at": 1.2}},
    {"type": "image", "src": "assets/ar-price-after.png", "w": 320, "h": 416, "x": 530, "y": 600, "rot": 3, "in": {"type": "pop", "at": 2.0}},
    {"type": "stamp", "text": "✓", "color": GREEN, "size": 80, "x": 610, "y": 440, "in": {"type": "slam", "at": 2.6}},
  ]})

# 8 CLOSE: ready, live soon
scenes.append({"id": "s08", "voice": v(8), "theme": "tk-bone", "banner": "جاهزة… وقريب على الموقع", "transition": "slide", "elements": [
    phone("assets/1-home-after.png", 360, 620, 330, **{"in": {"type": "rise", "at": 0.1}}),
    {"type": "stamp", "text": "جاهز ✓", "color": GREEN, "size": 52, "x": 470, "y": 390, "rot": -8, "in": {"type": "slam", "at": 1.0}},
    {"type": "sparkles", "count": 16, "radius": 220, "color": YELLOW, "at": 1.0, "x": 360, "y": 600},
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
scenes[-2]["elements"].append(txt(CREDIT, 360, 840, 22, "#D8D3C8", z=40, **{"in": {"type": "fade", "at": 0.6}}))

story = {"width": 720, "height": 1280, "fps": 30, "dir": "rtl", "style": STYLE["style"], "themes": STYLE["themes"],
         "audio": {"musicGain": -20}, "scenes": scenes}
json.dump(story, open(os.path.join(HERE, 'story.json'), 'w'), ensure_ascii=False, indent=1)
print(len(scenes), 'scenes')
