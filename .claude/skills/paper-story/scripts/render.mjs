#!/usr/bin/env node
/**
 * paper-story renderer.
 *
 *   node render.mjs <storyboard.json> -o out.mp4 [--scale 1.5] [--audio vo.mp3] [--music bed.mp3]
 *   node render.mjs <storyboard.json> --still 2.5,9 -o stills/       one PNG per time (fast QA)
 *   node render.mjs <storyboard.json> --check                        lists every face a banner, card or picture covers,
 *                                                                     and every bubble or word hidden under the banner
 *   node render.mjs <storyboard.json> --sheet [--every 2] -o sheet.png   contact sheet of the whole video
 *
 * Options: --fps N  --scale N (1 = 720x1280, 1.5 = 1080x1920)  --workers N  --from S --to S
 *          --crf N  --keep-frames  --voice-gain dB  --music-gain dB
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const stageUrl = pathToFileURL(path.join(here, '..', 'engine', 'stage.html')).href;

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const opt = { workers: Math.max(1, Math.min(4, os.cpus().length - 1)), scale: 1, crf: 18, every: 2 };
let sbPath = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '-o' || a === '--out') opt.out = next();
  else if (a === '--scale') opt.scale = +next();
  else if (a === '--fps') opt.fps = +next();
  else if (a === '--workers') opt.workers = +next();
  else if (a === '--audio') opt.audio = next();
  else if (a === '--music') opt.music = next();
  else if (a === '--from') opt.from = +next();
  else if (a === '--to') opt.to = +next();
  else if (a === '--crf') opt.crf = +next();
  else if (a === '--every') opt.every = +next();
  else if (a === '--still') opt.still = next().split(',').map(Number);
  else if (a === '--sheet') opt.sheet = true;
  else if (a === '--check') opt.check = true;
  else if (a === '--keep-frames') opt.keep = true;
  else if (a === '--review') opt.review = true;
  else if (a === '--final') opt.final = true;
  else if (a === '--voice-gain') opt.voiceGain = +next();
  else if (a === '--music-gain') opt.musicGain = +next();
  else if (!sbPath) sbPath = a;
  else die('Unexpected argument: ' + a);
}
function die(m) { console.error('render: ' + m); process.exit(1); }
if (!sbPath) die('usage: node render.mjs <storyboard.json> -o out.mp4 [options]   (see header of this file)');
sbPath = path.resolve(sbPath);
const sbDir = path.dirname(sbPath);
const sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
const resolveFile = (p) => (/^(https?:|data:|file:)/.test(p) ? p : pathToFileURL(path.resolve(sbDir, p)).href);
// ---- asset resolution -------------------------------------------------------
// 1. Relative paths in "src", "avatar" and puppet "parts" resolve against the storyboard folder.
// 2. An element with "asset": "ep1_boulder_01" and no src picks up <storyboard folder>/assets/ep1_boulder_01.(jpg|png|webp)
//    when that file exists, so real evidence replaces a placeholder just by being dropped into assets/.
// 3. A puppet with "character": "ali" picks up assets/characters/ali/<front|side>/<part>.png for every part found.
const placeholders = [];
const PARTS = ['head', 'torso', 'armU', 'armL', 'hand', 'legU', 'legL', 'foot'];
const findAsset = (id) => { for (const e of ['jpg', 'jpeg', 'png', 'webp']) { const f = path.join(sbDir, 'assets', id + '.' + e); if (fs.existsSync(f)) return f; } return null; };
(function fix(o) {
  if (Array.isArray(o)) o.forEach(fix);
  else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) {
      if ((k === 'src' || k === 'avatar') && typeof o[k] === 'string') o[k] = resolveFile(o[k]);
      else if (k === 'parts' && o[k] && typeof o[k] === 'object') for (const pk of Object.keys(o[k])) o[k][pk] = resolveFile(o[k][pk]);
      else fix(o[k]);
    }
    if (typeof o.asset === 'string' && !o.src && ['photo', 'igpost', 'image', 'phone', 'door', 'laptop', 'cutout', 'reveal'].includes(o.type)) {
      const f = findAsset(o.asset);
      if (f) o.src = pathToFileURL(f).href; else placeholders.push(o.asset);
    }
    if (o.type === 'puppet' && typeof o.character === 'string') {
      const dir = path.join(sbDir, 'assets', 'characters', o.character, o.view === 'side' ? 'side' : 'front');
      const found = {};
      for (const pn of PARTS) { const f = path.join(dir, pn + '.png'); if (fs.existsSync(f)) found[pn] = pathToFileURL(f).href; }
      if (Object.keys(found).length) o.parts = Object.assign(found, o.parts || {});
      else placeholders.push('character:' + o.character + (o.view === 'side' ? ' (side)' : ''));
    }
  }
})(sb);
if (opt.review) sb.review = true;
const fps = opt.fps || sb.fps || 30;
sb.fps = fps;
const abs = (p) => (p ? path.resolve(sbDir, p) : p);
const audio = opt.audio ? path.resolve(opt.audio) : abs(sb.audio && (sb.audio.voice || sb.audio.voiceover));
const music = opt.music ? path.resolve(opt.music) : abs(sb.audio && sb.audio.music);

// ---------------------------------------------------------------- tools
function findFfmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const w = spawnSync('ffmpeg', ['-version']);
  if (w.status === 0) return 'ffmpeg';
  const py = spawnSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']);
  if (py.status === 0) return py.stdout.toString().trim();
  die('ffmpeg not found. Install it (apt-get install ffmpeg) or: pip install imageio-ffmpeg');
}
function loadPlaywright() {
  const cache = path.join(os.homedir(), '.cache', 'paper-story');
  const roots = [here, process.cwd(), cache, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  try { roots.push(execFileSync('npm', ['root', '-g']).toString().trim()); } catch {}
  for (const r of roots) {
    try { const req = createRequire(path.join(r, 'x.js')); return req('playwright-core'); } catch {}
    try { const req = createRequire(path.join(r, 'node_modules', 'x.js')); return req('playwright-core'); } catch {}
  }
  console.error('render: installing playwright-core into ' + cache + ' (one time)...');
  fs.mkdirSync(cache, { recursive: true });
  if (!fs.existsSync(path.join(cache, 'package.json'))) fs.writeFileSync(path.join(cache, 'package.json'), '{"name":"paper-story-cache","private":true}');
  const r = spawnSync('npm', ['install', '--silent', '--prefix', cache, 'playwright-core'], { stdio: 'inherit' });
  if (r.status !== 0) die('could not install playwright-core. Run: npm i --prefix ~/.cache/paper-story playwright-core');
  return createRequire(path.join(cache, 'node_modules', 'x.js'))('playwright-core');
}
function chromiumPath() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    for (const d of fs.readdirSync(b).sort().reverse()) {
      for (const rel of ['chrome-linux/headless_shell', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(b, d, rel);
        if (d.startsWith('chromium') && fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

const ffmpeg = findFfmpeg();
if (placeholders.length) {
  console.warn(`placeholders still showing (${placeholders.length}): ${[...new Set(placeholders)].join(', ')}`);
  if (opt.final) die('--final refused: real assets are missing for the placeholders above');
}
if (opt.final) {
  const bad = sb.scenes.filter((s) => !s.status);
  if (bad.length) die('--final refused: scenes without a truth status: ' + bad.map((s) => s.id || '?').join(', '));
}

function audioDuration(f) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}
// Per-scene voice clips: scene.voice = "clip.wav". If dur is missing or "auto" the scene is as long as the clip + pad.
const voiceClips = [];
{
  let acc = 0;
  for (const sc of sb.scenes) {
    if (sc.voice) {
      const f = path.resolve(sbDir, sc.voice);
      if (!fs.existsSync(f)) die('scene voice not found: ' + f);
      const d = audioDuration(f);
      if (d == null) die('could not read the duration of ' + f);
      const at = sc.voiceAt != null ? sc.voiceAt : 0.15;
      if (sc.dur === undefined || sc.dur === 'auto') sc.dur = +Math.max(at + d + (sc.pad != null ? sc.pad : 0.45), sc.minDur || 0).toFixed(2);
      // captions follow the voice unless the storyboard pins them
      if (sc.captionStart == null) sc.captionStart = at + 0.05;
      if (sc.captionEnd == null) sc.captionEnd = Math.min(sc.dur - 0.2, at + d);
      else if (d > sc.dur) console.warn(`warning: voice clip ${sc.voice} is ${d.toFixed(1)}s but its scene is ${sc.dur}s`);
      voiceClips.push({ f, start: acc + (sc.voiceAt != null ? sc.voiceAt : 0.15) });
    } else if (sc.dur === undefined || sc.dur === 'auto') sc.dur = 4;
    acc += sc.dur;
  }
}
const pw = loadPlaywright();
const browser = await pw.chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--font-render-hinting=none', '--disable-gpu-vsync', '--allow-file-access-from-files'] }).catch((e) => die('could not launch Chromium: ' + e.message.split('\n')[0] + '\nTry: npx playwright-core install chromium'));

async function newPage() {
  const W = sb.width || 720, H = sb.height || 1280;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: opt.scale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.error('page console:', m.text()); });
  await page.goto(stageUrl);
  const info = await page.evaluate((s) => window.PM.init(s), sb);
  // every picture decoded before the first screenshot (large cut-outs were still loading in the opening frames)
  await page.evaluate(() => Promise.all([...document.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; }))
    .then(() => (im.decode ? im.decode().catch(() => {}) : null)))));
  return { page, info };
}
async function shot(page, t, file, png) {
  await page.evaluate((tt) => window.PM.setTime(tt), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await page.screenshot(png ? { path: file, type: 'png' } : { path: file, type: 'jpeg', quality: 94 });
}

// ---------------------------------------------------------------- modes
const first = await newPage();
const duration = first.info.duration;
const outW = Math.round(first.info.width * opt.scale), outH = Math.round(first.info.height * opt.scale);

if (opt.check) {
  // every 0.2 s: is any face covered by a banner, caption card, bubble or picture? (elements marked "person": true)
  const hits = [];
  for (let t = 0.05; t < duration; t += 0.2) hits.push(...(await first.page.evaluate((tt) => window.PM.headClashes(tt), t)));
  await browser.close();
  const seen = new Map();
  for (const h of hits) { const k = h.scene + '|' + h.person + '|' + h.by; const e = seen.get(k); if (!e) seen.set(k, { ...h, from: h.t, to: h.t }); else { e.to = h.t; e.covered = Math.max(e.covered, h.covered); } }
  for (const e of seen.values()) console.log(`scene ${e.scene + 1}  ${e.from.toFixed(1)}-${e.to.toFixed(1)}s  ` + (e.under ? `${e.by} is ${e.covered}% under the banner` : `${e.by} covers ${e.covered}% of the head of ${e.person}`));
  console.log(seen.size ? seen.size + ' clash(es)' : 'no face covered, nothing under the banner');
  process.exit(seen.size ? 1 : 0);
}

if (opt.still || opt.sheet) {
  const times = opt.still || Array.from({ length: Math.ceil(duration / opt.every) }, (_, i) => Math.min(duration - 0.05, i * opt.every + 0.01));
  const out = opt.out || (opt.sheet ? 'sheet.png' : 'stills');
  const dir = opt.sheet ? fs.mkdtempSync(path.join(os.tmpdir(), 'pm-sheet-')) : out;
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [i, t] of times.entries()) { const f = path.join(dir, 'still_' + String(i).padStart(3, '0') + '_' + t.toFixed(2) + 's.png'); await shot(first.page, t, f, true); files.push(f); }
  await browser.close();
  if (opt.sheet) {
    const cols = Math.min(6, files.length), rows = Math.ceil(files.length / cols);
    const tw = Math.round(270 * (opt.scale >= 1 ? 1 : opt.scale));
    // ffmpeg can't glob with the time suffix reliably, so rename to a plain sequence first
    files.forEach((f, i) => fs.renameSync(f, path.join(dir, 's' + String(i).padStart(3, '0') + '.png')));
    const t = spawnSync(ffmpeg, ['-y', '-v', 'error', '-framerate', '1', '-i', path.join(dir, 's%03d.png'), '-vf', `scale=${tw}:-1,tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', out], { stdio: 'inherit' });
    if (t.status !== 0) die('ffmpeg tile failed');
    console.log('contact sheet: ' + out + '  (' + files.length + ' frames, one every ' + opt.every + 's)');
  } else console.log(files.length + ' still(s) in ' + out + '/');
  process.exit(0);
}

const t0 = opt.from || 0, t1 = Math.min(opt.to || duration, duration);
const total = Math.round((t1 - t0) * fps);
const out = path.resolve(opt.out || 'out.mp4');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-frames-'));
console.log(`rendering ${total} frames (${t0}s-${t1}s @ ${fps}fps, ${outW}x${outH}) with ${opt.workers} worker(s)...`);
const pages = [first];
for (let k = 1; k < opt.workers; k++) pages.push(await newPage());
let done = 0, lastPct = -1;
const start = Date.now();
await Promise.all(pages.map(async (p, k) => {
  for (let i = k; i < total; i += pages.length) {
    await shot(p.page, t0 + i / fps, path.join(tmp, 'f_' + String(i).padStart(6, '0') + '.jpg'), false);
    done++;
    const pct = Math.floor((done / total) * 10) * 10;
    if (pct !== lastPct) { lastPct = pct; console.log(`  ${pct}%  (${((Date.now() - start) / 1000).toFixed(0)}s)`); }
  }
}));
await browser.close();

// ---------------------------------------------------------------- encode + audio
const D = total / fps;
const args = ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(tmp, 'f_%06d.jpg')];
const vg = opt.voiceGain != null ? opt.voiceGain : (sb.audio && sb.audio.voiceGain) || 0;
const mg = opt.musicGain != null ? opt.musicGain : (sb.audio && sb.audio.musicGain != null ? sb.audio.musicGain : -18);
// every audio source becomes { f, start, gain(dB), loop?, len? }; start is in output seconds
const srcs = [];
if (audio) {
  if (!fs.existsSync(audio)) die('audio not found: ' + audio);
  const ad = audioDuration(audio);
  if (ad && ad > D + 0.3) console.warn(`warning: voice-over is ${ad.toFixed(1)}s but the storyboard is ${D.toFixed(1)}s. Lengthen scene durations or the end will be cut.`);
  srcs.push({ f: audio, start: 0, gain: vg });
}
voiceClips.filter((v) => v.start < t1).forEach((v) => srcs.push({ f: v.f, start: Math.max(0, v.start - t0), gain: vg }));
// sound effects: scene.sfx = [{at, name, gain}], scene.beds = [{name, from, to, gain}], automatic paper sounds unless scene.silent
const sfxFile = (name) => {
  for (const d of [path.join(sbDir, 'sfx'), path.join(here, '..', 'assets', 'sfx')]) { const f = path.join(d, name.endsWith('.wav') ? name : name + '.wav'); if (fs.existsSync(f)) return f; }
  die('sound effect not found: ' + name + ' (looked in <storyboard>/sfx and the skill assets/sfx)');
};
const autoSfx = !(sb.audio && sb.audio.autoSfx === false);
let sfxCount = 0;
{
  let acc = 0;
  for (const [i, sc] of sb.scenes.entries()) {
    const cues = [];
    if (autoSfx && !sc.silent) {
      if (i > 0 && ['slide', 'push', 'rise', 'drop'].includes(sc.transition || 'slide')) cues.push({ at: 0, name: 'paper_slide', gain: -9 });
      if (sc.banner !== undefined || i === 0) cues.push({ at: 0.3, name: 'paper_place', gain: -14 });
    }
    (sc.sfx || []).forEach((c) => cues.push(c));
    for (const c of cues) { const st = acc + c.at - t0; if (st >= -0.01 && st < t1 - t0) { srcs.push({ f: c.file ? path.resolve(sbDir, c.file) : sfxFile(c.name), start: Math.max(0, st), gain: c.gain != null ? c.gain : -8 }); sfxCount++; } }
    for (const bd of sc.beds || []) { const from = acc + (bd.from || 0) - t0, len = (bd.to != null ? bd.to : sc.dur) - (bd.from || 0); if (from < t1 - t0) srcs.push({ f: sfxFile(bd.name), start: Math.max(0, from), gain: bd.gain != null ? bd.gain : -22, loop: true, len, fade: 0.4 }); }
    acc += sc.dur;
  }
}
srcs.forEach((x) => { if (x.loop) args.push('-stream_loop', '-1'); args.push('-i', x.f); });
if (music) { if (!fs.existsSync(music)) die('music not found: ' + music); args.push('-stream_loop', '-1', '-i', music); }
if (srcs.length || music) {
  const chains = [], labels = [];
  srcs.forEach((x, i) => {
    let c = `[${i + 1}:a]`;
    if (x.loop) c += `atrim=0:${x.len.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${x.fade},afade=t=out:st=${Math.max(0, x.len - x.fade).toFixed(3)}:d=${x.fade},`;
    c += `adelay=${Math.round(x.start * 1000)}:all=1,volume=${x.gain}dB[a${i}]`;
    chains.push(c); labels.push(`[a${i}]`);
  });
  if (music) { const mi = srcs.length + 1; chains.push(`[${mi}:a]volume=${mg}dB,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, D - 2.5).toFixed(2)}:d=2.5[m]`); labels.push('[m]'); }
  chains.push(labels.length === 1 ? `${labels[0]}anull[a]` : `${labels.join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,loudnorm=I=-18:TP=-2:LRA=11[a]`);
  args.push('-filter_complex', chains.join(';'), '-map', '0:v', '-map', '[a]');
}
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(opt.crf), '-preset', 'medium', '-r', String(fps), '-movflags', '+faststart');
if (srcs.length || music) args.push('-c:a', 'aac', '-b:a', '160k');
args.push('-t', D.toFixed(3), out);
const enc = spawnSync(ffmpeg, args, { stdio: 'inherit' });
if (enc.status !== 0) die('ffmpeg encode failed');
if (!opt.keep) fs.rmSync(tmp, { recursive: true, force: true }); else console.log('frames kept in ' + tmp);
const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log(`done: ${out}  ${outW}x${outH}  ${D.toFixed(1)}s  ${mb} MB${srcs.length || music ? '' : '  (no audio)'}`);
