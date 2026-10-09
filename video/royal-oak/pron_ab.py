#!/usr/bin/env python3
"""A fair A/B pronunciation test: one sentence, one voice, one seed, one length; only the spelling of the name changes.
All versions go into one file with a short tone between them.

  HABIBI_PY=<venv>/bin/python $HABIBI_PY pron_ab.py ab_royal_oak.json      -> voice-habibi/pron/<name>.wav

The JSON gives "template" (with {name}), "variants" (the spellings, in order) and "target" (the reference
pronunciation, for the listener only; it is never sent to the model)."""
import json, os, sys, time
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
SEED = 1234

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
    spec_path = sys.argv[1]; spec = json.load(open(os.path.join(H, spec_path)))
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/model_200000.safetensors')),
                       mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/vocab.txt')), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    ref_audio, ref_text = preprocess_ref_audio_text(str(files('habibi_tts').joinpath('assets/Gulf.wav')), T.REF_TEXT)
    ref_dur = sf.info(ref_audio).duration
    first = spec['template'].format(name=spec['variants'][0])
    fix = ref_dur + ref_dur * len(T.DIAC.sub('', first).encode('utf-8')) / len(ref_text.encode('utf-8')) / T.SPEED   # one length for every version
    parts, t0 = [], time.time()
    for i, v in enumerate(spec['variants']):
        torch.manual_seed(SEED); np.random.seed(SEED)
        text = spec['template'].format(name=v)
        w, sr, _ = infer_process(ref_audio, ref_text, text, model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type, device='cpu',
                                 dialect_id=None, fix_duration=fix)
        w = np.asarray(w, dtype=np.float64); w = w / max(1e-6, (w ** 2).mean() ** .5) * .1
        tone = .05 * np.sin(2 * np.pi * 880 * np.arange(int(.15 * sr)) / sr) * np.hanning(int(.15 * sr))
        parts += [np.zeros(int(.4 * sr)), tone, np.zeros(int(.4 * sr)), w]
        print('%d/%d  %s  (%.0f s)' % (i + 1, len(spec['variants']), v, time.time() - t0), flush=True)
    out = os.path.join(H, 'voice-habibi', 'pron', spec['name'] + '.wav'); os.makedirs(os.path.dirname(out), exist_ok=True)
    sf.write(out, np.concatenate(parts).clip(-.99, .99), sr)
    print('wrote', out, 'seed', SEED, 'fix_duration %.2f' % fix, flush=True)
