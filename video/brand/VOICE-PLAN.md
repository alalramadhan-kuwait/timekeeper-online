# خطة صوت تايم كيبر الكويتي (TK Voice)

صوت راوي كويتي خاص بتايم كيبر، مدرّب على صوت صاحب المحل من تسجيلاته: مقاطع اليوتيوب والبودكاست، أكثر من 20 ساعة
حوارات بالكويتي. نستخدمه في كل أفلام تايم كيبر بدل الأصوات المدفوعة، وحقوقه كاملة لنا.

> هذا الملف مكتوب عشان ينلصق في محادثة جديدة ويكون كافي لحاله. اقرأه كامل قبل أي خطوة.

---

## 0. السياق للمحادثة الجديدة

- **المستودع:** `alalramadhan-kuwait/timekeeper-online`، الفرع `claude/success-story-video`.
- **الأفلام تنبني بـ skill اسمه `paper-story`** (`.claude/skills/paper-story/`). مثال كامل: `video/royal-oak/parts.py`.
- **الصوت الحالي:** Andre من ElevenLabs عن طريق Higgsfield. مدفوع (0.15 إلى 0.6 كريدت للجملة)، والرصيد خلص.
- **شكل ملفات الصوت اللي يقراها الفيلم:** `voice-*/clips.json`، وكل جملة لها
  `{"file": "clips/<key>.wav", "seconds": 4.4, "text": "..."}`.
  - النصوص الحالية في `video/royal-oak/voice-ar/clips.json`.
  - التعديلات المقترحة في `VOICE-TODO.md`.
- **اختيار الراوي:** `NARRATOR=voice-tk python3 parts.py` يخلي الفيلم يستخدم مجلد صوت ثاني. نفس الفكرة موجودة في `tts_azure.py`، فالأداة الجديدة تكتب بنفس الشكل.
- **بيئة العمل:** حاوية سحابية فيها 4 أنوية CPU و15 GB ذاكرة، **بدون كرت شاشة (GPU)**:
  - التدريب يصير على كرت مستأجر.
  - التشغيل (تحويل النص لصوت) ممكن هني على الـ CPU، بس بطيء: حوالي دقيقة ونص للجملة القصيرة.
- **قواعد ثابتة:**
  - لا يندفع أي شي بدون ما نوري صاحب المحل التكلفة أول.
  - ولا مفتاح أو كلمة سر تنكتب في الشات. تنحط كمتغيرات في إعدادات البيئة.
  - ملفات الصوت والموديلات ما تدخل git، لأن `*.wav` وملفات الموديل في `.gitignore`.

---

## 1. الهدف ومعيار النجاح

- **صوت واحد ثابت:** صوت صاحب المحل بلهجة كويتية طبيعية، بنبرة راوي وثائقي هادية وفخمة، مو نبرة سوالف بودكاست.
- **يقرأ صح:**
  - مصطلحات الساعات: رويال أوك، أوديمار بيغيه، كاليبر، ستيل، كرونوغراف، باتيك فيليب.
  - الأرقام والسنين بالكويتي: "سنة اثنين وسبعين".
- **معيار القبول:**
  - 20 جملة اختبار من سكربتات الأفلام تنسمع طبيعية.
  - صاحب المحل يقول "هذا صوتي".
  - Whisper يطلّع منها نص قريب من الأصل.

---

## 2. الرخص والحقوق: أهم قسم، لا تتجاوزه

| الشي | الوضع |
| --- | --- |
| صوت صاحب المحل في تسجيلاته | ملكه. نوثّق موافقته مكتوبة في `video/brand/VOICE-CONSENT.md` (اسمه، التاريخ، "أوافق على تدريب صوت ذكاء اصطناعي من صوتي لاستخدام تايم كيبر"). |
| **أصوات الضيوف في البودكاست** | **ما تنستخدم أبداً** إلا بموافقة مكتوبة من كل ضيف. نشيلهم بفصل المتحدثين (الخطوة 4.4). |
| الموسيقى والمؤثرات في المقاطع | تنشال، ما ندرّب عليها. |
| الموديل الأساسي اللي ندربه | **لازم رخصته تسمح بالاستخدام التجاري**. |

**موديلات مستبعدة لأن رخصتها لغير الاستخدام التجاري:**
- F5-TTS والموديلات المبنية عليه، ومنها "حبيبي".
- XTTS-v2.
- Fish-Speech.
- أي شي مكتوب عليه `NC`.

**المرشح الأول:** Chatterbox Multilingual من Resemble AI. رخصته MIT، يدعم العربي، ويقلد الصوت من 10 ثواني.

**قبل البدء نتحقق من ثلاث أشياء:**
1. رخصة الأوزان نفسها في صفحة الموديل على Hugging Face، مو بس رخصة الكود.
2. هل فيه طريقة تدريب (fine-tune) للنسخة المتعددة اللغات، رسمية أو من المجتمع.
3. رخصة أي كود تدريب نستخدمه.

**نتيجة التحقق (2026-10-06):**
1. **رخصة الأوزان:** MIT في صفحة `ResembleAI/chatterbox` على Hugging Face، وتشمل `t3_mtl23ls_v3.safetensors`.
2. **كود التدريب:** ما فيه كود رسمي لتدريب النسخة المتعددة اللغات.
   - `stlohrey/chatterbox-finetuning` (MIT) آخر تحديث له يونيو 2025، قبل النسخة المتعددة اللغات، فهو للإنجليزي بس.
   - فيه موديلات من المجتمع دربت النسخة المتعددة اللغات بطريقة LoRA على الـ T3 (رتبة 32 على q/k/v/o، تقريباً 7.8 مليون متغير): `reenigne314/chatterbox-indic-lora` (MIT)، `Tohirju/chatterbox-mtl-uzbek` (MIT)، `gabar-tech/chatterbox-amharic` (CC-BY-SA، ما نستخدمه). بس ولا وحد منهم نشر سكربت التدريب، نشروا الأوزان وكود التشغيل بس.
   - **يعني:** نكتب سكربت تدريب LoRA خاص فينا (رخصته لنا) على الـ T3، والـ S3Gen والـ VE يبقون مثل ما هم. العربي مدعوم أصلاً، فما نحتاج نوسّع الـ tokenizer.
