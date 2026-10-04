'use strict';
/* How energy travels through an automatic movement: a 30 s, 1080x1920 canvas film drawn as a pure function of time.
   window.ready resolves when fonts and images are in; window.render(t) draws the frame at t seconds;
   window.events() lists the sound cues (ticks, ratchet clicks, whooshes) computed from the same mechanics.

   The mechanics are kept honest: meshing wheels share a module, turn in opposite directions at the ratio of their
   tooth counts and keep their teeth interleaved; the escape wheel advances half a tooth per beat, only while the
   balance's impulse jewel is in the fork; the fork angle follows the jewel; the hairspring breathes with the balance. */

const W = 1080, H = 1920, DUR = 30;
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const main = document.getElementById('c'), mctx = main.getContext('2d');
let ctx = mctx;

const FONT_DIR = '../../.claude/skills/paper-story/assets/fonts/';
const LOGO = new Image();
window.ready = Promise.all([
  ...[['Fraunces', 'fraunces-latin-700-normal.woff2', '700'], ['Inter Tight', 'inter-tight-latin-800-normal.woff2', '800'],
      ['Inter Tight', 'inter-tight-latin-900-normal.woff2', '900'], ['JetBrains Mono', 'jetbrains-mono-latin-500-normal.woff2', '500']]
    .map(([f, file, w]) => new FontFace(f, `url(${FONT_DIR}${file})`, { weight: w }).load().then((ff) => document.fonts.add(ff))),
  new Promise((r) => { LOGO.onload = r; LOGO.onerror = r; LOGO.src = '../../public/icon-512.png'; }),
]).then(() => { build(); return true; });

// ------------------------------------------------------------------ helpers
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const E = {
  lin: (u) => u, inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), out: (u) => 1 - Math.pow(1 - u, 3),
  in: (u) => u * u * u, sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2, expo: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
};
function kf(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (t <= t1) { const [t0, v0] = keys[i - 1]; return lerp(v0, v1, E[e || 'inOut']((t - t0) / (t1 - t0))); }
  }
  return keys[keys.length - 1][1];
}
const win = (t, a, b, fi = 0.25, fo = 0.25) => clamp((t - a) / fi) * clamp((b - t) / fo);
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const mod = (a, n) => ((a % n) + n) % n;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// numerical integral of a rate, tabulated once (deterministic, any t)
function integral(rate, t0 = 0, t1 = DUR + 1, dt = 1 / 1200) {
  const n = Math.ceil((t1 - t0) / dt) + 1, tab = new Float64Array(n);
  for (let i = 1; i < n; i++) { const t = t0 + (i - 0.5) * dt; tab[i] = tab[i - 1] + rate(t) * dt; }
  return (t) => { const x = clamp((t - t0) / dt, 0, n - 1.001), i = Math.floor(x); return lerp(tab[i], tab[i + 1], x - i); };
}

// ------------------------------------------------------------------ materials
const BRASS = [[0, '#fff3cf'], [0.22, '#e7c27a'], [0.48, '#a77b31'], [0.7, '#efd08d'], [1, '#5f4214']];
const ROSE = [[0, '#fff1e2'], [0.25, '#e9b98f'], [0.5, '#a96f45'], [0.72, '#f1c9a4'], [1, '#5c3517']];
const STEEL = [[0, '#ffffff'], [0.28, '#cfd6dd'], [0.52, '#7c8590'], [0.74, '#e2e7ec'], [1, '#353b43']];
const DARK = [[0, '#8a929c'], [0.35, '#4a5058'], [0.65, '#2a2e34'], [1, '#14171b']];
const GOLD = '#e9c27a';
function lin(x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
// a gradient lit from the top-left of the world, whatever the part's own rotation
function lit(r, rot, stops) { const a = -2.36 - rot; return lin(Math.cos(a) * r, Math.sin(a) * r, -Math.cos(a) * r, -Math.sin(a) * r, stops); }

// ------------------------------------------------------------------ parts
const pathCache = new Map();
function gearPath(N, rTip, rRoot, spokes, hub, hole, saw) {
  const key = [N, rTip.toFixed(2), rRoot.toFixed(2), spokes, hub, hole, saw].join('|');
  if (pathCache.has(key)) return pathCache.get(key);
  const p = new Path2D(), h = Math.PI / N;
  for (let k = 0; k < N; k++) {
    const c = k * 2 * h;
    const pts = saw
      ? [[c - h, rRoot], [c + h * 0.85, rTip], [c + h, rRoot]]
      : [[c - h, rRoot], [c - h * 0.66, rRoot + (rTip - rRoot) * 0.5], [c - h * 0.42, rTip], [c + h * 0.42, rTip], [c + h * 0.66, rRoot + (rTip - rRoot) * 0.5], [c + h, rRoot]];
    pts.forEach(([a, r], i) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; (k === 0 && i === 0) ? p.moveTo(x, y) : p.lineTo(x, y); });
  }
  p.closePath();
  if (spokes) {
    const ro = rRoot * 0.84, ri = hub, sw = Math.max(5, rRoot * 0.1);
    for (let k = 0; k < spokes; k++) {
      const a0 = (k * TAU) / spokes, a1 = ((k + 1) * TAU) / spokes, ho = Math.asin(sw / 2 / ro), hi = Math.asin(Math.min(0.95, sw / 2 / ri));
      p.moveTo(Math.cos(a0 + ho) * ro, Math.sin(a0 + ho) * ro);
      p.arc(0, 0, ro, a0 + ho, a1 - ho); p.lineTo(Math.cos(a1 - hi) * ri, Math.sin(a1 - hi) * ri); p.arc(0, 0, ri, a1 - hi, a0 + hi, true); p.closePath();
    }
  }
  if (hole) { p.moveTo(hole, 0); p.arc(0, 0, hole, 0, TAU); }
  pathCache.set(key, p); return p;
}

// a toothed wheel of N teeth on pitch radius r; blur = angle swept during the shutter (motion blur)
function gear(x, y, N, r, ang, o = {}) {
  const m = (2 * r) / N, rTip = r + m * 0.92, rRoot = r - m * 1.18;
  const spokes = o.spokes || 0, p = gearPath(N, rTip, rRoot, spokes, Math.max(m * 2.4, r * 0.24), Math.max(2.5, r * 0.045), !!o.saw);
  const mat = o.mat || BRASS, blur = o.blur || 0;
  const copies = Math.abs(blur) > 1e-4 ? Math.min(8, 1 + Math.ceil(Math.abs(blur) / ((TAU / N) * 0.3))) : 1;
  ctx.save(); ctx.translate(x, y);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  for (let i = 0; i < copies; i++) {
    const a = ang - (blur * i) / copies;
    ctx.save(); ctx.rotate(a);
    if (i === 0 && o.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = r * 0.18 + 6; ctx.shadowOffsetY = r * 0.05 + 4; }
    if (copies > 1) ctx.globalAlpha *= i === 0 ? 0.55 : 0.75 / copies;
    ctx.fillStyle = lit(rTip, a, mat); ctx.fill(p, 'evenodd');
    ctx.restore();
  }
  ctx.rotate(ang);
  ctx.lineWidth = Math.max(0.8, r * 0.012); ctx.strokeStyle = 'rgba(255,250,235,.32)'; ctx.stroke(p);
  if (o.glow > 0.01) {
    ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffc860'; ctx.shadowBlur = 24 + r * 0.1;
    ctx.strokeStyle = `rgba(255,196,96,${0.7 * o.glow})`; ctx.lineWidth = 2 + r * 0.012; ctx.stroke(p);
  }
  ctx.restore();
}
function jewel(x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = lit(r * 1.7, 0, BRASS); ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ff9fb0'); g.addColorStop(0.35, '#e0153f'); g.addColorStop(1, '#5a0016');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#16060a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU); ctx.fill();
  ctx.restore();
}
function screw(x, y, r, a = 0.6) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#9fc0ff'); g.addColorStop(0.5, '#2c4fae'); g.addColorStop(1, '#0c1840');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#060b1c'; ctx.fillRect(-r * 0.85, -r * 0.13, r * 1.7, r * 0.26);
  ctx.restore();
}

