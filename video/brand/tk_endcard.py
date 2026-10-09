"""The Time Keeper end card. Every Time Keeper film ends on it (the owner's choice, taken from the success story).

On a near-black plate a gold clock hand sweeps once around and draws the Time Keeper logo (2 s, the "reveal"
element). One tick as the hand starts, the double tick as the screen falls to black, then 1.3 s of black. The film's
music should end before it, so the ticks are heard alone.

    import sys; sys.path.insert(0, '<repo>/video/brand'); from tk_endcard import endcard
    scenes += endcard(os.path.dirname(storyboard_path), theme='ro-black')

theme: any theme the storyboard defines (the plate covers it). caption / voice: an optional closing line, as in the
success story ('والوقت… | كان مجرد البداية.'); without one the card plays silent apart from the ticks."""
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LOGO = os.path.join(REPO, 'public', 'icon-512.png')
GOLD = '#C9A35F'
DUR, BLACK = 4.5, 1.3


def _plate(color, z, **kw):
    s = ('<svg xmlns="http://www.w3.org/2000/svg" width="760" height="1320" viewBox="0 0 760 1320"><rect width="760" height="1320" fill="%s"/></svg>' % color)
    return dict({"type": "svg", "w": 760, "h": 1320, "svg": s, "x": 360, "y": 640, "anchor": "c", "z": z, "depth": 0, "still": True}, **kw)


def endcard(storyboard_dir, theme, caption='', voice=None, voice_at=0.15, caption_end=None):
    """The two closing scenes (logo card, then black). Paths are made relative to the storyboard's folder."""
    hand = ('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="300" viewBox="0 0 40 300">'
            '<rect x="16" y="0" width="8" height="300" rx="4" fill="%s"/><circle cx="20" cy="290" r="14" fill="%s"/></svg>' % (GOLD, GOLD))
    els = [_plate('#111111', 1),
           {"type": "reveal", "src": os.path.relpath(LOGO, storyboard_dir), "x": 360, "y": 560, "w": 380, "h": 380, "z": 20,
            "reveal": [[0.3, 0], [2.3, 1, "inOutSine"]]},
           {"type": "svg", "w": 40, "h": 300, "svg": hand, "x": 360, "y": 560, "anchor": "b", "z": 30, "still": True,
            "rot": [[0.3, 0], [2.3, 360, "inOutSine"]], "opacity": [[0.3, 0], [0.4, 1], [2.3, 1], [2.6, 0]]},
           _plate('#000000', 90, opacity=[[3.6, 0], [4.5, 1]])]
    card = {"theme": theme, "floor": False, "elements": els, "dur": DUR, "silent": True, "transition": "fade", "endcard": "timekeeper",
            "sfx": [{"at": 0.3, "name": "tick", "gain": -12}, {"at": 3.6, "name": "tick_pair", "gain": -8}],
            "camera": {"zoom": [[0, 1.0], [DUR, 1.08]], "x": [[0, 360]], "y": [[0, 600]]}}
    if caption:
        card.update({"captions": caption, "captionStart": voice_at + .05, "captionEnd": caption_end or 3.0})
    if voice:
        card.update({"voice": os.path.relpath(voice, storyboard_dir), "voiceAt": voice_at})
    black = {"theme": theme, "floor": False, "elements": [_plate('#000000', 1)], "dur": BLACK, "silent": True, "transition": "cut", "endcard": "timekeeper"}
    return [card, black]
