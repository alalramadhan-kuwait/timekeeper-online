"""Storyboard for the «اسأل محمد» reel (paper-story engine). Hook: cold open, the shop phone nobody answers
(Ali's choice, option 1). Every scene is timed by its V5 voice clip (voice/sNN.wav); the Time Keeper end card closes.
Data rule (src/BRIEF.md): illustrative figures only, labelled «أرقام توضيحية»; the dashboard screenshot is shown with
its figures masked (assets/screen-dashboard.png).
Usage: python3 build.py  ->  story.json
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'brand'))
from tk_endcard import endcard  # noqa: E402

STYLE = json.load(open(os.path.join(HERE, '..', 'success-story', 'tk-style.json')))
YELLOW, NAVY, INK, CREAM = '#F9BE2A', '#1F2C55', '#111111', '#F3F0E8'
M = 'assets/mohammed.png'          # 1054 x 1186 after trim
MW, MH = 1054, 1186
CREDIT = 'الراوي: صوت ذكاء اصطناعي من صوت علي اليوسفي، بموافقته'


def moh(x, y, w, **kw):
    """Mohammed, the drawn character (src/mohammed-cartoon.png), standing waist-up."""
    return dict({"type": "image", "src": M, "frame": False, "w": w, "h": round(w * MH / MW), "x": x, "y": y,
                 "anchor": "b", "person": True}, **kw)


def phone(src, x=360, y=600, w=330, **kw):
    h = round((w - 24) * 2532 / 1170 + 28)
    return dict({"type": "phone", "src": src, "w": w, "h": h, "x": x, "y": y}, **kw)


def txt(t, x, y, size=44, color=INK, **kw):
    return dict({"type": "text", "text": t, "x": x, "y": y, "size": size, "color": color, "font": "banner"}, **kw)


def v(n):
    return f"voice/proc/s{n:02d}.wav"   # V5 take, silences trimmed, pace x1.10 (keeps the reel inside 45 s)


scenes = []

# 1 HOOK: the shop phone rings in an empty shop; nobody answers (frame 1 already moves and carries the text)
scenes.append({"id": "s01", "voice": v(1), "theme": "tk-graphite", "banner": "اتصلت بالمحل… محد رد",
  "transition": "cut", "elements": [
    {"type": "shape", "kind": "rect", "w": 560, "h": 150, "color": "#5A3E2B", "tex": "wood", "x": 360, "y": 890},   # counter
    {"type": "watch", "size": 150, "strap": False, "x": 560, "y": 400, "time": [10, 9, 0], "rate": 40},                   # wall clock spinning
    {"type": "phone", "label": "📞", "w": 200, "h": 380, "x": 300, "y": 640, "rot": -8, "idle": {"type": "shake", "amp": 9, "speed": 3, "until": 3.2}},
    {"type": "burst", "size": 150, "text": "رن!", "color": YELLOW, "x": 470, "y": 520, "in": {"type": "pop", "at": 0.0}, "idle": "pulse",
     "out": {"type": "fade", "at": 3.3}},
    {"type": "burst", "size": 110, "text": "رن!", "color": YELLOW, "x": 160, "y": 470, "in": {"type": "pop", "at": 0.5}, "out": {"type": "fade", "at": 3.3}},
    {"type": "text", "text": "…", "font": "banner", "size": 120, "color": CREAM, "x": 360, "y": 330, "in": {"type": "pop", "at": 3.3}},
  ]})

# 2 BEFORE: tabs everywhere, a calculator, the owner gives up
tabs = []
for i, (lab, x, y, r) in enumerate([("Lightspeed", 180, 420, -8), ("Excel", 520, 380, 7), ("تقرير المبيعات", 240, 620, 5), ("المخزون", 500, 640, -6),
                                    ("Lightspeed", 360, 500, 3), ("فواتير", 140, 760, -4), ("طلبات", 580, 790, 9)]):
    tabs.append({"type": "card", "w": 230, "h": 140, "header": lab, "headerColor": NAVY, "headerInk": CREAM, "headerH": 44, "headerSize": 22,
                 "x": x, "y": y, "rot": r, "in": {"type": "drop", "at": 0.15 + i * 0.22}, "idle": {"type": "wiggle", "amp": 2}})
scenes.append({"id": "s02", "voice": v(2), "theme": "tk-bone", "banner": "قبل: ٢٠ صفحة لسؤال واحد", "transition": "slide", "elements": tabs + [
    {"type": "shape", "kind": "round", "w": 150, "h": 200, "color": "#3A3D44", "text": "± × ÷", "ink": CREAM, "size": 34, "x": 600, "y": 520,
     "in": {"type": "slideR", "at": 1.6}, "rot": [[1.6, 0], [2.4, 25], [3.2, -20]], "idle": {"type": "shake", "amp": 4, "speed": 2}},
    {"type": "mascot", "x": 360, "y": 960, "look": [[0, "worried"], [3.6, "sleepy"]], "idle": "bob", "in": {"type": "rise", "at": 0.1}},
    {"type": "bubble", "text": "خلاص، باجر أشوف", "w": 300, "h": 84, "x": 470, "y": 700, "tail": "l", "in": {"type": "pop", "at": 3.4}},
    {"type": "sparkles", "count": 18, "radius": 260, "colors": [CREAM, "#D5CFC1"], "shape": "rect", "at": 1.0, "loop": True, "x": 360, "y": 560},
  ]})

# 3 NOW: the real back office; zoom to the corner, Mohammed pops out of his button
scenes.append({"id": "s03", "voice": v(3), "theme": "tk-linen", "banner": "الحين؟ هذا محمد", "transition": "push",
  "camera": {"zoom": [[0, 1], [1.2, 1], [2.4, 1.7, "inOutCubic"]], "x": [[1.2, 360], [2.4, 450, "inOutCubic"]], "y": [[1.2, 600], [2.4, 800, "inOutCubic"]]},
  "floor": False, "elements": [
    phone("assets/screen-dashboard.png", 360, 600, 330, z=1),
    {"type": "shape", "kind": "circle", "w": 120, "h": 120, "color": YELLOW, "x": 480, "y": 860, "in": {"type": "pop", "at": 2.4}, "out": {"type": "fade", "at": 3.0}, "z": 3},
    moh(470, 900, 240, **{"in": {"type": "rise", "at": 2.9, "from": 200}, "idle": {"type": "bob", "amp": 4}, "rot": [[2.9, 0], [3.5, -6], [4.2, 4]], "z": 4}),
    {"type": "sparkles", "count": 14, "radius": 150, "color": YELLOW, "at": 2.9, "x": 470, "y": 780, "z": 5},
  ]})

# 4 ASK: the chat opens; the question is typed
scenes.append({"id": "s04", "voice": v(4), "theme": "tk-bone", "banner": "اسأله أي شي", "transition": "slide", "elements": [
    phone("assets/screen-hello.png", 260, 650, 330),
    moh(560, 960, 230, **{"in": {"type": "slideL", "at": 0.2}, "rot": [[0.4, 0], [1.2, 8], [2.0, 8], [2.4, 0]], "idle": {"type": "bob", "amp": 3}}),
    {"type": "bubble", "text": "عندنا هوفمان باندا؟", "w": 330, "h": 84, "x": 300, "y": 360, "tail": "r", "size": 28, "in": {"type": "pop", "at": 0.35}},
  ]})

# 5 ANSWER: thinking, then the answer with a reason (illustrative figures)
scenes.append({"id": "s05", "voice": v(5), "theme": "tk-linen", "banner": "يرد بالأرقام… وليش", "transition": "slide", "elements": [
    phone("assets/screen-thinking.png", 270, 600, 320, out={"type": "fade", "at": 0.9, "dur": 0.3}),
    phone("assets/screen-answer.png", 270, 600, 320, **{"in": {"type": "fade", "at": 0.9, "dur": 0.3}}),
    {"type": "sticky", "label": "أرقام توضيحية", "w": 170, "h": 80, "x": 590, "y": 330, "rot": 6, "in": {"type": "pop", "at": 1.0}},
    {"type": "burst", "size": 150, "text": "١٥", "color": YELLOW, "x": 580, "y": 560, "in": {"type": "pop", "at": 2.6}, "idle": "pulse"},
    moh(590, 960, 200, **{"in": {"type": "rise", "at": 0.2}, "idle": {"type": "bob", "amp": 3}, "rot": [[2.6, 0], [3.0, -8], [3.6, 0]]}),
  ]})

# 6 LANGUAGES: Arabic, English, broken Arabic; he nods to all of them
scenes.append({"id": "s06", "voice": v(6), "theme": "tk-bone", "banner": "عربي؟ إنجليزي؟ يفهم", "transition": "slide", "elements": [
    {"type": "bubble", "text": "شكثر باقي؟", "w": 250, "h": 80, "x": 200, "y": 380, "tail": "r", "in": {"type": "pop", "at": 0.3}},
    {"type": "bubble", "text": "How many left?", "w": 270, "h": 80, "x": 520, "y": 470, "tail": "l", "in": {"type": "pop", "at": 1.0}},
    {"type": "bubble", "text": "هوفمان كم في موجود؟", "w": 320, "h": 80, "x": 250, "y": 570, "tail": "r", "in": {"type": "pop", "at": 1.8}},
    moh(360, 960, 300, **{"in": {"type": "rise", "at": 0.1}, "rot": [[0.6, 0], [0.8, 5], [1.0, 0], [1.3, 5], [1.5, 0], [2.1, 5], [2.3, 0]]}),
    {"type": "stamp", "text": "✓", "color": "#2E7D4F", "size": 90, "x": 560, "y": 650, "in": {"type": "slam", "at": 2.4}},
  ]})

# 7 NO MADE-UP NUMBERS: each number gets a «متشيّك» stamp
nums = []
for i, (n, x) in enumerate([("0", 150), ("19", 290), ("80", 430), ("15", 570)]):
    nums.append({"type": "card", "w": 120, "h": 150, "label": n, "x": x, "y": 520, "rot": [-4, 3, -2, 5][i],
                 "in": {"type": "drop", "at": 0.2 + i * 0.15}})
    nums.append(txt(n, x, 520, 64, INK, **{"in": {"type": "drop", "at": 0.2 + i * 0.15}, "rot": [-4, 3, -2, 5][i]}))
    nums.append({"type": "sparkles", "count": 8, "radius": 70, "color": "#2E7D4F", "at": 1.5 + i * 0.25, "x": x, "y": 520})
scenes.append({"id": "s07", "voice": v(7), "theme": "tk-linen", "banner": "ما يألّف أرقام", "transition": "slide", "elements": nums + [
    {"type": "stamp", "text": "متشيّك ✓", "color": "#2E7D4F", "size": 46, "x": 360, "y": 640, "rot": -8, "in": {"type": "slam", "at": 2.3}},
    txt("أرقام توضيحية", 360, 700, 24, "#555"),
    moh(360, 960, 200, **{"in": {"type": "rise", "at": 0.1}, "idle": {"type": "bob", "amp": 3}}),
  ]})

# 8 CONSIGNMENT: a watch with a supplier tag; Mohammed: don't buy, ask the supplier
scenes.append({"id": "s08", "voice": v(8), "theme": "tk-bone", "banner": "بضاعة أمانة؟", "transition": "slide", "elements": [
    {"type": "watch", "size": 230, "x": 220, "y": 520, "time": [10, 10, 30], "in": {"type": "pop", "at": 0.2}},
    {"type": "card", "w": 150, "h": 80, "label": "أمانة", "color": YELLOW, "x": 330, "y": 650, "rot": 10, "pin": True, "in": {"type": "drop", "at": 0.8}},
    {"type": "stamp", "text": "لا تشتري", "color": "#B3261E", "size": 34, "x": 250, "y": 330, "rot": -8, "in": {"type": "slam", "at": 2.0}},
    moh(560, 960, 230, **{"in": {"type": "slideL", "at": 0.3}, "rot": [[1.8, 0], [2.2, -6], [2.8, 0]]}),
    {"type": "bubble", "text": "كلّم المورد", "w": 220, "h": 76, "x": 540, "y": 430, "tail": "r", "in": {"type": "pop", "at": 2.6}},
  ]})

# 9 ALWAYS ON: tea, the clock spins, no holiday, no raise, never «باجر»
scenes.append({"id": "s09", "voice": v(9), "theme": "tk-graphite", "banner": "لا إجازة… ولا «باجر»", "transition": "slide", "elements": [
    {"type": "stopwatch", "size": 160, "x": 560, "y": 380, "sweep": [[0, 0], [4, 6]]},
    {"type": "card", "w": 150, "h": 90, "label": "إجازة", "x": 160, "y": 380, "rot": -6, "in": {"type": "pop", "at": 0.5}, "out": {"type": "fade", "at": 1.4}},
    {"type": "stamp", "text": "✗", "color": "#B3261E", "size": 70, "x": 160, "y": 380, "in": {"type": "slam", "at": 1.0}, "out": {"type": "fade", "at": 1.4}},
    {"type": "card", "w": 150, "h": 90, "label": "زيادة", "x": 160, "y": 380, "rot": 5, "in": {"type": "pop", "at": 1.5}, "out": {"type": "fade", "at": 2.4}},
    {"type": "stamp", "text": "✗", "color": "#B3261E", "size": 70, "x": 160, "y": 380, "in": {"type": "slam", "at": 2.0}, "out": {"type": "fade", "at": 2.4}},
    {"type": "card", "w": 150, "h": 90, "label": "باجر", "x": 160, "y": 380, "rot": -3, "in": {"type": "pop", "at": 2.5}},
    {"type": "stamp", "text": "✗", "color": "#B3261E", "size": 70, "x": 160, "y": 380, "in": {"type": "slam", "at": 3.0}},
    moh(360, 960, 300, **{"in": {"type": "rise", "at": 0.1}, "idle": {"type": "bob", "amp": 3}}),
    {"type": "cup", "size": 0.9, "x": 520, "y": 940, "in": {"type": "slideL", "at": 0.4}},
  ]})

# 10 CTA: Mohammed waves; the call to action; the consent credit
scenes.append({"id": "s10", "voice": v(10), "theme": "tk-bone", "banner": "اسأل محمد", "transition": "slide", "elements": [
    moh(360, 900, 340, **{"in": {"type": "pop", "at": 0.1}, "rot": [[0.4, 0], [0.7, 6], [1.0, -6], [1.3, 6], [1.6, 0]]}),
    {"type": "shape", "kind": "pill", "w": 330, "h": 70, "color": YELLOW, "text": "للملاك بس 🤫", "font": "banner", "size": 30, "ink": INK,
     "x": 360, "y": 330, "in": {"type": "pop", "at": 1.4}},
    {"type": "sparkles", "count": 16, "radius": 200, "color": YELLOW, "at": 0.2, "x": 360, "y": 600},
  ]})

NARR = {k: t for k, t in json.load(open(os.path.join(HERE, 'narration.json'))).items() if not k.startswith('_')}
for sc in scenes:
    sc["captions"] = NARR[sc["id"]]
scenes[0]["bannerAt"] = -1                # the hook text is on screen in frame 1
for sc in scenes:                      # tight cuts: the voice starts almost at once and the next scene follows it
    sc.update({"voiceAt": 0.05 if sc["id"] == "s01" else 0.1, "pad": 0.15})
scenes += endcard(HERE, theme='tk-ink')
scenes[-1]["dur"] = 0.7
scenes[-2]["banner"] = scenes[-1]["banner"] = ""
# the consent credit (src/BRIEF.md, VOICE-CONSENT.md) sits under the logo on the end card, clear of platform UI
for i, line in enumerate(CREDIT.split("، ")):   # two lines so it never runs off a phone screen
    scenes[-2]["elements"].append(txt(line, 360, 830 + i * 36, 24, "#D8D3C8", z=40, **{"in": {"type": "fade", "at": 0.6}}))

story = {"width": 720, "height": 1280, "fps": 30, "dir": "rtl", "style": STYLE["style"], "themes": STYLE["themes"],
         "audio": {"musicGain": -20}, "scenes": scenes}
json.dump(story, open(os.path.join(HERE, 'story.json'), 'w'), ensure_ascii=False, indent=1)
print(len(scenes), 'scenes')
