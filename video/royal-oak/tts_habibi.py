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
ORDER = ['p1-h'] + ['p1-%d' % i for i in range(9)] + ['p2-h', 'p2-0', 'p2-1', 'p2-q'] + ['p2-%d' % i for i in range(2, 9)]


def lines(revised):
    text = {k: v['text'] for k, v in json.load(open(os.path.join(H, 'voice-ar', 'clips.json'))).items()}
    if revised:
        for line in open(os.path.join(H, 'VOICE-TODO.md')):
            m = re.match(r'\| (p\d-[0-9a-z]+)[^|]*\| [^|]*\| ([^|]+) \|', line)
            if m and m.group(1) in text: text[m.group(1)] = m.group(2).strip()
    return text


if __name__ == '__main__':
    import torch, soundfile as sf
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
    todo = [k for k in keys if not (k in done and done[k]['text'] == text[k] and os.path.exists(os.path.join(OUT, done[k]['file'])))]
    if not todo: sys.exit('nothing to do')
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/model_200000.safetensors')),
                       mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/vocab.txt')), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    ref_audio, ref_text = preprocess_ref_audio_text(str(files('habibi_tts').joinpath('assets/Gulf.wav')), REF_TEXT)
    for k in todo:
        t0 = time.time()
        wav, sr, _ = infer_process(ref_audio, ref_text, text[k], model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type, device='cpu', dialect_id=None)
        f = 'clips/%s.wav' % k
        sf.write(os.path.join(OUT, f), wav, sr)
        done[k] = {"file": f, "seconds": round(len(wav) / sr, 2), "text": text[k], "voice": "Habibi-TTS SAU, Gulf.wav prompt"}
        json.dump(done, open(path, 'w'), ensure_ascii=False, indent=1)
        print('%s  %.1f s audio  in %.0f s' % (k, done[k]['seconds'], time.time() - t0), flush=True)
