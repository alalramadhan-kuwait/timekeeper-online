"""Sentence-final clipping test. Ali's review flagged many sentence-final words (قبل، بالطريق، الصبح، الأقل، ممتازة،
والعلبة). Chatterbox's generate() cuts the last speech token's audio (~40 ms) on purpose, which can eat the final
consonant. Three modes on the same sentences, same seed:
  trim     stock generate (cuts the last token)
  notrim   keep every token
  pad      keep every token and end the text with "…" so the model pauses before stopping
Plus trilled-ر spellings for قرر. Output: voice-src/tail/ + variants.json (spell-page format, order shuffled).
"""
import json
import random
import sys
from pathlib import Path

import torch
import torch.nn.functional as F
import torchaudio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tk_voice_train import SRC, apply_lexicon, load_tts  # noqa: E402
from chatterbox.mtl_tts import punc_norm  # noqa: E402
from chatterbox.models.s3tokenizer import drop_invalid_tokens  # noqa: E402

SENTENCES = [  # (final word, sentence)
    ("قبل", "والرسم أبيه باچر الصبح، ما انسوت مثلها قبل."),
    ("بالطريق", "لا تحاتي، أنا بمر عليك العصر وناخذ القهوة بالطريق."),
    ("الصبح", "الطيارة توصل الساعة ست واثنين وأربعين دقيقة الصبح."),
    ("الأقل", "حطيت الطلب online، بس الـ shipping ياخذ two weeks على الأقل."),
    ("ممتازة", "أنا مو مقتنع بالـ finishing، بس الـ case proportions صراحة ممتازة."),
    ("والعلبة", "اللي ياخذ ساعة مستعملة، لازم يشيك على الأوراق والعلبة."),
]
TRILL = ("قرر", "كانت بداية أزمة الكوارتز، وغولاي قرر يخاطر.", ["قرّر", "قررّر", "قرْرَر"])


def generate(tts, text, trim=True):
    text = punc_norm(apply_lexicon(text))
    tt = tts.tokenizer.text_to_tokens(text, language_id="ar").to(tts.device)
    tt = torch.cat([tt, tt], dim=0)
    tt = F.pad(F.pad(tt, (1, 0), value=tts.t3.hp.start_text_token), (0, 1), value=tts.t3.hp.stop_text_token)
    with torch.inference_mode():
        st = tts.t3.inference(t3_cond=tts.conds.t3, text_tokens=tt, max_new_tokens=1000, temperature=0.8,
                              cfg_weight=0.5, repetition_penalty=1.2, min_p=0.05, top_p=1.0)[0]
        st = drop_invalid_tokens(st).to(tts.device)
        wav, _ = tts.s3gen.inference(speech_tokens=st, ref_dict=tts.conds.gen)
        wav = wav.squeeze(0).cpu().numpy()
        if trim:
            wav = wav[: max(1, st.shape[-1] - 1) * (tts.sr // 25)]
    return torch.from_numpy(tts.watermarker.apply_watermark(wav, sample_rate=tts.sr)).unsqueeze(0)


tts = load_tts("cpu", sys.argv[1])
tts.prepare_conditionals(str(SRC / "ref.wav"), exaggeration=0.4)
torch.set_num_threads(4)
out = SRC / "tail"
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(7)
manifest = []
jobs = []
for n, (word, s) in enumerate(SENTENCES):
    modes = [("trim", s, True), ("notrim", s, False), ("pad", s.rstrip(".") + "…", False)]
    rng.shuffle(modes)
    jobs += [(n, word, s, i, m, t, tr) for i, (m, t, tr) in enumerate(modes)]
n = len(SENTENCES)
for i, sp in enumerate(TRILL[2]):
    jobs.append((n, TRILL[0], TRILL[1], i, sp, TRILL[1].replace(TRILL[0], sp).rstrip(".") + "…", False))
for n, word, s, i, mode, text, trim in jobs:
    f = out / f"w{n}-{i}.wav"
    if not f.exists():
        torch.manual_seed(0)
        torchaudio.save(str(f), generate(tts, text, trim), tts.sr)
    label = mode if word == TRILL[0] else f"نسخة {i + 1}"
    manifest.append({"word": word, "n": n, "i": i, "spelling": label, "mode": mode, "text": s, "file": f.name})
    print(word, mode, flush=True)
(out / "variants.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
