#!/usr/bin/env python3
"""A free draft read of the script, for the user to review the wording before any paid voice is recorded.

  python3 draft-voice.py script.json                       every line   -> voice-draft/
  python3 draft-voice.py script.json p2-h p3-e             only these lines
  python3 draft-voice.py script.json --out voice-draft --slow

script.json maps line keys to text ({"p1-h": "...", ...}); an optional "_parts" ({"part1": [keys...]}) gives the
order. It writes, next to the script:
  <out>/mp3/<key>.mp3          each line as read
  <out>/clips/<key>.wav        mono 48 kHz, levelled like the real narration
  <out>/clips.json             {key: {file, seconds, text}}, the same format as the paid voice, so a draft film can be
                               rendered with it to check timing (NARRATOR=voice-draft in the Royal Oak project)
  <out>/read-<part>.mp3        the whole part read in order, with a pause between lines: send this to the user
and prints each line's length and the characters a paid voice would charge.

The voice is Google's free text-to-speech (gTTS, Modern Standard Arabic or the script's language): no account, no
key, no credits. It is for reviewing words, order, length and rhythm, not for publishing, and it says names the
Arabic way; how the paid voice says a foreign name is checked after recording with voice-check.py.
Needs gTTS (pip install gTTS) and network access to translate.google.com."""
import json, os, subprocess, sys
import numpy as np

SR = 48000


def ffmpeg():
    if os.environ.get('FFMPEG'): return os.environ['FFMPEG']
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def decode(f):
    raw = subprocess.run([ffmpeg(), '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def write_wav(a, f):
    os.makedirs(os.path.dirname(f), exist_ok=True)
    subprocess.run([ffmpeg(), '-v', 'error', '-y', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', f],
                   input=a.clip(-.99, .99).tobytes(), check=True)


def trim(a, thr=.01):
    """Drop the silence gTTS leaves at both ends, so the length matches what a narrator would take."""
    idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - int(.05 * SR)): idx[-1] + int(.1 * SR)] if len(idx) else a


def main(argv):
    out_name, slow, lang = 'voice-draft', False, os.environ.get('DRAFT_LANG', 'ar')
    if '--out' in argv: i = argv.index('--out'); out_name = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    if '--slow' in argv: slow = True; argv.remove('--slow')
    if not argv: sys.exit(__doc__)
    try:
        from gtts import gTTS
    except ImportError:
        sys.exit('needs gTTS: pip install gTTS')
    script_path = os.path.abspath(argv[0]); base = os.path.dirname(script_path)
    script = json.load(open(script_path))
    lines = {k: v for k, v in script.items() if not k.startswith('_') and isinstance(v, str)}
    parts = script.get('_parts') or {'all': list(lines)}
    keys = argv[1:] or [k for p in parts.values() for k in p if k in lines]
    out = os.path.join(base, out_name)
    f_json = os.path.join(out, 'clips.json')
    done = json.load(open(f_json)) if os.path.exists(f_json) else {}
    chars = 0
    for k in keys:
        text = lines[k]; chars += len(text)
        if done.get(k, {}).get('text') == text and os.path.exists(os.path.join(out, done[k]['file'])):
            print('%-6s %5.1fs (unchanged)' % (k, done[k]['seconds'])); continue
        mp3 = os.path.join(out, 'mp3', k + '.mp3'); os.makedirs(os.path.dirname(mp3), exist_ok=True)
        gTTS(text.replace('|', ' '), lang=lang, slow=slow).save(mp3)
        a = trim(decode(mp3)); a = a / max(1e-6, np.sqrt((a ** 2).mean())) * .1
        write_wav(a, os.path.join(out, 'clips', k + '.wav'))
        done[k] = {'file': 'clips/%s.wav' % k, 'mp3': 'mp3/%s.mp3' % k, 'seconds': round(len(a) / SR, 2), 'text': text, 'voice': 'draft (gTTS)'}
        json.dump(done, open(f_json, 'w'), ensure_ascii=False, indent=1)
        print('%-6s %5.1fs | %s' % (k, done[k]['seconds'], text), flush=True)
    # one file per part, in order, with a pause between lines, for listening
    for name, pk in parts.items():
        pk = [k for k in pk if k in done and k in keys]
        if not pk: continue
        gap = np.zeros(int(.7 * SR))
        a = np.concatenate([np.concatenate([decode(os.path.join(out, done[k]['file'])), gap]) for k in pk])
        wav = os.path.join(out, 'read-%s.wav' % name); write_wav(a, wav)
        subprocess.run([ffmpeg(), '-v', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1:LRA=7', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', wav[:-4] + '.mp3'], check=True); os.remove(wav)   # loud enough on a phone speaker
        print('read-%s.mp3  %.0fs, %d lines' % (name, len(a) / SR, len(pk)))
    print('%d characters in these lines: what a paid voice would charge to record them' % chars)


if __name__ == '__main__':
    main(sys.argv[1:])
