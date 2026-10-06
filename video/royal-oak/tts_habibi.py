#!/usr/bin/env python3
"""Narration with Habibi-TTS (github.com/SWivid/Habibi-TTS), the Saudi/Gulf specialized model, voice cloned from the
Gulf reference prompt that ships with it (assets/Gulf.wav). Writes voice-habibi/clips/<key>.wav and
voice-habibi/clips.json in the same format as voice-ar; NARRATOR=voice-habibi python3 parts.py uses them.

LICENCE: the SAU/UAE/Unified Habibi models are CC-BY-NC-SA-4.0 (non-commercial), and F5-TTS, the base they are
fine-tuned from, is non-commercial too. Fine for drafts; the owner was told before choosing it for publication.

Run it with the Python that has habibi-tts installed (CPU is fine, about 25x real time):
  HABIBI_PY=<venv>/bin/python $HABIBI_PY tts_habibi.py [--revised] [key ...]     (resumes: skips clips already made)"""
import json, os, re, sys, time
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, 'voice-habibi'); os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)
REF_TEXT = 'وين تو الناس متى تصحى ومتى تفطر وتغير يبيلك ساعة يعني بالله تروح الشغل الساعة عشره.'
SPEED = 0.9            # a little slower than the model's natural pace: a documentary narrator, not a conversation
# English and foreign words are written in Latin letters for the model only (the owner asked for brand names, people's
# names and cities to be read in English); the captions keep the Arabic spelling.
PRON = {
    'جيرالد جنتا': 'Gerald Genta', 'جنتا': 'Genta', 'جيرالد': 'Gerald',
    'جورج غولاي': 'Georges Golay', 'غولاي': 'Golay',
    'كارلو دي ماركي': 'Carlo de Marchi', 'شارل بوتي': 'Charles Bauty', 'شارل دورو': 'Charles Dorot',
    'يونيفرسال جنيف': 'Universal Geneve', 'جنيف': 'Geneva', 'بازل': 'Basel', 'تورينو': 'Torino', 'لوزان': 'Lausanne', 'باريس': 'Paris',
    'إس إيه إس': 'S.A.S', 'البولروتر': 'Polerouter', 'أوميغا': 'Omega', 'الكونستليشن': 'Constellation',
    'أوديمار بيغيه': 'Audemars Piguet', 'الرويال أوك': 'Royal Oak', 'سيكو': 'Seiko', 'الكوارتز': 'quartz', 'كوارتز': 'quartz',
    'ملم': 'ملي',
}
DIAC = re.compile('[\u064B-\u0652]')


def spoken(t):
    for a in sorted(PRON, key=len, reverse=True):
        t = re.sub(r'(?<![\u0621-\u064A])([وبلف]?)' + re.escape(a) + r'(?![\u0621-\u064A])', lambda m: m.group(1) + (' ' if m.group(1) and PRON[a][:1].isascii() else '') + PRON[a], t)
    return t


REF_LATIN = 'wein tu ennas mita tisha w mita tiftir w tighayyir yibilak saa yani billah trooh ishshughul issaa ashra.'
LATIN = re.compile(r"[A-Za-z][A-Za-z.' -]*[A-Za-z.]|[A-Za-z]")


def segments(t):
    """Split a spoken line into (lang, text): runs of Latin letters are English, the rest Arabic."""
    out, i = [], 0
    for m in LATIN.finditer(t):
        a = t[i:m.start()].strip(' ')
        if a.strip(' ،,.:…'): out.append(('ar', a))
        elif a and out: out[-1] = (out[-1][0], out[-1][1] + a)
        out.append(('en', m.group(0).strip()))
        i = m.end()
    a = t[i:].strip(' ')
    if a.strip(' ،,.:…'): out.append(('ar', a))
    return out


ORDER = ['p1-h'] + ['p1-%d' % i for i in range(9)] + ['p2-h', 'p2-0', 'p2-1', 'p2-q'] + ['p2-%d' % i for i in range(2, 9)]


def lines(revised):
    text = {k: v['text'] for k, v in json.load(open(os.path.join(H, 'voice-ar', 'clips.json'))).items()}
    if revised:
        for line in open(os.path.join(H, 'VOICE-TODO.md')):
            m = re.match(r'\| (p\d-[0-9a-z]+)[^|]*\| [^|]*\| ([^|]+) \|', line)
            if m and m.group(1) in text: text[m.group(1)] = m.group(2).strip()
    return text


