#!/usr/bin/env python3
"""Make the copy of a finished film that gets shared: it opens on its cover, carries the cover as an attached picture,
and fits a size limit.

   python3 deliver.py film.mp4 cover.jpg out.mp4 [--hold 0.7] [--fade 0.3] [--max-mb 29]

Messaging apps (WhatsApp, iMessage) use the first frame as the thumbnail, and a paper film usually opens dark. So the
cover is held for --hold seconds, then cross-fades (--fade) into the film; the audio is delayed by the same amount, so the
narration and music stay where they were against the picture. The cover is also attached as an attached_pic stream
for players that show one. The picture is re-encoded, stepping the quality down until the file is under --max-mb."""
import argparse, os, re, subprocess, sys

FF = os.environ.get('FFMPEG', 'ffmpeg')
ap = argparse.ArgumentParser()
ap.add_argument('film'); ap.add_argument('cover'); ap.add_argument('out')
ap.add_argument('--hold', type=float, default=0.7, help='seconds the cover shows on its own before the fade')
ap.add_argument('--fade', type=float, default=0.3)
ap.add_argument('--max-mb', type=float, default=29)
a = ap.parse_args()

probe = subprocess.run([FF, '-hide_banner', '-i', a.film], capture_output=True, text=True).stderr
W, H = re.search(r'Video: .*?, (\d{2,5})x(\d{2,5})', probe).groups()
fps = 30
start = a.hold                           # the film begins under the fade, right after the cover's hold
lead = a.hold + a.fade
ms = int(round(start * 1000))

for crf in (23, 25, 27, 29, 31):
    cmd = [FF, '-v', 'error', '-y', '-loop', '1', '-framerate', str(fps), '-t', '%.3f' % lead, '-i', a.cover, '-i', a.film, '-i', a.cover,
           '-filter_complex',
           '[0:v]scale=%s:%s:force_original_aspect_ratio=increase,crop=%s:%s,fps=%d,format=yuv420p,setsar=1,settb=AVTB[c];'
           '[1:v]fps=%d,format=yuv420p,setsar=1,settb=AVTB[f];'
           '[c][f]xfade=transition=fade:duration=%.3f:offset=%.3f[v];'
           '[1:a]adelay=%d|%d[a]' % (W, H, W, H, fps, fps, a.fade, start, ms, ms),
           '-map', '[v]', '-map', '[a]', '-map', '2:v',
           '-c:v:0', 'libx264', '-crf', str(crf), '-preset', 'medium', '-pix_fmt:v:0', 'yuv420p',
           '-c:v:1', 'mjpeg', '-disposition:v:1', 'attached_pic',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', a.out]
    subprocess.run(cmd, check=True)
    mb = os.path.getsize(a.out) / 2 ** 20
    print('crf %d: %.1f MiB' % (crf, mb))
    if mb <= a.max_mb: break
else:
    sys.exit('still over %.0f MiB at crf 31: shorten the film or lower its resolution' % a.max_mb)
print('wrote', a.out, '(opens on the cover for %.1f s, then a %.1f s fade; audio delayed %.2f s)' % (start, a.fade, start))
