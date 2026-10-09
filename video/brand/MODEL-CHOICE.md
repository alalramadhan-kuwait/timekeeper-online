# Which model gets the corrected Ali dataset

Status: **recommendation for approval**. Nothing has been downloaded, installed, trained or listened to. 2026-10-09.

All facts below come from the model cards and repositories, read on 2026-10-09. "Kuwaiti support" counts only where it is written as supported, not as a roadmap item. Gulf or Saudi is not counted as Kuwaiti.

## What was checked

| Model | Weights available | Dialects documented | Licence (weights) | Fine-tuning path | Hardware |
|---|---|---|---|---|---|
| **Lahgtna-OmniVoice v2** (`oddadmix/lahgtna-omnivoice-v2`, 0.6B) | Yes | The card's "Supported Dialects" lists nothing. **Kuwait appears only in the "roadmap" checklist.** The GitHub README lists 13 dialects (Egyptian, Saudi, Bahraini, Iraqi, …), **with no Kuwaiti**. **Kuwaiti: not verified.** | **Not stated.** It is a fine-tune of k2-fsa/OmniVoice, whose weights are **CC-BY-NC** ("because of its training data"), so treat it as non-commercial | OmniVoice `examples/`; no instructions on the card; training data undisclosed | NVIDIA GPU or Apple MPS; no figures |
| **SILMA TTS v1** (`silma-ai/silma-tts`, 150M) | Yes (`model.pt` 2.6 GB, `vocab.txt`, `config.yaml`, patched `finetune_cli.py`) | **MSA + English only.** No dialect claim. | **Apache-2.0** (code MIT), from the publisher's own org | **Official:** "100% compatible with F5-TTS v1.1.7", using F5's fine-tuning tools plus SILMA's config and vocab | Inference RTF 0.12 on an RTX 4090. Fine-tuning VRAM not stated; F5 at this size fits on a 24 GB card |
| SILMA TTS v2 (KSA) | **No**: hosted API only ($0.025/min) | MSA + Saudi Najdi | Commercial service | None | – |
| **Qwen3-TTS 1.7B, Saudi checkpoint** (`vadimbelsky/qwen3-TTS-KSA`) | Yes, about 4 GB | Saudi; a community-added Arabic language ID | Apache-2.0 (card). **The source of its training data is unknown**; the same author's Emirati data came from a commercial TTS provider | Official Qwen single-speaker fine-tuning, but Arabic support is a community patch | GPU ≥ 16–24 GB |
| **Chatterbox Multilingual** (our V1–V5), and NAMAA-Saudi-TTS (a Chatterbox fine-tune) | Yes | MSA-leaning / Saudi | MIT | Our LoRA pipeline exists. NAMAA gives no training details or data | CPU/Mac (slow) or a small GPU |
| Habibi (F5-TTS) | Yes | Saudi and Emirati (unified) | **Non-commercial** | F5 fine-tuning | GPU |

**No open model has documented Kuwaiti support.** Whichever we choose, the Kuwaiti has to come from Ali's corrected clips.

## What earlier failures tell us to look for

| Lesson | Evidence | What it rules in or out |
|---|---|---|
| The model must learn pronunciation **from the spelling we give it** | V5's errors followed its text (غ for g, شون); 511 of 699 clips were relabelled | Prefer a model that reads characters directly and lets us write گ and چ, and that does not force MSA vowels on dialect text |
| Accent comes from the training audio | Habibi (F5) sounded Saudi/Emirati because that is what it was trained on. Fahed's ar-KW voice was not heard as Kuwaiti (0 of 8). | An architecture that copies the dialect of its fine-tuning audio is what we want, since our audio is Kuwaiti |
| An autoregressive token model plus LoRA traded pronunciation for likeness, and added doubled consonants at pauses | Chatterbox V1–V5 | Lower priority for Chatterbox and its derivatives |
| The licence must allow Time Keeper to use the result | Habibi and OmniVoice weights are non-commercial | Rules out Lahgtna for production |
| Small, verifiable, cheap pilots | User's direction | Prefer a small model that fine-tunes in hours on one card |

## Recommendation: SILMA TTS v1

