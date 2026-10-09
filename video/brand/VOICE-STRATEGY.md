# Ali Voice: automatic Kuwaiti narration — audit and recommended plan

Status: **for approval**. Nothing has been built, installed or trained for this plan. 2026-10-09.
Sources: VOICE-PLAN.md (full log), TOOLS.md (tool ratings), VOICE-CONSENT.md, the voice-src/ inventory on this machine.

## 1. Why the previous attempts failed

**One model was asked to learn two hard things from weak data.** TK Voice (Chatterbox Multilingual + LoRA, V1–V5)
had to learn Kuwaiti pronunciation *and* Ali's identity from 2.06 h of speech (699 clips from 31 of the channel's
221 videos). That speech was conversational podcast audio, compressed, at 24 kHz. Measured repeatedly: the LoRA traded
pronunciation for likeness. The base model has better pronunciation and worse likeness, and blending (strength 0.5 vs 1.0) gave mixed results.

**The labels were wrong more often than the model.** Whisper writes Kuwaiti close to MSA and gets it wrong:
- g was written as غ (الأرغام), and شلون came out as شون.
- 48% of clips had suspect words, and 511 of 699 clips changed in the V5 text.
- Ali's ق is word-dependent (11 g / 7 q in round 4), so no single spelling rule is right.
- Undiacritised words are ambiguous (أدور).

The model was trained on text that did not match the audio.

**The data had the wrong shape.** Clips were cut at any pause, so most ended mid-sentence. This explains:
- the wrong sentence endings;
- the shadda invented at pauses;
- the dropped pauses.

**The scoring did not predict the film.** Checkpoints were picked on validation loss. V5 beat v4 14/18 in blind tests, yet was «سيء جدا» in a real reel. A relative win is not an acceptable result.

**Other engines:**

| Engine | Pronunciation | Problem |
|---|---|---|
| Habibi | Gulf | Saudi/Emirati accent, non-commercial licence, 3–6 min per line |
| Fahed ar-KW | Kuwaiti | Robotic rhythm |
| Audar | — | Blocked on a gated codec |

**What worked:** the recorded mode. A Kuwaiti human read, converted to Ali with Chatterbox VC, then post-processed for pace (x1.13), pitch range (x1.45) and clarity (EQ):
- Pronunciation is right by construction.
- Speaker similarity went from 0.77 to 0.91.
- The user's verdict was «ممتاز», with tweaks.

**This is the key evidence: separating pronunciation from identity works.**

## 2. Most promising architecture

**Recommended: B, made automatic — a Kuwaiti speech engine plus an Ali identity layer.**

```
script → Kuwaiti TTS engine (any voice, natural Kuwaiti) → VC to Ali (proven chain) → pace/tone/clarity → approval
```

**Why B:**
- It is the only path that has already produced acceptable Kuwaiti speech in Ali's voice.
- Automating it means replacing the human reader with an engine that sounds like a Kuwaiti human reader.
- Identity comes only from Ali's data through VC. Pronunciation data from another speaker cannot leak into his voice.

**C (fine-tune directly on Ali) has the higher ceiling.** It has no VC artefacts, since VC softened clarity and needed an EQ fix. But it needs two things we don't have yet:
1. **A base model with strong Arabic and a production-usable licence.**

   | Model | Licence | Status |
   |---|---|---|
   | Chatterbox | MIT | Already failed |
   | Qwen3-TTS | Apache-2.0 | No built-in Arabic; ScienceSoft added Emirati/Saudi |
   | OmniVoice / Lahgtna / VoiceTut | CC-BY-NC weights | Research only |
   | Habibi / F5 | Non-commercial | Research only |

2. **Hours of correctly labelled Ali speech.**

C becomes Phase 2. The same library feeds it.

**A (direct TTS on Ali, as V1–V5 did) is not recommended again** on the current base model.

**Commercial shortcut, untested:** an ElevenLabs Professional Voice Clone of Ali.
- ElevenLabs claims regional Arabic accents, but Kuwaiti is not confirmed.
- It needs Ali's explicit consent to upload his voice to a third party, because the current consent covers a *private* model.
- It costs about $22/month.
- It is an optional arm, only if both are approved.

## 3. Can a permanent voice library fix the recurring pronunciation problems?

**Partly.** The library fixes the cause we can control: labels. Scripted recordings mean we know exactly what was said, written in our Kuwaiti spelling convention, with the dictionary's verified entries. It also gives clean, full-sentence clips, which fixes the shape problem.

**It cannot fix a weak engine.** That is why the engine is proven first (section 5), and recording comes after.

Keep three separate sets, never mixed:

| Set | Who | Purpose | Used for training? |
|---|---|---|---|
| `identity-ali` | Ali | His timbre and expression (VC target, RVC/C later) | Yes, identity only |
| `pron-kw` | Reader (or Ali) | Kuwaiti pronunciation and narrator delivery for the TTS engine | Yes, engine only |
| `eval` | Ali and reader | Sealed test sentences with real reference takes | **Never** |

## 4. Recordings we have, and what is actually needed

**We have:**
- **Ali, on the channel:** 162 h across 221 videos (includes guests).
  - 2.8 h downloaded (31 videos), of which 2.06 h is in the training set (699 clips).
  - Transcripts: Whisper, with V5 corrections.
