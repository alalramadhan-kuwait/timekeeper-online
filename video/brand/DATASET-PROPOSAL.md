# Kuwaiti voice and pronunciation library: proposal

Status: **revision 2, for approval**. 2026-10-09.

Nothing has been trained, downloaded, recorded or cut. The only new work is a read-only scan of the audio we already have, which produced a list of candidate clips. That scan is `tk_pilot_select.py`, and its output is `voice-src/pilot/candidates.json` and `selection.json`. Production stays on Recorded Mode.

The goal is unchanged: automatic Kuwaiti narration in Ali's recognisable voice, with no human recording per script.

## Staged plan (revision 2): prove the model can learn before building a large dataset

### Stage 0: gates before any training

1. **Backups on the Mac and on Google Drive, verified.**
   - Drive: every part's checksum is compared against `PARTS.md5`.
   - Mac: the user reports the output of RESTORE.txt steps 2 and 4, so the archive is shown to restore.
   - **Still pending:** the user has to upload.
2. **The user approves this document**: material, model, criteria and caps.
3. **Kept unchanged:** Recorded Mode, V1–V5 checkpoints, the dictionary, the evaluations and all original audio. New work goes in new folders (`voice-src/pilot/`, `voice-src/ckpt/pilot-*`), so nothing is overwritten.

### Stage 1: the pilot dataset (20–30 min of Ali, from the 2.8 h we already have)

**What the scan found.** It covered 28 episodes; the 3 evaluation episodes were left out. It found 46 minutes of sentence-shaped Ali speech in 459 units.

How units were cut:
- Boundaries come from Ali's own pauses on the separated vocal track, never from Whisper's word times.
- Ali pauses at least 0.3 s about every 5.5 s, but only 6% of his pauses reach 0.6 s. So the audio is split at 0.3 s pauses, and the pieces are joined until one ends on a sentence-final pitch fall (a statement) or rise (a question).
- A unit that runs past 15 s without such an ending is dropped. Nothing is cut mid-word.

| Pool | Clips | Minutes | Episodes | What still needs checking |
|---|---|---|---|---|
| **A**: speaker ≥ 0.80, Whisper confident, sentence-final pitch, low background | 84 | **10.8** | 11 | Kuwaiti spelling pass; a 20% random audit by ear |
| **B-music**: as A, but the episode has music under the voice (taken from the separated vocal track) | 76 | **9.5** | 5 | Every clip listened to for leftover music or artefacts |
| **B-other**: speaker 0.75–0.80, or weaker Whisper confidence | 111 | 10.8 | 7 | Reserve, used only if A and B-music fall short; every clip listened to |

**Proposed pilot: pool A plus B-music, 160 clips, 20.3 min,** with B-other as the reserve to reach 20–30 min after rejections.

What it covers and what it lacks:
- 97 words from the problem list (ق/گ words and the known Whisper misspellings); 12 of them appear at least 3 times.
- The best covered are حق, قاعد, قدموا, قبل, قلنا, تقريبا, فقط, نقدر and الطاقة.
- **Weak coverage of the rest is a known limit of using existing audio**, and it is one reason the expansion in Stage 4 exists.

**Known weakness of the automatic cut.** Pitch-based sentence ends are imperfect. Some tier-A units end on a pause plus pitch fall that is not a full sentence: one example ends on «…لكن». So "complete sentence" is one of the things every reviewed clip is checked for, and a text check flags units ending on a connective (و، لكن، إنه، اللي، عشان …).

**Assisted verification: the user does not listen to every clip.**
1. **Claude, automatically:**
   - writes a Kuwaiti draft for every clip (Whisper, plus the VERIFIED dictionary entries, plus the fixes for known Whisper errors such as غ→ق and شون→شلون);
   - marks every changed or low-confidence word;
   - flags units that look incomplete.
2. **The user listens only to:**
   - every flagged clip;
   - every B clip;
   - a random 20% of the unflagged A clips.

   Each clip takes three taps: the text is right (or fix it), the sentence is complete (yes/no), only Ali with a clean background (yes/no). Pages hold 3 clips, as before.
