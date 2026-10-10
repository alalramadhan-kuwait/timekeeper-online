# Pilot 0: can Chatterbox_Kuwaiti learn from Ali? (approved 2026-10-10)

The user chose option 1 on 2026-10-10: a small learning test on the verified clips, before more review time is spent.
It is **not** the Stage 3 pilot. Its only question: does a short fine-tune on Ali's real speech move the model toward
Ali's Kuwaiti without breaking it? Nothing runs until the user approves this page.

## Data

- **24 clips, about 3.6 minutes.** These are the 26 clips the user verified (batches 1–2, `voice-data/pilot-review-answers.json`),
  minus 2 whose spoken numbers are unclear.
- **Text:** the user's corrected transcripts.
  - Digits and Latin words are written as spoken (`voice-data/pilot0-spoken.json`).
  - ق stands for Ali's g, the transcript convention for this model.
- **Audio:** Ali's original vocal track, untouched (no speed, pitch or pause changes).
- **Excluded from training:** the 3 evaluation episodes and every test sentence below.

## Method (fixed before training)

- **Base:** Genarabia-ai/Chatterbox_Kuwaiti, research only, with Ali's `ref.wav` as the voice prompt.
- **Training:** LoRA rank 32 on the T3 transformer (q/k/v/o). S3Gen and the voice encoder stay frozen. This is the same method
  as `tk_voice_train.py`, pointed at the Kuwaiti checkpoint and its own tokenizer.
- **Settings:** lr 1e-4, batch 1, 300 steps (about 12 passes over 24 clips). Checkpoints are saved at steps 150 and 300.
  2 clips are held out for validation loss, as a diagnostic only.
- **Where:** on this session's CPU. **Cost: $0**, with no rented GPU. It takes about 40–60 minutes of training plus about 10 minutes of generation.
- **One run only.** If it does not help, there is no second run without a new approval.

## Test (frozen now)

- **Sentences:** the 10 unseen sentences (`voice-data/ckkw-unseen-10.json`) plus the user's sentence («جاسم راح البقالة…»), 11 in all.
  All are read as written, with no dictionary.
- **Two listens:**
  1. **Pick the checkpoint.** 2 sentences at step 150 and step 300 (4 clips). The user picks the better step.
  2. **Blind comparison.** The 11 sentences, before vs after, letters أ/ب drawn per sentence.
     - Each version is rated separately on wrong words (tap them), dialect, rhythm and tone, and "is this Ali?".
     - Then the user says which version is better.
- **Scorecard (as before):** كويتية = 100, قريبة = 50, مو = 0; طبيعي = 100, مقبول = 50, آلي = 0; word accuracy = words not tapped.

Baseline already measured on these sentences: words 84%, dialect 50%, rhythm 60%.

## Decision rule (fixed now)

- **The model learns:** after is better or equal in at least 7 of 11, **and** dialect or word accuracy rises by at least 10 points, **and** "is Ali" does not fall.
  - Then reviewing more batches, toward 15–20 minutes, is worth the user's time.
- **No signal:** a change under 5 points either way, or after is better in 5 or fewer.
  - Then 4 minutes was too little to tell. More review before any rerun is the user's call.
- **It breaks:** words or "is Ali" drop by 10 points or more. Then fine-tuning this base is stopped and the reason recorded.

## Gates

1. **Backups.** The user's own rule says nothing proceeds while the original audio backup is unverified. Training only *reads*
   copies in `voice-src/` and changes no original. The user either verifies the backups (Mac restore check and Drive checksums)
   or explicitly lets pilot 0 run before that.
2. **The user approves this page.**
- 2026-10-10: the user explicitly allowed pilot 0 to run before the backup check ("شغّل التدريب الحين"); backup verification is still owed afterwards.

## Training log (2026-10-10)

The run finished in 21 minutes on CPU. 22 clips trained and 2 were held out.

| Step | Train speech loss | Val speech loss |
|---|---|---|
| 0 | | 6.585 |
| 150 | 3.51 | **5.207** |
| 300 | 1.97 | 6.013 |

- Validation loss fell by step 150, so the model is learning.
- By step 300 it rose again, a sign of memorising 22 clips.
- Loss is a diagnostic only: the user's ear picks the step.
