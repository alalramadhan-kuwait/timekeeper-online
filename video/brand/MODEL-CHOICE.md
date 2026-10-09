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