1. **It learns from characters, and the characters we need are there.** Its `vocab.txt` is one character per line and includes **گ, چ and ڤ** plus the diacritics. Ali's corrected Kuwaiti spelling ("write what Ali says") goes straight in with no conversion. V5 did not have this.
2. **It uses the same architecture as Habibi (F5-TTS),** which shows this design picks up the dialect of its training audio. Our audio is Ali's own Kuwaiti.
3. **Apache-2.0 from the publisher's own organisation,** with an official, documented fine-tuning path (F5-TTS v1.1.7 tools). No community patch is needed for Arabic.
4. **It is small (150M),** so a fine-tune takes hours on one rented 24 GB card or an overnight run on the M2 Mac. That keeps the pilot cheap and repeatable.
5. It clones a voice from a reference under 8 s. Fine-tuning adds Ali's identity and delivery on top of that.

**Honest risks:**
- The base is MSA, so 20–30 minutes has to shift the dialect, not just the voice. That is what the pilot measures.
- SILMA's automatic diacritiser (CATT) adds MSA vowels and **must be off** for Kuwaiti text. Its README does not say how to turn it off; this is checked when the code is first read.
- The fine-tuning VRAM need is not published.
- There is no public listening evaluation of the model.

**Why not the others:**
- **Lahgtna v2:** it does not support Kuwaiti (roadmap only), has no stated licence, inherits a non-commercial base and discloses no data.
- **Qwen3-TTS (Saudi):** a closer dialect starting point, but its data source is unknown, its Arabic is a community patch, and it is 11 times larger. It is the **second choice**, only if SILMA fails for a reason a Gulf starting point would fix.
- **Chatterbox / NAMAA:** the architecture we already saw trade pronunciation for likeness.
- **Habibi:** non-commercial.

## Minimal pilot (only after approval)

**Data:** the Stage 1 pilot set from DATASET-PROPOSAL.md:
- **Clips:** 20–30 min of Ali-only, complete-sentence clips from the existing 2.8 h. The selection is ready: 160 clips, 20.3 min.
- **Transcripts:** verified Kuwaiti transcripts, through the assisted review.
- **Eval episodes:** never used for training.

**The three things that went wrong in V5, closed here:**

| V5 mistake | In this pilot |
|---|---|
| Unreliable transcripts | Only `verified` clips are trained; a random audit must reach ≥ 98% word agreement |
| Clips cut mid-sentence | Clips are bounded by Ali's own pauses plus a sentence-final pitch; the user confirms they are complete; anything ending on a connective is flagged |
| Checkpoint chosen on validation loss | Checkpoint chosen **by ear**, on 3 validation sentences that are not in training. Loss is logged for diagnosis only |

**Run:**
1. **Baseline:** SILMA with no fine-tuning, cloning Ali from `ref.wav` (whose text Ali verified).
2. **Fine-tune:** one run on the pilot set, starting from SILMA's weights, with the diacritiser off. Settings are fixed before the run: the F5 defaults for small single-speaker sets, about lr 1e-5, and a checkpoint saved at fixed steps.
3. **Generate:** the 12 new sentences, written and frozen before training (with ق/گ words, أدور, شلون, numbers, brands, questions and one long sentence), plus 3 `refcmp` sentences with Ali's real recording.

**Comparison:** fine-tuned SILMA against **V5** (our current automatic Ali) and against **SILMA with no fine-tuning**. The last one shows whether the fine-tune itself made the difference. It is a blind listening test in pages of 3, with each dimension judged separately: pronunciation (dialect rating plus wrong words), "this is Ali", naturalness, clarity and expression.

**Success, fixed now. All must pass:**

| Dimension | Pass |
|---|---|
| Kuwaiti pronunciation | Fine-tuned SILMA rated «كويتية» in ≥ 8 of 12, **≥ 4 more than both** V5 and SILMA without fine-tuning, and none «مو كويتية» |
| Ali's identity | "This is Ali" in ≥ 9 of 12 |
| Clarity | No sentence unusable, and equal or better than V5 in ≥ 8 of 12 |
| Naturalness and expression | Equal or better than V5 in ≥ 8 of 12, each |

Speaker similarity and ASR are reported but are not evidence. A1 scored 0.90 similarity and was heard as Ali in only 2 of 8.

**On fail:**
- no second run, no more data, no switch to Qwen without a decision;
- a written explanation of which dimension failed and where it started (data, base dialect, or voice);
- then a stop.

**Cost and time:**

| Item | Estimate | Cap |
|---|---|---|
| Rented GPU (24 GB, e.g. RTX 4090 / L4 / A10, about $0.4–0.9 per hour; exact quote before renting) | Fine-tune 2–4 h + generation 1 h | **≤ 6 GPU-hours, ≤ $10** (the M2 Mac overnight is a $0 alternative, but slower) |
| Downloads | SILMA weights 2.6 GB + F5-TTS v1.1.7 | – |
| Engineering (data export, fine-tune setup, CATT off, generation) | 1–1.5 days | 2 days |
| User | Stage 1 review about 1.5–2 h, listening about 30 min | – |

