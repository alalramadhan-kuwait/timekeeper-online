#!/usr/bin/env python3
"""Pronunciation test for the Gulf voice (Habibi SAU): each foreign word in several Arabic spellings with diacritics,
one clip per word, the variants in order with a short tone between them. The owner picks the variant per word;
it goes into PRON in tts_habibi.py.

  HABIBI_PY=<venv>/bin/python $HABIBI_PY pron_test.py [word-key-prefix ...]   -> voice-habibi/pron/<key>.wav"""
import json, os, sys, time
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, 'voice-habibi', 'pron'); os.makedirs(OUT, exist_ok=True)

if __name__ == '__main__':
    import torch, soundfile as sf
    from importlib.resources import files
    from cached_path import cached_path
    from omegaconf import OmegaConf
    from hydra.utils import get_class
    from f5_tts.infer.utils_infer import load_model, load_vocoder, preprocess_ref_audio_text
    from habibi_tts.infer.utils_infer import infer_process
    sys.path.insert(0, H); import tts_habibi as T
    torch.set_num_threads(os.cpu_count())
    words = json.load(open(os.path.join(H, 'pron_test.json')))
    want = [a for a in sys.argv[1:] if not a.startswith('--')]
    MODEL = next((a[8:] for a in sys.argv if a.startswith('--model=')), 'SAU')        # SAU | UAE | MSA | IRQ | Unified
    if MODEL != 'SAU': OUT = os.path.join(OUT, MODEL); os.makedirs(OUT, exist_ok=True)
    step = {'SAU': 200000, 'MSA': 200000}.get(MODEL, 100000)
    CK, VB = ('hf://SWivid/Habibi-TTS/Unified/model_200000.safetensors', 'hf://SWivid/Habibi-TTS/Unified/vocab.txt') if MODEL == 'Unified' else \
             ('hf://SWivid/Habibi-TTS/Specialized/%s/model_%d.safetensors' % (MODEL, step), 'hf://SWivid/Habibi-TTS/Specialized/%s/vocab.txt' % MODEL)
    from habibi_tts.model.utils import dialect_id_map
    DID = dialect_id_map['SAU'] if MODEL == 'Unified' else None
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path(CK)), mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path(VB)), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    ref_audio, ref_text = preprocess_ref_audio_text(str(files('habibi_tts').joinpath('assets/Gulf.wav')), T.REF_TEXT)
    ref_dur = sf.info(ref_audio).duration
    for key, variants in words.items():
        if want and not any(key.startswith(w) for w in want): continue
        f = os.path.join(OUT, key.replace(' ', '_') + '.wav')
        if os.path.exists(f): continue
        t0 = time.time(); parts = []
        for i, v in enumerate(variants):
            text = v + '.'
            fx = ref_dur + ref_dur * len(T.DIAC.sub('', text).encode('utf-8')) / len(ref_text.encode('utf-8')) / T.SPEED + .3
            w, sr, _ = infer_process(ref_audio, ref_text, text, model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type, device='cpu',
                                     dialect_id=DID, fix_duration=fx)
            w = np.asarray(w, dtype=np.float64); w = w / max(1e-6, (w ** 2).mean() ** .5) * .1
            tone = .05 * np.sin(2 * np.pi * 880 * np.arange(int(.12 * sr)) / sr) * np.hanning(int(.12 * sr))
            parts += [np.zeros(int(.35 * sr)), tone, np.zeros(int(.35 * sr)), w]
        sf.write(f, np.concatenate(parts).clip(-.99, .99), sr)
        print('%s  %d variants  in %.0f s' % (key, len(variants), time.time() - t0), flush=True)