3. **رخصة كود التدريب:** كودنا، فما فيه قيد.

**نتيجة المرحلة A (2026-10-06):** الصوت قريب من صوته (تشابه البصمة 0.90 إلى 0.94، وبين مقطعين حقيقيين له 0.93)، بس النطق يطيح في الكوارتز وبيغيه وغولاي والچ. صاحب الصوت قال **مو مقبول**، فنكمل B إلى E. اسم الصوت: **Ali Alyousifi**.

**تجارب التدريب على الـ CPU (2026-10-06 و07)،** الخطأ في الكلام (WER حسب Whisper) للجمل الخمس:

| النسخة | البيانات | p1-h | p2-h | p2-q | p2-2 | p2-7 |
| --- | --- | --- | --- | --- | --- | --- |
| A، بدون تدريب | 18 ثانية مرجع | 30٪ | 33٪ | 12٪ | 32٪ | 31٪ |
| run1، خطوة 100 | تيودور، 9 دقايق | 40٪ | 25٪ | 56٪ | 53٪ | 31٪ |
| cpu2، خطوة 1500 | ساعتين (المرجع من نفس المقطع: غلطة) | 60٪ | 92٪ | 20٪ | 53٪ | 62٪ |
| cpu4، خطوة 1000 | ساعتين، نص كويتي، المرجع من مقطع ثاني | 40٪ | 42٪ | 40٪ | 53٪ | 46٪ |

ولا نسخة مدربة طلعت أوضح من A. ساعتين من يوتيوب (64 kbps، سوالف، والنص ما انراجع) ما كفّت على الـ CPU. وWhisper ما يقيس الكويتي زين، فالحكم الأخير بأذن صاحب الصوت.

**الاختبار الأعمى (2026-10-07):** ثلاث نسخ بدون أسماء، والترتيب عشوائي في كل جملة.
- **النسخ:**
  - **A:** مرجع 30 ثانية.
  - **B:** بصمة صوت من 8 دقايق.
  - **C:** ساعتين مع T3 LoRA، الخطوة 2250. التقسيم حسب جلسات التسجيل، والـ validation loss نزل من 5.08 إلى 4.565.
- **النتيجة:** صاحب الصوت اختار **C في 31 من 31**:
  - الجمل الثابتة: 10 من 10.
  - الجمل الجديدة: 20 من 20، وهذي ما شافها التدريب، وما تشترك معه ولا في 4 كلمات ورا بعض.
  - جملة الـ canary.
- **معناه:** الـ LoRA تعلّم اللهجة فعلاً، مو بس حفظ.

**مراجعة النطق كلمة كلمة لنسخة C:**
- **الحجم:** 36 كلمة غلط في 30 جملة. 9 جمل سليمة بالكامل.
- **سليمة كلها:** جمل الأسماء الأجنبية، وأغلب جمل الإنجليزي.
- **الأغلاط مركزة على حروف:**
  - **چ:** باچر ثلاث مرات، وچذي.
  - **ق الكويتية (g أو ج):** القهوة، وبالطريق (تنقال «بالطريج»)، وقبل، وقرر، ورقم، وبقطر.
  - **خ:** خبر، والخضراء.
- **السبب:** Whisper يكتب هالحروف بشكل الفصحى، فنصوص التدريب ما فيها ولا «چ» وحدة.
- **الحل:**
  1. قاموس نطق يطبَّق على النص قبل ما يقراه الموديل (`voice-data/lexicon.json`).
  2. نصحح نصوص التدريب بنفس القاموس.

**اختبار نهاية الجملة (2026-10-07):** ثلاث طرق لإنهاء الجملة على 6 جمل، بدون أسماء:
- **النتيجة:**
  - وقفة «…» في الآخر: فازت في 3 جمل.
  - القص الأصلي: فاز في 2.
  - بدون قص: فاز في 1.
- **معناه:** القص مو السبب الرئيسي. «…» صارت الافتراضي لأنها فازت أكثر وما تضر.
- **باقي بدون حل:**
  - «باچر»: ولا تهجئة من 7 نجحت.
  - لام «قبل» في آخر الجملة.
  - تكرار الراء في «قرر».
- **حل الباقي:** هذي نطق من الموديل نفسه، وحلها بيانات تدريب نصها مكتوب على النطق الكويتي.

**Prosody experiments 1–2 (2026-10-07; 9 held-out clips, val + final sessions; `tk_prosody_exp12.py`):**
- Exp 1, real clip → S3 codes → S3Gen, compared with the real clip (medians):
  - **Clip itself as voice prompt:** F0 contour correlation 0.74, energy correlation 0.95, pitch range kept 95%, timing exact.
  - **Tudor ref.wav as voice prompt:** F0 correlation 0.64, energy correlation 0.88, pitch range kept 83%.
  - So the codes carry most of the prosody, and S3Gen is not the main bottleneck. The choice of voice prompt costs some range.
- Exp 2, the same held-out sentence generated and compared with the real one:
  - **Base:** F0 correlation 0.02, phrase-final slope −9.5 st/s, 13% slower, extra pauses. It reads like a book.
  - **LoRA:** F0 correlation 0.18, final slope −1.6 st/s, speed close to Ali's. But pitch range is 7.9 st against Ali's 9.4 st, compressed.
  - **Ali:** final slope +5.3 st/s.
- **Conclusion:** the loss is in T3's prediction (and the voice prompt), not in the representation. LoRA moves timing and phrase endings toward Ali but flattens the range.
- **Next:** the exaggeration sweep, then a voice-prompt (reference clip) test.

**Kuwaiti pronunciation track (from 2026-10-07):** a controlled experiment before adding any hours.
- **Sealed test:** `voice-data/kw-pron-test.json`, 30 lines, frozen at commit 609749e, sha256 6b12befc3616e356…
  - Never changed after this point, including its kw spellings, whatever the audit shows.
  - Never used for training, transcript decisions, checkpoint choice or tuning.
- **Audit:** `tk_kw_audit.py` flags q/g, k/ch and j/y candidates. Its output is not ground truth: Ali checks representative cases by ear before any spelling rule.
- **V5:**
  - Same audio, same 699 clips, same session split, same base model and training settings.
  - Only the transcripts change.
  - Checkpoint chosen on validation only.
