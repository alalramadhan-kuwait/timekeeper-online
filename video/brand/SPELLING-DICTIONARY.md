# Spelling dictionary experiment (Genarabia Chatterbox_Kuwaiti + Ali's voice)

Research only, with no training. Started 2026-10-10 at the user's request. The rules and decision rule below were
written **before** any round-2 or unseen-sentence result was heard.

## Question

Can a spelling dictionary alone make the zero-training clone (Chatterbox_Kuwaiti with Ali's `ref.wav`) speak natural
Kuwaiti? If it cannot, is the gap in **word pronunciation** or in **speaking style** (rhythm and tone)?

## Two layers, kept separate

| Layer | File | Holds | Depends on a model? |
|---|---|---|---|
| General Kuwaiti lexicon | `voice-data/kuwaiti-lexicon.json` | Kuwaiti word choice (امبارح → أمس, كذا → چذي), pronunciation guide, meaning, status | No. It is reusable for any model and for a future general Kuwaiti model |
| Model spelling map | `voice-data/ckkw-spelling-map.json` | How this model must be *written* to say the Kuwaiti word (كم → چم, باجر → باكر; plain ق already gives g) | Yes, Chatterbox_Kuwaiti only |

`tk_kw_text.py` applies them in order: confirmed lexicon word choices, then the model map. It changes whole words only,
including after و ف ب ل ال. It never guesses: an entry marked proposed or unsolved changes nothing.

## Steps

1. **Word test.** 49 words and expressions in all.
   - 15 were tested earlier (`ckkw-spelling-12.json` and test 1).
   - 34 are new (`ckkw-spelling-34.json`). Each is in a short natural sentence, with 1–2 spellings per word.
   - k01–k05 check that formal words keep a real q (موقع، أعتقد، فقط، الطاقة، المستقبل).
   - The user picks the best spelling, or says right/near/wrong.
   - The results go into the model map. Words confirmed by ear move from proposed to confirmed in the lexicon.
2. **Unseen check.** 10 new sentences (`ckkw-unseen-10.json`), fixed before round 2 and not used to build anything.
   - Each sentence is generated as written (raw) and after `tk_kw_text.py` (dict), with the same seed.
   - Letters أ and ب are drawn per sentence and the key is hidden.
   - Each version is rated separately on three things: **wrong words** (tap them), **dialect** (كويتية/قريبة/مو كويتية),
     and **rhythm and tone** (طبيعي/مقبول/آلي). The user then says which version is better.
   - A sentence the dictionary leaves unchanged is generated once. It is left out of the A/B count, but it is still rated on the same three points, because the diagnosis needs every sentence.
3. **Stop.** No third spelling round and no training are started from these results without approval.

## Decision rule (fixed in advance)

- **The dictionary helps:** dict is better or equal in at least 7 of the scored sentences, and has fewer wrong words in total.
- **Good enough to try in a real video:** additionally, dict has no wrong word in at least 8 of 10, dialect is كويتية in at
  least 7 of 10, and rhythm is طبيعي or مقبول in at least 8 of 10.
  - Even then it is only a candidate. Recorded Mode stays production until the user's ear says otherwise.
- **Diagnosis when it is not enough:**
  - **Words are still wrong after the dictionary** (unsolved words, or wrong words in dict versions): the gap is
    *word pronunciation*. A fine-tune needs Ali's words with Kuwaiti transcripts (the pilot dataset), written with plain ق for g.
  - **Words are right but dialect is قريبة or مو كويتية, or rhythm is آلي**: the gap is *speaking style*
    (intonation, stress, pace). Spelling cannot reach it. Only training on natural Kuwaiti speech can, which needs whole
    utterances with their natural endings (the pilot selection already keeps those).
  - **Both:** the larger count decides which comes first.
- **The dictionary does not help** (dict better or equal in fewer than 6): stop spelling work for this model and record why.

## Results

### Round 2: 34 words (the user's ear, 2026-10-10, artifact JAkn4ex4qgRbgaH5s9poGS)

| Outcome | Count | Words |
|---|---|---|
| A different spelling fixed or improved it | 7 | الطّاقَة (diacritics keep q), اشلون, هنيه, يديد, واجد (closest, still wrong), جدام (the user's note) |
| The plain spelling was already right | 16 | موقع, أعتقد, فقط, المستقبل, شنو, ليش, الحين, شوي, أبي, منو, كبيرة, كان, ترا, مافي/ماكو, زين, مو, بعد, وين, يبيلها |
| Near | 3 | لين, السموحة, أكيد |
| Wrong in the only spelling tried | 5 | عيل, عاد, خلاص, أمس, (يمديك: unclear, the note was about باكر) |
| Word choice, not spelling | 2 | شكثر → چم for a price; يدي → ايدي |

Notes:
- The model keeps a real q in formal words, so the "plain ق" rule is safe.
- باكر was rejected ("ما نقول باكر"), so باچر is unsolved again.
- محدودة was said wrong in k16.

Together with round 1, these words are wrong in every spelling tried: عيل, عاد, خلاص, أمس, باچر, أدور, نقدر, صديقي.
They are common, short words, and a respelling has nothing left to change.
The dictionary changes only 4 of the 10 unseen sentences (u01, u02, u03, u08). The model already reads most written
Kuwaiti the way it reads it, and the errors that remain sit in words the dictionary cannot fix.

### Unseen sentences

(Filled in after the user listens.)
