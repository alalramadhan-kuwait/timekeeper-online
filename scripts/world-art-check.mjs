// Every picture in src/world/assets/final/ must fit the World before it ships.
//
// Replacement art arrives as one PNG per key. A picture that is cut to the
// wrong proportions, or has no transparency, does not fail loudly in the game:
// it stands a little off its floor tile or sits in a white box. This reads each
// file's size and colour type from its PNG header and checks it against
// src/world/assets/contract.json (the agreed size and anchor per key) or, for a
// file placed by hand, the entry in final/art.json made for that exact file.
//
// Errors fail the build; notes are printed and do not.
/* global URL, console, process */
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../src/world/assets/', import.meta.url)
const contract = JSON.parse(readFileSync(new URL('contract.json', dir), 'utf8'))
let art = {}
try { art = JSON.parse(readFileSync(new URL('final/art.json', dir), 'utf8')) } catch { /* no hand-tuned placement yet */ }

const errors = [], notes = []
const files = readdirSync(new URL('final/', dir)).filter((f) => /\.(png|webp|svg)$/.test(f))
const seen = new Set()
let tuned = 0, byContract = 0

// PNG: 8-byte signature, then IHDR (width, height, bit depth, colour type); tRNS gives a palette image transparency
function pngInfo(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20), colourType = buf[25]
  let alpha = colourType === 4 || colourType === 6
  for (let at = 8; at < buf.length - 8 && !alpha;) {
    const len = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8)
    if (type === 'tRNS') alpha = true
    if (type === 'IDAT') break
    at += 12 + len
  }
  return { width, height, alpha }
}

for (const f of files) {
  const m = f.match(/^(.+?)(?:@(\d+)x(\d+))?\.(png|webp|svg)$/)
  const key = m[1]
  seen.add(key)
  const c = contract[key]
  if (!c) { errors.push(`${f}: "${key}" is not a key the World draws (see contract.json)`); continue }
  if (m[4] !== 'png') { notes.push(`${f}: not a PNG, so its size is not checked`); continue }
  const info = pngInfo(readFileSync(new URL(`final/${f}`, dir)))
  if (!info) { errors.push(`${f}: not a readable PNG`); continue }
  if (!info.alpha) errors.push(`${f}: no transparency (save as PNG with an alpha channel)`)
  // an animated sheet is checked by its frame
  const [w, h] = m[2] ? [+m[2], +m[3]] : [info.width, info.height]
  if (m[2] && (info.width % w || info.height % h)) errors.push(`${f}: ${info.width} x ${info.height} is not a whole number of ${w} x ${h} frames`)
  const entry = art[key]
  if (entry && (!entry.size || (entry.size[0] === w && entry.size[1] === h))) { tuned++; continue }
  if (entry) notes.push(`${f}: replaced (art.json was tuned for ${entry.size.join(' x ')}); placed by the contract now, so its art.json entry can go`)
  byContract++
  const [cw, ch] = c.px
  const off = Math.abs(w / h - cw / ch) / (cw / ch)
  if (off > 0.02) errors.push(`${f}: ${w} x ${h} px, but "${key}" must be ${cw} x ${ch} (or the same shape larger); it is ${(off * 100).toFixed(1)}% off`)
  else if (w < cw) notes.push(`${f}: ${w} x ${h} px is smaller than ${cw} x ${ch}; it will look soft when zoomed in`)
}
for (const key of Object.keys(art)) if (!seen.has(key)) notes.push(`art.json: "${key}" has no file in final/`)

const temporary = Object.keys(contract).filter((k) => !seen.has(k))
console.log(`  world art: ${tuned} placed by art.json, ${byContract} by the contract, ${temporary.length} still temporary${temporary.length ? ` (${temporary.join(', ')})` : ''}`)
for (const n of notes) console.log(`  note   ${n}`)
for (const e of errors) console.error(`  ERROR  ${e}`)
if (errors.length) process.exit(1)
