#!/usr/bin/env python3
"""Listen to the narration before rendering: transcribe every clip on this machine and compare it with its script line.
Free (no voice credits), so run it after every recording and before any render.

  python3 voice-check.py voice/clips.json                 every line in clips.json ({key: {file, text}})
  python3 voice-check.py voice/clips.json p2-h p3-e       only these lines
  python3 voice-check.py voice/clips.json --terms الكوارتز,الستيل
                                                          also check these words are heard with their article («ال»)
  python3 voice-check.py a.wav "the line as written"      one file

It prints, per line, how much of the script was heard and which written words were not, then a short verdict.
What it catches (each was a real fault): a name or term sent to the voice in Latin letters loses the Arabic article
(«هدّد Quartz» was heard as «هدد كوارتز»); a skipped or garbled word; an extra sound or word; a line cut short.
Numbers are spoken words in the script and digits in the transcript, so they are not counted as missing.

Needs faster-whisper (pip install faster-whisper); the small model (about 500 MB) downloads on first use.
Whisper mishears some names; read the transcript next to the line rather than trusting the score alone."""
import difflib, json, os, re, sys

TASHKEEL = re.compile(r'[ؐ-ًؚ-ٰٟۖ-ۭـ]')
LATIN = re.compile(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.'’ -]*")
NUMBER_WORDS = re.compile(r'^(و?)(واحد|اثن|ثلاث|أربع|اربع|خمس|ست|سبع|ثمان|تسع|عشر|مئة|مائة|مئت|ألف|الف|آلاف|صفر|عام|فاصلة)')


def norm(w):
    w = TASHKEEL.sub('', w).strip('،,.:;!?؟…«»"\'()-–— ')
    w = re.sub('[إأآا]', 'ا', w).replace('ى', 'ي').replace('ة', 'ه')
    return w.lower()


def words(t):
    return [n for n in (norm(w) for w in t.replace('|', ' ').split()) if n]


def main(argv):
    terms = []
    if '--terms' in argv:
        i = argv.index('--terms'); terms = [t for t in argv[i + 1].split(',') if t]; argv = argv[:i] + argv[i + 2:]
    if not argv: sys.exit(__doc__)
    if argv[0].endswith('.json'):
        clips = json.load(open(argv[0])); base = os.path.dirname(os.path.abspath(argv[0]))
        keys = argv[1:] or list(clips)
        # names and terms sent to the voice in Latin letters (clips.json 'spoken') are left out: whisper spells them its own way
        items = [(k, os.path.join(base, clips[k]['file']), clips[k]['text'], LATIN.sub(' ', clips[k].get('spoken') or clips[k]['text'])) for k in keys]
    else:
        items = [(os.path.basename(argv[0]), argv[0], argv[1] if len(argv) > 1 else '', argv[1] if len(argv) > 1 else '')]
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit('needs faster-whisper: pip install faster-whisper')
    model = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8')
    lang = os.environ.get('WHISPER_LANG', 'ar')
    bad = 0
    for key, f, text, check_text in items:
        segs, _ = model.transcribe(f, language=lang, beam_size=5)
        heard = ' '.join(s.text.strip() for s in segs)
        a, b = words(check_text), words(heard)
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        missing = [w for tag, i1, i2, j1, j2 in sm.get_opcodes() if tag in ('delete', 'replace') for w in a[i1:i2]
                   if not NUMBER_WORDS.match(w)]
        counted = [w for w in a if not NUMBER_WORDS.match(w)]
        score = 1 - len(missing) / max(1, len(counted))
        art = [t for t in terms if t in text and norm(t) not in [norm(x) for x in heard.split()]]
        flag = score < 0.75 or art
        bad += bool(flag)
        print('%s %-8s %3d%% heard | %s' % ('!!' if flag else 'ok', key, round(score * 100), heard))
        if missing: print('             not heard as written: ' + ' '.join(missing))
        if art: print('             without its article or not heard: ' + ' '.join(art))
    print('%d of %d line(s) to listen to again' % (bad, len(items)) if bad else 'every line heard as written')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