// club-tooth escape wheel, 15 teeth, turning towards +angle: a near-radial locking face in front (its tip leading
// slightly, for draw), the sloped impulse face of the club behind it
function escapePath(R) {
  const key = 'esc' + R; if (pathCache.has(key)) return pathCache.get(key);
  const p = new Path2D(), N = 15, P = TAU / N, rr = R * 0.72;
  for (let k = 0; k < N; k++) {
    const c = k * P;
    [[c - P * 0.6, rr], [c - P * 0.45, rr * 1.04], [c - P * 0.27, R * 0.9], [c - P * 0.24, R * 0.95], [c, R], [c - P * 0.04, rr]]
      .forEach(([a, r], i) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; (k === 0 && i === 0) ? p.moveTo(x, y) : p.lineTo(x, y); });
  }
  p.closePath();
  const ro = rr * 0.86, ri = R * 0.16;
  for (let k = 0; k < 5; k++) {
    const a0 = (k * TAU) / 5, a1 = ((k + 1) * TAU) / 5, ho = Math.asin(R * 0.05 / ro), hi = Math.asin(R * 0.05 / ri);
    p.moveTo(Math.cos(a0 + ho) * ro, Math.sin(a0 + ho) * ro); p.arc(0, 0, ro, a0 + ho, a1 - ho);
    p.lineTo(Math.cos(a1 - hi) * ri, Math.sin(a1 - hi) * ri); p.arc(0, 0, ri, a1 - hi, a0 + hi, true); p.closePath();
  }
  pathCache.set(key, p); return p;
}
function escapeWheel(x, y, R, ang, o = {}) {
  const p = escapePath(R), blur = o.blur || 0, copies = Math.abs(blur) > 0.01 ? Math.min(8, 1 + Math.ceil(Math.abs(blur) / 0.08)) : 1;
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < copies; i++) {
    const a = ang - (blur * i) / copies;
    ctx.save(); ctx.rotate(a);
    if (i === 0) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = R * 0.12; ctx.shadowOffsetY = R * 0.04; }
    if (copies > 1) ctx.globalAlpha *= i === 0 ? 0.55 : 0.75 / copies;
    ctx.fillStyle = lit(R, a, STEEL); ctx.fill(p, 'evenodd'); ctx.restore();
  }
  ctx.rotate(ang); ctx.lineWidth = Math.max(0.8, R * 0.008); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.stroke(p);
  if (o.glow > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffc860'; ctx.shadowBlur = 30; ctx.strokeStyle = `rgba(255,196,96,${0.45 * o.glow})`; ctx.lineWidth = 3; ctx.stroke(p); }
  ctx.restore();
}

// balance wheel: rim, three arms, timing screws
function balance(x, y, R, ang, o = {}) {
  const blur = o.blur || 0, copies = Math.abs(blur) > 0.02 ? Math.min(9, 1 + Math.ceil(Math.abs(blur) / 0.07)) : 1;
  for (let i = 0; i < copies; i++) {
    const a = ang - (blur * i) / copies;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    if (copies > 1) ctx.globalAlpha *= i === 0 ? 0.5 : 0.8 / copies;
    if (i === 0) { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = R * 0.15; ctx.shadowOffsetY = R * 0.05; }
    const p = new Path2D(); p.arc(0, 0, R, 0, TAU); p.moveTo(R * 0.88, 0); p.arc(0, 0, R * 0.88, 0, TAU, true);
    for (let k = 0; k < 3; k++) { const b = (k * TAU) / 3; p.moveTo(0, 0); p.rect(0, -R * 0.045, R * 0.9, R * 0.09); }
    ctx.fillStyle = lit(R, a, o.mat || BRASS); ctx.fill(p);
    for (let k = 1; k < 3; k++) { ctx.save(); ctx.rotate((k * TAU) / 3); ctx.fillRect(0, -R * 0.045, R * 0.9, R * 0.09); ctx.restore(); }
    ctx.shadowColor = 'transparent';
    for (let k = 0; k < 12; k++) {
      const b = (k * TAU) / 12 + 0.13, sx = Math.cos(b) * R * 1.02, sy = Math.sin(b) * R * 1.02;
      ctx.fillStyle = k % 3 === 0 ? '#2d52b4' : '#f2d394'; ctx.beginPath(); ctx.arc(sx, sy, R * 0.045, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.lineWidth = Math.max(0.8, R * 0.01); ctx.strokeStyle = 'rgba(255,250,230,.45)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  if (o.glow > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffc860'; ctx.shadowBlur = 40; ctx.strokeStyle = `rgba(255,200,100,${0.75 * o.glow})`; ctx.lineWidth = R * 0.03; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); }
  ctx.restore();
}
function hairspring(x, y, rIn, rOut, turns, beta, a0, lw) {
  ctx.save(); ctx.translate(x, y);
  const pts = [];
  for (let i = 0; i <= 700; i++) { const s = i / 700, r = lerp(rIn, rOut, s), a = a0 + s * turns * TAU + beta * (1 - s); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const line = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); };
  line(lw * 1.8, 'rgba(0,0,0,.55)'); line(lw, '#3f66c9'); line(lw * 0.35, 'rgba(200,220,255,.7)');
  ctx.restore();
}

// ------------------------------------------------------------------ textures (built once)
let PERLAGE, COTES, GRAIN, VIGNETTE;
function build() {
  // perlage: overlapping circular graining on the main plate
  const s = 600; PERLAGE = canvas(s, s); let g = PERLAGE.getContext('2d');
  g.fillStyle = '#25282d'; g.fillRect(0, 0, s, s);
  const st = 30;
  for (let y = -st; y < s + st; y += st * 0.82) for (let x = -st; x < s + st; x += st * 0.82) {
    const cx = x + rnd(x * 7 + y) * 6, cy = y + rnd(y * 3 + x) * 6, rg = g.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, st * 0.62);
    rg.addColorStop(0, '#3d4148'); rg.addColorStop(0.55, '#2b2e34'); rg.addColorStop(0.85, '#3a3e45'); rg.addColorStop(1, '#212428');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, st * 0.62, 0, TAU); g.fill();
  }
  // Côtes de Genève: soft parallel bands
  COTES = canvas(240, 240); g = COTES.getContext('2d');
  for (let i = 0; i < 4; i++) { const lg = g.createLinearGradient(i * 60, 0, i * 60 + 60, 0); lg.addColorStop(0, '#9aa3ad'); lg.addColorStop(0.45, '#e4e8ec'); lg.addColorStop(0.55, '#c2c9d0'); lg.addColorStop(1, '#8a939d'); g.fillStyle = lg; g.fillRect(i * 60, 0, 60, 240); }
  GRAIN = canvas(512, 512); g = GRAIN.getContext('2d'); const id = g.createImageData(512, 512);
  for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (rnd(i * 0.37) - 0.5) * 90; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  VIGNETTE = canvas(W, H); g = VIGNETTE.getContext('2d');
  const vg = g.createRadialGradient(W / 2, H * 0.47, W * 0.35, W / 2, H / 2, H * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.78)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  BUF = [canvas(W, H), canvas(W, H)];
  initMechanics();
}

