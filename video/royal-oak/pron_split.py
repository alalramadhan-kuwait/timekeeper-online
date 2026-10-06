#!/usr/bin/env python3
"""Syllable-split pronunciation test: each spelling is spoken on its own (no carrier sentence), saved as its own
numbered file, so a fault can be traced to Royal, to Oak, or to the join between them.

  $HABIBI_PY pron_split.py ro_split.json      -> voice-habibi/pron/<name>/<group>_NN.wav

Same voice, seed and speed for every file; one length per group (sized for the group's longest spelling, so no
version is squeezed). Identical spellings give identical audio, so each distinct text is generated once."""
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
    spec = json.load(open(os.path.join(H, sys.argv[1])))
    cfg = OmegaConf.load(str(files('f5_tts').joinpath('configs/F5TTS_v1_Base.yaml')))
    model = load_model(get_class('f5_tts.model.%s' % cfg.model.backbone), cfg.model.arch,
                       str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/model_200000.safetensors')),
                       mel_spec_type=cfg.model.mel_spec.mel_spec_type, vocab_file=str(cached_path('hf://SWivid/Habibi-TTS/Specialized/SAU/vocab.txt')), device='cpu')
    vocoder = load_vocoder(vocoder_name=cfg.model.mel_spec.mel_spec_type, device='cpu')
    ref_audio, ref_text = preprocess_ref_audio_text(str(files('habibi_tts').joinpath('assets/Gulf.wav')), T.REF_TEXT)
    ref_dur = sf.info(ref_audio).duration
    say = lambda v: v if v[-1] in '.،' else v + '.'
    est = lambda v: ref_dur + ref_dur * len(T.DIAC.sub('', say(v)).encode('utf-8')) / len(ref_text.encode('utf-8')) / T.SPEED + .3
    out_dir = os.path.join(H, 'voice-habibi', 'pron', spec['name']); os.makedirs(out_dir, exist_ok=True)
    log, made, t0 = [], {}, time.time()
    for g, variants in spec['groups'].items():
        fix = max(est(v) for v in variants)
        for i, v in enumerate(variants, 1):
            f = '%s_%02d.wav' % (g, i)
            if (say(v), fix) not in made:
                torch.manual_seed(SEED); np.random.seed(SEED)
                w, sr, _ = infer_process(ref_audio, ref_text, say(v), model, vocoder, mel_spec_type=cfg.model.mel_spec.mel_spec_type,
                                         device='cpu', dialect_id=None, fix_duration=fix)
                w = np.asarray(w, dtype=np.float64); w = w / max(1e-6, (w ** 2).mean() ** .5) * .1
                made[(say(v), fix)] = (w.clip(-.99, .99), sr, f)
            w, sr, same = made[(say(v), fix)]
            sf.write(os.path.join(out_dir, f), w, sr)
            log.append({'file': f, 'group': g, 'form': i, 'text': say(v), 'same_as': None if same == f else same, 'fix_duration': round(fix, 2)})
            print('%s  %s%s  (%.0f s)' % (f, say(v), '' if same == f else '  = ' + same, time.time() - t0), flush=True)
    json.dump({'seed': SEED, 'speed': T.SPEED, 'model': 'SAU model_200000', 'target': spec['target'], 'files': log},
              open(os.path.join(out_dir, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    print('done', out_dir, flush=True)
