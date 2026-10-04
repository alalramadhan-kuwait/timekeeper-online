#!/usr/bin/env node
/* Renders index.html (three.js, WebGL through SwiftShader) frame by frame. Serves the repo over a local port so the
   ES modules load, and keeps the page's 2D output canvas (picture, motion blur, grade, words).
     node render.mjs --still 2,9.5 -o stills/ [--sub 1]   review stills (sub 1 = no motion blur, faster)
     node render.mjs -o frames/ [--from 0 --to 30]        every frame as JPEG, 30 fps
     node render.mjs --events                             the sound cues as JSON
   Needs playwright-core (NODE_PATH), three.js linked at ./vendor-three, Chromium under /opt/pw-browsers. */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..');
const argv = process.argv.slice(2), opt = { workers: 2, from: 0, to: 30, sub: 0 };
for (let i = 0; i < argv.length; i++) { const a = argv[i], n = () => argv[++i];
  if (a === '--still') opt.still = n().split(',').map(Number); else if (a === '-o') opt.out = n(); else if (a === '--events') opt.events = true;
  else if (a === '--workers') opt.workers = +n(); else if (a === '--from') opt.from = +n(); else if (a === '--to') opt.to = +n(); else if (a === '--sub') opt.sub = +n(); else if (a === '--cam') opt.cam = n(); else if (a === '--where') opt.where = true; else if (a === '--cover') opt.cover = n(); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/video/movement-3d/index.html`;
let pw; for (const r of [here, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)]) { try { pw = createRequire(path.join(r, 'x.js'))('playwright-core'); break; } catch {} }
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).map((d) => path.join(base, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function page() { const p = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await p.goto(url); await p.waitForFunction(() => window.ready && window.render, null, { timeout: 120000 }); await p.evaluate(() => window.ready); return p; }
const grab = async (p, t, file, type) => {
  if (opt.cam) await p.evaluate((c) => { window.DEBUG_CAM = c.split(';').map((v, i) => (i < 2 ? v.split(',').map(Number) : +v)); }, opt.cam);
  await p.evaluate(([tt, s]) => window.render(tt, s), [t, opt.sub]); const d = await p.evaluate((ty) => document.querySelector('canvas').toDataURL(ty, 0.93), type); fs.writeFileSync(file, Buffer.from(d.split(',')[1], 'base64')); };
const done = async (c = 0) => { await browser.close(); server.close(); process.exit(c); };
if (opt.cover) { const p = await page(); await p.evaluate(() => window.cover()); const d = await p.evaluate(() => document.querySelector('canvas').toDataURL('image/jpeg', 0.94)); fs.writeFileSync(opt.cover, Buffer.from(d.split(',')[1], 'base64')); console.log('cover ' + opt.cover); await done(); }
if (process.env.BLURPLAN) { const p = await page(); console.log(JSON.stringify(await p.evaluate(() => window.blurPlan()))); await done(); }
if (opt.where) { const p = await page(); await p.evaluate(() => window.render(18.3, 1)); console.log(JSON.stringify(await p.evaluate(() => window.where2()))); console.log(JSON.stringify(await p.evaluate(() => window.where()), (k, v) => (typeof v === 'number' ? +v.toFixed(2) : k === 'group' || k === 'wheel' || k === 'pinion' ? undefined : v))); await done(); }
if (opt.events) { const p = await page(); console.log(JSON.stringify(await p.evaluate(() => window.events()))); await done(); }
const out = opt.out || 'stills'; fs.mkdirSync(out, { recursive: true });
if (opt.still && opt.cam && opt.cam.includes('|')) { const p = await page(); const cams = opt.cam.split('|');
  for (const [i, c] of cams.entries()) { opt.cam = c; await grab(p, opt.still[0], path.join(out, `cam_${String(i).padStart(2, '0')}.jpg`), 'image/jpeg'); } await done(); }
if (opt.still) { const p = await page(); for (const t of opt.still) { const t0 = Date.now(); await grab(p, t, path.join(out, `still_${t.toFixed(2)}.jpg`), 'image/jpeg'); console.log(t, (Date.now() - t0) + ' ms'); } await done(); }
const frames = []; for (let f = Math.round(opt.from * 30); f < Math.round(opt.to * 30); f++) if (!fs.existsSync(path.join(out, `f${String(f).padStart(5, '0')}.jpg`))) frames.push(f);
let n = 0; const t0 = Date.now();
await Promise.all(Array.from({ length: opt.workers }, async (_, w) => { const p = await page();
  for (let i = w; i < frames.length; i += opt.workers) { const f = frames[i]; await grab(p, f / 30, path.join(out, `f${String(f).padStart(5, '0')}.jpg`), 'image/jpeg');
    if (++n % 30 === 0) console.log(`${n}/${frames.length} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } }));
console.log(`${frames.length} frames in ${out}`); await done();
