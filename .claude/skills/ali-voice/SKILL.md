---
name: ali-voice
description: Narration in Ali Alyousifi's voice (صوت علي اليوسفي) for a Time Keeper film, made from a Kuwaiti reader's own recordings. The reader records the script in parts; the tool cleans, splits per sentence, converts to Ali's voice (Chatterbox VC), moves pace and tone toward Ali's, restores clarity, and the audio is sent for approval before any video. Use when the user wants a film, reel or voice-over "بصوت علي", sends recordings of a script to be turned into Ali's voice, or asks to redo or adjust that voice (faster, slower, tone, muffled).
---

# Ali's voice from a Kuwaiti read

The person reading is a Kuwaiti speaker (usually the user). They give the pronunciation and the delivery; the tool gives Ali's timbre.

Text-to-speech in Ali's voice (TK Voice V5) was judged «سيء جدا» in a real film, so it is not used. Don't fall back to it, or to another voice, without asking.

Everything runs through one tool: `video/brand/tk_ali_voice.py`. Its docstring has every step and the reason for each default. `video/brand/TOOLS.md` rates every tool tried. `video/brand/VOICE-PLAN.md` holds the full history.

## Rules

- **Consent.** Ali's consent is in `video/brand/VOICE-CONSENT.md`, and the reader consents by recording.
  - Every film in this voice ends with the credit line «الراوي: صوت ذكاء اصطناعي من صوت علي اليوسفي، بموافقته».
  - Never use anyone else's voice or recordings without their written consent.
- **No audio in git.** That covers recordings, `voice-src/`, `voice-rec/` and `voice-vc/`, and `.gitignore` already covers them.
- **Audio first.** Send the narration audio first (`voice-vc/all.m4a`). Build the video only after the user approves the sound.
- **Language.** The user writes Kuwaiti Arabic, so reply in Kuwaiti Arabic. Keep messages short.

## Workflow

### 1. Script

Write `<film>/narration.json` with one short line per scene (`"s01"`, `"s02"`, …).

- About 10 lines makes a 30–45 s reel.
- Group the lines into parts of 3–4 with `"_parts": [["s01","s02","s03"], ["s04","s05","s06"], …]`.

Send the user the script numbered by part, with these recording instructions:

- One file per part.
- About one second of silence between sentences.
- Read naturally, without worrying about speed (the tool speeds it up).
- If a sentence goes wrong, say it again in the same file after a pause. The later take wins.
- Record in a quiet room with the phone close.

### 2. Recordings

Put the files in `<film>/voice-rec/`. They are taken in natural name order, so `1, 2, … 10` sort correctly. Keep the names the user gave unless the order is unclear; if it is, ask.

### 3. Run

```
/root/tkvoice/bin/python video/brand/tk_ali_voice.py video/<film>
```

- Takes about 9 minutes on CPU for 10 sentences.
- Add `--split-only` to check the cuts first.
- Then read `voice-vc/report.txt`:
  - Every sentence shows a match score and what Whisper heard.
  - Scores of 0.7 and up are normal. Whisper writes Kuwaiti poorly, so judge the match, not the spelling.
  - A low score, or a "left out" line that is not an obvious retake, goes to the user before going on.

### 4. Send `voice-vc/all.m4a`

Report the total length. Ask the user three things:

- Is the speed right?
- Is the tone like Ali's?
- Is it clear?

Use these knobs, re-running with:

- `--tempo` (default 1.13): pace.
- `--range` (default 1.45): how much the pitch moves. Higher sounds livelier.
- `--pause` (default 0.15 s): the longest pause inside a sentence.
- If the user hears it as muffled or harsh, tune `BRIGHT` in the tool and measure band levels against the reader's clean recording. The method is in the commit history of the tool.

### 5. Video, after approval

Use the `paper-story` skill. Each scene's `voice` is `voice-vc/proc/sNN.wav`, with captions taken from `narration.json`.

- If the reader changed a word, fix the caption to what was said.
- End on the Time Keeper end card, with the consent credit as two lines under the logo. `video/ask-mohammed-reel/build.py` is the worked example: `NARRATOR=ali-vc`, credit lines at y 830/866.
- Render, run `deliver.py` with a cover taken from the film, and send both.

## Setup on a fresh machine

Check: `/root/tkvoice/bin/python -c "import chatterbox, demucs, faster_whisper, parselmouth"` and `ls voice-src/ref.wav`.

**Environment.** Python 3.11+. This takes a few minutes, and the models download about 10 GB on first use.

```
python3 -m venv /root/tkvoice
/root/tkvoice/bin/pip install torch==2.6.0 torchaudio==2.6.0
/root/tkvoice/bin/pip install chatterbox-tts faster-whisper demucs praat-parselmouth librosa soundfile
/root/tkvoice/bin/pip install --no-deps --force-reinstall "git+https://github.com/resemble-ai/chatterbox.git@5de7a54aa4e5e2baadb0182dde554908b48b85c2"
```

You also need ffmpeg built with `rubberband` and `aexciter` (`ffmpeg -filters | grep -E "rubberband|aexciter"`).

**Ali's reference clip.** `voice-src/ref.wav` is not in git. It is 17.6 s from the Tudor episode on the Time Keeper KW YouTube channel (video `ZhOZyrX90nI`), and Ali picked it himself. Rebuild it from the episode audio with:

```
ffmpeg -i ZhOZyrX90nI.mp3 -ss 101.8 -t 17.6 -ac 1 -ar 24000 -af volume=1.42 voice-src/ref.wav
```

This matches the original at correlation 0.999.

Getting the episode audio:

- YouTube blocks downloads from cloud machines ("Sign in to confirm you're not a bot").
- So ask the user to send `ref.wav` (they keep a copy) or the episode audio.
- Never take Ali's voice from a third-party mirror.
