#!/usr/bin/env python3
"""Narration with ElevenLabs (direct API, the owner's own account). Same lines as voice-habibi/clips.json, with
people's names, brands and cities written in Latin letters for the voice only (tts_habibi.PRON; the captions keep the
Arabic spelling). Writes voice-eleven/clips/<key>.wav and voice-eleven/clips.json in the same format as voice-ar;
NARRATOR=voice-eleven python3 parts.py uses them.

  ELEVENLABS_API_KEY comes from the environment settings (never from the chat or the repo).
  python3 tts_eleven.py --voices [accent]          Arabic voices in the shared library (accent e.g. gulf, kuwaiti, saudi)
  python3 tts_eleven.py --add OWNER_ID VOICE_ID    adds a library voice to the account so the API can use it
  python3 tts_eleven.py --test "text"              one free line -> voice-eleven/test.wav
  python3 tts_eleven.py --sample p2-7              one line of the script, to listen to first
  python3 tts_eleven.py [key ...]                  every line (or only these), skipping clips already made with the same settings

VOICE, MODEL and SETTINGS below (or ELEVEN_VOICE / ELEVEN_MODEL in the environment) choose the voice."""
import json, os, subprocess, sys, urllib.parse, urllib.request
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, H); import tts_habibi as T
OUT = os.path.join(H, 'voice-eleven'); os.makedirs(os.path.join(OUT, 'clips'), exist_ok=True)
API = 'https://api.elevenlabs.io'
try: import imageio_ffmpeg; FF = os.environ.get('FFMPEG', imageio_ffmpeg.get_ffmpeg_exe())
except ImportError: FF = os.environ.get('FFMPEG', 'ffmpeg')
VOICE = os.environ.get('ELEVEN_VOICE', '')                  # chosen with the owner after --voices
MODEL = os.environ.get('ELEVEN_MODEL', 'eleven_multilingual_v2')
SETTINGS = {'stability': .5, 'similarity_boost': .75, 'style': 0, 'use_speaker_boost': True, 'speed': .92}   # a little slower: a documentary narrator
SEED = 1234


def call(path, body=None, query=None):
    url = API + path + ('?' + urllib.parse.urlencode(query) if query else '')
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode('utf-8'), method='GET' if body is None else 'POST',
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r: return r.read()


def voices(accent=None):
    q = {'language': 'ar', 'page_size': 100}
    if accent: q['accent'] = accent
    for v in json.loads(call('/v1/shared-voices', query=q))['voices']:
        print('%-22s %-12s %-6s %-8s %-14s %s  owner=%s\n   %s' % (v['voice_id'], v.get('accent', ''), v.get('gender', ''), v.get('age', ''),
                                                                  v.get('use_case', ''), v['name'], v.get('public_owner_id', ''), v.get('preview_url', '')))


def tts(text, wav):
    if not VOICE: sys.exit('set ELEVEN_VOICE (pick one with --voices first)')
    mp3 = call('/v1/text-to-speech/%s' % VOICE, {'text': text, 'model_id': MODEL, 'voice_settings': SETTINGS, 'seed': SEED},
               {'output_format': 'mp3_44100_128'})
    raw = subprocess.run([FF, '-v', 'error', '-i', '-', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], input=mp3, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).astype(np.float64)
    a = a / max(1e-6, (a ** 2).mean() ** .5) * .1                                    # -20 dBFS RMS, like the other narrators
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f64le', '-ar', '48000', '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', wav],
                   input=a.clip(-.99, .99).tobytes(), check=True)
    return round(len(a) / 48000, 2)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--voices']: voices(args[1] if len(args) > 1 else None); sys.exit()
    if args[:1] == ['--add']:
        print(call('/v1/voices/add/%s/%s' % (args[1], args[2]), {'new_name': 'TK narrator %s' % args[2][:6]}).decode()); sys.exit()
    if args[:1] == ['--test']:
        print('wrote voice-eleven/test.wav', tts(T.spoken(args[1]), os.path.join(OUT, 'test.wav')), 's'); sys.exit()
    src = json.load(open(os.path.join(H, 'voice-habibi', 'clips.json')))
    keys = args[1:] if args[:1] == ['--sample'] else (args or list(src))
    f_json = os.path.join(OUT, 'clips.json')
    done = json.load(open(f_json)) if os.path.exists(f_json) else {}
    for k in keys:
        text = src[k]['text']; say = T.spoken(text)
        same = done.get(k, {})
        if same.get('spoken') == say and same.get('voice_id') == VOICE and same.get('model') == MODEL and same.get('settings') == SETTINGS \
                and os.path.exists(os.path.join(OUT, same.get('file', '-'))): continue
        sec = tts(say, os.path.join(OUT, 'clips', k + '.wav'))
        done[k] = {'file': 'clips/%s.wav' % k, 'seconds': sec, 'text': text, 'spoken': say, 'voice': 'ElevenLabs', 'voice_id': VOICE,
                   'model': MODEL, 'settings': SETTINGS}
        json.dump(done, open(f_json, 'w'), ensure_ascii=False, indent=1)
        print(k, sec, 's |', say, flush=True)
