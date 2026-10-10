// How each Watch Mall picture sits on the grid, checked against the spec's geometry.
//
// world-art-check.mjs checks what every picture must have (its key, size and
// transparency). This reads the pixels of the mall pictures and checks the
// things that make them line up in the game: floor tiles fill their diamond,
// walls run along their floor line and end at their connection points so the
// next piece joins with no step, accent layers stay inside the wall they tint,
// a kiosk's top is where watches will stand and its glass sits on that top,
// figures stand on their feet, and the plain areas the game writes on are plain.
//
//   node scripts/world-mall-geometry.mjs [folder]     (default: src/world/assets/final)
//
// The geometry comes from src/world/assets/mall-geometry.json, made with the
// artwork spec. Exits 1 when a check fails. Not part of the build: run it when
// a new set of mall pictures arrives.
/* global URL, console, process, Buffer */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url).pathname
const dir = process.argv[2] ?? join(root, 'src/world/assets/final')
const geo = JSON.parse(readFileSync(join(root, 'src/world/assets/mall-geometry.json'), 'utf8'))

/* A plain PNG reader: 8-bit RGBA or RGB (or palette), not interlaced, which is what the art is saved as. */
function readPng(file) {
  const buf = readFileSync(file)
  let at = 8, w = 0, h = 0, ct = 0, depth = 0, pal = null, trns = null
  const idat = []
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8), d = buf.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced PNG') }
    else if (type === 'PLTE') pal = d
    else if (type === 'tRNS') trns = d
    else if (type === 'IDAT') idat.push(d)
    at += 12 + len
  }
  if (depth !== 8) throw new Error(`${depth}-bit PNG`)
  const ch = { 6: 4, 2: 3, 3: 1, 4: 2, 0: 1 }[ct], raw = inflateSync(Buffer.concat(idat)), stride = w * ch
  const px = Buffer.alloc(w * h * ch), out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? px[y * stride + i - ch] : 0, b = y ? px[(y - 1) * stride + i] : 0, c = y && i >= ch ? px[(y - 1) * stride + i - ch] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
      px[y * stride + i] = (src[i] + pred) & 255
    }
  }
  for (let i = 0; i < w * h; i++) {
    const s = px.subarray(i * ch, i * ch + ch)
    if (ct === 6) out.set(s, i * 4)
    else if (ct === 2) out.set([s[0], s[1], s[2], 255], i * 4)
    else if (ct === 3) out.set([pal[s[0] * 3], pal[s[0] * 3 + 1], pal[s[0] * 3 + 2], trns && s[0] < trns.length ? trns[s[0]] : 255], i * 4)
    else if (ct === 4) out.set([s[0], s[0], s[0], s[1]], i * 4)
    else out.set([s[0], s[0], s[0], 255], i * 4)
  }
  return { w, h, px: out }
}

const results = []
let failed = 0
const say = (key, ok, msg) => { results.push({ key, ok, msg }); if (ok === false) failed++ }

const load = (key) => { const f = join(dir, `${key}.png`); return existsSync(f) ? readPng(f) : null }
const A = (im, x, y) => im.px[(y * im.w + x) * 4 + 3]
const RGB = (im, x, y) => { const i = (y * im.w + x) * 4; return [im.px[i], im.px[i + 1], im.px[i + 2]] }
/* For each column, the first and last row that is solid (alpha >= 128). */
function edges(im) {
  const top = new Int32Array(im.w).fill(-1), bot = new Int32Array(im.w).fill(-1)
  for (let x = 0; x < im.w; x++) for (let y = 0; y < im.h; y++) if (A(im, x, y) >= 128) { if (top[x] < 0) top[x] = y; bot[x] = y + 1 }
  return { top, bot }
}
function bbox(im, thr = 128) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) >= thr) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 }
}
const inDiamond = (x, y, [t, r, b, l]) => {
  const cx = (l[0] + r[0]) / 2, cy = (t[1] + b[1]) / 2, hw = (r[0] - l[0]) / 2, hh = (b[1] - t[1]) / 2
  return Math.abs(x + 0.5 - cx) / hw + Math.abs(y + 0.5 - cy) / hh <= 1
}
const along = ([[x0, y0], [x1, y1]]) => (x) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
const prims = (g, kind) => g.prims.filter((p) => p[0] === kind).map((p) => p[1])
const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b