// ------------------------------------------------------------------ camera and text
function cam(x, y, z, r = 0) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(W / 2, H / 2); ctx.rotate(r); ctx.scale(z, z); ctx.translate(-x, -y); CAM = { x, y, z, r }; }
let CAM = { x: 0, y: 0, z: 1, r: 0 };
function toScreen(px, py) { const dx = (px - CAM.x) * CAM.z, dy = (py - CAM.y) * CAM.z, c = Math.cos(CAM.r), s = Math.sin(CAM.r); return [W / 2 + dx * c - dy * s, H / 2 + dx * s + dy * c]; }
function screen() { ctx.setTransform(1, 0, 0, 1, 0, 0); }
function backdrop(tone = '#121418') {
  screen(); ctx.fillStyle = '#060708'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, H * 0.65); g.addColorStop(0, tone); g.addColorStop(1, '#040405');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function plate(x, y, R, o = {}) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
  ctx.fillStyle = ctx.createPattern(PERLAGE, 'repeat'); ctx.fillRect(x - R, y - R, R * 2, R * 2);
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.1, x, y, R); g.addColorStop(0, 'rgba(255,240,210,.10)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
  ctx.restore();
}
function text(str, x, y, { font = 'Inter Tight', weight = 800, size = 40, color = '#f3efe6', align = 'left', ls = 0, alpha = 1, shadow = true } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px "${font}"`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = ls + 'px'; ctx.fillStyle = color;
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 24; }
  ctx.fillText(str, x, y); ctx.restore();
}
// chapter card, top-left: number, title wiping in, gold rule, one line of explanation
function chapter(lt, dur, num, title, sub, sub2) {
  if (window.COVER) return; screen();
  const a = clamp(lt / 0.3) * clamp((dur - lt) / 0.3); if (a <= 0) return;
  const x = 84, y = 238, wipe = E.out(clamp((lt - 0.05) / 0.5));
  ctx.save(); ctx.globalAlpha = a;
  const sg = ctx.createLinearGradient(0, 0, 0, 560); sg.addColorStop(0, 'rgba(3,4,5,.9)'); sg.addColorStop(0.62, 'rgba(3,4,5,.6)'); sg.addColorStop(1, 'rgba(3,4,5,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, 560);
  text(num + ' / 06', x, y - 74, { font: 'JetBrains Mono', weight: 500, size: 28, color: GOLD, ls: 6 });
  ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y - 90, (W - x) * wipe + 10, 120); ctx.clip();
  text(title, x, y, { weight: 900, size: 76, ls: 7 }); ctx.restore();
  ctx.fillStyle = GOLD; ctx.fillRect(x, y + 30, 120 * E.out(clamp((lt - 0.25) / 0.4)), 4);
  const sa = clamp((lt - 0.35) / 0.35);
  text(sub, x, y + 100 + (1 - sa) * 14, { font: 'Fraunces', weight: 700, size: 44, color: '#ece5d4', alpha: sa });
  if (sub2) text(sub2, x, y + 156 + (1 - sa) * 14, { font: 'Fraunces', weight: 700, size: 44, color: '#ece5d4', alpha: sa });
  ctx.restore();
}
function tag(str, x, y, a, color = GOLD, align = 'left') {
  if (a <= 0 || window.COVER) return; screen();
  ctx.save(); ctx.globalAlpha = a; ctx.font = '500 26px "JetBrains Mono"'; ctx.letterSpacing = '4px';
  const w = ctx.measureText(str).width + 30, x0 = align === 'right' ? x - w : x;
  ctx.fillStyle = 'rgba(8,9,11,.72)'; ctx.fillRect(x0, y - 30, w, 44); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y - 30, w, 44);
  ctx.fillStyle = color; ctx.fillText(str, x0 + 15, y + 1); ctx.restore();
}
// a thin callout from a point on a part to its label
function callout(px, py, side, label, sub, a) {
  if (a <= 0) return;
  const [sx, sy] = toScreen(px, py); screen();
  ctx.font = '800 34px "Inter Tight"'; ctx.letterSpacing = '4px';
  const tw = ctx.measureText(label).width + 12, room = { l: sx - 36, r: W - sx - 36 };
  if (room[side] < 70 + 40 + tw) side = room.l > room.r ? 'l' : 'r';           // the side with room
  const leg = clamp(room[side] - 70 - tw, 24, 150);                             // shorter line when tight
  const dir = side === 'l' ? -1 : 1, ex = sx + dir * 70, ey = sy - 70, lx = ex + dir * leg * E.out(clamp(a * 1.4));
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(lx, ey); ctx.stroke();
  ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(233,194,122,.5)'; ctx.beginPath(); ctx.arc(sx, sy, 15 + 6 * Math.sin(a * 6), 0, TAU); ctx.stroke();
  const al = side === 'l' ? 'right' : 'left', tx = lx + dir * 12;
  text(label, tx, ey - 12, { weight: 800, size: 34, ls: 4, align: al });
  if (sub) text(sub, tx, ey + 28, { font: 'JetBrains Mono', weight: 500, size: 25, color: GOLD, align: al, ls: 1 });
  ctx.restore();
}
// glowing energy along a polyline; flowing dashes show the direction; u limits how far it has reached (0..1)
function energy(pts, t, { u = 1, a = 1, width = 6, speed = 160 } = {}) {
  if (a <= 0 || u <= 0) return;
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
  const reach = L * clamp(u);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const path = new Path2D(); let acc = 0; path.moveTo(...pts[0]);
  for (let i = 1; i < pts.length && acc < reach; i++) {
    const d = seg[i - 1], f = Math.min(1, (reach - acc) / d);
    path.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)); acc += d;
  }
  ctx.shadowColor = '#ffb84a'; ctx.shadowBlur = 30;
  ctx.strokeStyle = `rgba(255,170,60,${0.28 * a})`; ctx.lineWidth = width * 2.6; ctx.stroke(path);
  ctx.setLineDash([width * 2.5, width * 3.5]); ctx.lineDashOffset = -t * speed;
  ctx.strokeStyle = `rgba(255,226,160,${0.95 * a})`; ctx.lineWidth = width; ctx.stroke(path);
  ctx.restore();
}
function sparks(cx, cy, r0, r1, a0, spread, t, n, a, seed = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const u = mod(t * (0.55 + rnd(i + seed) * 0.5) + rnd(i * 3 + seed), 1), ang = a0 + (rnd(i * 7 + seed) - 0.5) * spread;
    const r = lerp(r0, r1, E.in(u)), x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r, s = 2 + rnd(i * 11) * 4;
    const al = Math.sin(Math.PI * u) * a;
    ctx.fillStyle = `rgba(255,214,140,${al})`; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ mechanics
// meshing: arbor i's wheel drives arbor i+1's pinion. Each pair shares a module, so their teeth stay interleaved.
// phase for wheel B (NB teeth) so its gaps meet the teeth of A (NA teeth, at angle phaseA) along the line of centres
function meshPhase(A, B, NA, phaseA, NB) {
  const phi = Math.atan2(B.y - A.y, B.x - A.x), fA = mod((phi - phaseA) / (TAU / NA), 1);
  return phi + Math.PI - (TAU / NB) * (0.5 - fA);
}
function chainOf(arbors) {
  arbors[0].g = 1; arbors[0].phase = arbors[0].phase || 0;
  for (let i = 1; i < arbors.length; i++) {
    const A = arbors[i - 1], B = arbors[i], NA = A.wheel.N, NB = B.pinion.N;
    B.g = -A.g * (NA / NB);
    const phi = Math.atan2(B.y - A.y, B.x - A.x), pA = TAU / NA, pB = TAU / NB;
    const fA = mod((phi - A.phase) / pA, 1);
    B.phase = phi + Math.PI - pB * (0.5 - fA);
  }
  return arbors;
}
let TRAIN, REV, ESC;
const T_ESC = 18.0, T_FIN = 26.5;
let ESC_PHASE = -0.038; // escape wheel phase: at rest, a tooth's locking face meets the locked pallet (worked out from the geometry)
function initMechanics() {
  // going train in the overview (caliber seen from the back, centre wheel at the centre); module 5 throughout
  TRAIN = chainOf([
    { id: 'barrel', x: -120.2, y: -120.2, wheel: { N: 60, r: 150 }, pinion: null },
    { id: 'centre', x: 0, y: 0, pinion: { N: 8, r: 20 }, wheel: { N: 52, r: 130 } },
    { id: 'third', x: 138.6, y: 50.4, pinion: { N: 7, r: 17.5 }, wheel: { N: 44, r: 110 } },
    { id: 'fourth', x: 116.5, y: 176, pinion: { N: 7, r: 17.5 }, wheel: { N: 40, r: 100 } },
    { id: 'escape', x: 216, y: 233.5, pinion: { N: 6, r: 15 }, wheel: null },
  ]);
  // reverser: rotor wheel -> reverser (both directions in, one out) -> reduction -> ratchet; module 6
  REV = { I: { x: -60, y: -560, N: 24, r: 72 }, A: { x: 1.6, y: -390.9, N: 36, r: 108, pN: 8, pr: 24 }, O: { x: 131.3, y: -343.7, N: 38, r: 114, pN: 8, pr: 24 }, R: { x: 57.8, y: -186, N: 50, r: 150 } };
  const revRate = (t) => 3.2 * Math.sin((TAU * (t - 6.0)) / 1.5);            // the rotor wheel swings both ways
  REV.angI = integral(revRate);
  REV.angAout = integral((t) => Math.abs(revRate(t)) * (72 / 108));          // the reverser's output only ever turns one way
  REV.rate = revRate;
  // escapement: balance frequency 0.5 Hz (slowed 8x) until 23 s, then up to the real 4 Hz
  const f = (t) => (t < 23.0 ? 0.5 : lerp(0.5, 4, E.inOut(clamp((t - 23.0) / 1.8))));
  ESC = { f, phase: integral((t) => TAU * f(t), 0), A: 230 * D2R, bw: 32 * D2R, step: 12 * D2R, rRoll: 80, L: 510 };
  ESC.phi = (t) => Math.PI / 2 + ESC.phase(t) - ESC.phase(T_ESC);           // starts with the balance at full swing
}
// balance angle, fork angle and escape wheel angle at t (escapement set; the finale reuses it at real speed)
function escState(phi) {
  const { A, bw, step, rRoll, L } = ESC, beta = A * Math.sin(phi);
  const alpha = (-rRoll / L) * clamp(beta, -bw, bw);                         // the fork follows the impulse jewel
  const w = Math.asin(bw / A), done = Math.floor((phi - w) / Math.PI), p = clamp((phi - ((done + 1) * Math.PI - w)) / (2 * w));
  const drop = p < 0.18 ? -0.12 * Math.sin((p / 0.18) * Math.PI) : E.out((p - 0.18) / 0.82);   // slight recoil on unlock, then impulse and drop
  return { beta, alpha, esc: step * (done + drop), p, inPulse: p > 0 && p < 1, beat: done };
}

// ------------------------------------------------------------------ the watch from the back (shots 1-2)
function caseback(psi, rho, lt, sweep) {
  ctx.save(); ctx.rotate(psi);
  // lugs and case
  ctx.fillStyle = lit(560, psi, STEEL);
  [[-1], [1]].forEach(([s]) => { ctx.beginPath(); ctx.roundRect(-250, s > 0 ? 380 : -620, 500, 240, 40); ctx.fill(); });
  ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  ctx.fillStyle = lit(540, psi, STEEL); ctx.beginPath(); ctx.arc(0, 0, 540, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = lit(500, psi + 1.2, DARK); ctx.beginPath(); ctx.arc(0, 0, 500, 0, TAU); ctx.fill();
  for (let k = 0; k < 6; k++) { ctx.save(); ctx.rotate((k * TAU) / 6); ctx.fillStyle = '#1b1e22'; ctx.fillRect(468, -14, 40, 28); ctx.restore(); }
  ctx.fillStyle = lit(470, psi, STEEL); ctx.beginPath(); ctx.arc(0, 0, 470, 0, TAU); ctx.fill();
  // movement under the sapphire
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 430, 0, TAU); ctx.clip();
  plate(0, 0, 430);
  ctx.save(); ctx.globalAlpha = 0.9;               // bridges with Côtes de Genève
  const bridges = [[[-380, -160], [-60, -330], [120, -250], [-40, -60], [-330, 60]], [[60, 80], [380, -60], [400, 160], [180, 330], [20, 260]]];
  bridges.forEach((pts) => {
    const pth = new Path2D(); pts.forEach(([x, y], i) => (i ? pth.lineTo(x, y) : pth.moveTo(x, y))); pth.closePath();
    ctx.save(); ctx.clip(pth); ctx.rotate(0.6); ctx.fillStyle = ctx.createPattern(COTES, 'repeat'); ctx.fillRect(-600, -600, 1200, 1200); ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.stroke(pth); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(pth);
  });
  ctx.restore();
  [[-300, -120], [-120, -250], [320, 40], [150, 280], [-250, 40]].forEach(([x, y], i) => screw(x, y, 13, i));
  [[-200, -180], [260, 120], [90, 200]].forEach(([x, y]) => jewel(x, y, 10));
  const b = 230 * D2R * Math.sin(TAU * 4 * (lt + 0.13));                     // the balance, beating at 4 Hz
  balance(250, -160, 78, b, { blur: 230 * D2R * TAU * 4 * Math.cos(TAU * 4 * (lt + 0.13)) / 60 });
  jewel(250, -160, 9);
  // rotor
  ctx.save(); ctx.rotate(rho - psi);
  ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  const rp = new Path2D(); rp.moveTo(0, 0); rp.arc(0, 0, 425, -Math.PI / 2, Math.PI / 2); rp.closePath();
  ctx.fillStyle = '#888'; ctx.fill(rp); ctx.shadowColor = 'transparent';
  ctx.save(); ctx.clip(rp); ctx.rotate(-0.4); ctx.fillStyle = ctx.createPattern(COTES, 'repeat'); ctx.fillRect(-500, -500, 1000, 1000); ctx.restore();
  ctx.save(); ctx.lineWidth = 62; ctx.strokeStyle = lit(400, rho, BRASS); ctx.beginPath(); ctx.arc(0, 0, 394, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03); ctx.stroke(); ctx.restore();
  ctx.fillStyle = 'rgba(10,11,13,.85)';
  [[-0.9, -0.15], [0.15, 0.9]].forEach(([a0, a1]) => { ctx.beginPath(); ctx.arc(0, 0, 330, a0, a1); ctx.arc(0, 0, 150, a1, a0, true); ctx.closePath(); ctx.fill(); });
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke(rp);
  ctx.save(); ctx.rotate(0); ctx.font = '800 26px "Inter Tight"'; ctx.letterSpacing = '9px'; ctx.fillStyle = 'rgba(40,30,10,.85)'; ctx.textAlign = 'center';
  ctx.translate(394, 0); ctx.rotate(Math.PI / 2); ctx.fillText('AUTOMATIC', 0, 9); ctx.restore();
  ctx.restore();
  // bearing
  ctx.fillStyle = lit(60, rho, STEEL); ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fill();
  for (let k = 0; k < 12; k++) { const a = (k * TAU) / 12 + (rho - psi) * 0.5; const g = ctx.createRadialGradient(Math.cos(a) * 44 - 3, Math.sin(a) * 44 - 3, 1, Math.cos(a) * 44, Math.sin(a) * 44, 8); g.addColorStop(0, '#fff'); g.addColorStop(1, '#4a525c'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Math.cos(a) * 44, Math.sin(a) * 44, 8, 0, TAU); ctx.fill(); }
  screw(0, 0, 22, rho - psi);
  ctx.restore();
  // sapphire reflection sweeping across
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 430, 0, TAU); ctx.clip(); ctx.rotate(-0.7 - psi);
  const sx = lerp(-700, 700, sweep), g = ctx.createLinearGradient(sx - 160, 0, sx + 160, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,248,230,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(-700, -700, 1400, 1400); ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ shots
function sHook(lt, D) {
  backdrop('#1a1c21');
  const z = kf([[0, 2.3], [2.8, 0.9]], lt), cx = kf([[0, 150], [2.8, 0]], lt), cy = kf([[0, 260], [2.8, 150]], lt);
  cam(cx, cy, z, kf([[0, 0.12], [2.8, 0]], lt));
  const psi = kf([[0, -0.38], [1.25, 0.32], [2.25, -0.2], [3.0, 0.04]], lt);
  const rho = Math.PI / 2 + kf([[0, 0.15], [0.8, -0.55], [1.7, 0.48], [2.6, -0.3], [3.0, 0]], lt);
  caseback(psi, rho, lt, clamp(lt / 1.8));
  screen();
  const l1 = win(lt, 0.3, 1.38, 0.2, 0.15), l2 = win(lt, 1.5, D + 0.2, 0.2, 0.2);
  ctx.fillStyle = GOLD; ctx.globalAlpha = Math.max(l1, l2); ctx.fillRect(W / 2 - 40, 1500, 80, 3); ctx.globalAlpha = 1;
  text('No battery.', W / 2, 1610 - 16 * (1 - l1), { font: 'Fraunces', weight: 700, size: 108, align: 'center', alpha: l1 });
  text('Just motion.', W / 2, 1610 - 16 * (1 - l2), { font: 'Fraunces', weight: 700, size: 108, align: 'center', alpha: l2 });
}
function sRotor(lt, D) {
  backdrop('#1a1c21');
  cam(kf([[0, 0], [3, 40]], lt), kf([[0, 150], [3, 60]], lt), kf([[0, 0.9], [3, 1.28]], lt), kf([[0, 0], [3, -0.05]], lt));
  const psi = kf([[0, 0.04], [3, 0]], lt), sw = kf([[0, 0], [0.8, 1.25], [1.75, -1.05], [2.6, 0.85], [3.0, 0.4]], lt), rho = Math.PI / 2 + sw;
  caseback(psi, rho, lt + 3, 1);
  // energy gathered by the swinging weight runs to its pivot
  ctx.save(); ctx.rotate(psi);
  const rl = rho - psi;
  sparks(0, 0, 400, 40, rl, 2.4, lt, 70, clamp(lt / 0.4), 3);
  energy([[Math.cos(rl) * 390, Math.sin(rl) * 390], [Math.cos(rl) * 200, Math.sin(rl) * 200], [0, 0]], lt, { u: clamp((lt - 0.2) / 0.6), a: 0.9, width: 7 });
  ctx.restore();
  callout(0, 0, 'l', 'OSCILLATING WEIGHT', 'turns on a ball bearing', win(lt, 1.0, D, 0.3, 0.25));
  chapter(lt, D, '01', 'ROTOR', 'Every move of your wrist', 'swings the rotor.');
}
function sReverser(lt, D) {
  const t = lt + 6.0;
  backdrop('#16181c');
  cam(kf([[0, 20], [3, 60]], lt), kf([[0, -420], [3, -300]], lt), kf([[0, 1.75], [3, 1.5]], lt), kf([[0, -0.05], [3, 0.04]], lt));
  plate(40, -330, 1200);
  const { I, A, O, R } = REV, aI = REV.angI(t), aAo = REV.angAout(t);
  const phA = meshPhase(I, A, I.N, 0, A.N), phO = meshPhase(A, O, A.pN, 0, O.N), phR = meshPhase(O, R, O.pN, phO, R.N);
  const aA = phA - (aI * I.N) / A.N, aO = phO - (aAo * A.pN) / O.N, aR = phR - ((aO - phO) * O.pN) / R.N;
  const dir = Math.sign(REV.rate(t)) || 1, vI = Math.abs(REV.rate(t));
  gear(R.x, R.y, R.N, R.r, aR, { saw: true, mat: STEEL, spokes: 0 });
  screw(R.x, R.y, 30, aR);
  gear(O.x, O.y, O.pN, O.pr, aO, { mat: STEEL });
  gear(O.x, O.y, O.N, O.r, aO, { spokes: 4, glow: 0.5 });
  gear(A.x, A.y, A.N, A.r, aA, { spokes: 5 });
  // reverser clicks: the engaged pawl lights up, so either direction drives the output one way
  ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(aAo);
  for (let k = 0; k < 2; k++) {
    ctx.save(); ctx.rotate(k * Math.PI); const on = (k === 0) === dir > 0;
    ctx.fillStyle = on ? '#ffd27a' : '#6d747e'; ctx.shadowColor = on ? '#ffb040' : 'transparent'; ctx.shadowBlur = on ? 22 : 0;
    ctx.beginPath(); ctx.moveTo(18, -6); ctx.lineTo(58, -18 + (on ? 6 : 0)); ctx.lineTo(60, -6); ctx.lineTo(22, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  gear(A.x, A.y, A.pN, A.pr, aAo, { mat: STEEL });
  gear(I.x, I.y, I.N, I.r, aI, { mat: STEEL, spokes: 3 });
  [[I.x, I.y], [A.x, A.y], [O.x, O.y]].forEach(([x, y]) => jewel(x, y, 9));
  // direction arrows: the rotor's flips, the output's never does
  const arrow = (x, y, r, d, col, a) => {
    if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
    const a0 = -2.4, a1 = -0.9, sgn = d > 0 ? 1 : -1;
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
    const ae = sgn > 0 ? a1 : a0, tx = Math.cos(ae) * r, ty = Math.sin(ae) * r, tg = ae + (sgn * Math.PI) / 2;
    ctx.beginPath(); ctx.moveTo(tx + Math.cos(tg) * 22, ty + Math.sin(tg) * 22); ctx.lineTo(tx + Math.cos(tg + 2.4) * 18, ty + Math.sin(tg + 2.4) * 18); ctx.lineTo(tx + Math.cos(tg - 2.4) * 18, ty + Math.sin(tg - 2.4) * 18); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  arrow(I.x, I.y, I.r + 34, dir, '#ffffff', clamp(vI / 1.2));
  arrow(O.x, O.y, O.r + 34, -1, GOLD, 1);
  energy([[I.x, I.y], [A.x, A.y], [O.x, O.y], [R.x, R.y]], t, { u: clamp((lt - 0.1) / 1.0), a: 0.85, width: 7 });
  callout(I.x - 40, I.y, 'l', 'FROM THE ROTOR', 'turns both ways', win(lt, 0.5, D, 0.3, 0.3));
  callout(R.x - 120, R.y + 40, 'l', 'TO THE MAINSPRING', 'always one way', win(lt, 1.3, D, 0.3, 0.3));
  chapter(lt, D, '02', 'REVERSER', 'Either direction', 'winds the mainspring.');
}
function sSpring(lt, D) {
  backdrop('#15171b');
  cam(0, kf([[0, -240], [4, -150]], lt), kf([[0, 1.35], [4, 1.0]], lt), kf([[0, 0.05], [4, -0.02]], lt));
  const C = [0, -170], Rd = 300;
  const Tn = kf([[0, 0.05], [2.7, 0.95, 'inOut'], [4, 0.86, 'sine']], lt);                     // tension
  const aArb = kf([[0, 0], [2.7, TAU * 1.15, 'out'], [4, TAU * 1.15]], lt), aDrum = kf([[0, 0], [2.6, 0], [4, 0.32, 'in']], lt);
  // drum: toothed barrel, lid removed
  gear(C[0], C[1], 120, Rd, aDrum, { glow: clamp((lt - 2.6) / 0.8) });
  ctx.save(); ctx.translate(...C); ctx.fillStyle = '#0d0f12'; ctx.beginPath(); ctx.arc(0, 0, Rd - 26, 0, TAU); ctx.fill();
  const ig = ctx.createRadialGradient(0, 0, 40, 0, 0, Rd - 26); ig.addColorStop(0, 'rgba(255,200,120,.05)'); ig.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = ig; ctx.fill();
  // the mainspring: wound coils pack around the arbor, released coils lie against the drum wall
  const n = 7, pts = [];
  for (let i = 0; i <= 1400; i++) {
    const s = i / 1400, rw = 54 + 112 * s, ru = 150 + 118 * s, r = lerp(ru, rw, Tn);
    const a = aArb * (1 - s) + aDrum * s + s * n * TAU; pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const line = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
  line(15, '#040506'); line(11, lit(260, 0, STEEL)); line(2.4, 'rgba(255,255,255,.75)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 30; line(6, `rgba(255,190,90,${0.5 * Tn * Tn})`); ctx.restore();
  ctx.restore();
  gear(C[0], C[1], 9, 42, aArb, { mat: STEEL });
  screw(C[0], C[1], 20, aArb);
  // power reserve gauge
  screen(); const [gx, gy] = toScreen(...C), gr = (Rd + 70) * CAM.z, g0 = 0.75 * Math.PI, g1 = 2.25 * Math.PI;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(gx, gy, gr, g0, g1); ctx.stroke();
  ctx.strokeStyle = GOLD; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 24; ctx.beginPath(); ctx.arc(gx, gy, gr, g0, lerp(g0, g1, Tn)); ctx.stroke(); ctx.restore();
  text('POWER RESERVE', gx, gy + gr * 0.82, { font: 'JetBrains Mono', weight: 500, size: 28, color: GOLD, align: 'center', ls: 6 });
  text(Math.round(Tn * 100) + '%', gx, gy + gr * 0.82 + 66, { weight: 900, size: 64, align: 'center', ls: 2 });
  const relA = win(lt, 2.7, D + 0.2, 0.3, 0.2);
  tag('UNWINDING → DRIVES THE GEARS', W / 2 + 230, 1795, relA, GOLD, 'right');
  chapter(lt, D, '03', 'MAINSPRING', 'Energy, stored in a coil', 'of tempered steel.');
}
function trainAngles(PHI) { const o = {}; TRAIN.forEach((a) => (o[a.id] = a.phase + a.g * PHI)); return o; }
function drawTrain(ang, rate, glow, o = {}) {
  const [b, c, th, f, e] = TRAIN, pf = 1 / 30;
  plate(40, 40, 520);
  [[-330, 120], [300, -260], [-80, 380], [380, 330], [-260, -360]].forEach(([x, y], i) => screw(x, y, 15, i * 1.7));
  gear(b.x, b.y, 60, 150, ang.barrel, { spokes: 0, glow: glow.barrel, blur: rate * b.g * pf });
  ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = lit(110, ang.barrel, DARK); ctx.beginPath(); ctx.arc(0, 0, 112, 0, TAU); ctx.fill(); ctx.restore();
  gear(b.x, b.y, 40, 100, ang.barrel * 0.4, { saw: true, mat: STEEL, alpha: 0.9 });
  screw(b.x, b.y, 24, ang.barrel * 0.4);
  gear(c.x, c.y, 8, 20, ang.centre, { mat: STEEL });
  gear(c.x, c.y, 52, 130, ang.centre, { spokes: 4, glow: glow.centre, blur: rate * c.g * pf });
  gear(th.x, th.y, 7, 17.5, ang.third, { mat: STEEL });
  gear(th.x, th.y, 44, 110, ang.third, { spokes: 4, glow: glow.third, blur: rate * th.g * pf });
  gear(f.x, f.y, 7, 17.5, ang.fourth, { mat: STEEL });
  gear(f.x, f.y, 40, 100, ang.fourth, { spokes: 4, glow: glow.fourth, blur: rate * f.g * pf });
  gear(e.x, e.y, 6, 15, ang.escape, { mat: STEEL });
  escapeWheel(e.x, e.y, 75, ang.escape, { glow: glow.escape, blur: o.escBlur != null ? o.escBlur : rate * e.g * pf });
  [c, th, f, e].forEach((a) => jewel(a.x, a.y, 7));
}
const TRAIN_PATH = () => { const [b, c, th, f, e] = TRAIN; const mid = (A, B, rA) => { const d = Math.hypot(B.x - A.x, B.y - A.y); return [A.x + ((B.x - A.x) * rA) / d, A.y + ((B.y - A.y) * rA) / d]; };
  return [[b.x, b.y], mid(b, c, 150), [c.x, c.y], mid(c, th, 130), [th.x, th.y], mid(th, f, 110), [f.x, f.y], mid(f, e, 100), [e.x, e.y]]; };
function sTrain(lt, D) {
  backdrop('#15171b');
  const [b, c, th, f, e] = TRAIN;
  const way = [[0, b.x, b.y], [1.0, (b.x + c.x) / 2, (b.y + c.y) / 2], [1.8, c.x, c.y], [2.8, th.x, th.y], [3.8, f.x, f.y], [4.8, e.x + 10, e.y - 10]];
  const cx = kf(way.map(([t, x]) => [t, x]), lt), cy = kf(way.map(([t, , y]) => [t, y]), lt);
  cam(cx, cy, kf([[0, 1.75], [2.4, 1.45], [5, 1.7]], lt), kf([[0, -0.08], [5, 0.1]], lt));
  // time-lapse that eases down the train, so whichever wheel is in frame is seen turning; meshing stays exact
  const k = 0.32 * Math.exp(-1.15 * lt), PHI = (0.32 / 1.15) * (1 - Math.exp(-1.15 * lt));
  const g = (id, a) => clamp((lt - a) / 0.5) * 0.9;
  drawTrain(trainAngles(PHI), k, { barrel: g('b', 0), centre: g('c', 1.0), third: g('t', 2.0), fourth: g('f', 3.0), escape: g('e', 4.0) });
  energy(TRAIN_PATH(), lt + 13, { u: clamp(lt / 4.4), a: 0.9, width: 5 });
  callout(b.x, b.y - 150, 'r', 'BARREL', 'unwinds slowly', win(lt, 0.15, 1.3, 0.25, 0.25));
  callout(c.x, c.y - 95, 'r', 'CENTRE WHEEL', '1 turn per hour', win(lt, 1.35, 2.5, 0.25, 0.25));
  callout(th.x, th.y - 80, 'r', 'THIRD WHEEL', 'faster again', win(lt, 2.45, 3.35, 0.25, 0.25));
  callout(f.x, f.y + 70, 'l', 'FOURTH WHEEL', '1 turn per minute', win(lt, 3.35, 4.35, 0.25, 0.25));
  callout(e.x, e.y - 60, 'r', 'ESCAPE WHEEL', '', win(lt, 4.3, D + 0.3, 0.25, 0.3));
  tag('TIME-LAPSE', W - 84, 1795, win(lt, 0.3, 3.4, 0.3, 0.5), '#cfd6dd', 'right');
  chapter(lt, D, '04', 'GEAR TRAIN', 'Each wheel turns', 'faster than the last.');
}
// escapement macro: escape wheel at the bottom, pallet fork in the middle, balance on top (vertical frame)
const EX = [0, 380], EP = [0, 70], EB = [0, -520], ER = 230;
// each pallet: its seat in the fork and its tip, 30 degrees either side of the line of centres (2.5 teeth apart, so
// when one rests on a tooth the other is in a gap). Tips on the tooth circle at mid-swing; at the fork's 5 degree
// banking one tip is 13 px inside the teeth (the lock) and the other 13 px clear
const PALLETS = [-1, 1].map((sd) => { const a = -Math.PI / 2 + sd * 30 * D2R, d = [Math.cos(a), Math.sin(a)];
  return [[EX[0] + 300 * d[0] - EP[0], EX[1] + 300 * d[1] - EP[1]], [EX[0] + ER * d[0] - EP[0], EX[1] + ER * d[1] - EP[1]]]; });
function drawEscapement(t, s, lt, glowK = 1) {
  // background: blurred wheels for depth
  ctx.save(); ctx.filter = 'blur(10px)'; ctx.globalAlpha = 0.6;
  gear(-430, 720, 44, 300, t * 0.05, { spokes: 4, shadow: false }); gear(470, -60, 40, 220, -t * 0.12, { spokes: 4, shadow: false }); ctx.restore();
  plate(0, 0, 1500);
  [[-330, 240], [330, 520], [-300, -760], [320, -330]].forEach(([x, y], i) => screw(x, y, 18, i));
  const imp = s.inPulse ? Math.sin(Math.PI * s.p) : 0;
  escapeWheel(EX[0], EX[1], ER, s.esc + ESC_PHASE, { glow: imp * glowK, blur: 0 });
  gear(EX[0], EX[1], 6, 46, s.esc + ESC_PHASE, { mat: STEEL });
  jewel(EX[0], EX[1], 14);
  // pallet fork: anchor body, two ruby pallets on the wheel's teeth, lever up to the fork that meets the impulse jewel
  ctx.save(); ctx.translate(...EP); ctx.rotate(s.alpha);
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
  const fork = new Path2D();
  fork.moveTo(-18, -8); fork.lineTo(-14, -470); fork.lineTo(-44, -500); fork.lineTo(-30, -520); fork.lineTo(-8, -488); fork.lineTo(8, -488); fork.lineTo(30, -520); fork.lineTo(44, -500); fork.lineTo(14, -470); fork.lineTo(18, -8);
  fork.lineTo(160, 22); fork.lineTo(172, 66); fork.lineTo(126, 80); fork.lineTo(14, 52); fork.lineTo(-14, 52); fork.lineTo(-126, 80); fork.lineTo(-172, 66); fork.lineTo(-160, 22); fork.closePath();
  ctx.fillStyle = lit(300, s.alpha, STEEL); ctx.fill(fork); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(fork);
  const ruby = (x0, y0, x1, y1) => { const L = Math.hypot(x1 - x0, y1 - y0); ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2);
    const g = ctx.createLinearGradient(-14, 0, 14, 0); g.addColorStop(0, '#5a0016'); g.addColorStop(0.5, '#ff4f70'); g.addColorStop(1, '#7a0020'); ctx.fillStyle = g; ctx.fillRect(-13, -6, 26, L + 6); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-4, 0, 3, L - 8);
    if (imp > 0.05) { ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 30; ctx.fillStyle = `rgba(255,190,90,${0.6 * imp * glowK})`; ctx.fillRect(-13, L * 0.55, 26, L * 0.45); } ctx.restore(); };
  PALLETS.forEach(([o, tip]) => ruby(o[0], o[1], tip[0], tip[1]));
  ctx.fillStyle = '#e0153f'; ctx.beginPath(); ctx.arc(0, 0, 0, 0, TAU); ctx.fill();
  if (imp > 0.02) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 30; ctx.strokeStyle = `rgba(255,210,130,${0.9 * imp * glowK})`; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.setLineDash([24, 26]); ctx.lineDashOffset = -lt * 400; ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -470); ctx.stroke(); ctx.restore(); }
  ctx.restore();
  jewel(EP[0], EP[1], 12);
  // banking pins
  [[-62, -380], [62, -380]].forEach(([x, y]) => { ctx.fillStyle = lit(12, 0, BRASS); ctx.beginPath(); ctx.arc(EP[0] + x, EP[1] + y, 12, 0, TAU); ctx.fill(); });
  // balance, roller with impulse jewel, hairspring
  const db = ESC.A * Math.cos(ESC.phi(t)) * TAU * ESC.f(t) / 30;
  balance(EB[0], EB[1], 255, s.beta, { blur: db * 0.9, glow: Math.max(0, 1 - mod(ESC.phi(t), Math.PI) / 1.4) * 0.8 * glowK });
  hairspring(EB[0], EB[1], 34, 175, 10, s.beta, -1.2, 3.2);
  ctx.save(); ctx.translate(...EB); ctx.rotate(s.beta);
  ctx.fillStyle = lit(86, s.beta, STEEL); ctx.beginPath(); ctx.arc(0, 0, 86, 0, TAU); ctx.fill();
  const g = ctx.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, '#5a0016'); g.addColorStop(0.5, '#ff5577'); g.addColorStop(1, '#7a0020'); ctx.fillStyle = g; ctx.fillRect(-9, ESC.rRoll - 14, 18, 28);
  ctx.restore();
  jewel(EB[0], EB[1], 15);
  // stud holding the hairspring's outer end
  ctx.fillStyle = lit(30, 0, STEEL); ctx.fillRect(EB[0] + Math.cos(-1.2) * 178 - 16, EB[1] + Math.sin(-1.2) * 178 - 16, 32, 32);
}
function sEscape(lt, D) {
  const t = lt + T_ESC;
  backdrop('#14161a');
  const cx = kf([[0, -20], [4.3, 0]], lt), cy = kf([[0, 250], [4.3, 60], [5.6, -440], [8.5, -330]], lt), z = kf([[0, 2.25], [4.3, 1.35], [5.6, 1.3], [8.5, 1.0]], lt);
  cam(cx, cy, z, kf([[0, 0.06], [4.3, -0.03], [8.5, 0.02]], lt));
  const s = escState(ESC.phi(t));
  drawEscapement(t, s, lt);
  // the beat, named as it happens (slow motion only)
  if (lt < 4.9 && s.inPulse) {
    const word = s.p < 0.3 ? 'UNLOCK' : s.p < 0.82 ? 'IMPULSE' : 'LOCK';
    const [px, py] = toScreen(150, EP[1] + 150);
    tag(word, px + 30, py, clamp((4.9 - lt) / 0.3));
  } else if (lt < 4.9) {
    const [px, py] = toScreen(150, EP[1] + 150); tag('LOCK', px + 30, py, 0.65 * clamp((4.9 - lt) / 0.3));
  }
  tag('SLOWED 8×', W - 84, 1795, win(lt, 0.3, 5.0, 0.3, 0.3), '#cfd6dd', 'right');
  tag('REAL TIME · 4 Hz', W - 84, 1795, win(lt, 6.9, D + 0.3, 0.3, 0.2), GOLD, 'right');
  chapter(lt, 4.9, '05', 'ESCAPEMENT', 'Releases the energy', 'in tiny, equal steps.');
  chapter(lt - 4.9, D - 4.9, '06', 'BALANCE', '8 beats every second:', '28,800 an hour.');
}
function sFinale(lt, D) {
  const t = lt + T_FIN;
  backdrop('#16181c');
  cam(kf([[0, 80], [3.5, 60]], lt), kf([[0, 40], [3.5, 40]], lt), kf([[0, 1.3], [3.5, 1.05]], lt), kf([[0, 0.06], [3.5, -0.03]], lt));
  const PHI = 0.0022 * (t - 20), ang = trainAngles(PHI);
  const e = TRAIN[4], P = [248.5, 144.2], BL = [299.8, 3.2];
  const s = escState(ESC.phi(t)), on = (a) => clamp((lt - a) / 0.25);
  const route = [[0, -330], ...TRAIN_PATH(), P, BL];
  drawTrain(ang, 0.0022, { barrel: on(0.2), centre: on(0.4), third: on(0.55), fourth: on(0.7), escape: on(0.85) }, { escBlur: 0 });
  // reverser and rotor, ghosted, start of the route
  gear(0, -330, 30, 60, t * 1.5, { mat: STEEL, alpha: 0.8 });
  ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 470, Math.PI / 2 + 0.6 * Math.sin(t * 1.3) - Math.PI / 2, Math.PI / 2 + 0.6 * Math.sin(t * 1.3) + Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.restore();
  // pallet and balance of the overview, at real speed
  ctx.save(); ctx.translate(...P); ctx.rotate(Math.atan2(BL[1] - P[1], BL[0] - P[0]) + Math.PI / 2 + s.alpha * 3);
  ctx.fillStyle = lit(80, 0, STEEL); ctx.fillRect(-5, -150, 10, 150); ctx.fillRect(-45, -6, 90, 14); ctx.restore();
  hairspring(BL[0], BL[1], 12, 60, 9, s.beta, -1.2, 1.6);
  balance(BL[0], BL[1], 95, s.beta, { blur: (ESC.A * Math.cos(ESC.phi(t)) * TAU * 4) / 30, glow: on(1.1) * 0.6 });
  jewel(BL[0], BL[1], 7);
  energy(route, t, { u: clamp(lt / 1.2), a: 1, width: 9, speed: 260 });
  // to the dial: the time it all keeps
  const d = E.inOut(clamp((lt - 1.55) / 0.5));
  if (d > 0) {
    screen(); ctx.save(); ctx.globalAlpha = d; ctx.fillStyle = '#050607'; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = d; cam(0, 130, lerp(1.25, 0.95, E.out(clamp((lt - 1.55) / 1.9)))); dial(t); ctx.restore();
  }
  screen();
  const l1 = win(lt, 0.25, 1.65, 0.25, 0.2), l2 = win(lt, 1.85, D + 1, 0.3, 0.2);
  text('Motion becomes energy.', W / 2, 1640, { font: 'Fraunces', weight: 700, size: 76, align: 'center', alpha: l1 });
  text('Energy becomes time.', W / 2, 1640, { font: 'Fraunces', weight: 700, size: 76, align: 'center', alpha: l2 });
  const la = clamp((lt - 2.5) / 0.5);
  if (la > 0 && LOGO.width) { ctx.save(); ctx.globalAlpha = la; ctx.drawImage(LOGO, W / 2 - 46, 1718, 92, 92); ctx.restore(); }
}
function dial(t) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  ctx.fillStyle = lit(560, 0, STEEL); [[-1], [1]].forEach(([s]) => { ctx.beginPath(); ctx.roundRect(-240, s > 0 ? 380 : -620, 480, 240, 40); ctx.fill(); });
  ctx.beginPath(); ctx.arc(0, 0, 520, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = lit(480, 1, DARK); ctx.beginPath(); ctx.arc(0, 0, 482, 0, TAU); ctx.fill();
  ctx.fillStyle = lit(30, 0, STEEL); ctx.beginPath(); ctx.roundRect(512, -34, 44, 68, 10); ctx.fill();           // crown
  const g = ctx.createRadialGradient(-80, -120, 30, 0, 0, 460); g.addColorStop(0, '#1d3557'); g.addColorStop(1, '#070d18');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 460, 0, TAU); ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  for (let k = 0; k < 360; k++) { const a = k * D2R * 1; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * 455, Math.sin(a) * 455); ctx.stroke(); }
  ctx.restore();
  for (let k = 0; k < 60; k++) { const a = (k * TAU) / 60 - Math.PI / 2; ctx.strokeStyle = 'rgba(240,235,220,.7)'; ctx.lineWidth = k % 5 ? 2 : 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 440, Math.sin(a) * 440); ctx.lineTo(Math.cos(a) * (k % 5 ? 425 : 412), Math.sin(a) * (k % 5 ? 425 : 412)); ctx.stroke(); }
  for (let k = 0; k < 12; k++) {
    const a = (k * TAU) / 12 - Math.PI / 2; ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.fillStyle = lin(-10, -380, 10, -380, BRASS); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    if (k === 0) { ctx.fillRect(-26, -398, 18, 82); ctx.fillRect(8, -398, 18, 82); } else ctx.fillRect(-10, -398, 20, 70);
    ctx.restore();
  }
  const hand = (a, len, w, mat) => { ctx.save(); ctx.rotate(a); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 8;
    ctx.fillStyle = lin(-w, 0, w, 0, mat); ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(w, -len * 0.2); ctx.lineTo(0, 30); ctx.lineTo(-w, -len * 0.2); ctx.closePath(); ctx.fill(); ctx.restore(); };
  const secs = Math.floor((t - 26.5) * 8) / 8 + 12;                                 // 8 small steps a second
  hand((TAU * (10 + 9 / 60)) / 12, 250, 22, BRASS);
  hand((TAU * (9 + secs / 60)) / 60, 380, 17, BRASS);
  ctx.save(); ctx.rotate((TAU * secs) / 60); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 5; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#e8e3d6'; ctx.fillRect(-2.5, -420, 5, 500); ctx.fillStyle = '#d4202e'; ctx.fillRect(-2.5, -420, 5, 60); ctx.restore();
  ctx.fillStyle = lit(18, 0, BRASS); ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.fill();
  const rg = ctx.createLinearGradient(-460, -460, 460, 460); rg.addColorStop(0.3, 'rgba(255,255,255,0)'); rg.addColorStop(0.45, 'rgba(255,255,255,.10)'); rg.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 460, 0, TAU); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ timeline and compositing
const SHOTS = [
  { t0: 0, t1: 3.0, fn: sHook }, { t0: 3.0, t1: 6.0, fn: sRotor }, { t0: 6.0, t1: 9.0, fn: sReverser },
  { t0: 9.0, t1: 13.0, fn: sSpring }, { t0: 13.0, t1: 18.0, fn: sTrain }, { t0: T_ESC, t1: T_FIN, fn: sEscape }, { t0: T_FIN, t1: DUR, fn: sFinale },
];
const XF = 0.28;
let BUF;
function drawShot(i, t, buf) { ctx = buf.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; const S = SHOTS[i]; S.fn(t - S.t0, S.t1 - S.t0); }
window.setPhase = (p) => { ESC_PHASE = p; };
window.render = function (t) {
  t = clamp(t, 0, DUR - 1e-4);
  const i = SHOTS.findIndex((s) => t >= s.t0 && t < s.t1);
  drawShot(i, t, BUF[0]);
  ctx = mctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const into = t - SHOTS[i].t0;
  if (i > 0 && into < XF) {
    drawShot(i - 1, t, BUF[1]); ctx = mctx;
    mctx.drawImage(BUF[1], 0, 0); mctx.globalAlpha = E.sine(into / XF); mctx.drawImage(BUF[0], 0, 0); mctx.globalAlpha = 1;
  } else mctx.drawImage(BUF[0], 0, 0);
  // a warm flash on every cut
  const near = Math.min(...SHOTS.slice(1).map((s) => Math.abs(t - s.t0)));
  if (near < XF) {
    const f = 1 - near / XF, g = mctx.createRadialGradient(W * 0.7, H * 0.3, 10, W * 0.6, H * 0.4, H * 0.8);
    g.addColorStop(0, `rgba(255,214,150,${0.1 * f * f})`); g.addColorStop(1, 'rgba(255,170,80,0)');
    mctx.globalCompositeOperation = 'lighter'; mctx.fillStyle = g; mctx.fillRect(0, 0, W, H); mctx.globalCompositeOperation = 'source-over';
  }
  mctx.drawImage(VIGNETTE, 0, 0);
  mctx.save(); mctx.globalAlpha = 0.05; mctx.globalCompositeOperation = 'overlay';
  const ox = Math.floor(rnd(Math.floor(t * 30)) * 512), oy = Math.floor(rnd(Math.floor(t * 30) + 7) * 512);
  mctx.fillStyle = mctx.createPattern(GRAIN, 'repeat'); mctx.translate(-ox, -oy); mctx.fillRect(ox, oy, W, H); mctx.restore();
  const fin = clamp(t / 0.45) * clamp((DUR - t) / 0.35);
  if (fin < 1) { mctx.fillStyle = `rgba(0,0,0,${1 - fin})`; mctx.fillRect(0, 0, W, H); }
};

// sound cues from the same mechanics: escapement ticks, ratchet clicks, whooshes and hits on the cuts
window.events = function () {
  const ev = [], dt = 1 / 600;
  let last = escState(ESC.phi(T_ESC)).beat;
  for (let t = T_ESC; t < DUR; t += dt) {
    const s = escState(ESC.phi(t)); if (s.beat !== last) { ev.push({ t: +t.toFixed(3), name: s.beat % 2 ? 'tick' : 'tock', gain: t < 23 ? -4 : -9 }); last = s.beat; }
  }
  let lr = Math.floor((REV.angAout(6.0) * (REV.A.pN / REV.O.N) * (REV.O.pN / REV.R.N)) / (TAU / REV.R.N));
  for (let t = 6.0; t < 11.7; t += dt) {
    const a = t < 9 ? REV.angAout(t) * (REV.A.pN / REV.O.N) * (REV.O.pN / REV.R.N) : 0, k = Math.floor(a / (TAU / 50));
    if (t < 9 && k !== lr) { ev.push({ t: +t.toFixed(3), name: 'click', gain: -14 }); lr = k; }
  }
  for (let t = 6.0; t < 9.0; t += dt) if (Math.sign(REV.rate(t)) !== Math.sign(REV.rate(t - dt))) ev.push({ t: +t.toFixed(3), name: 'click', gain: -8 });
  for (let t = 9.0; t < 11.7; t += 0.11 + 0.05 * Math.sin(t * 3)) ev.push({ t: +t.toFixed(3), name: 'click', gain: -12 });
  SHOTS.slice(1).forEach((s) => ev.push({ t: +(s.t0 - 0.35).toFixed(3), name: 'whoosh', gain: -10 }));
  ev.push({ t: 0.3, name: 'whoosh', gain: -12 });
  return ev.sort((a, b) => a.t - b.t);
};

// cover: the escapement mid-impulse, with the title
window.cover = function () {
  window.COVER = true; window.render(19.62); window.COVER = false;
  ctx = mctx; screen();
  const g = ctx.createLinearGradient(0, H * 0.52, 0, H); g.addColorStop(0, 'rgba(3,4,5,0)'); g.addColorStop(0.35, 'rgba(3,4,5,.82)'); g.addColorStop(1, 'rgba(3,4,5,.95)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.52, W, H * 0.48);
  const t2 = ctx.createLinearGradient(0, 0, 0, 600); t2.addColorStop(0, 'rgba(3,4,5,.95)'); t2.addColorStop(1, 'rgba(3,4,5,0)'); ctx.fillStyle = t2; ctx.fillRect(0, 0, W, 600);
  text('INSIDE AN AUTOMATIC MOVEMENT', W / 2, 1450, { font: 'JetBrains Mono', weight: 500, size: 30, color: GOLD, align: 'center', ls: 6 });
  text('Where does a watch', W / 2, 1570, { font: 'Fraunces', weight: 700, size: 92, align: 'center' });
  text('get its energy?', W / 2, 1680, { font: 'Fraunces', weight: 700, size: 92, align: 'center' });
  ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 50, 1735, 100, 4);
};
