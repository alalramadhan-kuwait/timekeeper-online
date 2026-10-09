#!/usr/bin/env python3
"""Pronunciation by example: the owner's own recording of a name goes at the start of the voice's reference, with
the spelling it should be tied to, so the model hears how the name is said before it speaks. The Gulf reference
stays last, next to the generated speech, so the narrator's voice carries on.

  $HABIBI_PY pron_prompt.py ro_prompt.json      -> voice-habibi/pron/<name>/<NN>.wav

The JSON gives "owner" (the recording, git-ignored, and the span in seconds that holds the name), and "tests": each
one a spelling (written into the reference transcript after the owner's clip) and a text to speak.
Same seed and speed for every file; one length for every name-only test and one for every sentence test."""
import json, os, sys, time, tempfile
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
SEED = 1234

if __name__ == '__main__':
    import torch, soundfile as sf, librosa
    from importlib.resources import files
    from cached_path import cached_path
    from omegaconf import OmegaConf
    from hydra.utils import get_class
    from f5_tts.infer.utils_infer import load_model, load_vocoder
    from habibi_tts.infer.utils_infer import infer_process
    sys.path.insert(0, H); import tts_habibi as T
    torch.set_num_threads(os.cpu_count())
    spec = json.load(open(os.path.join(H, sys.argv[1])))
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/model_200000.safetensors')),
                       mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/vocab.txt')), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    SR = 24000
    gulf, _ = librosa.load(str(files('habibi_tts').joinpath('assets/Gulf.wav')), sr=SR)
    o = spec['owner']; own, _ = librosa.load(os.path.expanduser(o['file']), sr=SR, offset=o['start'], duration=o['end'] - o['start'])
    own = own / max(1e-6, (own ** 2).mean() ** .5) * (gulf ** 2).mean() ** .5           # the owner's clip at the narrator's level
    ref = np.concatenate([own, np.zeros(int(.4 * SR)), gulf]).astype(np.float32)
    out_dir = os.path.join(H, 'voice-habibi', 'pron', spec['name']); os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'ref.wav'); sf.write(tmp, ref, SR)
    ref_dur = len(ref) / SR
    def fix_for(test):
        rt = test['spelling'] + '. ' + T.REF_TEXT
        return ref_dur + ref_dur * len(T.DIAC.sub('', test['text']).encode('utf-8')) / len(T.DIAC.sub('', rt).encode('utf-8')) / T.SPEED + .3
    fixes = {}
    for t in spec['tests']: fixes[t['kind']] = max(fixes.get(t['kind'], 0), fix_for(t))
    log, t0 = [], time.time()
    for i, t in enumerate(spec['tests'], 1):
        torch.manual_seed(SEED); np.random.seed(SEED)
        ref_text = t['spelling'] + '. ' + T.REF_TEXT
        w, sr, _ = infer_process(tmp, ref_text, t['text'], model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type,
                                 device='cpu', dialect_id=None, fix_duration=fixes[t['kind']])
        w = np.asarray(w, dtype=np.float64); w = w / max(1e-6, (w ** 2).mean() ** .5) * .1
        f = '%02d.wav' % i; sf.write(os.path.join(out_dir, f), w.clip(-.99, .99), sr)
        log.append(dict(t, file=f, fix_duration=round(fixes[t['kind']], 2)))
        print('%s  [%s] %s  (%.0f s)' % (f, t['spelling'], t['text'], time.time() - t0), flush=True)
    json.dump({'seed': SEED, 'speed': T.SPEED, 'model': 'SAU model_200000', 'owner_span': [o['start'], o['end']], 'files': log},
              open(os.path.join(out_dir, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', out_dir, flush=True)
