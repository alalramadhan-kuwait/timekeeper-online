"""Pronunciation-by-spelling test: the flagged words from Ali's review, each in its own sentence, rendered by the
winning checkpoint with several spellings (Whisper wrote Kuwaiti چ / g-ق / ج-ق as MSA letters, so the model never
learned them). Ali picks the spelling that sounds right; picks become the lexicon in voice-data/lexicon.json.
Output: voice-src/spell/<word>-<n>.wav + spell/variants.json
"""
import json
import sys
from pathlib import Path

import torch
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, load_tts  # noqa: E402

TESTS = [  # (word as written, sentence, spellings to try)
    ("باچر", "إذا باچر غيرنا الموعد، دزلي خبر قبل لا تطلع من البيت.", ["باچر", "باتشر", "باجر"]),
    ("چذي", "چذي الشركات تفكر، تبيك تنتظر عشان تحس إنها نادرة.", ["چذي", "تشذي"]),
    ("القهوة", "لا تحاتي، أنا بمر عليك العصر وناخذ القهوة بالطريق.", ["القهوة", "الگهوة"]),
    ("بالطريق", "لا تحاتي، أنا بمر عليك العصر وناخذ القهوة بالطريق.", ["بالطريق", "بالطريج"]),
    ("قبل", "والرسم أبيه باچر الصبح، ما انسوت مثلها قبل.", ["قبل", "گبل"]),
    ("قرر", "كانت بداية أزمة الكوارتز، وغولاي قرر يخاطر.", ["قرر", "گرر"]),
    ("رقم", "رقم القطعة أربعمية وتسعة من أصل خمسمية وعشرين.", ["رقم", "رگم"]),
    ("بقطر", "الرويال أوك، بقطر تسعة وثلاثين ملم.", ["بقطر", "بگطر"]),
]

ckpt = sys.argv[1]
out = SRC / "spell"
out.mkdir(parents=True, exist_ok=True)
tts = load_tts("cpu", ckpt)
tts.prepare_conditionals(str(SRC / "ref.wav"))
torch.set_num_threads(4)
manifest = []
for n, (word, sentence, spellings) in enumerate(TESTS):
    for i, sp in enumerate(spellings):
        text = sentence.replace(word, sp)
        f = out / f"w{n}-{i}.wav"
        if not f.exists():
            torch.manual_seed(0)
            w = tts.generate(text, language_id="ar", exaggeration=0.4, cfg_weight=0.5)
            torchaudio.save(str(f), w, tts.sr)
        manifest.append({"word": word, "n": n, "i": i, "spelling": sp, "text": text, "file": f.name})
        print(word, sp, flush=True)
(out / "variants.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
