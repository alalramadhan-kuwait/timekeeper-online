# Screening run A1: Fahed → Chatterbox VC (2026-10-09)

Stage 1 of VOICE-STRATEGY.md, approved with changes on 2026-10-09.

- **Status:** objective measurements are done. The listening verdict is pending.
- **Screening only:** a pass here earns a larger unseen test, not production.
- **Inputs:** the test set and pass criteria were fixed before any run (`voice-data/screen-9.json`, commit 4190b09).
- **Code:**
  - `tk_fahed_poc.py` (generation)
  - `blind-test/build_screen.py` (listening page)
- **Audio:** `voice-src/screen/` (not in git).

## 0. Backup (done before anything else)

- **Contents:** 1,940 files, 1.0 GB.
  - `voice-src/` without `sep/`, which is 3.4 GB of Demucs stems that can be regenerated.
  - Chat uploads.
  - Repo copies of the dictionary and the plans.
- **Checks:** a SHA-256 for every file (SHA256SUMS), and for every part (PARTS.sha256, PARTS.md5).
- **Verified:** the 36 parts were reassembled here and every file passed.
- **Copy 1 (Mac):** the 36 parts plus RESTORE.txt were sent in chat. The user saves them and runs RESTORE.txt step 2.
- **Copy 2 (Google Drive):** the private folder "TK Voice backup 2026-10-09 (private)" was created with PARTS.md5. The connector cannot carry 1 GB, so the user uploads the parts from the Mac; then Claude checks each part's Drive md5 against PARTS.md5.
- **Originals:** untouched. Nothing was deleted.

## 1. What was run

- **TTS:** Fahed (ar-KW-FahedNeural, through edge-tts, rate +0%) read the nine sentences as written.
- **Three stages per sentence:**
  - `tts`: Fahed raw.
  - `vc`: Fahed through Chatterbox VC to Ali (target `voice-src/ref.wav`), with nothing else.
  - `final`: the production chain of `tk_ali_voice.py` (tighten, VC, pitch range, clarity EQ, pace).
- **Pace:** set from data. Fahed reads 9.7 letters/s of speech and Ali 11.3, so x1.164.
- **Pitch range:** the first run reused the reader's x1.45 and overshot. Fahed already moves his pitch more than Ali, so the final ranges were 75–123 Hz against Ali's real 52–77, with lower likeness. It is now calibrated to Ali's 75 Hz: x1.068. That run is kept in `voice-src/screen/fahed-run1/`.
- **No training. Nothing was changed in the recorded-mode pipeline.**

## 2. Objective diagnostics (medians over the sentences)

These measurements say where to listen. They are not proof of pronunciation.

| Stage | n | Similarity to Ali | Pitch range (Hz) | ASR match to text | Energy 4–11 kHz (dB) |
|---|---|---|---|---|---|
| Fahed raw (tts) | 9 | 0.716 | 92 | 0.97 | −12.7 |
| Fahed → VC (vc) | 9 | **0.897** | 81 | **0.96** | −28.1 |
| Fahed final | 9 | 0.860 | 72 | 0.89 | −24.7 |
| Recorded mode: reader raw | 3 | 0.720 | 43 | – | −26.8 |
| Recorded mode: raw VC | 3 | 0.924 | 41 | – | −33.2 |
| Recorded mode: final | 3 | 0.882 | 58 | 0.80 | −30.5 |
| Ali's real recording | 3 | 0.928 | 67 | – | −33.3 |

Per-sentence final similarity:

| am-s01 | am-s05 | am-s08 | kp02 | kp14 | kp17 | SI6-009 | vTah-005 | aaVA-007 |
|---|---|---|---|---|---|---|---|---|
| 0.86 | 0.83 | 0.90 | 0.85 | 0.86 | **0.78** | 0.87 | 0.88 | 0.87 |

What the numbers say:

1. **VC keeps Fahed's intelligibility.** ASR match is 0.96 after VC against 0.97 raw, and similarity rises from 0.72 to 0.90. That is about the same as the recorded mode's raw VC (0.92).
2. **The post chain costs likeness and intelligibility in both modes.**
   - Fahed: similarity 0.90 → 0.86, ASR match 0.96 → 0.89.
   - Recorded mode: similarity 0.92 → 0.88.

   Pace, pitch and EQ are tuned by ear for the reader. They are a suspect, not a given.
3. **Fahed's melody is wider than Ali's,** and it survives VC: 81 Hz against Ali's 67–75. Fahed does not sound flat. If his delivery sounds unnatural, it will be in rhythm and stress, not range.
4. **kp17** («شفيك؟ ليش ما رديت علي امبارح؟») is the weakest: similarity 0.78 and ASR match 0.84. It is short and emotional.
5. **Pronunciation is unknown** until the user listens. ASR cannot tell گ from ق, or a Kuwaiti stress pattern from an MSA one.

## 3. Listening (pending)