- **Evaluation:**
  - **Test A (controlled):** current LoRA and V5 read the same text, once all plain and once all kw.
  - **Test B (production):** current LoRA + plain against V5 + kw.
  - **Reporting:** the two tests are reported separately.
  - **Scores:** pronunciation, Kuwaiti naturalness, likeness and clarity, plus a separate prosody score to catch regressions.

**Prosody experiments 3–4 (`tk_prosody_exp34.py`; 2 sentences × 1 seed per cell, so direction, not precision):**
- **Punctuation**, phrase-final slope in st/s, base vs LoRA:

  | Ending | Base | LoRA |
  | --- | --- | --- |
  | Full stop | −17.8 | **+1.6** |
  | Question | +21.1 | +21.1 |
  | Comma | +9.9 | +18.3 |
  | Ellipsis | −4.8 | +2.7 |
  | Exclamation | −9.8 | +23.8 |

  LoRA has lost the full-stop fall, so it no longer ends sentences.
- **Probable cause:** training clips are cut at any pause (4–12 s), so most end mid-sentence on a continuation contour (real clips' median final slope is +5.3). This fits the sentence-ending errors and LoRA dropping pauses.
- **Intents:** both models vary by intent. LoRA varies more (range spread 5.2 st vs 2.7) but is about 25% faster with almost no pauses.
- **Context, on base:** the same sentence ends differently inside a paragraph, so context matters. The LoRA paragraph cut failed and still needs checking.
- **Plan change:** V5b, after V5 and separately measured: re-cut clips at sentence boundaries and set punctuation to match the actual ending.
- **Paragraph context with LoRA:**
  - **Garbled targets:** LoRA garbles the target inside a paragraph ("وهذا نخلها اجلة … بوتها", "كيف يعرف الناس صليه").
  - **Rushing:** it runs short, 7.6 s against base's 10.0 s.
  - **Contrast with base:** base reads both paragraphs cleanly, and its endings change with context.
  - **Likely same cause:** LoRA only saw 4–12 s clips cut mid-sentence. V5b should help, and until then, don't render whole paragraphs with this LoRA.

**Transcript audit (2026-10-07, `tk_kw_audit.py`, all 699 clips; candidates only, pending Ali's ear):**
- **Letters in the training text:** 1130 ق, 2193 ك, 784 ج.
- **Candidates by sound:**
  - **ق heard as g:** 486, which is 43% of all ق. Confidence: 405 high, 69 medium, 12 low.
  - **ك heard as ch:** 17, or 0.8%.
  - **ج heard as y:** 1.
- **Clips affected:** 336 of 699 (48%). By split: 443 train, 28 val, 33 final.
- **Most common words:** حق (60), قاعد (45), قبل (36), قلنا (16), نقدر (12), نقول (11), عقرب (10), يقول (7), يقدر (6), تقدرون (6), قال (6).
- **Reading:** the contradictory supervision is concentrated on one sound. Ali's everyday Kuwaiti g (gaa'id, yigool, gabil, ḥag) is always written ق, so T3 learned that ق is sometimes q and sometimes g, with nothing in the text to tell which.
- **Lower-bound caveat:** these counts are a floor. Words without a time alignment were skipped, and the recognizer can miss sounds.
- **Listening check:** https://claude.ai/artifact/N63qCTbjqMcYPkXqsbqxoU (27 cases: 22 ق→g, 4 ك→ch, 1 ج→y).

**Audit round 1, Ali's ear (27 cases):**
- **ق→g:** 22 of 22 confirmed g. That holds at high confidence (15/15) and at medium confidence (7/7, lowest 0.50).
- **ك→ch:** 0 of 4. He said k in شركة, شركات and اشتراك, and something else in بالتاك. The recognizer's ch is noise on these words.
- **ج→y:** 0 of 1 (اجتماعية, something else).
- **The pattern is lexical:**
  - Everyday Kuwaiti words are almost always g: حق 60/75, قاعد 45/51, قبل 36/44, قلنا 16/16, نقدر 12/13, يقول 7/7, عقرب 10/10, القمر 5/5.
  - Formal words are never flagged: الوقت 0/18, فقط 0/16, أعتقد 0/16, قدموا 0/11, ننتقل 0/9, علاقة 0/7.
  - Some words are mixed: فوق 5/10, أزرق 3/8, تقريباً 2/10, طريقة 1/9.
- **Still open, so round 2:** https://claude.ai/artifact/26BQ7CveH3Htzd59NybeRg (27 cases, blind to the recognizer, `tk_kw_audit2.py`).
  - **12 unflagged ق in mostly-g words:** these decide between tagging each instance separately and tagging the whole word.
  - **6 ق→g flags below 0.5 confidence.**
  - **9 ك→ch flags not yet heard**, including كم and لكن.

**Audit round 2, Ali's ear (27 cases, recognizer hidden):**
- **Unflagged ق in mostly-g words:** g in 12 of 12. That includes the 5 where the recognizer clearly heard q (قبل, تقريباً twice, طريقة, فوق).
- **Low-confidence ق→g flags:** g in 6 of 6.
- **ك→ch:** only كم was ch, 1 of 9. فيك, لكن, مشكورين, بشكل, شكلياً, يتكلمون and يشقلك were all k.
- **Conclusion:** the recognizer misses Ali's g often, and its q is not reliable. The rule should be per word, not per instance: once a word is g, it is g everywhere.
- **Still open, so round 3:** https://claude.ai/artifact/EzdFHokH7WYb7mdoPVDqRo. The 17 most frequent ق words that were never flagged (الوقت, فقط, أعتقد, قدموا, علاقة, طريق, ...). Are they really q?

**Audit round 3, Ali's ear (17 never-flagged ق words, one clip each):**
- All 17 were g. That includes the most formal ones: الوقت, فقط, أعتقد, قدموا, ننتقل, علاقة, بالمستقبل, منطقة.
- **Across all three rounds:** every ق Ali was asked about was g, 57 of 57.
  - That puts the q rate below about 5% (95% upper bound).
  - The recognizer's q is wrong for Ali. Its "q" is probably his g, or a uvular [ɢ].

**Kuwaiti transcription convention (draft, waiting for Ali's OK; `kw_convention()` in `tk_voice_train.py`):**
1. **ق → گ everywhere.** This is a rule from the ear evidence, not mechanical conversion: 57/57 by ear, across everyday and formal words.
2. **ك stays ك, except the word كم → چم** (also بكم and وكم). By ear, ch appeared only in كم (1 of 13 flagged words); 4 instances in the data.
3. **ج stays ج.** No y was confirmed. Words Ali says with y are already written with ي (ياي, وايد).
4. **Everything else is unchanged.** That covers verbs, endings and affixes: the existing `fixes.json` respellings (شي, هذي, ياخذ, ...) stay.
5. **The same function is used at inference.** For V5, the production input is `kw_convention(plain script)`.
   - The sealed test file is not edited. Test B feeds V5 `kw_convention(plain)`.
   - kp04 and the other lines tagged "q-kept" were written before the audit. They will be read as "does V5 say g there, as Ali does".
- **Effect on the data:** 511 of 699 clips change, and 1114 words. Draft text: `voice-src/dataset-v5/metadata-kw.csv`.
  - V5 = same audio, clips and split as v4; only this text changes.

**⚠ Correction (2026-10-07, after V5 started):** Ali says he misunderstood the ق question in rounds 1–3, so his ق answers are not reliable.
- The 57/57 basis for ق→گ is withdrawn until it is re-checked.
- **Re-check:** https://claude.ai/artifact/3ZpPHac8LvPkv6zSzBrUz3. It reuses the same 20 clips: the 17 from round 3 plus حق, قاعد and قبل.
  - The question is one choice: گ (as in گاعد, the g in good) or Fusha ق (as in القرآن or قطر on the news), or unsure.
- **Plan:**
  - If the formal words come back as ق, they go into `keep_q` and V5 is retrained on the corrected text, with the same settings.
  - The V5 run already under way continues for now (the CPU is otherwise idle). Its result counts only if the re-check confirms ق→گ.
- The ك answers are unaffected: those had separate, clear options.

**Pronunciation dictionary (replaces the single rule; `voice-data/kw-pron-dict.json`, applied by `kw_convention()`):**
- **Three layers:**
  - `rules`: letter level, e.g. ق→گ.
  - `words`: per-word respellings. An entry whose `to` equals the word is a confirmed exception (Ali really says it that way).
  - `context`: words with more than one pronunciation. These are never applied automatically.
- **Every entry has a status, and only VERIFIED is applied.** UNVERIFIED text stays exactly as written. Nothing is assumed.
  - Exceptions (keep-as-written entries) need the same ear evidence as respellings.
  - Words like القرآن or الكويت are not exceptions until they have been heard and confirmed.
  - At start: 0 VERIFIED entries, and the rule is UNVERIFIED.
- **How a word is resolved** (it is also tried with one prefix removed, from و ف ب ل ال بال وال لل):
  1. A context word stays as written.
  2. A VERIFIED word entry wins.
  3. Otherwise the VERIFIED rules apply.
  4. Latin script is never touched.
- **Seeded with every ق word in the training text:** 475 entries plus كم.
  - Each has its count and the recognizer's g count, which is a hint only.
  - All start UNVERIFIED, and so does the ق→گ rule, because the round 1–3 ق answers were withdrawn.
- **Ear evidence comes in by listening rounds,** starting with round 4.
  - If round 4 shows ق→گ holds across everyday and formal words, the rule becomes VERIFIED, and the words Ali says with q become VERIFIED keep-entries.
  - If it doesn't hold, only the confirmed words are VERIFIED.
- **Round 4, by ear** (20 clips, clear گ / Fusha ق question). Ali had seen another source's predictions (all گ) before answering, but his answers differ from them, so they read as his own ear.
  - **گ (11):** حقاً, قبل, قاعد, صديقي, الوقت, فرق, علاقة, فستقي, منطقة, تعقيدة, قدموا.
  - **ق (7):** القالب, بالمستقبل, الطاقة, موقع, طريق, أعتقد, فقط.
  - **Unsure (2):** ننتقل, أقل.
  - **Result:** not uniform, so the ق→گ rule stays UNVERIFIED and the per-word dictionary is the method. The 18 sure words are now VERIFIED (1 clip each).
  - Coverage so far: 235 of 1130 written ق, and 168 words respelled.
  - Note: حقاً (really) was verified, not the Kuwaiti حق (for). They are different words.
- **Round 5:** https://claude.ai/artifact/2w13hzDYMX1BeZDkGASjRe. The 19 most frequent unverified words (حق, قلنا, تقريبا, نقول, نقدر, فوق, عقرب, ...).
  - It adds about 260 ق, which brings coverage to about 45%.
  - Verifying a base word also covers its prefixed forms (بطريقة via طريقة).
- **V5-draft (blanket ق→گ):** round 4 contradicts its premise for 7 of 18 words. It keeps running only to give Ali the 25/50/75% listening probes, and it is not a candidate model.
  - The real V5 is built from the dictionary (VERIFIED only) after round 5.
- **Decision rule after round 4** (kept for the record; applied above):
  - If ق→گ is near-uniform, use the general rule: a VERIFIED rule plus a few VERIFIED keep-entries, rather than verifying 475 words one at a time.
  - If there are real differences, use the dictionary.
- **The V5 now training** used the earlier blanket ق→گ text. It is **V5-draft**, an experiment only. It is never adopted before round 4.
  - If round 4 confirms the blanket rule, it is V5.
  - Otherwise V5 is rebuilt from the dictionary (VERIFIED only) and retrained with the same settings.

**Earlier draft (superseded by the dictionary above): convention as approved by Ali (2026-10-07), and V5-draft as built:**
- **Data, not code.** The rules live in `voice-data/kw-convention.json` and `kw_convention()` reads them.
  - `default`: ق → گ.
  - `keep_q`: whole words Ali really says with q (names, foreign words, Fusha, anything found later). Matched with or without the و ف ب ل ال prefixes. It starts empty.
  - `word_map`: confirmed whole-word respellings. It also starts empty.
  - `pending`: كم → چم sits here. It was heard by ear in 1 clip, which is not yet strong enough, so V5 tests ق→گ alone.
  - Latin-script words are never touched.
- **What V5 changes:** only ق→گ, verified mechanically.
  - Every V5 line equals its v4 line with ق replaced by گ. 509 of 699 clips changed; no ق remains.
  - For the 190 unchanged clips, the text tokens are identical to v4.
  - The speech and voice features are byte-identical to v4.
  - Same clip ids and the same train/val/final split. No re-cut, no punctuation change.
  - گ is a real token in the Chatterbox tokenizer (id 1589, ق is 1488), not UNK.
- **Bug caught on the way:** `retext` re-applied `fixes.json`, which is not idempotent. It doubled letters in 30 clips (للأمانة → لللأمانة).
  - V5 is built with `fixes_on=False`.
  - Side finding: v4's own text already carries some of those doubled letters (اللأمانة, ييبدعون) from an earlier double application. They are kept as they are in V5, so the comparison stays controlled. Clean them in a later version.
- **V5 training run:** `tk_voice_train.py train --data dataset-v5 --name v5 --steps 2250 --lr 5e-5 --eval-every 150 --patience 3`.
  - Same base, LoRA rank, seed, lr and eval cadence as v4.
  - `--steps 2250` matches v4's actual training length: v4's run ended at step 2253, and its pick was step 2250. This keeps the training budget equal.
  - The checkpoint is picked on val loss only.
  - V5's val loss is on گ text, so it is not comparable to v4's number. Only the blind tests compare the two.
- **After V5:**
  - **Test A (controlled 2×2):** both models, the same sealed text, run once as plain and once as `kw_convention(plain)`.
  - **Test B (production):** v4 + plain against V5 + `kw_convention(plain)`.
  - The sealed `kw-pron-test.json` is not edited.
  - V5b (re-cutting at sentence ends) stays separate, after the V5 result.
- **Progress listening (Ali's request):** `tk_progress_probe.py` renders 3 new ق-heavy lines (`voice-data/progress-probe.json`).
  - It renders v4 plus V5 at 25%, 50% and 75% (steps 600, 1200 and 1650), and pauses training while it renders.
  - These lines are not in any test set, and they are never used to pick the checkpoint.
- **Probe caveat (found 2026-10-08):** the probes did not all get the same input text, because `kw_convention` read whichever spelling file was current at render time.
  - 25% (19:48) was rendered with the blanket rule, so every ق was گ.
  - 50% (20:59) and 75% (21:46) were rendered after the dictionary landed. Only VERIFIED words were گ: گاعد, الوگت, گبل; the rest stayed ق.
  - So 25% against 50/75% mixes a text change with more training. The probe now writes the exact text it used to `<tag>.json`.
  - Ali is marking the wrong words in the 75% probe sentence by sentence: https://claude.ai/artifact/G1TGb6n1pHNCEizPbfAig8
- **Ali's marks on the 75% probe (2026-10-08).** Sentence 2 was clean. Four errors in three different kinds:
  1. **ق:**
     - **الطريق → الطريگ.** He gave this explicitly, but round 4 heard q in a طريق clip. The latest explicit instruction wins: VERIFIED گ, flagged for context.
     - **قبلهم → گبلهم:** VERIFIED.
  2. **Invented doubling:** طويل، became طويلّ, and گبلهم… became گبلهمّ.
     - Both come right before a pause, so this is probably phrase-final lengthening rather than spelling.
     - Rule: never add a shadda Ali doesn't say. Logged as `_issues_not_spelling`.
  3. **Meaning-dependent vowels:** «أدور على ساعة» came out أدوّر (turn it round) instead of أَدُور (look for).
     - It goes in the `context` layer. It is not a fixed replacement.
- **Spelling test round 3:** https://claude.ai/artifact/7j9XgHQVvjZWexWEMFxLuE. `tk_voice_spell.py ... 3`, using the same V5-draft step 1650 checkpoint the marks came from.
  - أدور / أَدُور / أدُور
  - طويل، / طَوِيل، / طويل with no comma: vowels or pause?
  - گبلهم… / گبلهم. / گبلهُم…: pause type or vowel?
- **Spelling round 3, Ali's picks:**
  - **طويل:** the version without the comma was right. The doubled ل came from the comma pause, not the spelling. Phrase-final lengthening is confirmed as one cause of invented doubling.
  - **أدور:** none of the three.
  - **گبلهم:** none of the three.
- **Spelling round 4** (Ali's own spellings, each against the previous form; nothing goes into the dictionary until Ali approves the sound): https://claude.ai/artifact/N5zfBPYq2oz5pR1sAwE8rC
  - **أدور:** أدور (previous) / ادُوّر (Ali's) / ادُور (no shadda, to check the "rotate" risk).
  - **گبلهم** (sentence now has طويل without the comma): گبلهم… (previous) / گَبْلَهُم. / گَبْلَهُم with no end mark / گبلهم with no end mark. This separates the effect of the tashkeel from dropping the end pause.
- **Spelling round 4** (no audio picks). Phoneme read-out: the "no end mark" variant equals the full-stop variant byte for byte, because Chatterbox adds a full stop. گَبْلَهُم lost its «هم» (came out گبلا).

**Ali's decision (2026-10-08): stop ad-hoc tashkeel trials, and run one limited reference comparison with ready-made Gulf models.** Comparison only; their outputs are never training data.
- **Audar-TTS-V1-Turbo** ([card](https://huggingface.co/audarai/Audar-TTS-V1-Turbo)).
  - Licence: AudarAI Community License v1.0. Research and evaluation are allowed, and limited commercial use is allowed for small entities (under 50 staff, under USD 2M revenue, under USD 250k attributable revenue, among other limits). Time Keeper should qualify; Ali to confirm.
  - §5(c) forbids using its outputs to train a competing general-purpose model. That isn't our case, and we don't train on them anyway.
  - It runs on CPU via llama.cpp (GGUF) and clones a voice from 5–15 s.
  - **Blocked:** its codec `neuphonic/neucodec` (Apache-2.0) is login-gated. It needs `HF_TOKEN` in the environment settings, from an HF account that accepted its terms. Third-party mirrors are not used.
  - Script: `tk_audar_ref.py` (separate venv `/root/audar`, torch 2.8).
- **FasihTTS** (https://www.fasihtts.com/en/dialects/kuwaiti-arabic-tts):
  - The page loads, but it is a JavaScript app with a REST API that needs an account and key. Pricing isn't readable.
  - **Set aside for now** (Ali: don't stall the project on it). It needs an API key in the environment settings and the cost shown first.
- **Licence policy for the research track (Ali, 2026-10-08):** models are not excluded just because they are non-commercial.
  - The current goal is an experimental model and listening research, not a product.
  - Licence limits stay documented here.
  - Weights and data are never redistributed.
  - Anything that ends up in the production TK voice for Time Keeper films still needs a licence that allows it.
- **Habibi-TTS** ([card](https://huggingface.co/SWivid/Habibi-TTS)) **is back in, for research comparison only.**
  - The Unified, SAU and UAE checkpoints are CC-BY-NC-SA-4.0 (restricted by the SADA and Mixat datasets). The other dialects are Apache-2.0.
  - F5-TTS base. There is no Kuwaiti ID, so it runs as Unified with `--dialect UAE`, the closest Gulf variety.
  - It lives in its own venv, `/root/habibi`.
- **Kuwait Dialect Speech Dataset** ([AhmedEladl/kuwait-dialect-speech-dataset](https://huggingface.co/datasets/AhmedEladl/kuwait-dialect-speech-dataset)): 31,633 clips, 3.7 GB, 22 kHz.
  - The dataset card has **no licence**. Inspecting and analysing it is OK for research. No licence does not mean permission to train, so it is not used for training.
  - A sample of 40 rows shows podcast chunks, transcribed in standard spelling (قاعدين, فقعدنا, قلنا, all with ق). It has the same blind spot as our own transcripts, and there are junk rows ("اااا…").
  - `normalized_text` = `text`. So it carries **no Kuwaiti spelling rules** to mine. It could only help as audio, and that is ruled out by the missing licence.
- **The benchmark** (Ali's plan): 30 held-out sentences from the `final` split, the ones richest in ق/ك/ج (257 letters).
  - Ali's real recording of each is the reference, compared against the current v4 model and Audar. Script: `tk_refcmp.py`.
  - These are listening comparisons only. Nothing trains on them or picks a checkpoint from them.
- **30-sentence blind comparison**
  - Built with `blind-test/build_refcmp.py`, with `refcmp-template.html` as the page template.
  - **The page:**
    - Ali's real recording is a labelled reference.
    - The models are anonymous letters, shuffled per sentence. The key is in `voice-src/refcmp/blind-key.json`.
    - Per version: 1–5 for Kuwaiti pronunciation, lengthening/doubling, and pauses.
    - Error types: wrong letter, extra lengthening, extra doubling, misplaced pause, wrong vowel, missing/extra word.
    - Tappable wrong words.
  - Parts of 5 sentences.
  - Habibi uses UAE as a Gulf reference only; it is not assumed closest to Kuwaiti.
  - **Output:** a report of the recurring errors and their likely causes, not just a ranking.
  - The first round is v4 vs Habibi. Audar and Fasih join later, if they become available.
- **Session 1, first version: inconclusive.** The letters were shuffled per sentence, and Ali assumed «أ» was the same model throughout.
  - In that version «أ» was Habibi in s01/s05 and v4 in s02–s04. The key is kept in `blind-key-session1-v1.json`.
  - His notes: «أ» better but some words sound Saudi; «ب» weaker on pronunciation and dialect, but calm, excellent pauses. These mix the two models, so they are not attributable.
- **Fix:**
  - One hidden random mapping per session (أ = the same model in all 5 sentences).
  - The page is lighter: per sentence, "which is closer to how you say it" (أ / ب / same), optional word taps, and one free-text note per session.
  - Session 1 was republished this way.
- **Comparison text problem (Ali, 2026-10-08):** the held-out sentences use Whisper's transcripts, which are full of errors.
  - Examples: غليل, بساكم, بالحالم, سوكربرغ, بودكاستان كيبر.
  - Whisper writes Ali's g as غ in about 20 training words: الأرغام, تغريبا, نغدر, غرروا, تغديم, الرغمية, مغاومة, and more. These get fixed in V5's text along with the dictionary.
  - Before testing, Ali corrects the 9 test sentences (3 sessions × 3) against his own recordings: https://claude.ai/artifact/RkmR33rYHUk1nm9LmMr9zv
  - The page is prefilled with Claude's proposed corrections. Uncertain phrases are left as transcribed for Ali.
  - Both models are re-rendered from the corrected text. Habibi renders of the old text were stopped.
  - Ali hears Emirati pronunciation in one voice. He marks those words by tapping, and they feed the error report.
- **Session 1 result (corrected text, letters fixed; أ=v4, ب=Habibi):**
  - **Picks:** s02 Habibi, s03 Habibi, s01 left unpicked. No word taps.
  - **Note:** «شون» is Emirati; the Kuwaiti is «شلون».
  - **Finding:** «شون» appears 10 times in the training text, and every one means «شلون» (how). It is a Whisper error, and the test sentences s02/s03 carried it too. It goes on the V5 text-fix list (whole word شون → شلون).
- **Comparison stopped after session 2 (Ali, 2026-10-08).** The remaining Habibi sessions add little, so the time goes to the model instead.
- **V5, the real one** (`tk_v5_text.py` → `voice-src/dataset-v5`; the earlier blanket-rule run is renamed `dataset-v5-draft` / `ckpt/v5-draft`):
  - **Text corrections:**
    - Whisper's غ-for-g words get their real spelling, 12 words (الأرغام → الأرقام …).
    - شون → شلون.
    - The 9 comparison sentences use Ali's by-ear text.
    - The dictionary is applied, VERIFIED entries only.
  - **Scope:** 166 clips changed (139 in train), 340 words.
  - **Unchanged:** same audio, features and split. fixes.json is not re-applied.
  - **Training:** same settings as v4 (2250 steps, lr 5e-5, eval every 150, patience 3). The checkpoint is chosen on val only.
  - **Then one short test:** 3 sentences, v4 against V5.
- **V5-draft training stopped at step 1713** (the process ended, probably a container restart). Best val: 4.584 at step 1650. It is not a candidate model, so it is not resumed.
- **Online check (2026-10-07):** found no Kuwaiti speech or TTS dataset with a commercial licence.
  - Open Arabic sets are MSA: ArVoice (CC-BY-4.0), Arabic Speech Corpus, ClArTTS.
  - The Gulf work is Emirati: the Ramsa corpus. The dialect-TTS papers fine-tune XTTS, which is NC and excluded here.
  - Useful ideas:
    - Dialect labels or conditioning, as the zero-shot dialect TTS papers do. This is our fallback path if V5 does not help.
    - Gulf ك→ch is mostly female address and informal speech, which matches the audit: in Ali's narration only كم.
  - Ali's own recordings stay the main data.

إذا ما طلع Chatterbox مناسب، ندوّر على بديل بنفس الشروط: رخصة تجارية، يدعم العربي، ويقبل تدريب على متحدث واحد.

**الشفافية:** في حقوق كل فيلم نكتب "الراوي: صوت ذكاء اصطناعي من صوت (الاسم)، بموافقته". والموديل يبقى خاص، ما ينشر وما ينعطى لأحد.

---

## 3. المراحل باختصار

| المرحلة | الناتج | الوقت التقريبي | التكلفة |
| --- | --- | --- | --- |
| A. تجربة بدون تدريب | عينات بصوته من 15 ثانية مرجعية | ساعة إلى ساعتين | صفر |
| B. تجهيز البيانات | من 8 إلى 15 ساعة نظيفة لصوته بس، مع النص | يوم إلى ثلاثة (أغلبها مراجعة) | صفر |
| C. تسجيل نبرة الراوي | 30 إلى 60 دقيقة يقرأ فيها سكربتات بنبرة الأفلام | جلسة وحدة | صفر |
| D. التدريب | موديل صوت تايم كيبر | 4 إلى 24 ساعة على كرت مستأجر | تقريباً 10 إلى 60 دولار |
| E. التقييم والاختيار | أفضل نقطة حفظ، مع عينات للاعتماد | ساعتين | صفر |
| F. الربط بالأفلام | `tts_tk.py`، و`NARRATOR=voice-tk` | ساعتين | صفر |

إذا طلعت المرحلة A زينة بما فيه الكفاية، ممكن نوقف عندها ونستخدم التقليد بدون تدريب.

---

## 4. التفاصيل

### 4.1 المرحلة A: تجربة سريعة بدون تدريب
1. صاحب المحل يرسل 15 إلى 20 ثانية بصوته لحاله: كلام هادي وواضح، بدون موسيقى، بأحسن مايك. ويرسل النص بالضبط.
2. نشغّل Chatterbox Multilingual على الـ CPU هني، بالمقطع كمرجع.
3. نطلّع 5 جمل من سكربت الرويال أوك، منها الهوك ومشهد الكوارتز، ونرسلها له يسمعها.
4. **قرار:** إذا الصوت واللهجة مقبولين، نروح للمرحلة F مباشرة. وإذا لا، نكمل B إلى E.

### 4.2 جمع المواد (المرحلة B)
- **الأفضل الملفات الأصلية:** ملفات المونتاج أو تسجيلات المايك بصيغة WAV أو FLAC. لا تنزّل من يوتيوب إذا الأصل موجود، لأن يوتيوب يضغط الصوت.
- **إذا ما فيه إلا يوتيوب:** نحمّل الصوت من قناته هو بس، بأعلى جودة. نستخدم `yt-dlp` مع `-x`، ونحتفظ بالصيغة الأصلية بدون تحويل.
- **طريقة الرفع:** صاحب المحل يرفع الملفات على Google Drive أو مكان تخزين سحابي، ويعطي رابط للمجلد. لا مفاتيح في الشات.
- **جرد بسيط:** نسوي `inventory.csv` فيه لكل ملف:

  | العمود | المعنى |
  | --- | --- |
  | `file` | اسم الملف |
  | `hours` | طوله بالساعات |
  | `mic` | المايك المستخدم |
  | `guests` | عدد الضيوف |
  | `music` | فيه موسيقى أو لا |
  | `notes` | ملاحظات |

### 4.3 التنظيف
1. نحوّل كل شي إلى WAV أحادي بتردد 24 أو 44.1 kHz حسب حاجة الموديل، ونوحّد مستوى الصوت.
2. نشيل الموسيقى والمقدمات. نقص المقدمة إذا ثابتة، أو نفصل الصوت عن الموسيقى بـ Demucs (رخصة MIT).
3. نشيل الضجة والصدى إذا موجودة. بس بخفة، لأن التنظيف القوي يخرب الصوت.

### 4.4 فصل المتحدثين: صوته هو بس
1. فصل المتحدثين بـ **pyannote speaker-diarization 3.1**:
   - كود pyannote رخصته MIT.
   - الموديل على Hugging Face يحتاج تقبل شروطه أول، وتحط مفتاح Hugging Face كمتغير بيئة اسمه `HF_TOKEN`.
   - البديل NVIDIA NeMo (رخصة Apache).
2. نحدد صوته بمقارنة كل متحدث بمقطع مرجعي له، يعني بصمة صوت: speaker embedding.
3. نشيل أي مقطع فيه تداخل أصوات، أو ضحك، أو حد ثاني يتكلم.
4. **مراجعة يدوية:** نسمع عينة عشوائية (2٪) ونتأكد ما فيها صوت ضيف.

### 4.5 التفريغ النصي: أهم عامل للجودة
1. نفرّغ بـ **WhisperX**: Whisper large-v3 (رخصة MIT) مع توقيت لكل كلمة (رخصة BSD-2).
2. نقسّم على الوقفات إلى مقاطع طولها من 3 إلى 15 ثانية. ما نقص كلمة بالنص.
3. **نصحح النص للهجة الكويتية:** Whisper يكتب أقرب للفصحى، وهذا يخرب التدريب. نوحّد طريقة الكتابة:
   - چ أو ك (نختار وحدة ونمشي عليها)
   - "باچر"، "شلون"، "وايد"
   - الأرقام بالكلمات مثل ما انقالت
   - أسماء الماركات بالعربي مثل ما تنطق: "رويال أوك"، "أوديمار بيغيه"
4. نشيل التشكيل كله أو نخليه بشكل ثابت، مو مرة ومرة.
5. صاحب المحل أو شخص يعرف اللهجة يراجع عينة. هذي المراجعة هي أغلب وقت المرحلة B.

### 4.6 فلترة الجودة
- **نشيل المقاطع:**
  - اللي فيها قص في الصوت (clipping) أو ضجة عالية
  - اللي أطول من 15 ثانية أو أقصر من ثانيتين
  - اللي سرعة كلامها غريبة: أقل من 4 أو أكثر من 25 حرف بالثانية، مثل ما سوى بحث "حبيبي"
- **المتوقع:** من 8 إلى 15 ساعة نظيفة من الـ 20. هذا أكثر من كافي لتدريب على متحدث واحد.
- **نخلّي على جنب 50 مقطع للاختبار،** ما ندرّب عليها.
- **صيغة البيانات:** مجلد `wavs/`، وملف `metadata.csv` فيه سطر لكل مقطع: `file|text` (نفس صيغة LJSpeech)، أو الصيغة اللي يطلبها كود التدريب.

### 4.7 نبرة الراوي (المرحلة C): مهمة
البودكاست سوالف، والأفلام سرد وثائقي هادي. عشان كذا:
- صاحب المحل يسجّل من 30 إلى 60 دقيقة يقرأ فيها سكربتات أفلام تايم كيبر، مثل `SCRIPT.md` و`SCRIPT-AR.md`.
- **ظروف التسجيل:** نفس المايك، بغرفة هادية، وبالنبرة اللي يبيها بالأفلام.
- هالتسجيلات تدخل التدريب **بوزن أعلى**. وتصير مصدر المقطع المرجعي اللي نعطيه للموديل عشان يمسك النبرة.

### 4.8 التدريب (المرحلة D)
1. **كرت شاشة مستأجر:**
   - RunPod أو Lambda أو Vast أو Colab Pro.
   - كرت A100 أو L40S أو 4090 بذاكرة 24 GB أو أكثر.
   - تقريباً من نص دولار إلى دولارين ونص بالساعة.
   - نوري صاحب المحل التكلفة قبل ما نشغّل.
2. **إعداد التدريب:** نبدأ من أوزان Chatterbox Multilingual، وندرّب على صوته بإعدادات محافظة:
   - معدل تعلم صغير (learning rate)
   - نحفظ نقطة كل 1,000 إلى 2,000 خطوة
3. **كل نقطة حفظ:** نطلّع منها 20 جملة اختبار ثابتة: الهوك، الكوارتز، أسماء الساعات، الأرقام، جملة طويلة.
4. **ننتبه للتدريب الزايد (overfitting):** إذا الصوت صار يكرر كلام البودكاست أو ضاعت الجمل الجديدة، نرجع لنقطة أقدم.
5. **التخزين:** الأوزان تنحفظ في مكان خاص: مستودع Hugging Face خاص، أو مساحة تخزين سحابية. ما تدخل git.

### 4.9 التقييم والاختيار (المرحلة E)
- **قياسات آلية:**
  - Whisper يقرأ العينات، ونقيس نسبة خطأ الكلمات (WER).
  - نقيس تشابه الصوت مع صوته الحقيقي (speaker similarity).
- **تقييم بالسمع:** صاحب المحل يسمع 3 نقاط حفظ ويختار. هذا القرار النهائي.

### 4.10 الربط بالأفلام (المرحلة F)
1. أداة جديدة `video/royal-oak/tts_tk.py`، مثل `tts_azure.py`:
   - تقرأ النصوص من `voice-ar/clips.json`.
   - تقرأ التعديلات المعتمدة من `VOICE-TODO.md` مع الخيار `--revised`.
   - تكتب `voice-tk/clips/<key>.wav` و`voice-tk/clips.json`.
   - فيها خيار `--sample <key>` لجملة وحدة.
2. نوحّد مستوى الصوت بين الجمل، ونقصّر الوقفات الطويلة. `voice-ar/tighten.py` يسوي هالشي.
3. `NARRATOR=voice-tk python3 parts.py`، وبعدها نفس خطوات البناء: render، وscore_parts، وmix، وdeliver.
4. **نضيف للـ skill** (`references/production.md`): صوت تايم كيبر الافتراضي هو `voice-tk`، وطريقة تشغيله.

---

## 5. قائمة اللي يحتاجه صاحب المحل يجهزه

- [ ] موافقة مكتوبة على تدريب صوته، تنحط في `VOICE-CONSENT.md`.
- [ ] رابط لمجلد التسجيلات الأصلية، بصيغة WAV أو FLAC إذا ممكن، مع أسماء الحلقات اللي فيها ضيوف.
- [ ] 15 إلى 20 ثانية بصوته لحاله، مع نصها، للمرحلة A.
- [ ] جلسة تسجيل من 30 إلى 60 دقيقة يقرأ فيها سكربتات بنبرة الأفلام، للمرحلة C.
- [ ] حساب على منصة كرت شاشة، أو موافقة على الاستئجار. التكلفة المتوقعة تقريباً 10 إلى 60 دولار.
- [ ] مفتاح Hugging Face (`HF_TOKEN`) في إعدادات البيئة، إذا استخدمنا pyannote أو مستودع خاص للأوزان.

## 6. المخاطر وكيف نتعامل معها

| الخطر | الحل |
| --- | --- |
| صوت ضيف يدخل البيانات | فصل المتحدثين، وبصمة الصوت، ومراجعة يدوية |
| النبرة تطلع مثل سوالف البودكاست | تسجيلات المرحلة C بوزن أعلى، ومقطع مرجعي بنبرة الراوي |
| أخطاء في التفريغ النصي | تصحيح كتابة اللهجة، ومراجعة إنسان يعرف اللهجة |
| الموديل الأساسي ما يدعم التدريب بشكل زين | نختبر المرحلة A أول، ونتأكد من وجود كود تدريب ورخصته قبل ما نصرف |
| استخدام الصوت بدون إذن | الموديل خاص، ما يطلع من حسابات تايم كيبر، ونوضح في الحقوق إنه صوت ذكاء اصطناعي |
