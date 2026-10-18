---
name: ali-voice-auto
description: Automatic narration in Ali Alyousifi's Kuwaiti voice (Time Keeper) from text, no recording. Use when the user wants a voice-over, narration or app/feature explainer "بصوت علي" from a script.
---

# Ali's automatic voice (صوت علي التلقائي)

This kit turns Arabic (Kuwaiti) text into Ali Alyousifi's voice.
- **Model:** OmniVoice, the voice model, plus a small adapter trained on Ali's real speech. Gulf Arabic mode.
- **Consent:** Ali's consent is on file with the owner.
- **Licence:** the OmniVoice weights are non-commercial (CC-BY-NC). Use it for drafts, internal and test videos until the owner says otherwise.

## Files in this kit
| File | What it is |
|---|---|
| `say.py` | Generates the audio |
| `setup.sh` | One-time setup |
| `adapter/` | Ali's trained adapter. **Private: never upload or share it, never commit it to a public repo.** |
| `ref8.wav` + `ref8.txt` | Ali's 7.5 s reference and its text. Private. |
| `kuwaiti-lexicon.json` | General Kuwaiti word choice (أمس not امبارح, جدام, …) |
| `omni-spelling-map.json` | How to write words so this model says them right. Built by the owner's ear, word by word. |

## Steps
1. **Setup, once:** `bash setup.sh`. The first run downloads the 3 GB base model from Hugging Face.
2. **Write the script by these rules:**
   - Kuwaiti dialect, short sentences, one per line.
   - English names and words in English letters: Time Keeper, Rolex, app, login, dashboard. Never transliterate them into Arabic letters.
   - Numbers as Kuwaiti words: خمسة وعشرين, not 25.
   - No diacritics, except one vowel on a truly ambiguous word (سُمك = thickness). Heavy diacritics sound formal and Saudi.
   - Avoid words known to fail until they are fixed in the map. Check `omni-spelling-map.json` for words marked `testing` or `unsolved`.
3. **Generate:** `.venv/bin/python say.py --file script.txt voice.wav --speed 1.1`.
   - The text is passed through the lexicon and the spelling map automatically.
4. **Always send the audio to the owner for approval before using it in a video.** The owner marks any wrong word.
   - Send those words back to the main voice chat (timekeeper-online), where they are fixed in the spelling map and retested.
   - Then copy the updated `omni-spelling-map.json` into this kit.
5. **For video:** put the WAV under the visuals. Leave about 0.3 s of silence between scenes. Do not speed it up past 1.2.

## Do not
- Do not train or fine-tune anything.
- Do not upload `adapter/` or `ref8.wav` to any service, or publish them.
- Do not change the voice settings (Gulf Arabic, `ref8`, adapter): they were chosen by blind listening tests.