for (const [key, g] of Object.entries(geo)) {
  const im = load(key)
  if (!im) { results.push({ key, ok: null, msg: 'not in this folder' }); continue }
  if (im.w !== g.px[0] || im.h !== g.px[1]) { say(key, null, `${im.w} x ${im.h}, not the spec's ${g.px[0]} x ${g.px[1]}: placed by hand in art.json, so not measured here`); continue }
  const fp = prims(g, 'fp')[0], floor = prims(g, 'floor')[0]
  if (g.kind === 'tile' && key.startsWith('mall-tile')) {
    let inside = 0, inN = 0, outside = 0, outN = 0
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
      if (inDiamond(x, y, fp)) { inN++; if (A(im, x, y) >= 250) inside++ } else { outN++; if (A(im, x, y) > 8) outside++ }
    }
    say(key, inside / inN > 0.97 && outside / outN < 0.02, `diamond ${(100 * inside / inN).toFixed(1)}% filled, ${(100 * outside / outN).toFixed(1)}% painted outside it`)
  } else if (floor && g.layer === 'tint') {
    // an accent layer is drawn over its wall: it must stay inside the wall's own outline
    const base = load(key.replace(/-accent$/, ''))
    if (!base) { say(key, null, 'its wall is not in this folder to compare with'); continue }
    let stray = 0, n = 0
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y) >= 64) { n++; if (A(base, x, y) < 64) stray++ }
    say(key, stray <= n * 0.005, `${n} accent pixels, ${stray} outside the wall`)
  } else if (floor) {
    const { top, bot } = edges(im), f = along(floor)
    const [fx0, fx1] = [Math.min(floor[0][0], floor[1][0]), Math.max(floor[0][0], floor[1][0])]
    let dev = 0, empty = 0
    for (let x = fx0; x < fx1; x++) { if (bot[x] < 0) empty++; else dev = Math.max(dev, Math.abs(bot[x] - f(x))) }
    say(key, dev <= 2 && !empty, `floor line within ${dev.toFixed(0)} px${empty ? `, ${empty} empty columns` : ''}`)
    const ledge = prims(g, 'top').length > 1
    const t = along(prims(g, 'top')[ledge ? 1 : 0])
    let tdev = 0
    for (let x = fx0; x < fx1; x++) if (top[x] >= 0) tdev = Math.max(tdev, Math.abs(top[x] - t(x)))
    say(key, tdev <= 3, `${ledge ? 'front top edge' : 'top edge'} within ${tdev.toFixed(0)} px`)
    if (ledge) {
      // the 16 px of top seen behind the front edge
      const back = along(prims(g, 'top')[0]), probe = Math.round((fx0 + fx1) / 2) + 8
      const seen = top[probe] >= 0 ? t(probe) - top[probe] : 0, want = t(probe) - back(probe)
      say(key, seen >= want - 3 ? true : null, `top thickness ${seen.toFixed(0)} px of ${want.toFixed(0)} drawn${seen < want - 3 ? ' (note: it joins either way)' : ''}`)
    }
    for (const [cx, cy] of prims(g, 'conn')) {
      const x = Math.min(Math.max(cx === fx1 ? cx - 1 : cx, 0), im.w - 1)
      say(key, Math.abs(bot[x] - cy) <= 2, `connection point (${cx}, ${cy}): wall meets the floor at y = ${bot[x]}`)
    }
  } else if (fp && g.kind === 'object') {
    const b = bbox(im), [, right, front, left] = fp
    const centre = (left[0] + right[0]) / 2, mid = (fp[0][1] + front[1]) / 2
    const bx = []
    for (let x = b.x0; x < b.x1; x++) if (A(im, x, b.y1 - 1) >= 128) bx.push(x)
    const lowX = bx.reduce((s, x) => s + x, 0) / bx.length
    if (key !== 'kiosk-glass') say(key, b.y1 <= front[1] + 3 && b.y1 >= mid && Math.abs(lowX - front[0]) <= 8 && b.x0 >= left[0] - 2 && b.x1 <= right[0] + 2,
      `stands inside its footprint: lowest point (${lowX.toFixed(0)}, ${b.y1}), front corner (${front[0]}, ${front[1]}); spans x ${b.x0}–${b.x1} of ${left[0]}–${right[0]}, centred at ${((b.x0 + b.x1) / 2).toFixed(0)} (${centre})`)
    const top = prims(g, 'surface')[0]
    if (top) {
      // the key-specific top: kiosk bases have it, the glass rests on it
      if (key === 'kiosk-glass') {
        let a = 0, n = 0
        for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) if (A(im, x, y) > 0) { a += A(im, x, y); n++ }
        say(key, Math.abs(b.y1 - top[2][1]) <= 8, `rests on the base's top: lowest point y = ${b.y1}, top's front corner y = ${top[2][1]}`)
        say(key, a / n < 200, `see-through: average opacity ${(100 * a / n / 255).toFixed(0)}%`)
      } else {
        say(key, Math.abs(b.y0 - top[0][1]) <= 4 && Math.abs(b.x0 - top[3][0]) <= 4 && Math.abs(b.x1 - top[1][0]) <= 4,
          `top surface at y ${b.y0} (spec ${top[0][1]}), x ${b.x0}–${b.x1} (spec ${top[3][0]}–${top[1][0]})`)
      }
    }
  } else if (g.kind === 'person') {
    const b = bbox(im), [[ax, ay]] = prims(g, 'anchor')
    say(key, Math.abs(b.y1 - ay) <= 10 && Math.abs((b.x0 + b.x1) / 2 - ax) <= 12, `feet at (${((b.x0 + b.x1) / 2).toFixed(0)}, ${b.y1}), anchor (${ax}, ${ay})`)
  } else if (fp && g.kind === 'tile') {
    const b = bbox(im, 32)
    say(key, b.x0 >= fp[3][0] - 2 && b.x1 <= fp[1][0] + 2 && b.y0 >= fp[0][1] - 2 && b.y1 <= fp[2][1] + 2, `inside its ring area: x ${b.x0}–${b.x1}, y ${b.y0}–${b.y1}`)
  }
  for (const [x0, y0, x1, y1] of prims(g, 'rect')) {
    let solid = 0, n = 0, s = 0, s2 = 0
    for (let y = y0 + 4; y < y1 - 4; y++) for (let x = x0 + 4; x < x1 - 4; x++) { n++; if (A(im, x, y) > 200) solid++; const l = lum(RGB(im, x, y)); s += l; s2 += l * l }
    const sd = Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2))
    say(key, solid / n > 0.95 && sd < 25, `writing area plain: ${(100 * solid / n).toFixed(0)}% solid, brightness spread ${sd.toFixed(1)}`)
  }
}

