#!/usr/bin/env node
/* Renders movement.html frame by frame in headless Chromium.
     node render.mjs --still 1.5,10 -o stills/      PNG stills for review
     node render.mjs -o frames/                     every frame as JPEG (30 fps), then encode with ffmpeg
     node render.mjs --events                       print the sound cues as JSON
   Needs playwright-core (NODE_PATH) and a Chromium under /opt/pw-browsers. */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), opt = { workers: 3, fps: 30, from: 0, to: 30 };
for (let i = 0; i < argv.length; i++) { const a = argv[i], n = () => argv[++i];
  if (a === '--still') opt.still = n().split(',').map(Number); else if (a === '-o') opt.out = n(); else if (a === '--events') opt.events = true; else if (a === '--cover') opt.cover = n();
  else if (a === '--workers') opt.workers = +n(); else if (a === '--from') opt.from = +n(); else if (a === '--to') opt.to = +n(); }
let pw; for (const r of [here, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)]) { try { pw = createRequire(path.join(r, 'x.js'))('playwright-core'); break; } catch {} }
if (!pw) { console.error('playwright-core not found (set NODE_PATH)'); process.exit(1); }
const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
const exe = fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).map((d) => path.join(base, d, 'chrome-linux', 'chrome')).find((p) => fs.existsSync(p));
const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-gpu-vsync'] });
async function page() {
  const p = await (await browser.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  p.on('pageerror', (e) => console.error('page error:', e.message));
  await p.goto(pathToFileURL(path.join(here, 'movement.html')).href); await p.evaluate(() => window.ready); return p;
}
const grab = async (p, t, file, type) => { await p.evaluate((tt) => window.render(tt), t); const url = await p.evaluate((ty) => document.getElementById('c').toDataURL(ty, 0.93), type); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };
if (opt.cover) { const p = await page(); await p.evaluate(() => window.cover()); const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/jpeg', 0.94)); fs.writeFileSync(opt.cover, Buffer.from(url.split(',')[1], 'base64')); await browser.close(); console.log('cover ' + opt.cover); process.exit(0); }
if (opt.events) { const p = await page(); console.log(JSON.stringify(await p.evaluate(() => window.events()))); await browser.close(); process.exit(0); }
const out = opt.out || 'stills'; fs.mkdirSync(out, { recursive: true });
if (opt.still) { const p = await page(); for (const t of opt.still) await grab(p, t, path.join(out, `still_${t.toFixed(2)}.png`), 'image/png'); await browser.close(); console.log(opt.still.length + ' stills in ' + out); process.exit(0); }
const frames = []; for (let f = Math.round(opt.from * opt.fps); f < Math.round(opt.to * opt.fps); f++) frames.push(f);
let done = 0; const t0 = Date.now();
await Promise.all(Array.from({ length: opt.workers }, async (_, w) => { const p = await page();
  for (let i = w; i < frames.length; i += opt.workers) { const f = frames[i]; await grab(p, f / opt.fps, path.join(out, `f${String(f).padStart(5, '0')}.jpg`), 'image/jpeg');
    if (++done % 90 === 0) console.log(`${done}/${frames.length} frames  ${((Date.now() - t0) / 1000).toFixed(0)}s`); } }));
await browser.close(); console.log(`${frames.length} frames in ${out}`);
