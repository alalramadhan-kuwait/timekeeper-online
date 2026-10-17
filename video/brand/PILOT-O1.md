# Pilot O1: can OmniVoice learn the Kuwaiti tone from Ali? (approved 2026-10-17)

The user chose option 1 on 2026-10-17: train OmniVoice on Ali's Kuwaiti speech.

**Why:** OmniVoice is the best automatic voice so far.
- It won 11 of 11 against Chatterbox_Kuwaiti, and was «قريب وايد» to Ali on 4 of 5 of his real sentences.
- But the tone, especially at the ends of sentences, is generic Gulf (Emirati or Saudi), not Kuwaiti.
- Settings and references could not fix that (accent test, 2026-10-17). Only training can.

Research only: the OmniVoice weights are CC-BY-NC.

## Data

- **24 clips, 3.6 min:** the clips the user verified (`voice-data/pilot-review-answers.json`), the same set as pilot 0.
- **Text by the OmniVoice writing rules:**
  - English words back in English letters: LVMH, dual time, GMT, IWC, in house, rose gold, 5 links bracelet.
  - Numbers as Kuwaiti words.
  - Where the user corrected a clip on the fix page, the user's text is used.
- **Audio:** Ali's original vocal track, untouched.
- **More data helps.** Each extra review batch (15 clips, about 2 min) can join a later run, but nothing waits for it.

## Method (fixed before training)

- **LoRA fine-tune of OmniVoice**, as in the model's own recipe (`docs/lora_finetuning.md`).
  - r 16, attention and MLP projections, about 3% of the parameters.
  - lr 1e-4, Gulf Arabic (afb) language id.
  - Checkpoints at two points, picked by the user's ear on 2 sentences, as in pilot 0.
- **Base weights stay untouched.** The adapter is a separate file of tens of MB and can be dropped at any time.
- **Where:** on this session's CPU first, at **$0**. A 20-step timing check comes first.
  - If CPU is too slow (over about 3 hours), the run stops and a GPU price is quoted before anything is rented. The cap is **$10**.
- **One run only.** No second run without a new approval.

## Test (frozen now; none of it is in the training data)

- **Sentences:** the 10 unseen sentences, the user's «جاسم…» sentence, and the 4-line Time Keeper script (`voice-data/omni-script-1.json`).
- **Blind before/after,** one question per item (the user's preferred format):
  1. «أيهم أكثر كويتية؟»
  2. Then, once only: «الأفضل يصلح لفيديو؟»

## Decision rule (fixed now)

| Outcome | Pass mark | Next |
|---|---|---|
| **The model learns the Kuwaiti tone** | After is more Kuwaiti in at least 8 of 12 | More review batches toward 15–20 min become worth the user's time, then one larger run |
| **No signal** | Better in 5–7 of 12 | 3.6 min was too little. More data first, the user's call |
| **It gets worse** | Better in fewer than 5 of 12, or words clearly break | Stop and record why |

## Gates

1. **Backups:** the user decides again, as for pilot 0. Training only reads copies.
2. **The user approves this page.**
- 2026-10-17: the user approved ("موافق"), covering the plan and running before the backup check, as for pilot 0.

## Run notes (2026-10-17)

- The pip release of OmniVoice (0.2.1) has no LoRA code: `use_lora` was silently ignored. Its 20-step timing check was a full fine-tune that needed 14 GB of memory (12 s/step, then out of disk when saving).
- Installed the GitHub main branch (same version number, with `omnivoice/utils/lora.py`).
- Checkpoints keep the adapter only. The optimizer state is skipped because the run is never resumed and disk is tight.
- Freed the re-downloadable faster-whisper turbo cache (1.6 GB).
- Settings: 300 steps, one clip per step (2048-token batches ran out of memory at the first epoch boundary), checkpoints at 150 and 300, CPU, $0.
