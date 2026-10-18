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
- **Training finished (30 min, CPU, $0).**
  - Dev loss: 3.05 at step 150, 4.43 at step 300. The second figure looks like memorising 22 clips, as in pilot 0. Diagnostic only.
  - Adapters are 114 MB each in `voice-src/pilotO1/exp/`.
- Stage pick page (u06 + script, step 150 vs 300): artifact RgAGh6nDonSX3w86LgpvkL.
- Stage pick: step 300 won the script; u06 was a tie. Full before/after page (12 items, step 300): artifact 5vV6umCFwasvCmP4TForJY.

## Result (the user's ear, 2026-10-17, blind)

| | Count |
|---|---|
| After (step 300) more Kuwaiti | **7 of 12** (58%) |
| Before more Kuwaiti | 4 |
| Same | 1 |

- After won t01, u03, u04, u05, u09, u10 and the Time Keeper script.
- Before won u01, u02, u06 and u08. u07 was a tie.
- **The Time Keeper script after training was rated «يصلح لفيديو: إي».** This is the first «usable» for any automatic voice.
- **Decision by the pre-fixed rule:** 7 falls in the «no clear signal» band (5–7), one short of «the model learns» (8 or more).
  - It leans positive (7 against 4), but 3.6 minutes is too little to call it.
  - Next, by the rule: more data first, the user's call.
  - No second run without a new approval.
- Review batch 3 for the next run (artifact TqcwKHymLxLxTdwU6itHph). The edit hint now says English words in English letters, the OmniVoice convention.

## Direction change (the user, 2026-10-17)

The user does not want more training or more clip review. The decisions:
- **Production voice:** OmniVoice with the O1 adapter (step 300). Its Time Keeper script was rated usable.
- **Batch 3 is dropped.** No more training runs.
- **From here, only the word dictionary.** Each test, the user taps the wrong words. Claude generates the word in several spellings, and the user picks the right one. The spelling that wins goes into the OmniVoice spelling map, and the word is retested until it is right.
- Word round 1 (10 sentences, production voice): artifact MZgnAfGxJ47y5JRKRca6i8.
- **The owner's own voice («me», 2026-10-18).**
  - The reference is 9.8 s cut from the owner's recording, kept locally in `voice-src/me/`.
  - In a blind choice between plain OmniVoice and OmniVoice with the O1 adapter, both with the owner's reference, the owner picked **with the adapter**.
  - The kit's default is therefore the adapter with `--voice me`.
- Word round 2 (confirm + مرتبة / هالموديل variants): artifact Nfo4Eqd5VC26trz577FQM4.
- Word round 3 (هالـmodel confirm, ذربة/ملمومة/مضبوطة/كشخة, موديل/ينلقى/مْرَتِّبَه variants): artifact 1AVwf3MMtMLgZUzQvdSwbz.
- Word round 4 (confirm امْرَتِّبَه, «هذا الـmodel»; كشخة/الدوام/الطلعات variants): artifact BYPr4VdCctcTah1tEPraC2.

### Word round 4 (2026-10-18)
Both confirmation sentences were right: امْرَتِّبَه and «هذا الـmodel» (now applied through the key الموديل). Picks: كَشْخة, الدوام as written, الطَّلْعَات. Round 5 (`voice-data/omni-words-5.json`) confirms them in new plain sentences with the dictionary applied, tries «تلقاها/تحصله» in place of ينلقى, and tests the bare word موديل in four spellings.