if __name__ == '__main__':
    import torch, soundfile as sf, numpy as np
    from importlib.resources import files
    from cached_path import cached_path
    from omegaconf import OmegaConf
    from hydra.utils import get_class
    from f5_tts.infer.utils_infer import load_model, load_vocoder, preprocess_ref_audio_text
    from habibi_tts.infer.utils_infer import infer_process
    torch.set_num_threads(os.cpu_count())
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    text = lines('--revised' in sys.argv)
    keys = args or ORDER
    path = os.path.join(OUT, 'clips.json')
    done = json.load(open(path)) if os.path.exists(path) else {}
    todo = [k for k in keys if not (k in done and done[k]['text'] == text[k] and done[k].get('speed') == SPEED and done[k].get('spoken') == spoken(text[k]) and done[k].get('method') == 'splice' and os.path.exists(os.path.join(OUT, done[k]['file'])))]
    if not todo: sys.exit('nothing to do')
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/model_200000.safetensors')),
                       mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/vocab.txt')), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    ref_audio, ref_text = preprocess_ref_audio_text(str(files('habibi_tts').joinpath('assets/Gulf.wav')), REF_TEXT)
    ref_dur = sf.info(ref_audio).duration
    en = {}
    def english(word):
        # the base F5-TTS model (English) cloned from the same Gulf prompt: the same voice, saying the English word
        if 'm' not in en:
            from f5_tts.api import F5TTS
            en['m'] = F5TTS(model='F5TTS_v1_Base', device='cpu')
        w, sr_, _ = en['m'].infer(ref_audio, REF_LATIN, word, speed=SPEED, remove_silence=False, show_info=lambda *a: None)
        return np.asarray(w, dtype=np.float64), sr_
    def level(w): return w / max(1e-6, (w ** 2).mean() ** .5) * 10 ** (-20 / 20)
    def trim(w, sr_, th=.02):
        idx = np.where(np.abs(w) > th * np.abs(w).max())[0]
        return w[max(0, idx[0] - int(.03 * sr_)): idx[-1] + int(.06 * sr_)] if len(idx) else w
    for k in todo:
        t0 = time.time()
        say = spoken(text[k])
        # the model sizes a line by its UTF-8 length; diacritics would stretch it, so size it from the plain text
        plain = DIAC.sub('', say)
        fix = ref_dur + ref_dur * len(plain.encode('utf-8')) / len(ref_text.encode('utf-8')) / SPEED
        parts = []
        for lang, seg in segments(say):
            if lang == 'ar' and seg[:1] in '،,:.' and parts:                         # a comma after a name: a longer breath
                parts[-1] = np.zeros(int(.26 * sr)); seg = seg.lstrip('،,:. ')
            if lang == 'en':
                w, sr = english(seg)
            else:
                plain_s = DIAC.sub('', seg)
                fx = ref_dur + ref_dur * len(plain_s.encode('utf-8')) / len(ref_text.encode('utf-8')) / SPEED
                w, sr, _ = infer_process(ref_audio, ref_text, seg, model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type, device='cpu',
                                         dialect_id=None, fix_duration=fx)
            w = level(trim(np.asarray(w, dtype=np.float64), sr))
            f = min(len(w) // 4, int(.012 * sr)); w[:f] *= np.linspace(0, 1, f); w[len(w) - f:] *= np.linspace(1, 0, f)
            parts += [w, np.zeros(int(.12 * sr))]
        wav = level(np.concatenate(parts[:-1]))                                        # every line at the same loudness (-20 dBFS RMS)
        wav = wav.clip(-.99, .99)
        f = 'clips/%s.wav' % k
        sf.write(os.path.join(OUT, f), wav, sr)
        done[k] = {"file": f, "seconds": round(len(wav) / sr, 2), "text": text[k], "voice": "Habibi-TTS SAU, Gulf.wav prompt", "spoken": say, "speed": SPEED, "method": "splice"}
        json.dump(done, open(path, 'w'), ensure_ascii=False, indent=1)
        print('%s  %.1f s audio  in %.0f s' % (k, done[k]['seconds'], time.time() - t0), flush=True)
