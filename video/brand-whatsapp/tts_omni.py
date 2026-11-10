"""Narration for the brand-WhatsApp team video with OmniVoice (k2-fsa/OmniVoice, Gulf Arabic 'afb').
One voice for every line: the same clone reference as video/store-update (its s03 take), so both team videos share a narrator.
Each line gets N takes; faster-whisper reads them back and the take closest to the script wins.
Writes voice/sNN.wav (trimmed, 24 kHz) and voice/report.json. Run with /root/omni/venv/bin/python.
Usage: tts_omni.py [keys...] [--takes N]
"""
import difflib
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
import torch
from faster_whisper import WhisperModel
from omnivoice import OmniVoice

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'voice')
REF = os.path.join(OUT, 'ref.wav')
# what ref.wav says (video/store-update narration s03)
REF_TEXT = 'صفحة الساعة: زر الواتساب صار تحت زر الشراء على طول، والرسالة توصلكم فيها اسم الساعة.'
lines = {k: v for k, v in json.load(open(os.path.join(HERE, 'narration.json'))).items() if not k.startswith('_')}
args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith('--') and sys.argv[i - 1] != '--takes']
takes = int(sys.argv[sys.argv.index('--takes') + 1]) if '--takes' in sys.argv else 3
keys = [k for k in lines if not args or k in args]

torch.set_num_threads(4)
tts = OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map='cpu', dtype=torch.float32)
asr = WhisperModel('small', device='cpu', compute_type='int8')


# English names in the script, as an Arabic transcript may spell them, so a take that says them is not marked down
SPELL = {'dennison': 'دنيسون', 'whatsapp': 'واتساب'}


def norm(s):
    s = re.sub(r'[A-Za-z]+', lambda m: SPELL.get(m.group(0).lower(), m.group(0)), s)
    s = re.sub(r'[^؀-ۿ0-9 ]', ' ', s)
    s = re.sub('[أإآ]', 'ا', s).replace('ة', 'ه').replace('ى', 'ي')
    return ' '.join(s.split())


def trim(a, thr=0.01, pad=0.08):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx):
        return a
    p = int(pad * 24000)
    return a[max(0, idx[0] - p): idx[-1] + p]


report = json.load(open(os.path.join(OUT, 'report.json'))) if os.path.exists(os.path.join(OUT, 'report.json')) else {}
for k in keys:
    best = None
    for n in range(takes):
        torch.manual_seed(100 + n)
        a = tts.generate(text=lines[k], language='afb', ref_audio=REF, ref_text=REF_TEXT)[0]
        a = trim(a)
        f = os.path.join(OUT, f'{k}-t{n}.wav')
        sf.write(f, a, 24000)
        heard = ' '.join(s.text.strip() for s in asr.transcribe(f, language='ar', beam_size=5)[0])
        score = difflib.SequenceMatcher(None, norm(lines[k]), norm(heard)).ratio()
        if re.search(r'[A-Za-z]', lines[k]):   # the English names, as a transcript with no language set hears them
            heard += '  [auto: ' + ' '.join(s.text.strip() for s in asr.transcribe(f, beam_size=5)[0]) + ']'
        print(k, n, f'{len(a) / 24000:.1f}s', f'{score:.2f}', heard, flush=True)
        if best is None or score > best[0]:
            best = (score, f, heard, len(a) / 24000)
    os.replace(best[1], os.path.join(OUT, f'{k}.wav'))
    report[k] = {'text': lines[k], 'heard': best[2], 'score': round(best[0], 3), 'sec': round(best[3], 2)}
    for n in range(takes):
        p = os.path.join(OUT, f'{k}-t{n}.wav')
        if os.path.exists(p):
            os.remove(p)
json.dump(report, open(os.path.join(OUT, 'report.json'), 'w'), ensure_ascii=False, indent=1)
