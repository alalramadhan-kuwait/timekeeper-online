#!/usr/bin/env python3
"""Builds the three Time Keeper success-story storyboards (ep1.json, ep2.json, ep3.json).

Every scene carries:  id, status (CONFIRMED | FOUNDER | METAPHOR | UNCONFIRMED), claims (what it asserts),
vo (the narration line), and note. `node check-story.mjs` audits them. Edit THIS file, then run:  python3 build.py
Scene durations are estimates from the Arabic word count; when narration is recorded per scene, add "voice": "x.wav"
and drop "dur" so each scene takes the clip's length.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
STYLE = json.load(open(os.path.join(HERE, 'tk-style.json')))
LOGO = '../../public/icon-512.png'   # app icon: black "tk" monogram. Replace with the official logo file when supplied.

# ---- founders (placeholder rigs until approved character art exists in assets/characters/<id>/) -----------------
CH = {
    'ar': dict(id='ali-alramadhan', initial='ع ر', top='#43464D'),
    'ay': dict(id='ali-alyousifi', initial='ع ي', top='#6C7078'),
    'mw': dict(id='mohammad-alyousifi', initial='م ي', top='#8D9198'),
}
def pup(k, x, y=960, size=.85, **kw):
    c = CH[k]
    d = {"type": "puppet", "x": x, "y": y, "size": size, "character": c['id'], "initial": c['initial'], "top": c['top']}
    d.update(kw); return d

# ---- places ---------------------------------------------------------------------------------------------------
BOU = dict(id='bou', lon=-105.27, lat=40.01, label='BOULDER')
LA = dict(id='la', lon=-118.24, lat=34.05, label='LOS ANGELES')
KW = dict(id='kw', lon=47.98, lat=29.37, label='KUWAIT')
GVA = dict(id='gva', lon=6.14, lat=46.20, label='GENEVA')
V = lambda lon, lat, span: {"lon": lon, "lat": lat, "span": span}
def MAP(view, pins=None, routes=None, y=600, w=660, h=720, **kw):
    d = {"type": "map", "x": 360, "y": y, "w": w, "h": h, "view": view, "sea": "#CCC6B7", "land": "#F4F1E8",
         "pins": pins or [], "routes": routes or []}
    d.update(kw); return d

def pin(p, at): return dict(p, at=at)
def caps(vo):
    return re.sub(r'([…\.؟،:])\s+', r'\1 | ', vo.strip())

SCENES = {1: [], 2: [], 3: []}
KEEP = None
def S(ep, id, status, dur, theme, vo='', banner='', els=None, claims=None, note='', sfx=None, beds=None, tr=None,
      silent=False, brands=None, floor=False, captions=None, **kw):
    sc = {"id": id, "status": status, "dur": dur, "theme": theme, "floor": floor, "elements": els or []}
    if banner is not KEEP: sc["banner"] = banner
    if vo: sc["vo"] = vo
    c = captions if captions is not None else (caps(vo) if vo else '')
    if c: sc["captions"] = c
    if claims: sc["claims"] = claims
    if note: sc["note"] = note
    if sfx: sc["sfx"] = sfx
    if beds: sc["beds"] = beds
    if tr: sc["transition"] = tr
    if silent: sc["silent"] = True
    if brands: sc["brands"] = brands
    sc.update(kw)
    SCENES[ep].append(sc)

def photo(asset, x, y, w, aspect, label, rot, at, desc=None, **kw):
    d = {"type": "photo", "asset": asset, "x": x, "y": y, "w": w, "aspect": aspect, "label": label, "desc": desc or label,
         "rot": [[0, rot * 3], [0.9, rot, "outBack"]], "in": {"type": "drop", "at": at, "dur": 0.6}}
    d.update(kw); return d

def table(y=845, w=470):
    wall = {"type": "watch", "x": 360, "y": 430, "size": 440, "strap": False, "numerals": "arabic", "date": False, "opacity": 0.2,
            "behind": True, "still": True, "time": [10, 9, 0]}
    return [wall, {"type": "card", "x": 360, "y": y, "w": w, "h": 34, "tex": "wood", "color": "#fff", "edge": "cut", "z": 20},
            {"type": "card", "x": 360 - w / 2 + 40, "y": y + 62, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19},
            {"type": "card", "x": 360 + w / 2 - 40, "y": y + 62, "w": 22, "h": 90, "tex": "wood", "color": "#fff", "z": 19}]

DIALS = ['#17171A', '#F1EEE6', '#B9BDC4']

# =====================================================================================================================
# EPISODE 1  «قبل تايم كيبر»   friendship -> passion -> problem -> idea
# =====================================================================================================================
S(1, 'E1-S01', 'METAPHOR', 3.8, 'tk-black', banner='', silent=True, floor=False,
  claims=['Opening image only: a mechanical watch seconds hand. No factual claim.'],
  note='Silence except the watch. Camera pulls back from the dial.',
  beds=[{"name": "watch_run", "from": 0.0, "to": 3.8, "gain": -14}],
  els=[{"type": "watch", "x": 360, "y": 640, "size": 560, "strap": False, "numerals": "arabic", "brand": "", "date": False,
        "scale": [[0, 1.75], [3.6, 1.0, "inOutCubic"]], "time": [10, 8, 40], "still": True, "guilloche": True}])

S(1, 'E1-S02', 'FOUNDER', 7.0, 'tk-ink', banner='',
  vo='قبل تايم كيبر… ما كان في شركة. ولا محل. ولا حتى خطة.',
  claims=['Before Time Keeper there was no company, no store and no plan (founder testimony).'],
  note='A paper map of the United States unfolds.', tr='fade',
  sfx=[{"at": 0.2, "name": "paper_tear", "gain": -12}],
  els=[MAP([[0, V(-98, 38.5, 58)]], y=620, h=760, states=True, unfold={"at": 0.2, "dur": 1.5})])

S(1, 'E1-S03', 'FOUNDER', 6.0, 'tk-bone', floor=True,
  vo='كانوا ثلاثة شباب… يجمعهم شيء واحد: حب الساعات.',
  claims=['Three young men united by a love of watches (founder testimony).'],
  note='Three founder rigs appear as silhouettes; a watch lights up on "love of watches".',
  sfx=[{"at": 0.9, "name": "paper_place", "gain": -12}, {"at": 1.5, "name": "paper_place", "gain": -12}, {"at": 2.1, "name": "paper_place", "gain": -12}, {"at": 3.7, "name": "clasp", "gain": -10}],
  els=[pup('ar', 190, 960, 1.0, opacity=[[0, 0.35], [3.6, 1]], pose='stand', **{"in": {"type": "rise", "at": 0.8}}),
       pup('mw', 360, 960, 1.0, opacity=[[0, 0.35], [3.6, 1]], pose='stand', **{"in": {"type": "rise", "at": 1.4}}),
       pup('ay', 530, 960, 1.0, opacity=[[0, 0.35], [3.6, 1]], pose='stand', **{"in": {"type": "rise", "at": 2.0}}),
       {"type": "watch", "x": 360, "y": 470, "size": 250, "strap": False, "numerals": "arabic", "time": [10, 9, 0], "in": {"type": "pop", "at": 3.6}, "idle": "pulse"}])

S(1, 'E1-S04', 'FOUNDER', 8.0, 'tk-ink', banner='BOULDER — COLORADO',
  vo='في بولدر، كولورادو… التقى علي الرمضان وعلي اليوسفي، وهم يدرسون.',
  claims=['Ali Al-Ramadhan and Ali Al-Yousifi met while studying in Boulder, Colorado (founder testimony).'],
  note='Real university photographs of the two Alis go in the polaroid.',
  sfx=[{"at": 2.5, "name": "pin", "gain": -8}, {"at": 3.8, "name": "paper_place", "gain": -8}],
  els=[MAP([[0, V(-98, 38.5, 58)], [2.6, V(-105.27, 40.0, 9), "inOutCubic"]], pins=[pin(BOU, 2.4)], y=520, h=520, w=640, states=True),
       photo('ep1_boulder_university', 360, 850, 380, 1.5, 'BOULDER', -3, 3.6, desc='Ali Al-Ramadhan + Ali Al-Yousifi, university years in Boulder')])

S(1, 'E1-S05', 'FOUNDER', 6.5, 'tk-bone', floor=True,
  vo='وشوي شوي… صارت الساعات تدخل بكلامهم.',
  claims=['Their friendship and watch interest developed while studying in the US (founder testimony). They are discovering, not yet experts.'],
  note='Two founders talk over coffee with one watch on the table. Question marks, no expertise.',
  sfx=[{"at": 1.4, "name": "paper_place", "gain": -12}, {"at": 3.5, "name": "pin", "gain": -10}],
  els=table() + [
      pup('ar', 235, 960, 1.1, pose='sitTalk', talk=True, **{"in": {"type": "rise", "at": 0.2}}),
      pup('ay', 485, 960, 1.1, pose='sit', flip=True, **{"in": {"type": "rise", "at": 0.5}}),
      {"type": "cup", "x": 285, "y": 832, "size": .62, "z": 25}, {"type": "cup", "x": 440, "y": 832, "size": .62, "z": 25},
      {"type": "watch", "x": 362, "y": 828, "size": 110, "strap": False, "anchor": "b", "z": 25, "numerals": "arabic", "in": {"type": "pop", "at": 1.4}},
      {"type": "bubble", "x": 200, "y": 480, "w": 120, "h": 70, "kind": "thought", "text": "؟", "in": {"type": "pop", "at": 3.4}, "z": 40},
      {"type": "bubble", "x": 520, "y": 500, "w": 120, "h": 70, "kind": "thought", "text": "؟", "in": {"type": "pop", "at": 4.0}, "z": 40}])

S(1, 'E1-S06', 'FOUNDER', 7.0, 'tk-ink', banner='LOS ANGELES — CALIFORNIA',
  vo='وفي لوس أنجلوس، كاليفورنيا… تعرفوا على محمد بن وائل اليوسفي.',
  claims=['Mohammad bin Wail Al-Yousifi was met in Los Angeles, California (founder testimony).'],
  note='Map unfolds west; a paper plane travels Boulder to Los Angeles. Real photo of the meeting goes in the polaroid.',
  sfx=[{"at": 1.6, "name": "plane", "gain": -14}, {"at": 3.5, "name": "paper_place", "gain": -8}],
  els=[MAP([[0, V(-105.27, 40.0, 9)], [1.4, V(-111, 36.5, 24), "inOutCubic"]], pins=[pin(BOU, 0), pin(LA, 2.9)],
           routes=[{"from": "bou", "to": "la", "at": 1.7, "dur": 1.3}], y=520, h=520, w=640, states=True),
       photo('ep1_losangeles_meeting', 360, 850, 380, 1.5, 'LOS ANGELES', 3, 3.4, desc='Meeting Mohammad bin Wail Al-Yousifi in Los Angeles')])

S(1, 'E1-S07', 'FOUNDER', 5.0, 'tk-bone', floor=True,
  vo='وصاروا ثلاثة.',
  claims=['The three founders came together (founder testimony).'],
  note='Three coffee cups, three watches, one table.',
  sfx=[{"at": 0.8, "name": "paper_place", "gain": -10}, {"at": 1.6, "name": "paper_place", "gain": -10}, {"at": 2.4, "name": "paper_place", "gain": -10}],
  els=table(w=560) + [
      pup('ar', 150, 960, 1.1, pose='sitTalk', **{"in": {"type": "rise", "at": 0.1}}),
      pup('mw', 360, 960, 1.1, pose='sit', **{"in": {"type": "rise", "at": 0.3}}),
      pup('ay', 570, 960, 1.1, pose='sit', flip=True, **{"in": {"type": "rise", "at": 0.5}})] + [
      {"type": "cup", "x": 200 + i * 160, "y": 832, "size": .6, "z": 25, "in": {"type": "pop", "at": 0.8 + i * 0.8}} for i in range(3)] + [
      {"type": "watch", "x": 270 + i * 90, "y": 828, "size": 96, "strap": False, "anchor": "b", "z": 25, "dialColor": DIALS[i], "handColor": '#F1EEE6' if i == 0 else '#111', "markerColor": '#F1EEE6' if i == 0 else '#111', "in": {"type": "pop", "at": 1.0 + i * 0.8}} for i in range(3)])

S(1, 'E1-S08', 'FOUNDER', 7.0, 'tk-ink', banner='KUWAIT',
  vo='وبعد الدراسة… رجعوا الكويت.',
  claims=['The founders returned to Kuwait after their studies in the US (founder testimony).'],
  note='Suitcases, plane USA to Kuwait, Kuwait Towers rise from paper.',
  sfx=[{"at": 0.4, "name": "clasp", "gain": -10}, {"at": 1.3, "name": "plane", "gain": -12}, {"at": 4.6, "name": "paper_slide", "gain": -10}],
  els=[MAP([[0, V(-98, 38.5, 58)], [1.6, V(-30, 36, 170), "inOutCubic"], [4.0, V(48, 29.4, 30), "inOutCubic"]],
           pins=[pin(BOU, 0), pin(KW, 4.2)], routes=[{"from": "bou", "to": "kw", "at": 1.2, "dur": 2.6, "curve": 0.12}],
           highlight=[{"n": "Kuwait", "at": 4.0, "color": "#111111"}], y=560, h=640, w=640),
       {"type": "suitcase", "x": 190, "y": 960, "w": 150, "sticker": "TK", "in": {"type": "drop", "at": 0.1}, "z": 30},
       {"type": "suitcase", "x": 330, "y": 960, "w": 120, "color": "#5B5F68", "in": {"type": "drop", "at": 0.3}, "z": 30},
       {"type": "towers", "x": 560, "y": 960, "h": 330, "in": {"type": "rise", "at": 4.4, "dur": 0.8}, "z": 30}])

S(1, 'E1-S09', 'FOUNDER', 7.0, 'tk-bone', floor=True,
  vo='وكانت لهم جلسات… ساعات على الطاولة، وكلام ما ينتهي.',
  claims=['After returning to Kuwait, the three kept meeting and talking about watches (founder testimony).'],
  note='Phones, laptop, watch magazines and watches on the table.',
  sfx=[{"at": 0.8, "name": "paper_place", "gain": -12}, {"at": 1.8, "name": "click", "gain": -14}, {"at": 2.8, "name": "paper_place", "gain": -12}],
  els=table(w=600) + [
      pup('ar', 130, 960, 1.1, pose='sitTalk', talk=True, **{"in": {"type": "rise", "at": 0.1}}),
      pup('mw', 360, 960, 1.1, pose='sitWatch', **{"in": {"type": "rise", "at": 0.2}}),
      pup('ay', 590, 960, 1.1, pose='sit', flip=True, talk=True, talkFrom=2.0, **{"in": {"type": "rise", "at": 0.3}}),
      {"type": "laptop", "x": 215, "y": 832, "w": 150, "z": 25, "in": {"type": "pop", "at": 0.8}},
      {"type": "card", "x": 360, "y": 818, "w": 110, "h": 74, "label": "WATCH", "labelSize": 18, "rot": -8, "z": 26, "in": {"type": "pop", "at": 1.4}},
      {"type": "phone", "x": 465, "y": 836, "w": 54, "h": 100, "anchor": "b", "z": 26, "in": {"type": "pop", "at": 1.8}},
      {"type": "watch", "x": 520, "y": 828, "size": 96, "strap": False, "anchor": "b", "z": 26, "dialColor": "#17171A", "handColor": "#F1EEE6", "markerColor": "#F1EEE6", "in": {"type": "pop", "at": 2.2}},
      {"type": "cup", "x": 300, "y": 832, "size": .6, "z": 25}])

S(1, 'E1-S10', 'FOUNDER', 10.0, 'tk-graphite', banner='المشكلة',
  vo='كل ما تعمقنا أكثر بعالم الساعات… اكتشفنا مشكلة. المعلومات موجودة… لكن أغلبها مو بالعربي.',
  claims=['Their discussions exposed a lack of accessible Arabic watch information (founder testimony). The pile sizes are a visual metaphor, not a measurement.'],
  note='English information piles up; Arabic stays tiny.',
  sfx=[{"at": 3.0 + i * 0.5, "name": "paper_place", "gain": -13} for i in range(6)] + [{"at": 8.0, "name": "pin", "gain": -8}],
  els=[{"type": "text", "text": "ENGLISH", "x": 215, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "ls": .12, "upper": False, "shadow": False, "in": {"type": "fade", "at": 2.6}},
       {"type": "text", "text": "عربي", "x": 560, "y": 330, "size": 38, "font": "banner", "weight": 800, "color": "#F3F0E8", "shadow": False, "in": {"type": "fade", "at": 2.6}}] + [
      {"type": "card", "x": 215 + (i % 2) * 14 - 7, "y": 880 - i * 60, "w": 270, "h": 56, "label": ["WATCH GUIDE", "MOVEMENTS", "REVIEWS", "HISTORY", "BUYING TIPS", "COMPLICATIONS", "BRAND STORIES"][i],
       "labelSize": 20, "color": "#F3F0E8", "rot": ((i * 37) % 7 - 3) * 0.8, "in": {"type": "drop", "at": 3.0 + i * 0.5, "dur": 0.45}} for i in range(7)] + [
      {"type": "card", "x": 560, "y": 880, "w": 130, "h": 46, "label": "بالعربي", "labelSize": 18, "color": "#F3F0E8", "rot": 2, "in": {"type": "drop", "at": 6.2, "dur": 0.45}}])

S(1, 'E1-S11', 'FOUNDER', 9.0, 'tk-bone', banner='الأسئلة', captions='',
  claims=['Example questions beginners ask. Wording supplied by the founders in the brief.'],
  note='No narration: the questions are physical cards. Tick bed underneath.',
  beds=[{"name": "watch_run", "from": 0, "to": 9, "gain": -26}],
  sfx=[{"at": 0.6, "name": "paper_place", "gain": -9}, {"at": 2.4, "name": "paper_place", "gain": -9}, {"at": 4.2, "name": "paper_place", "gain": -9}, {"at": 6.0, "name": "paper_place", "gain": -9}],
  els=[{"type": "card", "x": 360, "y": 420 + i * 150, "w": 560, "h": 112, "style": "sticky", "color": ["#F3F0E8", "#FFFFFF", "#E9E4D8", "#F8F5EE"][i], "pin": True, "pinColor": "#111111",
        "label": q, "labelSize": 30, "labelFont": "banner", "rot": [-2.2, 1.8, -1.4, 2.2][i], "in": {"type": "pop", "at": 0.6 + i * 1.8}}
       for i, q in enumerate(['ليش هالساعة غالية؟', 'شنو يعني حركة ميكانيكية؟', 'شنو الفرق بين ساعة وساعة؟', 'ليش ساعة تستاهل… وساعة لا؟'])])

S(1, 'E1-S12', 'FOUNDER', 5.0, 'tk-ink', banner='', silent=True,
  vo='قلنا… ليش ما نبسطها؟',
  claims=['The decision to simplify watches for an Arabic audience (founder testimony).'],
  note='Everything stops. Silence. A small Time Keeper mark appears. NOT yet a business.',
  els=[{"type": "image", "x": 360, "y": 560, "w": 190, "h": 190, "src": LOGO, "pad": 12, "rot": -2, "in": {"type": "pop", "at": 3.1, "dur": 0.7}}])

S(1, 'E1-S13', 'FOUNDER', 4.5, 'tk-ink', banner='',
  vo='وهني… بدأت الفكرة.',
  claims=['The idea began here (founder testimony).'],
  note='End of episode 1. Hold on the mark, tick returns once.', tr='cut',
  sfx=[{"at": 3.4, "name": "tick_pair", "gain": -10}],
  els=[{"type": "image", "x": 360, "y": 560, "w": 190, "h": 190, "src": LOGO, "pad": 12, "rot": -2}])

# =====================================================================================================================
# EPISODE 2  «الفكرة تكبر»   education -> trust -> demand -> community
# =====================================================================================================================
S(2, 'E2-S01', 'UNCONFIRMED', 7.5, 'tk-bone', banner='2018',
  vo='بدينا بشي بسيط: نشرح الساعات… بالعربي.',
  claims=['The original goal was education: explaining watches in Arabic (founder testimony).',
          'The banner year 2018 is HELD: the brief lists it as a milestone but not what it marks. Confirm before use.'],
  note='An empty social post frame, then real early posts drop in.',
  sfx=[{"at": 0.5, "name": "paper_place", "gain": -9}, {"at": 2.2, "name": "paper_place", "gain": -9}, {"at": 3.2, "name": "paper_place", "gain": -9}, {"at": 4.2, "name": "paper_place", "gain": -9}],
  els=[{"type": "igpost", "x": 360, "y": 600, "w": 340, "empty": True, "avatar": LOGO, "handle": "timekeeperkw", "in": {"type": "drop", "at": 0.5}, "out": {"at": 2.0, "type": "fade", "dur": 0.2}},
       {"type": "igpost", "asset": "ep2_first_post_01", "desc": "First educational post (real, dated)", "x": 215, "y": 560, "w": 330, "avatar": LOGO, "handle": "timekeeperkw", "rot": -4, "likeAt": 3.4, "in": {"type": "drop", "at": 2.2}},
       {"type": "igpost", "asset": "ep2_first_post_02", "desc": "Early educational post", "x": 505, "y": 660, "w": 330, "avatar": LOGO, "handle": "timekeeperkw", "rot": 3, "in": {"type": "drop", "at": 3.2}},
       {"type": "igpost", "asset": "ep2_first_post_03", "desc": "Early educational post", "x": 330, "y": 800, "w": 330, "avatar": LOGO, "handle": "timekeeperkw", "rot": -2, "in": {"type": "drop", "at": 4.2}}])

S(2, 'E2-S02', 'FOUNDER', 8.5, 'tk-linen', floor=True,
  vo='ما كنا نبيع… كنا نعلّم.',
  claims=['The original objective was education and simplifying watches, not selling (founder testimony).'],
  note='The founders break a complicated watch into simple named pieces. Labels are generic watch anatomy.',
  sfx=[{"at": 1.0, "name": "crown_wind", "gain": -10}, {"at": 2.6, "name": "pin", "gain": -10}, {"at": 3.2, "name": "pin", "gain": -10}, {"at": 3.8, "name": "pin", "gain": -10}, {"at": 4.4, "name": "pin", "gain": -10}],
  els=[{"type": "watch", "x": 360, "y": 560, "size": 330, "numerals": "arabic", "brand": "", "explode": [[1.2, 0], [2.8, 1, "outBack"], [6.5, 1, "linear"], [7.8, 0, "inOutCubic"]], "time": [10, 9, 36], "rate": 5, "in": {"type": "pop", "at": 0.2}}] + [
      {"type": "shape", "kind": "pill", "x": x, "y": y, "w": 150, "h": 46, "color": "#111111", "ink": "#F3F0E8", "text": t, "size": 22, "in": {"type": "pop", "at": 3.0 + i * 0.6}}
      for i, (t, x, y) in enumerate([("الحركة", 120, 420), ("العلبة", 130, 620), ("الميناء", 600, 400), ("العقارب", 600, 560), ("التاج", 595, 720), ("السوار", 125, 800)])] + [
      pup('ar', 150, 960, .8, pose='point', talk=True, **{"in": {"type": "rise", "at": 0.1}}),
      pup('ay', 570, 960, .8, pose='stand', flip=True, **{"in": {"type": "rise", "at": 0.3}})])

S(2, 'E2-S03', 'FOUNDER', 10.0, 'tk-graphite', banner='الطلب جاء من الناس',
  vo='إحنا بدينا نشرح الساعات… والناس بدأت تطلب الساعات اللي نتكلم عنها.',
  claims=['Audience requests for the watches they featured led Time Keeper toward selling (founder testimony).',
          'The three messages are representative of the requests; replace with real screenshots when available.'],
  note='Notifications arrive. The community, not a business plan, created the demand.',
  sfx=[{"at": 1.4, "name": "notif", "gain": -9}, {"at": 3.4, "name": "notif", "gain": -9}, {"at": 5.4, "name": "notif", "gain": -9}],
  els=[{"type": "igpost", "x": 360, "y": 640, "w": 360, "asset": "ep2_featured_watch_post", "desc": "A real post featuring a watch", "avatar": LOGO, "rot": -2, "opacity": 0.55, "in": {"type": "pop", "at": 0.3}}] + [
      {"type": "notif", "x": 360 + (i - 1) * 14, "y": 420 + i * 175, "w": 560, "name": "timekeeperkw", "initial": "؟", "text": t, "size": 30, "in": {"type": "slideD", "at": 1.4 + i * 2.0, "from": 600}, "z": 30 + i}
      for i, t in enumerate(['وين أحصل هالساعة؟', 'تقدرون توفرونها؟', 'من وين نشتريها؟'])])

S(2, 'E2-S04', 'METAPHOR', 4.5, 'tk-bone', banner='', silent=True,
  claims=['Visual metaphor: educational content turning into a watch box (content to commerce). No factual claim.'],
  note='The post folds into a box. Silence plus paper sounds.',
  sfx=[{"at": 0.8, "name": "fold", "gain": -8}, {"at": 1.5, "name": "paper_place", "gain": -8}, {"at": 2.4, "name": "clasp", "gain": -8}],
  els=[{"type": "igpost", "x": 360, "y": 600, "w": 340, "empty": True, "avatar": LOGO, "scale": [[0.4, 1], [1.4, 0.35, "inCubic"]], "rot": [[0.4, 0], [1.4, 8]], "out": {"at": 1.35, "type": "fade", "dur": 0.15}},
       {"type": "box", "x": 360, "y": 680, "w": 340, "h": 240, "lid": [[2.2, 0], [3.2, 1, "outBack"]], "in": {"type": "pop", "at": 1.4}},
       {"type": "watch", "x": 360, "y": 650, "size": 150, "strap": False, "numerals": "arabic", "in": {"type": "pop", "at": 3.0}, "z": 40}])

S(2, 'E2-S05', 'METAPHOR', 7.0, 'tk-linen',
  vo='وكل طلب… كان معناه شي واحد: ثقة.',
  claims=['Framing: growth measured in trust, not numbers. No figures shown.', 'Screens and parcels are placeholders for the real website, app, first orders and first packaging.'],
  note='Not a numbers montage. The word ثقة lands last.',
  sfx=[{"at": 0.7, "name": "paper_place", "gain": -10}, {"at": 1.7, "name": "paper_place", "gain": -10}, {"at": 2.7, "name": "paper_place", "gain": -10}, {"at": 5.0, "name": "stamp", "gain": -6}],
  els=[{"type": "phone", "x": 190, "y": 560, "w": 230, "h": 460, "asset": "ep2_app_screenshot", "label": "REAL APP / WEBSITE SCREENSHOT NEEDED", "rot": -4, "in": {"type": "drop", "at": 0.6}},
       {"type": "box", "kind": "parcel", "x": 500, "y": 760, "w": 240, "h": 160, "label": "TK-0001", "rot": 3, "in": {"type": "drop", "at": 1.6}},
       {"type": "box", "kind": "parcel", "x": 540, "y": 590, "w": 200, "h": 140, "label": "TK-0002", "rot": -5, "in": {"type": "drop", "at": 2.6}},
       {"type": "text", "text": "ثقة", "x": 360, "y": 880, "size": 120, "font": "banner", "weight": 800, "color": "#111111", "paper": "#F3F0E8", "upper": False, "in": {"type": "slam", "at": 5.0}, "z": 60}])

S(2, 'E2-S06', 'FOUNDER', 9.0, 'tk-ink', banner='TIME KEEPER PODCAST',
  vo='وبعدها جاء البودكاست… وما عادوا يشرحون الساعات بروحهم. صاروا يتكلمون مع عالم الساعات نفسه.',
  claims=['Time Keeper has a podcast (brief; also listed on the company site). The shift from explaining alone to speaking with the watch world is founder narrative.'],
  note='Real podcast photographs and the first episode cover go in the polaroids.',
  sfx=[{"at": 0.6, "name": "mic_tap", "gain": -6}, {"at": 1.4, "name": "paper_place", "gain": -9}, {"at": 2.4, "name": "paper_place", "gain": -9}],
  els=[{"type": "mic", "x": 360, "y": 960, "size": 1.0, "in": {"type": "drop", "at": 0.3}, "z": 30},
       {"type": "waves", "x": 360, "y": 430, "bars": 25, "h": 150, "color": "#F3F0E8", "level": [[1.0, 0], [1.6, 1]]},
       photo('ep2_podcast_studio', 195, 700, 300, 1.5, 'البودكاست', -4, 1.4, desc='Real podcast recording photo'),
       photo('ep2_podcast_guest', 525, 760, 300, 1.5, 'ضيوف', 4, 2.4, desc='Important podcast guest, real photo')])

S(2, 'E2-S07', 'FOUNDER', 10.0, 'tk-ink', banner='GENEVA — SWITZERLAND',
  vo='ومن الكويت… إلى جنيف. من أكبر دور الساعات في العالم… إلى صُنّاع الساعات المستقلين.',
  claims=['Time Keeper reached Geneva and the international watch industry (founder brief).',
          'NO partnership claim and NO house logo is shown. Each house below stays a placeholder until its relationship is classified in BRAND-RELATIONS.md.'],
  note='Passport, stamp, plane. Placeholder cards carry a relationship type, never a logo.',
  sfx=[{"at": 0.8, "name": "plane", "gain": -12}, {"at": 3.5, "name": "stamp", "gain": -5}, {"at": 5.2, "name": "paper_place", "gain": -10}, {"at": 6.4, "name": "paper_place", "gain": -10}, {"at": 7.6, "name": "paper_place", "gain": -10}],
  els=[MAP([[0, V(48, 29.4, 30)], [1.2, V(26, 38, 70), "inOutCubic"], [3.4, V(10, 44, 26), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 3.0)],
           routes=[{"from": "kw", "to": "gva", "at": 0.8, "dur": 2.2, "curve": 0.14}], highlight=[{"n": "Kuwait", "at": 0, "color": "#111111"}, {"n": "Switzerland", "at": 3.2, "color": "#111111"}], y=500, h=480, w=640),
       {"type": "card", "x": 105, "y": 905, "w": 150, "h": 200, "color": "#17181B", "ink": "#E6E1D5", "label": "PASSPORT", "labelSize": 20, "rot": -6, "in": {"type": "drop", "at": 2.4}, "z": 30},
       {"type": "stamp", "x": 108, "y": 925, "text": "GENEVA", "color": "#F3F0E8", "size": 22, "weight": 800, "rot": -12, "blend": "normal", "in": {"type": "slam", "at": 3.5}, "z": 40}] + [
      {"type": "photo", "asset": "ep2_house_%d" % (i + 1), "x": 270 + i * 170, "y": 905, "w": 160, "aspect": 1.3, "label": "", "desc": "House + relationship type (no logo until classified)", "descSize": 15,
       "rot": [-3, 2, -2][i], "in": {"type": "drop", "at": 5.2 + i * 1.2}, "z": 35 + i} for i in range(3)])

S(2, 'E2-S08', 'FOUNDER', 10.0, 'tk-bone', floor=True, banner='WATCHES & WONDERS — GENEVA',
  vo='في البداية… كنا ندور المعلومة. وبعد سنوات… صرنا نروح للمصدر.',
  claims=['The founders attended Watches & Wonders in Geneva (founder brief). Relationship class for event: EVENT ACCESS. Do not describe as partnership.'],
  note='Same three founders, now walking through the international watch industry. Real event photos go on the wall.',
  brands=[{"name": "Watches & Wonders", "relation": "event_access", "evidence": "Founder brief: attended in Geneva. Add badge or invitation photo."}],
  beds=[{"name": "crowd", "from": 0.5, "to": 10, "gain": -26}],
  sfx=[{"at": 5.2, "name": "shutter", "gain": -10}],
  els=[photo('ep2_wandw_01', 190, 520, 280, 1.5, 'جنيف', -3, 0.6, desc='Watches & Wonders, Geneva (real photo)'),
       photo('ep2_wandw_02', 530, 560, 280, 1.5, '', 3, 1.2, desc='Meeting or manufacture visit (real photo)'),
       pup('ar', [[0, -120], [9.5, 840, "linear"]], 960, .8, view='side', walk=True, walkRate=1.3),
       pup('mw', [[0, -300], [9.5, 660, "linear"]], 960, .8, view='side', walk=True, walkRate=1.3),
       pup('ay', [[0, -480], [9.5, 480, "linear"]], 960, .8, view='side', walk=True, walkRate=1.3)])

S(2, 'E2-S09', 'FOUNDER', 8.0, 'tk-ink', banner='',
  vo='تايم كيبر ما عاد مجرد حساب. صار مجتمع.',
  claims=['Time Keeper grew from an account into a community (founder brief).'],
  note='Kuwait connected by paper lines to Switzerland, then the map widens. Cut to black at the end.',
  beds=[],
  sfx=[{"at": 0.6, "name": "plane", "gain": -14}, {"at": 5.6, "name": "stamp", "gain": -7}],
  els=[MAP([[0, V(26, 38, 70)], [3.0, V(20, 25, 300), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 0)], routes=[{"from": "kw", "to": "gva", "at": 0.3, "dur": 1.0, "keep": True, "plane": False}],
           highlight=[{"n": "Kuwait", "color": "#111111"}, {"n": "Switzerland", "color": "#111111"}], y=560, h=700, w=660, graticule=True),
       {"type": "text", "text": "مجتمع", "x": 360, "y": 900, "size": 130, "font": "banner", "weight": 800, "color": "#111111", "paper": "#F3F0E8", "upper": False, "in": {"type": "slam", "at": 5.6}, "z": 60}])

# =====================================================================================================================
# EPISODE 3  «من مجتمع… إلى علامة»   community -> credibility -> physical presence -> creation -> legacy
# =====================================================================================================================
S(3, 'E3-S01', 'METAPHOR', 6.5, 'tk-graphite', banner='',
  vo='المجتمع الرقمي… احتاج بيت.',
  claims=['Metaphor: the digital community finds a physical home.'],
  note='The phone screen folds down and becomes a door; the door opens.',
  sfx=[{"at": 1.4, "name": "fold", "gain": -8}, {"at": 3.0, "name": "paper_place", "gain": -8}, {"at": 4.2, "name": "door_chime", "gain": -10}],
  els=[{"type": "phone", "x": 360, "y": 580, "w": 320, "h": 640, "src": LOGO, "fold": [[1.4, 0], [2.6, 1, "inCubic"]], "in": {"type": "pop", "at": 0.2}},
       {"type": "door", "x": 360, "y": 600, "w": 300, "h": 540, "asset": "ep3_lounge_interior", "desc": "Lounge interior (real photo)", "sign": "TIME KEEPER LOUNGE", "open": [[3.6, 0], [5.4, 1, "outBack"]], "in": {"type": "rise", "at": 2.6, "dur": 0.7}}])

S(3, 'E3-S02', 'FOUNDER', 8.5, 'tk-ink', floor=True, banner='TIME KEEPER LOUNGE — 2022',
  vo='سنة ٢٠٢٢… افتتحنا صالة تايم كيبر. مو بس أرفف… ناس.',
  claims=['Time Keeper Lounge opened in 2022 (founder brief). People, collectors and appointments, not just shelves.'],
  note='Real lounge photographs. Populated with people.',
  sfx=[{"at": 0.9, "name": "shutter", "gain": -10}, {"at": 2.2, "name": "shutter", "gain": -10}, {"at": 3.5, "name": "shutter", "gain": -10}],
  els=[photo('ep3_lounge_01', 180, 520, 290, 1.5, 'الصالة', -4, 0.8, desc='Time Keeper Lounge (real photo)'),
       photo('ep3_lounge_02', 540, 560, 290, 1.5, 'هواة الجمع', 3, 2.0, desc='Collectors in the Lounge (real photo)'),
       photo('ep3_lounge_03', 360, 780, 300, 1.5, 'مواعيد', -1, 3.3, desc='Appointment / conversation (real photo)'),
       pup('ar', 90, 960, .7, pose='hands', talk=True, **{"in": {"type": "rise", "at": 2.5}}),
       pup('mw', 630, 960, .7, pose='stand', flip=True, **{"in": {"type": "rise", "at": 3.0}})])

S(3, 'E3-S03', 'FOUNDER', 9.0, 'tk-bone', floor=True, banner='',
  vo='من نحكي عن الساعات… إلى نبيعها… إلى نشارك بصناعتها.',
  claims=['Time Keeper moved from talking about watches, to selling them, to helping create limited and collaborative editions (founder brief).',
          'Only documented Time Keeper editions may appear in the edition cards.'],
  note='Dial, case, hands and strap assemble like layered paper. Real edition photos go on the cards.',
  sfx=[{"at": 1.0, "name": "paper_place", "gain": -10}, {"at": 1.4, "name": "paper_place", "gain": -10}, {"at": 1.8, "name": "paper_place", "gain": -10}, {"at": 2.2, "name": "clasp", "gain": -9}, {"at": 3.4, "name": "crown_wind", "gain": -9}],
  els=[{"type": "card", "x": 360, "y": 905, "w": 640, "h": 30, "tex": "wood", "color": "#fff", "z": 5},
       {"type": "watch", "x": 360, "y": 580, "size": 360, "numerals": "arabic", "brand": "TIME KEEPER", "assemble": {"at": 0.8, "stagger": 0.42, "dur": 0.6}, "time": [10, 9, 30], "rate": 4},
       photo('ep3_edition_01', 130, 780, 210, 1.2, '', -5, 5.0, desc='Real Time Keeper edition'),
       photo('ep3_edition_02', 590, 780, 210, 1.2, '', 5, 5.8, desc='Real Time Keeper edition')] + [
      {"type": "shape", "kind": "circle", "x": 210 + i * 70, "y": 330, "w": 46, "h": 46, "color": c, "in": {"type": "pop", "at": 4.0 + i * 0.25}}
      for i, c in enumerate(['#17171A', '#F1EEE6', '#B9BDC4', '#6C7078', '#D9C9A8'])])

S(3, 'E3-S04', 'FOUNDER', 8.0, 'tk-linen', floor=True, banner='TIME GALLERY — SALHIYA',
  vo='وبعدها… تايم غاليري في الصالحية. مكان تلتقي فيه الساعات المستقلة.',
  claims=['Time Gallery, Salhiya, is a Time Keeper boutique (founder brief; photo supplied by Time Keeper shows the TIME GALLERY storefront).',
          'Independent brands shown must be ones actually stocked: list needed.'],
  note='Paper building rises, doors open on the real storefront photograph.',
  sfx=[{"at": 0.8, "name": "paper_slide", "gain": -10}, {"at": 3.2, "name": "door_chime", "gain": -10}, {"at": 3.6, "name": "paper_place", "gain": -8}],
  els=[{"type": "building", "x": 170, "y": 960, "w": 250, "h": 560, "color": "#D9D2C2", "cols": 2, "rows": 7, "lit": .3, "glass": "#C9CDD2", "litColor": "#EFE8D5", "in": {"type": "rise", "at": 0.5, "dur": 0.9}},
       {"type": "card", "x": 170, "y": 430, "w": 230, "h": 54, "style": "dark", "label": "TIME GALLERY", "labelSize": 22, "ink": "#EDE9E0", "in": {"type": "pop", "at": 1.6}, "z": 40},
       photo('ep3_timegallery_store', 430, 640, 480, 1.589, 'تايم غاليري', 2.5, 3.4, desc='Time Gallery storefront')])

S(3, 'E3-S05', 'FOUNDER', 8.0, 'tk-bone', floor=True, banner='',
  vo='والمجتمع كبر… ضيوف، وهواة جمع، وصُنّاع ساعات… من كل مكان.',
  claims=['The community grew to include guests, collectors, independent watchmakers and international visitors (founder brief).',
          'The Tudor photo is an occasion Time Keeper attended; relationship class EVENT ACCESS. The words partnership and official are not used.'],
  note='The scene fills with people. Real event photographs.',
  brands=[{"name": "Tudor", "relation": "event_access", "evidence": "Photo supplied by Time Keeper: attendance at an occasion with Tudor and Saddik & Mohamed Attar signage. Confirm relationship wording with the founders."}],
  sfx=[{"at": 0.6 + i * 0.5, "name": "paper_place", "gain": -14} for i in range(6)] + [{"at": 4.2, "name": "shutter", "gain": -10}],
  beds=[{"name": "crowd", "from": 1.0, "to": 8.0, "gain": -28}],
  els=[photo('ep3_event_tudor', 360, 470, 440, 1.689, 'مناسبة تيودور · صديق ومحمد عطار', -2.5, 4.0, desc='Event photo'),
       pup('ar', 120, 960, .72, pose='stand', **{"in": {"type": "rise", "at": 0.5}}), pup('mw', 250, 960, .72, pose='hands', flip=True, **{"in": {"type": "rise", "at": 0.9}}),
       pup('ay', 380, 960, .72, pose='stand', **{"in": {"type": "rise", "at": 1.3}}),
       {"type": "puppet", "x": 510, "y": 960, "size": .72, "top": "#B1B5BC", "pose": "stand", "in": {"type": "rise", "at": 1.9}},
       {"type": "puppet", "x": 600, "y": 960, "size": .66, "top": "#5B5F68", "pose": "hands", "flip": True, "in": {"type": "rise", "at": 2.3}},
       {"type": "puppet", "x": 55, "y": 960, "size": .66, "top": "#9A9EA6", "pose": "stand", "in": {"type": "rise", "at": 2.7}}])

S(3, 'E3-S06', 'METAPHOR', 8.0, 'tk-black', banner='THE RAREST IN KUWAIT', floor=False,
  vo='وهذا مو بيع… هذي ثقافة ساعات.',
  claims=['The Rarest in Kuwait is a Time Keeper project (founder brief). Watches shown must be the real pieces featured; the three here are generic placeholders.'],
  note='Darker, museum-like. Spotlights, pedestals, collector cards. Culture, not sales.',
  sfx=[{"at": 1.0, "name": "whoosh", "gain": -12}, {"at": 2.6, "name": "whoosh", "gain": -12}, {"at": 4.2, "name": "whoosh", "gain": -12}],
  els=[{"type": "spotlight", "x": 150 + i * 210, "y": 250, "w": 260, "h": 760, "in": {"type": "fade", "at": 0.8 + i * 1.6, "dur": 0.5}, "flicker": False} for i in range(3)] + [
      {"type": "pedestal", "x": 150 + i * 210, "y": 940, "w": 170, "h": 150, "color": "#2B2D33"} for i in range(3)] + [
      {"type": "watch", "x": 150 + i * 210, "y": 640 - i * 20, "size": 210, "strap": i != 1, "numerals": "arabic", "dialColor": DIALS[i], "handColor": '#F1EEE6' if i == 0 else '#111', "markerColor": '#F1EEE6' if i == 0 else '#111',
       "caseColor": ['#C9CCD1', '#B5976A', '#9AA0A8'][i], "assemble": {"at": 1.0 + i * 1.6, "stagger": 0.1, "dur": 0.6}, "time": [10, 9, 30]} for i in range(3)] + [
      {"type": "card", "x": 150 + i * 210, "y": 1030, "w": 190, "h": 76, "style": "dark", "color": "#EDE9E0", "ink": "#111", "label": "REF. — — —", "labelSize": 16, "in": {"type": "pop", "at": 2.2 + i * 1.6}} for i in range(3)])

S(3, 'E3-S07', 'FOUNDER', 8.0, 'tk-bone', floor=True, banner='TIME KEEPER — THE AVENUES',
  vo='وبعدها… الأفنيوز.',
  claims=['Time Keeper has a boutique at The Avenues (founder brief; SYSTEM.md lists Avenues as an outlet).'],
  note='The Avenues rises from paper; real storefront photo and the founders outside.',
  sfx=[{"at": 0.6, "name": "paper_slide", "gain": -10}, {"at": 3.4, "name": "door_chime", "gain": -10}, {"at": 4.2, "name": "shutter", "gain": -10}],
  els=[{"type": "building", "x": 215, "y": 960, "w": 340, "h": 600, "color": "#D2CABA", "cols": 3, "rows": 7, "lit": .25, "glass": "#C9CDD2", "litColor": "#EFE8D5", "in": {"type": "rise", "at": 0.4, "dur": 1.0}},
       {"type": "card", "x": 215, "y": 410, "w": 260, "h": 58, "style": "dark", "label": "TIME KEEPER", "labelSize": 22, "ink": "#EDE9E0", "in": {"type": "pop", "at": 1.6}, "z": 40},
       photo('ep3_avenues_store', 470, 600, 380, 1.5, 'الأفنيوز', 3, 3.6, desc='Time Keeper, The Avenues (real photo)'),
       pup('ar', 420, 960, .78, pose='stand', **{"in": {"type": "rise", "at": 2.6}}), pup('mw', 530, 960, .78, pose='cheer', **{"in": {"type": "rise", "at": 2.9}}),
       pup('ay', 640, 960, .78, pose='stand', flip=True, **{"in": {"type": "rise", "at": 3.2}})])

# ---- the ending: return to the beginning ----------------------------------------------------------------------------
S(3, 'E3-S08', 'FOUNDER', 5.0, 'tk-ink', banner='BOULDER — COLORADO',
  vo='القصة ما بدأت بمحل.',
  claims=['The story began in Boulder, not in a store (founder testimony).'],
  note='Return to the beginning: the Boulder photograph again.',
  sfx=[{"at": 0.3, "name": "fold", "gain": -10}, {"at": 1.4, "name": "paper_place", "gain": -8}],
  els=[MAP([[0, V(-105.27, 40.0, 9)]], pins=[pin(BOU, 0.4)], y=520, h=520, w=640, states=True),
       photo('ep1_boulder_university', 360, 850, 380, 1.5, 'BOULDER', -3, 1.2, desc='Ali Al-Ramadhan + Ali Al-Yousifi, university years in Boulder')])

S(3, 'E3-S09', 'FOUNDER', 4.5, 'tk-bone', floor=True,
  vo='ولا بدأت بخطة عمل.',
  claims=['It did not begin with a business plan (founder testimony).'],
  note='Match cut: the old coffee table, the three friends.',
  els=table(w=560) + [
      pup('ar', 150, 960, 1.1, pose='sitTalk', talk=True), pup('mw', 360, 960, 1.1, pose='sit'), pup('ay', 570, 960, 1.1, pose='sit', flip=True)] + [
      {"type": "cup", "x": 200 + i * 160, "y": 832, "size": .6, "z": 25} for i in range(3)])

S(3, 'E3-S10', 'FOUNDER', 6.0, 'tk-bone', floor=True,
  vo='بدأت بثلاثة أصدقاء… يحبون الساعات.',
  claims=['It began with three friends who love watches (founder testimony).'],
  note='Same table. Watches arrive.',
  sfx=[{"at": 1.6, "name": "clasp", "gain": -9}, {"at": 2.4, "name": "clasp", "gain": -9}, {"at": 3.2, "name": "clasp", "gain": -9}],
  els=table(w=560) + [
      pup('ar', 150, 960, 1.1, pose='sitWatch'), pup('mw', 360, 960, 1.1, pose='sit'), pup('ay', 570, 960, 1.1, pose='sitWatch', flip=True)] + [
      {"type": "cup", "x": 200 + i * 160, "y": 832, "size": .6, "z": 25} for i in range(3)] + [
      {"type": "watch", "x": 270 + i * 90, "y": 828, "size": 96, "strap": False, "anchor": "b", "z": 25, "dialColor": DIALS[i], "handColor": '#F1EEE6' if i == 0 else '#111', "markerColor": '#F1EEE6' if i == 0 else '#111', "in": {"type": "pop", "at": 1.5 + i * 0.8}} for i in range(3)])

S(3, 'E3-S11', 'FOUNDER', 6.5, 'tk-graphite', banner='KUWAIT',
  vo='شافوا إن المعلومة بالعربي ناقصة… وقرروا يبسّطونها.',
  claims=['They saw that Arabic watch information was lacking and decided to simplify it (founder testimony).'],
  note='Kuwait Towers; the tiny Arabic card grows to match the English pile.',
  sfx=[{"at": 0.8, "name": "paper_slide", "gain": -10}, {"at": 3.4, "name": "paper_place", "gain": -9}, {"at": 4.4, "name": "paper_place", "gain": -9}],
  els=[{"type": "towers", "x": 600, "y": 960, "h": 360, "in": {"type": "rise", "at": 0.3}}] + [
      {"type": "card", "x": 190 + (i % 2) * 10, "y": 880 - i * 60, "w": 270, "h": 56, "label": ["WATCH GUIDE", "MOVEMENTS", "REVIEWS", "HISTORY", "BUYING TIPS"][i], "labelSize": 20, "color": "#F3F0E8", "rot": ((i * 37) % 7 - 3) * 0.8} for i in range(5)] + [
      {"type": "card", "x": 420, "y": 880, "w": 130, "h": 46, "label": "بالعربي", "labelSize": 18, "color": "#F3F0E8", "rot": 2,
       "scale": [[2.4, 1], [3.6, 1.9, "outBack"]]}] + [
      {"type": "card", "x": 420, "y": 880 - (i + 1) * 78, "w": 250, "h": 70, "label": ["بسيطة", "واضحة", "بالعربي"][i], "labelSize": 24, "labelFont": "banner", "color": "#F3F0E8", "rot": ((i * 29) % 5 - 2) * 0.9, "in": {"type": "drop", "at": 3.8 + i * 0.5}} for i in range(3)])

# 4-beat montage: post / mic / people / world
S(3, 'E3-S12', 'FOUNDER', 2.4, 'tk-bone', banner='', vo='من بوست…',
  claims=['From a post to a podcast to a community to the world: the arc stated by the founders.'],
  sfx=[{"at": 0.3, "name": "paper_place", "gain": -8}],
  els=[{"type": "igpost", "asset": "ep2_first_post_01", "desc": "First educational post", "x": 360, "y": 600, "w": 360, "avatar": LOGO, "likeAt": 1.2, "in": {"type": "drop", "at": 0.2}}])
S(3, 'E3-S13', 'FOUNDER', 2.4, 'tk-ink', banner='', vo='إلى بودكاست…',
  claims=['Podcast (founder brief).'], sfx=[{"at": 0.3, "name": "mic_tap", "gain": -6}],
  els=[{"type": "mic", "x": 360, "y": 940, "size": 1.1, "in": {"type": "drop", "at": 0.1}}, {"type": "waves", "x": 360, "y": 420, "bars": 25, "h": 150, "color": "#F3F0E8", "level": [[0.5, 0], [0.9, 1]]}])
S(3, 'E3-S14', 'FOUNDER', 2.6, 'tk-bone', banner='', floor=True, vo='إلى مجتمع…',
  claims=['Community (founder brief).'], sfx=[{"at": 0.2, "name": "crowd", "gain": -18}],
  els=[pup('ar', 130, 960, .8, pose='cheer', **{"in": {"type": "rise", "at": 0.1}}), pup('mw', 250, 960, .8, pose='stand', **{"in": {"type": "rise", "at": 0.2}}),
       pup('ay', 370, 960, .8, pose='hands', **{"in": {"type": "rise", "at": 0.3}}),
       {"type": "puppet", "x": 490, "y": 960, "size": .8, "top": "#B1B5BC", "pose": "wave", "in": {"type": "rise", "at": 0.4}},
       {"type": "puppet", "x": 600, "y": 960, "size": .8, "top": "#5B5F68", "pose": "stand", "flip": True, "in": {"type": "rise", "at": 0.5}}])
S(3, 'E3-S15', 'FOUNDER', 3.2, 'tk-ink', banner='', vo='إلى العالم.',
  claims=['The wider global watch industry (founder brief). Map is illustrative.'], sfx=[{"at": 0.4, "name": "plane", "gain": -12}],
  els=[MAP([[0, V(48, 29.4, 30)], [2.6, V(20, 25, 330), "inOutCubic"]], pins=[pin(KW, 0), pin(GVA, 0.5)], routes=[{"from": "kw", "to": "gva", "at": 0.4, "dur": 1.4, "keep": True, "plane": False}],
           highlight=[{"n": "Kuwait", "color": "#111111"}, {"n": "Switzerland", "color": "#111111"}], y=560, h=700, w=660, graticule=True)])

S(3, 'E3-S16', 'METAPHOR', 4.0, 'tk-ink', banner='', silent=True,
  claims=['Pause. The Time Keeper mark.'], note='Silence, then the mark.', tr='fade',
  beds=[{"name": "watch_run", "from": 0.6, "to": 4.0, "gain": -24}],
  els=[{"type": "image", "x": 360, "y": 560, "w": 230, "h": 230, "src": LOGO, "pad": 14, "rot": -2, "in": {"type": "pop", "at": 0.8, "dur": 0.8}}])
S(3, 'E3-S17', 'FOUNDER', 5.5, 'tk-ink', banner='',
  vo='والوقت… كان مجرد البداية.',
  claims=['Closing line.'], note='Hold on the mark. Tick.', tr='cut',
  sfx=[{"at": 3.8, "name": "tick_pair", "gain": -8}],
  els=[{"type": "image", "x": 360, "y": 560, "w": 230, "h": 230, "src": LOGO, "pad": 14, "rot": -2}])
S(3, 'E3-S18', 'METAPHOR', 3.0, 'tk-black', banner='', silent=True, captions='',
  claims=['Black. One more tick.'], tr='fade', sfx=[{"at": 0.8, "name": "tick_pair", "gain": -8}], els=[])

# ---- write -----------------------------------------------------------------------------------------------------------
TITLES = {1: 'قبل تايم كيبر', 2: 'الفكرة تكبر', 3: 'من مجتمع… إلى علامة'}
MOODS = {1: 'curious', 2: 'momentum', 3: 'scale'}
for ep, scenes in SCENES.items():
    total = sum(s['dur'] for s in scenes)
    out = {"title": TITLES[ep], "episode": ep, "width": 720, "height": 1280, "fps": 30, "maxWords": 4,
           "style": STYLE['style'], "themes": STYLE['themes'],
           "audio": {"autoSfx": True, "music": "renders/ep%d_score_temp.wav" % ep, "musicGain": -17},
           "scenes": scenes}
    json.dump(out, open(os.path.join(HERE, 'ep%d.json' % ep), 'w'), ensure_ascii=False, indent=1)
    print('ep%d  %d scenes  %.1fs' % (ep, len(scenes), total))