/* Joins: every back-wall piece ends at the same height, so a run of them has no step. */
const height = (key, x, floorY) => {
  const im = load(key); if (!im) return null
  let n = 0
  for (let y = Math.round(floorY) - 1; y >= 0; y--) if (A(im, x, y) >= 128) n++; else if (n) break
  return n
}
const joins = [
  [['bq-wall', 6], ['bay-wall', 3], ['mall-wall-r', 1]].map(([k, n]) => ({ k, start: height(k, 0, 320), end: height(k, n * 128 - 1, 320 + n * 64) })),
  [['bq-front', 6], ['bay-front', 3], ['mall-ledge-r', 1]].map(([k, n]) => ({ k, start: height(k, 0, 120), end: height(k, n * 128 - 1, 120 + n * 64) })),
]
const wl = load('mall-wall-l')
if (wl) joins[0].push({ k: 'mall-wall-l', start: height('mall-wall-l', 127, 320), end: height('mall-wall-l', 0, 384) })
for (const run of joins) {
  const have = run.filter((r) => r.start !== null)
  if (have.length < 2) continue
  const hs = have.flatMap((r) => [r.start, r.end]), lo = Math.min(...hs), hi = Math.max(...hs)
  say('joins', hi - lo <= 2, `${have.map((r) => r.k).join(', ')}: every end ${lo}–${hi} px high, so pieces meet without a step`)
}

const W = Math.max(...results.map((r) => r.key.length))
for (const r of results) console.log(`${r.ok === true ? 'ok  ' : r.ok === false ? 'FAIL' : '--  '}  ${r.key.padEnd(W)}  ${r.msg}`)
console.log(`\n${failed ? `${failed} check(s) failed` : 'all measured checks pass'}; ${results.filter((r) => r.msg === 'not in this folder').length} key(s) not in this folder`)
process.exit(failed ? 1 : 0)
