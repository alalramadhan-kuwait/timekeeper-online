#!/usr/bin/env python3
"""Narration with ElevenLabs (direct API, the owner's own account), in a voice that already exists in that account
(Ali Alyousifi's). Same lines as voice-habibi/clips.json; people's names, brands and cities go to the voice in Latin
letters (tts_habibi.PRON), the captions keep the Arabic spelling.

Rules from the owner: never create, replace, edit or delete a voice (this script only reads voices); nothing that costs
characters runs without --yes, and without it every generating command only prints what it would send.

  The key is a network secret on the cloud environment: the agent proxy adds it to requests for api.elevenlabs.io as
  the xi-api-key header (Bearer is refused by ElevenLabs), so the session never sees it. An ELEVENLABS_API_KEY
  environment variable, if one is set, is sent as xi-api-key instead. Never from the chat or the repo.
  python3 tts_eleven.py --check                          is the key accepted; plan and characters left
  python3 tts_eleven.py --mine                           the voices in the account (ids, type, languages, models)
  python3 tts_eleven.py --models [VOICE_ID]              text-to-speech models that speak Arabic (and, given a voice, which it is tuned on)
  python3 tts_eleven.py --library [accent]               Arabic voices in the shared library, to listen to only
  python3 tts_eleven.py --test "text" [--yes]            one free line            -> voice-eleven/test.mp3
  python3 tts_eleven.py --compare KEY settings.json [--yes]   one line, several voice settings -> voice-eleven/compare/<KEY>_NN.mp3
  python3 tts_eleven.py [KEY ...] [--yes]                the script (or only these lines) -> voice-eleven/mp3/<KEY>.mp3, plus a
                                                         levelled voice-eleven/clips/<KEY>.wav and clips.json for the film
                                                         (NARRATOR=voice-eleven python3 parts.py)

ELEVEN_VOICE, ELEVEN_MODEL (and SETTINGS below) choose what is generated; they are printed before anything is sent."""
import json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request
import numpy as np
H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, H); import tts_habibi as T
OUT = os.path.join(H, 'voice-eleven')
API = 'https://api.elevenlabs.io'
try: import imageio_ffmpeg; FF = os.environ.get('FFMPEG', imageio_ffmpeg.get_ffmpeg_exe())
except ImportError: FF = os.environ.get('FFMPEG', 'ffmpeg')
VOICE = os.environ.get('ELEVEN_VOICE', '')
MODEL = os.environ.get('ELEVEN_MODEL', 'eleven_multilingual_v2')
SETTINGS = {'stability': .5, 'similarity_boost': .75, 'style': 0, 'use_speaker_boost': True, 'speed': .92}   # a little slower: a documentary narrator
SEED = 1234
ALI = re.compile(r'\bali\b|alyousifi|yousifi|علي|اليوسفي', re.I)


def call(path, body=None, query=None):
    url = API + path + ('?' + urllib.parse.urlencode(query) if query else '')
    headers = {'Content-Type': 'application/json'}
    if os.environ.get('ELEVENLABS_API_KEY'): headers['xi-api-key'] = os.environ['ELEVENLABS_API_KEY']   # else the agent proxy adds it (network secret)
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode('utf-8'), method='GET' if body is None else 'POST', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return r.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode('utf-8', 'replace')[:400]
        sys.exit('ElevenLabs %s %s: %s' % (e.code, path, detail))


def check():
    try:
        s = json.loads(call('/v1/user/subscription'))
        print('connected. plan %s, %s of %s characters used, resets %s' % (s.get('tier'), s.get('character_count'), s.get('character_limit'),
                                                                         s.get('next_character_count_reset_unix')))
    except SystemExit as e:
        if 'missing_permissions' not in str(e) and '401' not in str(e): raise
        json.loads(call('/v1/voices'))          # a key limited to voices still proves the connection
        print('connected (this key cannot read the plan; voices are readable)')


def mine():
    voices = json.loads(call('/v1/voices'))['voices']          # /v1: the agent proxy adds the key to /v1 paths
    for v in sorted(voices, key=lambda v: (v.get('category') == 'premade', v['name'])):
        langs = ', '.join(sorted({l.get('language', '') + ('/' + l['accent'] if l.get('accent') else '') for l in v.get('verified_languages') or []}))
        tuned = ', '.join(m for m, s in ((v.get('fine_tuning') or {}).get('state') or {}).items() if s == 'fine_tuned')
        labels = ', '.join('%s=%s' % kv for kv in (v.get('labels') or {}).items())
        print('%s %-22s %-13s %s\n      labels: %s\n      languages: %s\n      tuned for: %s' % ('>>' if ALI.search(v['name'] + ' ' + (v.get('description') or '')) else '  ',
              v['voice_id'], v.get('category', ''), v['name'], labels or '-', langs or '-', tuned or '-'))
    print('%d voices (>> marks names that look like Ali Alyousifi)' % len(voices))


