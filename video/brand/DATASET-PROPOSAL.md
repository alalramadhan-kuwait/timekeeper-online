# Kuwaiti voice and pronunciation library: proposal

Status: **for approval**. Nothing has been built, downloaded, recorded or trained for it. 2026-10-09.

- Production stays on Recorded Mode (the reader's recording → Ali through VC).
- The long-term goal is unchanged: automatic Kuwaiti narration in Ali's voice, with no new human recording per video.

**What the evidence says the library has to fix.** The V1–V5 errors came mostly from labels that did not match the audio:
- Whisper's MSA-leaning text: g written as غ, and شلون as شون;
- 48% of clips had suspect words, and 511 of 699 changed in V5;
- clips cut mid-sentence;
- the ق sound in Ali's speech varies by word.

Fahed (A1) showed that a non-Kuwaiti source cannot be rescued downstream. So the library's value is **correct Kuwaiti labels on Ali's own speech, in whole sentences**, not raw hours.

## 1. Which existing recordings are usable

| Source | Size | Usable for | Condition |
|---|---|---|---|
| 31 downloaded episodes (`voice-src/raw/`) | 2.8 h of audio; 699 clips / 2.06 h already screened | Identity: yes. Pronunciation: yes, once re-labelled. | YouTube MP3. 24 kHz is good enough for the model. Text is Whisper plus the V5 corrections, which are partly verified. Clips are cut mid-sentence, so they must be re-cut. |
| 30 `refcmp` clips | about 6 min | **Evaluation only** | Ali corrected the text by ear. These stay out of training. |
| The rest of the channel | 190 videos. Solo / English-titled: about 30–50 h of Ali; guest/podcast: about 9–20 h. Estimated, not measured. | Identity and pronunciation | Must be downloaded on the Mac, since the cloud is blocked. Guest episodes need speaker separation (pyannote, HF_TOKEN). |
| The reader's «اسأل محمد» read | 51 s | Not part of the library | It is a different speaker and a phone recording. It is a Recorded Mode asset only. |
| Pronunciation dictionary (`kw-pron-dict.json`) | 476 entries; about 20 VERIFIED | Labelling aid | Only VERIFIED entries are applied. |

**Phase 1 uses the solo episodes only:** the 31 we have, plus about 40 more solo episodes picked by title and length. That is roughly 10 h of video, which should yield about 5 h of clean Ali speech at the measured 69%. Guest episodes come later, if Phase 1 shows we need more.

## 2. Correcting and verifying the Kuwaiti transcripts

**Spelling convention, written once and applied everywhere: "write what Ali says".**
- گ where he says g, ق where he says q (word by word, as heard), چ and ي as heard.
- Dialect forms as spoken: شلون, وايد, باچر, خمسطعش.
- Numbers in words as said.
- Brand names in Arabic script as he pronounces them, with an English gloss kept in a separate field.
- No diacritics, except a small fixed list of ambiguous words (أدُور «look for» against أدوّر «turn»), where a diacritic marks the meaning.

**Workflow per clip:**
1. Whisper draft.
2. Automatic pass: the VERIFIED dictionary entries, the known Whisper errors (غ→ق family, شون→شلون), numbers. Every word the pass changes, and every low-confidence word, is flagged.
3. **Human verification by ear.** A Kuwaiti listener (the user) hears the clip and fixes the text on a page like the earlier `textfix` page, with the flagged words highlighted. Pages hold 3 clips.
4. Each clip gets a status, `verified` with who and when, or `draft`. **Only `verified` clips enter training.**
5. Quality check: a random 10% of verified clips are re-verified blind. Word agreement must be at least 98%. If it is lower, that batch goes back.

**Effort.** The real cost is human review: about 2–3 h of listening per hour of audio, so **5 h of Ali speech is about 10–15 h of review**. It can be done in sessions of a few pages; nothing needs to be done in one sitting.

## 3. Natural sentence boundaries, intonation and pauses

- **Re-cut every clip at sentence ends,** not at any pause. A cut needs all three:
  - an end-of-sentence mark in the verified text;
  - a pause of at least 300 ms;
  - a final pitch fall, or a question rise.

  A breath pause inside a sentence is never a cut.
- Clips run 2–20 s. Each keeps 150–250 ms of real silence before and after, and no word is cut.
- Every clip is tagged with its ending: statement, question, exclamation or continuation. Continuation clips stay in the library but are excluded from training at first.
- Pauses inside a clip are kept as spoken. The library never shortens or speeds up audio. Pace is a decision for the engine, and A1 showed post-processing does not help.
- **Paragraph units:** neighbouring sentences from the same take, joined into 20–40 s units with their pauses, for engines that learn delivery across sentences.

## 4. Keeping Ali's identity separate from pronunciation data

| Set | Who | What it holds | Used for |
|---|---|---|---|
| `identity` | **Ali only** | Clean clips that pass a speaker check (similarity to `ref.wav` plus a 5% human spot check; no guest, no overlap) | Speaker conditioning, VC target, timbre |
| `pron` | Ali first; the reader only to fill a measured gap | Every verified clip with its Kuwaiti text and pronunciation tags (g/q words, dialect forms) | Teaching the engine Kuwaiti pronunciation |
| `eval` | Ali (plus the sealed text set) | The 30 `refcmp` clips and the sealed 30 lines. Split by episode, so no episode in `eval` appears in training. Fixed with a hash. | Tests only, never training |

- Every clip carries `speaker`. Reader clips are tagged `speaker=reader` and can only be used by a model that conditions on speaker. They are **never** a voice reference, a VC target or an identity clip.
- Because Phase 1 is Ali-only, `identity` and `pron` overlap. That is fine: the same correct Ali clips teach both. The separation matters only if reader data is ever added.

**Manifest.** One `manifest.jsonl` row per clip. The manifest and the conventions go in git; the audio stays private.

| Field | Contents |
|---|---|
| `id`, `speaker` | Clip ID and who is speaking |
| `source` | Video ID, start, end |
| `split` | train / val / eval |
| `text_kw` | Verified Kuwaiti text |
| `text_whisper` | Whisper's original draft |
| `status` | verified or draft, with who and when |
| `end_type` | statement, question, exclamation or continuation |
| `tags` | Pronunciation tags |
| `snr`, `sim` | Signal-to-noise ratio and speaker similarity |
| `sha256` | Checksum of the audio |
| `consent` | Reference to VOICE-CONSENT.md |

## 5. Which architecture could realistically use it

No engine is chosen now. Once the library exists, candidates get one fixed test (the A1 method: screening, then a larger unseen set, judged by ear).

1. **Chatterbox Multilingual, fine-tuned again, on verified whole-sentence clips only.**
   - MIT licence, and the code is already here.
   - V1–V5 never had correct labels or sentence-level clips, so this is the cheapest fair re-test of the main hypothesis: **"labels were the cause"**.
   - Needs about 5 h verified. Fits on the Mac or a small rented GPU.
2. **Qwen3-TTS 1.7B with an Arabic adaptation.**
   - Apache-2.0, a stronger modern base.
   - Arabic is not built in, and ScienceSoft's dialect work used about 70 h. Realistic only with 15–20 h or more of verified Ali speech, which means Phase 2 with guest episodes.
3. **F5-TTS / Habibi fine-tune.** Gulf prior, research only (non-commercial licence). It would tell us whether a dialect-pretrained base wins, not give us a production engine.

**Expected result, stated honestly.** No base model available today has a Kuwaiti prior. Whether 5–20 h of correctly labelled Ali speech is enough is exactly what the first test answers, and the library is useful for every option above.

## 6. Recordings: the smallest session, only for measured gaps

Before asking anyone to record, a coverage report runs on the verified Phase 1 library. A recording is requested only for what it shows missing:

| Gap (to measure) | Expected | Smallest fill |
|---|---|---|
| **Film narration style.** The channel is review/talk style; films need narrated delivery. | Likely | **Ali reads 30–40 min** of real Time Keeper scripts in narrator tone, in a quiet room. |
| Words and sounds with fewer than 3 examples: each VERIFIED dictionary word, the ق/گ pairs, about 150 watch brands and terms, numbers and prices | Likely, partly | **Ali reads about 100 targeted sentences** (about 15 min) built from the missing list, in parts of 3–4 sentences, split with `tk_ali_voice.py` |
| Questions and exclamations | Possible | Folded into the session above |

**Ali records, not the reader,** so that identity is never mixed. The reader records only if Ali is unavailable, and that data goes to `pron` tagged `speaker=reader`.

**The session:** about 45–60 min of finished audio in one or two sittings.
- Same mic, 48 kHz WAV, a furnished quiet room, phone or mic 15–20 cm away.
- Parts of 3–4 sentences, scripts provided in advance.
- Verified the same way as section 2, but much faster, because the text is known.

## 7. Acceptance criteria for the library

The library is accepted, and only then is an engine test proposed, when all of these hold:

| Check | Pass |
|---|---|
| Labels | 100% of training clips `verified`; blind 10% re-check ≥ 98% word agreement |
| Speaker | 100% of `identity` clips pass the speaker check; a 5% human spot check finds no other voice |
| Boundaries | A 5% sample: ≥ 95% start and end on a sentence boundary, 0 cut words |
| Audio | SNR ≥ 25 dB, no clipping, no audible music after separation, ≥ 24 kHz |
| Coverage | Every VERIFIED dictionary word ≥ 3 times; the top watch terms ≥ 2 times; questions and exclamations ≥ 10% of clips |
| Size | Phase 1: ≥ 5 h verified Ali speech (Phase 2 target: 15–20 h, only if the first engine test asks for it) |
| Splits | Split by episode and session; `eval` sealed with a hash and never trained on |
| Rights | Consent and the source of every clip recorded; audio private and backed up (Mac and Drive, checksummed) |

## 8. Order of work and what each step needs

| Step | Who | Effort |
|---|---|---|
| 0. Finish the backups (Mac and Drive) and verify them | User uploads, Claude checks | 30 min |
| 1. Pick about 40 solo episodes and download them on the Mac (yt-dlp) | User runs one command | about 1 h, unattended |
| 2. Separation, speaker screening and sentence re-cut (automatic) | Claude, CPU | 1–2 days |
| 3. Transcript verification: about 5 h of speech | User, by ear, in short sessions | **about 10–15 h total** |
| 4. Coverage report, then a decision on the recording session | Claude, then the user | 1 h |
| 5. (If needed) Ali's 45–60 min session | Ali | 1–2 sittings |
| 6. Accept the library against section 7 | Claude, then the user | – |

Engine tests come only after step 6, and only after a separate approval.

**Step 3 is the real cost and the real value.** If 10–15 h of review is too much, Phase 1 can start at 2 h of speech (about 5 h of review). That is enough for the Chatterbox re-test in section 5, item 1, but not for Qwen3-TTS.
