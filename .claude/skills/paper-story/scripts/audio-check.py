#!/usr/bin/env python3
"""Check the sound before anyone hears it: narration clips (wav/mp3) or a finished film (mp4).

  python3 audio-check.py voice/clips/*.wav            each clip
  python3 audio-check.py film.mp4                      the final mix

Reports, per file:
  clipped    samples at full scale (distortion)
  peak/LUFS  true peak and integrated loudness of a film (social: about -14 to -18 LUFS, peak under -1 dBFS)
  gaps       the sound drops to silence in the middle: 0.8 s in a clip (a pause after «…» is shorter), 0.6 s in a
             film before its last 8 s (the end card is quiet on purpose)
  clicks     a spike under 3 ms with near silence around it (a mouth click or an edit). Consonants such as «ت» «د» «ك»
             also make short bursts, but inside speech; those are not reported. Listen to anything listed.
  edges      a clip that starts or ends mid-sound (a word cut at the edge)
ffmpeg comes from $FFMPEG, imageio-ffmpeg, or the path."""
import os, subprocess, sys
import numpy as np

SR = 48000


def ffmpeg():
    if os.environ.get('FFMPEG'): return os.environ['FFMPEG']
    try:
        import imageio_ffmpeg; return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def load(f):
    """Both channels as they are (a mono downmix can exceed full scale on its own), and their mean."""
    raw = subprocess.run([ffmpeg(), '-v', 'error', '-i', f, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    st = np.frombuffer(raw, np.float32).astype(np.float64).reshape(-1, 2)
    return st, st.mean(1)


def db(x): return 20 * np.log10(max(x, 1e-9))


def check(f):
    st, a = load(f); film = f.lower().endswith(('.mp4', '.mov', '.m4a'))
    out = []
    clipped = int((np.abs(st) > .99).sum())
    if clipped: out.append('clipped samples: %d' % clipped)
    blk = int(.05 * SR); n = len(a) // blk
    rms = np.array([db(np.sqrt((a[i * blk:(i + 1) * blk] ** 2).mean())) for i in range(n)])
    # gaps: silence after sound and before more sound, away from the ends (lengths in the docstring)
    gaps, i = [], 10
    while i < n - 10:
        if rms[i] < -60 and rms[i - 1] > -40:
            j = i
            while j < n and rms[j] < -60: j += 1
            if j - i >= (12 if film else 16) and j < n - (160 if film else 10): gaps.append('%.2fs (%.2fs)' % (i * .05, (j - i) * .05))
            i = j
        i += 1
    if gaps: out.append('gaps: ' + ', '.join(gaps[:8]))
    # clicks: a narrow high-frequency spike whose surroundings are quiet
    h = np.abs(np.diff(a, 2)); win = int(.002 * SR)
    cand = np.where(h > max(.05, np.percentile(h, 99.995)))[0]
    clicks, last = [], -SR
    for c in cand:
        if c - last < SR * .05: continue
        last = c
        ctx = np.concatenate([a[max(0, c - int(.02 * SR)):max(0, c - win)], a[c + win:c + int(.02 * SR)]])
        if len(ctx) and db(np.sqrt((ctx ** 2).mean())) < -40: clicks.append('%.2fs' % (c / SR))
    if clicks: out.append('clicks: ' + ', '.join(clicks[:8]))
    if not film:
        e = int(.01 * SR)
        head, tail = db(np.sqrt((a[:e] ** 2).mean())), db(np.sqrt((a[-e:] ** 2).mean()))
        if head > -35: out.append('starts mid-sound (%.0f dB in the first 10 ms)' % head)
        if tail > -35: out.append('ends mid-sound (%.0f dB in the last 10 ms)' % tail)
    info = ''
    if film:
        r = subprocess.run([ffmpeg(), '-v', 'info', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
        lines = [l.strip() for l in r.splitlines()[-14:]]
        I = next((l.split()[1] for l in lines if l.startswith('I:')), '?'); P = next((l.split()[1] for l in lines if l.startswith('Peak:')), '?')
        info = '  %s LUFS, true peak %s dBFS' % (I, P)
        try:
            if float(P) > -1: out.append('true peak above -1 dBFS')
        except ValueError:
            pass
    print('%s %s  %.1fs%s' % ('!!' if out else 'ok', os.path.basename(f), len(a) / SR, info))
    for o in out: print('     ' + o)
    return bool(out)


if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    bad = sum(check(f) for f in sys.argv[1:])
    print('%d file(s) to listen to' % bad if bad else 'clean')
    sys.exit(1 if bad else 0)