3. **Audit rule:** if the random A sample shows less than 98% word agreement, or more than 1 in 10 clips rejected, then all A clips are reviewed.
4. **Expected effort:** about 110–140 clips reviewed (about 13–17 min of audio), roughly **1.5–2 h of the user's time** in short sessions.

**Pilot dataset acceptance (all must hold):**

| Check | Pass |
|---|---|
| Size | 20–30 min after rejections |
| Speaker | Ali only: no other voice in any reviewed clip, and every clip at speaker similarity ≥ 0.75 |
| Labels | 100% of clips `verified` (reviewed, or covered by a passed audit); audit word agreement ≥ 98% |
| Sentences | 100% of reviewed clips confirmed complete; no clip ending on a flagged connective |
| Audio | No audible music or artefact in reviewed clips. Original pitch, rhythm and pauses untouched: no speed-up, no pause shortening |
| Separation | No clip from the 3 evaluation episodes, and none of the test sentences in Stage 3 |

**Drafting result (2026-10-10, `tk_pilot_draft.py`).** The drafting cut all 160 clips (20.3 min) and ran a second Whisper pass with a
prompt of Ali's vocabulary.
- The two passes agree on only 70% of words on average.
- 150 of 160 clips are flagged: 133 have 3 or more uncertain words, 76 are B-music, 29 contain digits or Latin letters, and 5 end on a connective.
- So the shortcut does not hold: the user reviews **152 clips (19.8 min)**, not 110–140. That is about 2–2.5 h in sessions, with progress saved.
- Review page: artifact QPrhcEizPSRQ7zWz1Zyc1d.
- The second pass turns some Kuwaiti words into MSA (الحين → الآن), so where the first pass heard the Kuwaiti word, it is kept.

**Review in batches (the user found 152 at once too many).**
- Each batch is 15 clips, easiest first. Each clip takes two taps when the draft is right. A clip left unanswered moves into the next batch.
- Answers are kept in `voice-data/pilot-review-answers.json`. It is text only, so it can be committed.

**Batch 1 (artifact 1aLMPm4zuwAJsuqzSZeziT): 12 of 15 answered.**
- 6 drafts were already right, and 6 were edited.
- **Draft word accuracy was 92.4%**, below the 98% needed to skip review, so the audit rule holds and every clip is listened to.
- Digits and Latin brand names are left as the user wrote them. The dataset build turns them into spoken Arabic.

### Stage 2: which model can learn from 20–30 minutes

> **Superseded on 2026-10-09 by MODEL-CHOICE.md.** After auditing Lahgtna-OmniVoice v2 and SILMA, the recommendation is **SILMA TTS v1**, with Qwen3-TTS (Saudi) as second choice. The table below is kept as the earlier analysis.


| Model | Licence | Arabic | Fine-tuning on a small single-speaker set | Hardware | Verdict for the pilot |
|---|---|---|---|---|---|
| **Qwen3-TTS 1.7B, starting from the public Saudi checkpoint** (`vadimbelsky/qwen3-TTS-KSA`) | Apache-2.0 (base and checkpoint card) | Not built in. Arabic was added by the checkpoint's author (language ID and input format), then trained on about 13k Saudi utterances. | **The official recipe is single-speaker fine-tuning** (`sft_12hz.py`), meant for small sets: lr 2e-6, 3–10 epochs | One GPU with ≥ 16–24 GB (rented) | **Recommended.** It is the only option that combines a **Gulf starting point**, a **recipe built for small single-speaker sets** and a **commercial licence** |
| Chatterbox Multilingual + LoRA (what V1–V5 used) | MIT | Built in, but leans MSA | Works, and already runs here. Community adapters for new languages use 10–50 h. Our 2 h traded pronunciation for likeness. | CPU or Mac (slow), or a small GPU | Fallback. With fewer minutes than V5 it is unlikely to fix pronunciation, but clean labels make it a fair test of "labels were the cause" |
| F5-TTS / Habibi | Non-commercial | Gulf (Saudi, Emirati) | Fine-tunes well on small sets | GPU | Research only, not production. Its Saudi/Emirati accent was already audible to the user. |
| CosyVoice 3 | Apache-2.0 (unconfirmed) | **No Arabic** | – | – | Excluded |
| OmniVoice / Lahgtna / VoiceTut, Fish/OpenAudio, XTTS-v2 | Non-commercial weights | Varies | – | – | Excluded for production |

