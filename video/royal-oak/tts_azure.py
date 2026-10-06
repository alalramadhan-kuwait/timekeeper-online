#!/usr/bin/env python3
"""Narration with Azure Speech (free tier F0, 0.5M characters a month; the whole film is about 3,000), voice
ar-KW-FahedNeural (Kuwaiti Arabic, male). Reads the lines from voice-ar/clips.json (or the reviewed wording in
VOICE-TODO.md with --revised) and writes voice-fahed/clips/<key>.wav plus voice-fahed/clips.json in the same format.

  AZURE_SPEECH_KEY and AZURE_SPEECH_REGION come from the environment (never from the chat or the repo).
  python3 tts_azure.py --sample p1-h          one line, to listen to first
  python3 tts_azure.py [--revised]            every line
  NARRATOR=voice-fahed python3 parts.py       storyboards that use these clips"""
import json, os, re, sys, wave, urllib.request
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, 'voice-fahed'); os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)
VOICE, RATE, PAUSE = 'ar-KW-FahedNeural', '-4%', '450ms'


def lines(revised):
    src = json.load(open(os.path.join(H, 'voice-ar', 'clips.json')))
    text = {k: v['text'] for k, v in src.items()}
    if revised:
        for line in open(os.path.join(H, 'VOICE-TODO.md')):
            m = re.match(r'\| (p\d-[0-9a-z]+)[^|]*\| [^|]*\| ([^|]+) \|', line)
            if m and m.group(1) in text: text[m.group(1)] = m.group(2).strip()
    return text


def ssml(t):
    t = t.replace('&', 'و').replace('<', '').replace('>', '')
    t = t.replace('…', '<break time="%s"/>' % PAUSE)
    return ("<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-KW'><voice name='%s'>"
            "<prosody rate='%s'>%s</prosody></voice></speak>" % (VOICE, RATE, t))


def say(key, t):
    region, k = os.environ['AZURE_SPEECH_REGION'], os.environ['AZURE_SPEECH_KEY']
    req = urllib.request.Request('https://%s.tts.speech.microsoft.com/cognitiveservices/v1' % region, data=ssml(t).encode('utf-8'), method='POST',
                                 headers={'Ocp-Apim-Subscription-Key': k, 'Content-Type': 'application/ssml+xml',
                                          'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm', 'User-Agent': 'timekeeper-royal-oak'})
    f = os.path.join(OUT, 'clips', key + '.wav')
    open(f, 'wb').write(urllib.request.urlopen(req, timeout=60).read())
    with wave.open(f) as w: sec = w.getnframes() / w.getframerate()
    return {"file": "clips/%s.wav" % key, "seconds": round(sec, 2), "text": t, "voice": VOICE}


if __name__ == '__main__':
    if not os.environ.get('AZURE_SPEECH_KEY') or not os.environ.get('AZURE_SPEECH_REGION'):
        sys.exit('AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are not set in this environment')
    text = lines('--revised' in sys.argv)
    keys = [sys.argv[sys.argv.index('--sample') + 1]] if '--sample' in sys.argv else sorted(text)
    path = os.path.join(OUT, 'clips.json')
    done = json.load(open(path)) if os.path.exists(path) else {}
    for key in keys:
        done[key] = say(key, text[key]); print(key, done[key]['seconds'], 's')
    json.dump(done, open(path, 'w'), ensure_ascii=False, indent=1)