def models(voice=None):
    tuned = {}
    if voice:
        v = json.loads(call('/v1/voices/%s' % voice))
        tuned = (v.get('fine_tuning') or {}).get('state') or {}
        print('voice %s (%s, %s)' % (v['name'], v.get('category'), voice))
    for m in json.loads(call('/v1/models')):
        if not m.get('can_do_text_to_speech'): continue
        langs = {l['language_id'] for l in m.get('languages') or []}
        if not ({'ar', 'ara'} & langs): continue
        print('%-28s %-34s max %s chars%s' % (m['model_id'], m['name'], m.get('maximum_text_length_per_request', '?'),
                                              ('   voice state: ' + tuned.get(m['model_id'], '-')) if voice else ''))


def library(accent=None):
    q = {'language': 'ar', 'page_size': 100, **({'accent': accent} if accent else {})}
    for v in json.loads(call('/v1/shared-voices', query=q))['voices']:
        print('%-22s %-12s %-6s %-8s %s\n   %s' % (v['voice_id'], v.get('accent', ''), v.get('gender', ''), v.get('age', ''), v['name'], v.get('preview_url', '')))


def plan(items, settings_list):
    print('voice   %s\nmodel   %s' % (VOICE or '(ELEVEN_VOICE not set)', MODEL))
    for s in settings_list: print('settings', json.dumps(s))
    n = 0
    for name, text in items: print('  %-8s %3d chars | %s' % (name, len(text), text)); n += len(text) * len(settings_list)
    print('total about %d characters. Nothing was sent: add --yes once the voice, model and text are confirmed.' % n)


def tts(text, mp3_path, settings):
    if not VOICE: sys.exit('set ELEVEN_VOICE (see --mine)')
    os.makedirs(os.path.dirname(mp3_path), exist_ok=True)
    mp3 = call('/v1/text-to-speech/%s' % VOICE, {'text': text, 'model_id': MODEL, 'voice_settings': settings, 'seed': SEED},
               {'output_format': 'mp3_44100_128'})
    open(mp3_path, 'wb').write(mp3)
    return mp3


def level_wav(mp3, wav):
    """The film's copy: mono 48 kHz, levelled to -20 dBFS RMS like the other narrators."""
    raw = subprocess.run([FF, '-v', 'error', '-i', '-', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], input=mp3, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).astype(np.float64); a = a / max(1e-6, (a ** 2).mean() ** .5) * .1
    os.makedirs(os.path.dirname(wav), exist_ok=True)
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f64le', '-ar', '48000', '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', wav], input=a.clip(-.99, .99).tobytes(), check=True)
    return round(len(a) / 48000, 2)


if __name__ == '__main__':
    yes = '--yes' in sys.argv; args = [a for a in sys.argv[1:] if a != '--yes']
    cmd = args[0] if args and args[0].startswith('--') else None
    if cmd == '--check': check(); sys.exit()
    if cmd == '--mine': mine(); sys.exit()
    if cmd == '--models': models(args[1] if len(args) > 1 else None); sys.exit()
    if cmd == '--library': library(args[1] if len(args) > 1 else None); sys.exit()
    src = json.load(open(os.path.join(H, 'voice-habibi', 'clips.json')))
    if cmd == '--test':
        items = [('test', T.spoken(args[1]))]
        if not yes: plan(items, [SETTINGS]); sys.exit()
        tts(items[0][1], os.path.join(OUT, 'test.mp3'), SETTINGS); print('wrote voice-eleven/test.mp3'); sys.exit()
    if cmd == '--compare':
        key, variants = args[1], json.load(open(os.path.join(H, args[2])))
        items = [(key, T.spoken(src[key]['text']))]
        sets = [{**SETTINGS, **v} for v in variants]
        if not yes: plan(items, sets); sys.exit()
        log = []
        for i, s in enumerate(sets, 1):
            f = os.path.join(OUT, 'compare', '%s_%02d.mp3' % (key, i)); tts(items[0][1], f, s)
            log.append({'file': os.path.basename(f), 'settings': s}); print(os.path.basename(f), json.dumps(s), flush=True)
        json.dump({'voice_id': VOICE, 'model': MODEL, 'seed': SEED, 'text': items[0][1], 'files': log},
                  open(os.path.join(OUT, 'compare', key + '.json'), 'w'), ensure_ascii=False, indent=1)
        sys.exit()
    keys = args or list(src)
    items = [(k, T.spoken(src[k]['text'])) for k in keys]
    if not yes: plan(items, [SETTINGS]); sys.exit()
    f_json = os.path.join(OUT, 'clips.json')
    done = json.load(open(f_json)) if os.path.exists(f_json) else {}
    for k, say in items:
        same = done.get(k, {})
        if same.get('spoken') == say and same.get('voice_id') == VOICE and same.get('model') == MODEL and same.get('settings') == SETTINGS \
                and os.path.exists(os.path.join(OUT, same.get('file', '-'))): continue
        mp3 = tts(say, os.path.join(OUT, 'mp3', k + '.mp3'), SETTINGS)
        sec = level_wav(mp3, os.path.join(OUT, 'clips', k + '.wav'))
        done[k] = {'file': 'clips/%s.wav' % k, 'mp3': 'mp3/%s.mp3' % k, 'seconds': sec, 'text': src[k]['text'], 'spoken': say,
                   'voice': 'ElevenLabs', 'voice_id': VOICE, 'model': MODEL, 'settings': SETTINGS}
        json.dump(done, open(f_json, 'w'), ensure_ascii=False, indent=1)
        print(k, sec, 's |', say, flush=True)