**Before it starts:**
1. Backups on the Mac and Drive, uploaded and verified.
2. The Stage 1 review done, with the pilot set accepted.
3. Approval of this model choice, the criteria and the caps.

## Stage 1 technical checks: results (2026-10-09)

These checks were run, not just read from the docs. There was inference only, no training on Ali.

**Downloaded:**
- `silma-ai/silma-tts`: `model.pt` (2.6 GB), vocab, config and the patched fine-tuning script, into `/root/silma-check/`;
- the SILMA repository;
- the `f5-tts==1.1.7` wheel (code only).

Two small packages were installed (jieba and pypinyin, which F5's text preparation needs). The originals are untouched; `ref.wav` still has sha256 a1d60699…

| Question | Result | How it was checked |
|---|---|---|
| 1. Can MSA diacritisation (CATT) and normalisation (NeMo) be switched off reliably? | **Yes.** The API has switches (`force_tashkeel=False`, `normalize_numbers=False`, `enable_normalizer=False`). In our runs **both modules were replaced with stubs that raise an error if called, and nothing called them**. The text reaching the model was logged: it equals the verified reference text plus our sentence, **unchanged, character for character** (6 of 6). | `tk_silma_baseline.py` |
| 2. Does the tokenizer keep گ / چ / ڤ? | **Yes.** It is a character vocabulary (9,260 entries, index 0 = space). گ=529, چ=524, ڤ=527. Our 1,645 texts (127,162 characters: V5 transcripts, the pilot candidates, the screening sentences, every dictionary form) have **0 out-of-vocabulary characters**. **Caution:** an unknown character would silently become a space, so the dataset export will refuse any OOV character. | Vocab check against all texts |
| 3. Does our spelling survive fine-tuning and inference? | **Yes.** F5 1.1.7's training text preparation (`convert_char_to_pinyin`) leaves Arabic unchanged, گ/چ/ڤ included. The only changes: a space inserted before «...» (we will not use it), and Chinese characters romanised. One Whisper candidate contains «大的», a hallucination, and is flagged. | Ran the 1.1.7 function on all 1,645 texts |
| 4. Can it run with Ali's reference without touching his recordings? | **Yes, with one fix.** SILMA cuts any reference longer than 8.05 s **and then silently throws away the supplied text and re-transcribes with Whisper**, which writes MSA. `ref.wav` is 17.6 s. **Fix:** `voice-src/ref8.wav`, a copy cut at a clean pause (7.49 s, a dip of −61 dB), with the matching part of Ali's verified text in `ref8.txt`. An assertion confirms our text is used. | `tk_silma_baseline.py` |
| 5. GPU memory and cost | **162.7M parameters.** One training step (random weights, 4 clips × 10 s, fp32 AdamW): peak about 8.5 GB of memory on top of the 2.6 GB checkpoint, so **a 16 GB GPU is enough and 24 GB is comfortable**. On this CPU a step takes 29.5 s, so **CPU training is not practical**. On a 24 GB GPU (L4 / A10 / RTX 4090, about $0.4–0.8 per hour), 20 min of data is about 30 steps per epoch. 100 epochs, about 3,000 steps, should take well under 1 hour, plus generation for checkpoint choice and testing: **about 2 GPU-hours, about $2–5. Cap: 6 GPU-hours, $10.** The M2 Mac (MPS) is a $0 alternative, probably overnight. | Measured |

## Stage 3 baseline (pretrained SILMA, Ali's reference, raw output)

Six representative sentences: three «اسأل محمد» lines and the V5 regressions kp02, kp14 and kp17, with kp02 in our گ spelling. The output is raw: no pitch, tempo or EQ processing. CPU inference took about 60–80 s per sentence.

| | am-s01 | am-s05 | am-s08 | kp02 | kp14 | kp17 |
|---|---|---|---|---|---|---|
| Similarity to Ali | 0.94 | 0.89 | 0.91 | 0.88 | 0.90 | 0.89 |
| ASR match to the text | 0.96 | 0.97 | 0.99 | 0.96 | 1.00 | 0.98 |

The pitch median is 109–134 Hz (Ali's is 127).

**For reference:**
- Fahed → VC final: 0.86 similarity and 0.89 ASR.
- Recorded mode final: 0.88 and 0.80.

These numbers are diagnostics, not proof (the A1 lesson).

**Technical reading:**
- The untrained model already produces clear, intelligible speech close to Ali's voice from 7.5 s of reference.
- **گ is not known yet:** «گال» was heard as «ذال». The base model never learned the letter, so the fine-tune has to teach it.
- **Kuwaiti pronunciation is unknown** until the user listens.

## GO / NO-GO

**Technical: GO.**
- The diacritiser and normaliser can be bypassed and the bypass is verifiable.
- The tokenizer keeps our spelling end to end.
- Inference works with Ali's reference without modifying any original.
- Compute is small: about $2–5, capped at $10.

**Training: NO-GO for now.** These gates are still open:
1. **Original-audio backup not yet verified** on the Mac or Drive.
2. **Stage 2 pilot dataset not yet built and verified**: the Kuwaiti transcripts and the "Ali only / complete sentence" check.
3. **A short ear check of the 6 baseline sentences** (`silma-baseline-6.m4a`), to confirm the base is a viable starting point: voice, clarity, no artefacts. Its dialect is expected to be MSA-leaning and is not judged here.
4. The user's approval of the Stage 4 run.

## Audit of existing Kuwaiti projects (2026-10-09)

Checked by reading pages and making public HTTP requests only. Nothing was downloaded, and no audio of Ali or of anyone else was sent anywhere.

| Item | What actually exists | Access, demo and licence | Data provenance |
|---|---|---|---|
| **Genarabia-ai/Kuwaiti_XTTS_Latest** (the priority) | Named as a fine-tuned XTTS v2, "fine-tuned for Kuwaiti pronunciation", about 5.6 GB | **Private.** The Hugging Face API returns 401 and the org's public model list doesn't include it. Access is possible only if the owners grant it; there is no public request page. **Licence:** XTTS v2 is under the **Coqui Public Model License (non-commercial)**. Coqui has shut down, so no commercial licence can be bought, and fine-tunes inherit those terms. | Not documented anywhere |
| **XTTS-Modal-Server** (MIT code) | Serves that checkpoint on Modal; the README advertises an open public API | **The endpoint is down:** the base URL answers "modal-http: invalid function call" and `/docs` gives 404. **No demo could be run**, so no generic-voice test was possible. | – |
| **xtts-vastai-deployment** | A Docker boilerplate for hosting the same private checkpoint on Vast.ai | Needs a Hugging Face token with access to the private repository, plus Vast.ai and Docker accounts. No licence stated. | "Fine-tuned for Kuwaiti pronunciation"; no data, method or base checkpoint described |
| **kuwaiti-speech-pipeline** (MIT per the README; the file itself is not in the listing) | A pipeline that **generates synthetic Kuwaiti dialogues** with "AI models", then diarises and transcribes them | It uses a Google GenAI API key. **Inference, not confirmed:** the training audio is likely synthetic speech from a Google model. | Generation models not named |
| **Genarabia-ai/Chatterbox_Kuwaiti** (found during the audit) | **Public**: a full Chatterbox Multilingual checkpoint (T3 2.1 GB, S3Gen 1.1 GB, ve, conds, expanded grapheme vocab), last modified 2026-01-12 | **No model card, no licence** (so all rights reserved by default), 0 downloads. The same architecture as our V5. | Not documented |
| **Hazawi+** (ACM, DOI 10.1145/3800688) | A **text** corpus: about 7.2M tokens of Kuwaiti stories and novels, annotated with CAMeL tools, with 105k tokens reviewed by hand. **Not speech.** | Availability and licence not confirmed. The affiliation (Kuwait University) is not confirmed from the sources found. | Online forums and surveys |
| **CAMeL Gumar** (NYU Abu Dhabi) | A **text** corpus: about 110M words of Gulf forum novels (Kuwait included in "Gulf"). The **hand-annotated subset (200k words) is Emirati**, not Kuwaiti. **Not speech.** | Download page with a licence acceptance; the terms could not be fully read | Online novels |

**What this means:**

- **No usable Kuwaiti voice model exists for us to build on today.**
  - The one built for Kuwaiti (Kuwaiti XTTS) is private, its demo is down, its training data is undocumented and probably synthetic, and **its XTTS licence blocks commercial use permanently**.
  - The public Chatterbox_Kuwaiti has no licence, no data provenance and no documentation. It is also the architecture that already traded pronunciation for likeness in V1–V5.
- **The text resources (Hazawi+, Gumar) are useful for text, not voice.** They can help to:
  - check our Kuwaiti spelling convention against real written Kuwaiti;
  - draw natural sentences for the frozen test set and the recording scripts;
  - build a Kuwaiti text normaliser.

  Each needs its licence confirmed before use.

## Recommendation: continue with the SILMA pilot, and contact the developers in parallel

1. **Continue SILMA (no change to the plan or gates).** It is the only option with **verified** weights, a **verified** commercial licence, a fine-tuning path we have already tested, and Ali's corrected data as the Kuwaiti source.
2. **Collaborate: one written enquiry to the developers (Ahmed Ezzat / Genarabia AI), sending no data.** Ask for:
   - the training-data provenance and licence of Chatterbox_Kuwaiti;
   - whether Kuwaiti_XTTS can be evaluated (research only, given its licence);
   - whether their Kuwaiti transcription and spelling conventions or their test sentences can be shared.

   **If** they document that Chatterbox_Kuwaiti's data is real and licensed, and give it a commercial licence, it becomes a candidate for a later, separate comparison. That does not happen automatically.
3. **Do not build on Kuwaiti_XTTS for production.** Its licence rules it out whatever its quality.
4. **Optional, later:** request Hazawi+ to support the Kuwaiti text side (spelling convention, test and recording sentences).

## Genarabia-ai/Chatterbox_Kuwaiti: inference probe (2026-10-09)

The model was run for research only, with no fine-tuning or integration, using the checkpoint's own built-in voice (`conds.pt`); no private audio was involved. The input was the same six sentences as the SILMA baseline. Code: `tk_ckkw_probe.py`.

**Restrictions to record for any future publication:**
- no model card and no licence, so all rights are reserved by default;
- training data undocumented.

**Downloads:** about 3.3 GB to `/root/ck-kw/`. To make room, the public wav2vec2-xlsr-espeak cache was deleted. It was used only by the old `tk_kw_audit.py` phoneme check and can be downloaded again.

**Compatibility:**
- It loads with our Chatterbox code (`from_local`).
- The text vocabulary is the same size as the base (2,454 entries); one slot differs (base ₹ → `[PLACEHOLDER45]`).
- گ, چ and ڤ are present. There is no Kuwaiti language tag, and `ar` is correct.

| Sentence | Default sampling | Conservative retry (exaggeration 0.4, cfg 0.3, temperature 0.6) | Whisper heard (diagnostic only) |
|---|---|---|---|
| am-s01 | Sentence in 4.1 s, **then silence until the 40 s cap** | Same | «هبي تعرفش أكثر عندك بضاعة لا تتصل بالمحل محد بيرد» |
| am-s05 | Fine, 5.8 s | – | «يقولك خلفت من كل الفروع تبيع 5 بالشهر أطلب 15 وليش» |
| am-s08 | Sentence in 3.3 s, then silence until the cap | Same | «والبضع الأمانة يقولك لا تشتري كلم المورت» |
| kp02 «الوكيل گال لي…» | 2.2 s, then silence until the cap | Same | «الوكيلي ان الطلب يتأخذ شوي»: **«گال» lost** |
| kp14 | Fine, 3.1 s | – | «بتذكر أول ساعة لبسها كانت من أبوه» |
| kp17 «شفيك؟ ليش ما رديت علي امبارح؟» | **Crash** (IndexError) | **Crash** | – |

**Reading:**
- **It runs, but it does not reliably stop.** In 3 of 6 sentences the speech is complete and then followed by silence to the 40 s limit. Whisper's «اشتركوا في القناة» over that silence is Whisper inventing text, not the model speaking. Trimming the silence makes those usable.
- **It crashes on 1 of 6.** Conservative sampling does not change this, so it is the checkpoint, not the settings.
- **The گ in «گال» is dropped.** Spelling alone did not carry the sound, the same weakness SILMA showed.
- **Whether its dialect is Kuwaiti needs the user's ear.** The five usable sentences, silence-trimmed, were sent as `ckkw-1…5.m4a`.
- **Comparison with the stock Chatterbox, same voice:** not run. The installed Chatterbox code loads `t3_mtl23ls_v2.safetensors`, which is not in the local base cache (only v3 is), and 2.1 GB more would not fit on disk.

**Standing:** a research curiosity, not a candidate to replace SILMA. It is unreliable at the end of sentences (3 of 6 never stop, 1 of 6 crashes) and has no documentation of what it learned. The enquiry to its developers covers provenance and licence.