- **Ali, evaluation:** 30 real clips with by-ear corrected text (`refcmp/ali`, used for the Habibi/V4/V5 comparisons), plus `ref.wav` (17.6 s, chosen by him).
- **Sealed test text:** 30 lines (`kw-pron-test.json`, including the regressions kp02, kp14, kp15 and kp17). Nobody has recorded these.
- **Reader:** 10 «اسأل محمد» sentences (51 s, phone, noisy: SNR 17–21 dB), plus the approved recorded-mode output.
- **Knowledge:** a 476-entry pronunciation dictionary, listening rounds 1–6, V5 blind tests, and the reference comparison.

**Risk: raw audio exists only on this temporary machine** (`voice-src/`, 4.4 GB). YouTube now blocks downloads from the cloud, so this should be backed up to the Mac or a private Drive before anything else.

**Needed now: nothing new.** The proof of concept (section 5) uses the existing data.

**Needed only if the proof of concept passes:**

- **`pron-kw`: 30 min to start** (about 200 scripted sentences in parts of 3–4), expanded to 60 min only if errors remain. It covers:
  - every ق/گ word in the dictionary, in both realisations where Ali uses both;
  - the context words (أدور, …);
  - چ/ك and ج/ي;
  - numbers and prices;
  - about 150 watch brands and terms;
  - questions and exclamations;
  - short and long narrator lines.

  Each sentence carries its intended pronunciation. Sentences are written from the observed error list, not at random.
- **`identity-ali`: 15–20 min** of Ali reading film-style narration in a quiet room.
  - This replaces the compressed YouTube target, so it should fix most of the muffled sound.
  - It also allows an RVC model trained on him.
  - If Ali can give 60–90 min, he records `pron-kw` himself. That one session then serves both B and C.
- **`eval`:** the reader records the 30 sealed sentences (about 4 min). Those become the pronunciation gold standard.

**Equipment and setup:**
- Any decent USB or lavalier mic, or a phone 15–20 cm away.
- 48 kHz WAV, in a furnished quiet room.
- The same setup for every session.

**Labelling:** every sentence has an ID in the script.
- `tk_ali_voice.py` already splits recorded parts and reports per-sentence matches.
- Only flagged lines go to someone's ear.
- The audio is stored privately, never in git. The repo keeps only the manifest: IDs, text, pronunciation notes and checksums.

## 5. The smallest experiment that can prove it

**Test set:** 9 sentences, so 3 listening pages of 3.
- 3 from «اسأل محمد»: the approved recorded-mode version is the reference.
- 3 regressions from the sealed set (kp02, kp14, kp17), judged by ear. There is no real take of these.
- 3 from `refcmp`, chosen for ق/گ and أدور. Ali's real takes are the reference.

**Arms:** all go through the same VC and post chain, so only the engine differs.
- **A0 — recorded mode:** reference. Already exists.
- **A1 — Fahed ar-KW → VC:** free. About 1 h of CPU time.
- **A2 — Qwen3-TTS 1.7B fine-tuned on Ali's existing 2.06 h,** with the V5-corrected text and an Arabic language ID added.
  - Scored twice: direct (that is C) and → VC (that is B).
  - GPU: about 4–8 h on a rented 24–48 GB card, roughly $5–20. The exact quote comes before renting.
- *(A3 — ElevenLabs Ali clone: only with consent and cost approval.)*

**Success criteria, fixed before running.**

| Criterion | Pass if |
|---|---|
| Pronunciation | 8 of the 9 sentences have no dialect error, marked word by word by the user, and every regression word is right |
| Identity | Blind: the user (and Ali if possible) say "this is Ali" for at least 7 of 9 |
| Clarity, naturalness, expression | Blind A/B against A0: the arm is judged equal or better in at least half the pairs, and no sentence is unusable |

On identity, speaker similarity of 0.85 or more is a sanity check, not proof. ASR and validation loss are not used as evidence of pronunciation.

**After the test:**
- **If A1 or A2→VC passes:** that becomes Automatic Mode.
- **If nothing passes on pronunciation:** record `pron-kw` (30 min) and fine-tune A2 once on it.
- **If it still fails:** stop Automatic Mode and keep Recorded Mode. No V6 for its own sake.

## 6. What to do first, time and compute

| Step | Who | Time | Cost |
|---|---|---|---|
| Back up `voice-src/` to a private location | User (place it); me (pack it) | 30 min | 0 |
| Build the 9-sentence test set and fix the criteria (no listening) | Me | 0.5 day | 0 |
| A1: Fahed → VC chain | Me | 1 h CPU | 0 (edge-tts for the test; the Azure key for production) |
| A2: Qwen3-TTS Arabic adaptation and fine-tune | Me | 1–2 days of engineering + 4–8 GPU hours | about $5–20, quoted first (the M2 Mac is possible but slow) |
| One blind listening session: 3 pages | User (and Ali if possible) | 15 min | 0 |
| Decision: record or not | Together | — | — |

**Total to a decision:** about 3–4 working days, under $25, and one 15-minute listening session.

**What this plan does not change:**
- The `ali-voice` Recorded Mode pipeline stays as it is.
- No training starts before approval.
- No original data is modified.
