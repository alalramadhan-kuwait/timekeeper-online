// Generates PWA icons (clock emblem on brand indigo) as PNGs — no external deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INDIGO = [79, 70, 229];   // #4F46E5
const WHITE = [255, 255, 255];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// signed distance helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;
function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2, R = size * 0.30, hand = size * 0.028;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x + 0.5, py = y + 0.5;
    let col = INDIGO.slice();
    // clock face (white)
    const face = clamp(0.5 - sdCircle(px, py, c, c, R), 0, 1);
    col = mix(col, WHITE, face);
    // hands (indigo) — minute up, hour to 2 o'clock
    const minute = clamp(0.5 - sdCapsule(px, py, c, c, c, c - R * 0.72, hand), 0, 1);
    const hour = clamp(0.5 - sdCapsule(px, py, c, c, c + R * 0.42, c - R * 0.42, hand * 1.15), 0, 1);
    col = mix(col, INDIGO, Math.max(minute, hour));
    // center pin
    col = mix(col, INDIGO, clamp(0.5 - sdCircle(px, py, c, c, size * 0.035), 0, 1));
    const i = (y * size + x) * 4;
    buf[i] = Math.round(col[0]); buf[i + 1] = Math.round(col[1]); buf[i + 2] = Math.round(col[2]); buf[i + 3] = 255;
  }
  return encodePNG(size, buf);
}

mkdirSync('public', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/${name}`, render(size));
  console.log('wrote public/' + name);
}