`voice-src/screen/page/screen-fahed.html` is one self-contained file, sent to the user directly. Publishing it as an artifact was refused because it holds Ali's voice.

The page has 3 pages of 3 sentences. For the «اسأل محمد» lines it starts with a blind A/B against the recorded mode (key in `voice-src/screen/page-key.json`). Then, for every sentence:

1. Fahed raw: mark the wrong words.
2. Final: "is this Ali?", and mark words broken by the conversion.
3. Raw VC against final: does the post chain help?

Answers come back as pasted text ("انسخ الإجابات").

The verdict is judged against `screen-9.json`:

- **Pronunciation:** ≥ 8/9 with no dialect error, and kp02, kp14 and kp17 all right.
- **Identity:** ≥ 7/9 "Ali".
- **Quality:** at least half of the pairs equal or better than the benchmark, and none unusable.

## 4. YouTube inventory: how much clean Ali speech exists

The estimate comes from `channel-videos.txt` (221 videos, 162 h) and the 31 downloaded videos (`screen.json`, `keep-v2.json`, dataset-v4). The categories are guessed from titles only.

**Measured on the 31 downloaded videos (4.7% of the channel):**

| Category | Videos | Video hours | Usable Ali speech | Yield |
|---|---|---|---|---|
| Solo (Arabic title) | 23 | 2.4 h | 1.65 h | 69% |
| English title (Ali still speaks Arabic in the ones checked) | 4 | 0.3 h | 0.21 h | 69% |
| Guest/short look | 3 | 0.1 h | 0.05 h | 51% |

"Usable Ali speech" means screened clips that passed speaker similarity, speaking rate and ASR confidence.

**Whole channel, by title:**

| Category | Videos | Hours |
|---|---|---|
| Solo | 86 | 38.9 |
| English title | 42 | 32.4 |
| Guest/podcast | 93 | 90.7 |

**Estimate.** These are ranges, not measurements.

- **Solo and English-titled videos (71 h):** at the measured 69% that would be about 49 h. The sample was picked from likely-solo videos, though, so 30–50 h of Ali-only speech is safer.
- **Guest/podcast videos (91 h):** Ali hosts, so his share is perhaps 20–40%. After diarisation and dropping overlap, that is about 9–20 h, and it needs pyannote (HF_TOKEN).
- **Total plausible: about 40–70 h of Ali speech.** Only 1.9 h is verified and in use today.

**Limits:**

- The categories come from titles, and one sampled "solo" video is actually a podcast clip (1DL9LBbCuiY, «طلال العجمي ٤٠»).
- YouTube now blocks downloads from this cloud machine, so any further audio has to come from the Mac (yt-dlp).
- More hours do not fix labels: Whisper's MSA-leaning transcripts were the main cause of V1–V5's pronunciation errors.

**How to firm up the estimate later:** download a stratified sample on the Mac (10 guest and 10 unseen solo videos) and run the same screening. No training is involved.

## 5. Standing instructions (user, 2026-10-09)

- **Primary candidate:** Fahed → Chatterbox VC, raw (`voice-src/screen/fahed/vc/`).
- **Processed versions:** both are kept for comparison. Pitch, tempo and EQ are not applied by default:
  - `final/`: the calibrated run;
  - `fahed-run1/final/`: the run with the reader's settings.
- **What does not change:** the voice pipeline (until the listening feedback is in) and the recorded-mode workflow.
- **Not started:** no training, no Qwen fine-tuning, no new recordings.
- **Backups:** once the Mac and Drive copies are uploaded, check that every part is present (Drive md5 against PARTS.md5) and that the archive restores.

## 6. Decision rule, fixed before the listening answers

The listening answers lead to exactly one outcome, with no open-ended follow-up.

- **Pronunciation errors:** a sentence fails pronunciation if its dialect is rated «مو كويتية», or «قريبة، فيها شي» with a word marked. A question on the dialect of the whole sentence was added on the user's question, before any answers came in.
- **"Raw VC is the version"** applies when the post step was judged «قبل» or «نفس الشي» in at least 5 of 9 sentences. Otherwise the processed version is judged.

| Decision | When |
|---|---|
| **ACCEPT** as the automatic engine, moving on to the larger unseen test | Pronunciation: ≥ 8/9 with no dialect error, and kp02, kp14 and kp17 all right. Identity: ≥ 7/9 "Ali". Blind A/B against the recorded mode: Fahed not judged worse in all 3. |
| **ONE TARGETED CORRECTION**, then one re-check of only the affected sentences | The failures share a single cause that can be fixed without training. Examples: the same word or sound wrong on Fahed raw, fixable by respelling or SSML; or errors that appear only after conversion. Identity must already pass. |
| **REJECT** Fahed → VC (recorded mode stays the production path) | Identity < 6/9, or pronunciation errors in ≥ 3 sentences with different causes, or Fahed judged worse in all 3 blind pairs and unusable in any. |