**Why Qwen3-TTS from the Saudi checkpoint is most likely to benefit from a small Kuwaiti set:**
1. Its fine-tuning path is the one built for this case: one speaker, few clips, full-model training.
2. It starts from Gulf Arabic, which is the nearest neighbour to Kuwaiti. With 20–30 minutes we can shift a dialect, not teach a language.
3. Its licence allows Time Keeper to use it.

**Risks, stated before we start:**
- **Provenance.** The checkpoint card does not say whether its 13k utterances are real or synthetic. ScienceSoft's write-up says their Emirati data came from a commercial TTS provider. The source data's terms are confirmed before any production use; for the pilot it is research.
- **A Saudi accent may stay.** Habibi's did.
- **The Arabic support is community code,** not Qwen's own.
- It needs a rented GPU.

**Gate 2a, before any training, and only after approval (no fine-tuning, inference only).** Download the checkpoint (about 4 GB) and generate the 9 screening sentences zero-shot with Ali's reference clip. Pass if at least 7 of 9 are intelligible Gulf Arabic, neither MSA nor foreign-sounding, with no crashes or garbling. This takes about 1 GPU-hour (about $2) and 15 minutes of the user's listening.
- **If it fails:** the pilot switches to the Chatterbox fallback, or stops, by the user's decision.

### Stage 3: one controlled pilot (only after Stage 1 acceptance, Gate 2a and approval)

- **What:** Qwen3-TTS fine-tuned once on the pilot dataset, starting from the Saudi checkpoint. Speaker reference: `ref.wav`. The settings are fixed in advance (lr 2e-6, at most 10 epochs, checkpoint chosen by ear on 3 validation sentences, not by loss).
- **Compared against:** the current model V5 (step 1800). It is the only automatic Ali voice we have.
- **Unseen test set, written and frozen before training:**
  - 12 new film-narration sentences, none in any training data or earlier test. They cover ق/گ words (verified ones and pending ones), أدور, شلون, numbers and prices, three watch brands, two questions and one long sentence.
  - Plus 3 `refcmp` sentences with Ali's real recording, as the identity reference.
- **Listening:** blind, in pages of 3, with one fixed letter mapping per session. For each sentence and version:
  - dialect (كويتية / قريبة / مو كويتية) plus the wrong words tapped;
  - "this is Ali?";
  - then one pairwise choice each for naturalness, clarity and expression.

**Success criteria, fixed now. All must pass for "meaningful improvement":**

| Dimension | Pass |
|---|---|
| Pronunciation | Pilot rated «كويتية» in ≥ 8 of 12 **and** at least 4 more than V5; none «مو كويتية» |
| Identity | "This is Ali" in ≥ 9 of 12 |
| Clarity | No sentence unusable; pilot equal or better than V5 in ≥ 8 of 12 |
| Naturalness, expression | Pilot equal or better than V5 in ≥ 8 of 12 each |

Automatic metrics (speaker similarity, ASR) are reported for diagnosis only. They are not evidence: A1 scored 0.90 similarity and was judged Ali in 2 of 8.

**Caps:**
- **Compute:** at most 8 rented GPU-hours, **at most $25** (Gate 2a included). The exact price is quoted before renting.
- **Engineering:** 2 working days.
- **User time:** about 2 h for Stage 1 review and about 30 min for listening.
- If any cap is reached before a result, the pilot stops and the reason is reported.

### Stage 4: expansion only on a pass

- **On a pass:** propose growing to 2–5 h (more existing episodes on the Mac, same workflow), then Ali's studio session (sections 6 and 8 below). Each step needs its own approval.
- **On a fail:**
  - **no** automatic expansion, re-training or new experiment;
  - a written explanation of which dimension failed and why, the stage where the problem starts (data, model or speaker), and the options;
  - **then stop for a decision.**

## Long-term reference (revision 1, applies from Stage 4 onwards)

The sections below are the original long-term design: the spelling convention, the separation of identity and pronunciation data, the full-library acceptance criteria and the studio session. The staged plan above replaces their order and scale. The Phase 1 download of about 40 episodes in section 1 is **not** approved and is postponed until a pilot passes.

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
