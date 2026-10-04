/* Inside the movement: a 30 s, 1080x1920 flight through an automatic watch, drawn with three.js as a pure function of
   time. window.ready resolves once everything is built; window.render(t) draws frame t into the output canvas;
   window.events() lists the sound cues. One unit is 0.1 mm: the movement is 30 mm across, the camera a speck in it.

   The movement lies in the XZ plane, height on Y. Its parts are laid out in "plan" coordinates (x right, y towards
   the viewer's bottom when seen from above), exactly as in the 2D film, inside a group turned so plan (x, y) = world
   (x, z) and plan depth z = -height. That keeps the mechanics identical: wheels mesh at their tooth ratios with teeth
   interleaved, the pallets span 2.5 teeth of a 15-tooth club wheel, the escape wheel moves half a tooth per beat only
   while the impulse jewel is in the fork, the fork follows the jewel, the hairspring breathes with the balance. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1080, H = 1920, DUR = 30, TAU = Math.PI * 2, D2R = Math.PI / 180;
const RS = 0.8, RW = Math.round(W * RS), RH = Math.round(H * RS);   // WebGL renders at 0.8 scale; the 2D output upscales
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const mod = (a, n) => ((a % n) + n) % n;
const E = { inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), out: (u) => 1 - Math.pow(1 - u, 3), in: (u) => u * u * u, sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2, lin: (u) => u };
function kf(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) { const [t1, v1, e] = keys[i]; if (t <= t1) { const [t0, v0] = keys[i - 1]; return lerp(v0, v1, E[e || 'inOut']((t - t0) / (t1 - t0))); } }
  return keys[keys.length - 1][1];
}
const win = (t, a, b, fi = 0.3, fo = 0.3) => clamp((t - a) / fi) * clamp((b - t) / fo);
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function integral(rate, t0 = 0, t1 = DUR + 1, dt = 1 / 1200) {
  const n = Math.ceil((t1 - t0) / dt) + 1, tab = new Float64Array(n);
  for (let i = 1; i < n; i++) tab[i] = tab[i - 1] + rate(t0 + (i - 0.5) * dt) * dt;
  return (t) => { const x = clamp((t - t0) / dt, 0, n - 1.001), i = Math.floor(x); return lerp(tab[i], tab[i + 1], x - i); };
}

// ------------------------------------------------------------------ renderer, post, output canvas
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(RW, RH);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92; renderer.outputColorSpace = THREE.SRGBColorSpace;
const out = document.createElement('canvas'); out.width = W; out.height = H; document.body.appendChild(out);
const octx = out.getContext('2d');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040506);
scene.fog = new THREE.FogExp2(0x050607, 0.0026);
const pmrem = new THREE.PMREMGenerator(renderer);
// a dark product studio: strip softboxes give polished metal crisp highlight bands
function studio() {
  const env = new THREE.Scene(); env.background = new THREE.Color(0x1a1c20);
  const box = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x1c1e23, side: THREE.BackSide })); env.add(box);
  const strip = (w, h, x, y, z, rx, ry, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); };
  strip(70, 40, 0, 45, 0, Math.PI / 2, 0, 0xffffff, 4.0);          // overhead softbox
  strip(70, 8, 0, 44, -28, Math.PI / 2, 0, 0xffffff, 9.0);          // a hard strip in it, for crisp bands
  strip(8, 70, -45, 10, 0, 0, Math.PI / 2, 0xfff1dc, 3.4);          // left strip, warm
  strip(8, 70, 45, 5, 10, 0, -Math.PI / 2, 0xdfe8ff, 2.6);           // right strip, cool
  strip(70, 6, 0, -10, 45, 0, Math.PI, 0xffd9a0, 1.8);               // low warm kicker
  strip(30, 30, 0, 20, -45, 0, 0, 0xffffff, 1.2);                    // back fill
  return pmrem.fromScene(env, 0.02).texture;
}
scene.environment = studio();
scene.environmentIntensity = 1.15;
const camera = new THREE.PerspectiveCamera(58, W / H, 0.05, 4000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(RW, RH), 0.32, 0.45, 0.93); composer.addPass(bloom);
const bokeh = new BokehPass(scene, camera, { focus: 30, aperture: 0.0008, maxblur: 0.012 }); composer.addPass(bokeh);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ textures (canvas)
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dataTex(w, h, draw, repeat = 1) { const t = canvasTex(w, h, draw, repeat); t.colorSpace = THREE.NoColorSpace; return t; }
// Côtes de Genève: soft polished bands
const cotesDraw = (g, w, h) => { for (let i = 0; i < 4; i++) { const lg = g.createLinearGradient(i * w / 4, 0, (i + 1) * w / 4, 0); lg.addColorStop(0, '#6f7780'); lg.addColorStop(0.42, '#f4f6f8'); lg.addColorStop(0.56, '#b9c0c8'); lg.addColorStop(1, '#646b74'); g.fillStyle = lg; g.fillRect(i * w / 4, 0, w / 4 + 1, h); } };
const COTES = canvasTex(256, 256, cotesDraw); COTES.rotation = 0.6; COTES.repeat.set(1 / 60, 1 / 60);
const COTES_R = dataTex(256, 256, (g, w, h) => { for (let i = 0; i < 4; i++) { const lg = g.createLinearGradient(i * w / 4, 0, (i + 1) * w / 4, 0); lg.addColorStop(0, '#9a9a9a'); lg.addColorStop(0.5, '#3a3a3a'); lg.addColorStop(1, '#9a9a9a'); g.fillStyle = lg; g.fillRect(i * w / 4, 0, w / 4 + 1, h); } });
COTES_R.rotation = 0.6; COTES_R.repeat.set(1 / 60, 1 / 60);
// perlage: overlapping circular graining
const perlageDraw = (light) => (g, w, h) => {
  g.fillStyle = light ? '#6b7078' : '#777'; g.fillRect(0, 0, w, h); const st = w / 9;
  for (let y = -st; y < h + st; y += st * 0.8) for (let x = -st; x < w + st; x += st * 0.8) {
    const rg = g.createRadialGradient(x - st * 0.18, y - st * 0.18, 1, x, y, st * 0.62);
    if (light) { rg.addColorStop(0, '#b8bec6'); rg.addColorStop(0.55, '#7d838b'); rg.addColorStop(0.85, '#a9afb7'); rg.addColorStop(1, '#5f646b'); }
    else { rg.addColorStop(0, '#444'); rg.addColorStop(0.55, '#888'); rg.addColorStop(0.85, '#555'); rg.addColorStop(1, '#999'); }
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, st * 0.62, 0, TAU); g.fill();
  }
};
const PERLAGE = canvasTex(512, 512, perlageDraw(true)); PERLAGE.repeat.set(16, 16);
const PERLAGE_R = dataTex(512, 512, perlageDraw(false)); PERLAGE_R.repeat.set(16, 16);
const SUNBURST = canvasTex(1024, 1024, (g, w, h) => {
  const rg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); rg.addColorStop(0, '#b3d2a6'); rg.addColorStop(1, '#8fb585'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.06; for (let k = 0; k < 720; k++) { const a = (k / 720) * TAU; g.strokeStyle = k % 2 ? '#ffffff' : '#000000'; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w, h / 2 + Math.sin(a) * w); g.stroke(); }
});
SUNBURST.repeat.set(1, 1);
const graining = (dark) => (g, w) => { g.fillStyle = dark ? '#808080' : '#d9b46c'; g.fillRect(0, 0, w, w);
  for (let r = 2; r < w * 0.71; r += 1.4) { const v = rnd(r * 7.1); g.strokeStyle = dark ? `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${0.05 + 0.08 * rnd(r)})` : `rgba(${v > 0.5 ? '255,240,205' : '150,105,45'},${0.025 + 0.035 * rnd(r)})`; g.lineWidth = 1.1; g.beginPath(); g.arc(w / 2, w / 2, r, 0, TAU); g.stroke(); } };
const GRAIN_C = canvasTex(1024, 1024, graining(false)), GRAIN_R = dataTex(1024, 1024, graining(true));
const wheelMats = new Map();
function wheelMat(R, base) {   // circular graining centred on a wheel of radius R (shape units)
  const k = R + '|' + (base ? 'steel' : 'gold'); if (wheelMats.has(k)) return wheelMats.get(k);
  const m = (base || M.gold).clone(), c = GRAIN_C.clone(), r = GRAIN_R.clone();
  [c, r].forEach((t) => { t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1 / (2.4 * R), 1 / (2.4 * R)); t.offset.set(0.5, 0.5); });
  m.map = base ? null : c; m.roughnessMap = r; m.color = new THREE.Color(base ? 0xdfe4ea : 0xffffff);
  const both = [m, base || M.gold]; wheelMats.set(k, both); return both;   // [faces, sides] for ExtrudeGeometry's two groups
}
const GLOW = canvasTex(128, 128, (g, w) => { const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); rg.addColorStop(0, 'rgba(255,236,190,1)'); rg.addColorStop(0.25, 'rgba(255,190,90,.55)'); rg.addColorStop(1, 'rgba(255,150,40,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });

// ------------------------------------------------------------------ materials
const M = {
  gold: new THREE.MeshStandardMaterial({ color: 0xe0b56a, metalness: 1, roughness: 0.26 }),
  goldDark: new THREE.MeshStandardMaterial({ color: 0xc89a52, metalness: 1, roughness: 0.32 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xf0f3f6, metalness: 1, roughness: 0.12 }),
  steelSatin: new THREE.MeshStandardMaterial({ color: 0xc6ccd3, metalness: 1, roughness: 0.3 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xc8cdd3, metalness: 1, roughness: 0.42, map: PERLAGE, roughnessMap: PERLAGE_R }),
  bridge: [new THREE.MeshStandardMaterial({ color: 0xd7dce1, metalness: 1, roughness: 0.3, map: COTES, roughnessMap: COTES_R }), new THREE.MeshStandardMaterial({ color: 0xeef1f4, metalness: 1, roughness: 0.1 })],
  rotor: [new THREE.MeshStandardMaterial({ color: 0xbfc5cc, metalness: 1, roughness: 0.34, map: COTES, roughnessMap: COTES_R }), new THREE.MeshStandardMaterial({ color: 0xeef1f4, metalness: 1, roughness: 0.1 })],
  ruby: new THREE.MeshPhysicalMaterial({ color: 0xa50a2c, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0x4a0414, envMapIntensity: 2.2, specularIntensity: 1, ior: 1.76 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2c4fb0, metalness: 1, roughness: 0.22 }),
  spring: new THREE.MeshStandardMaterial({ color: 0xedf1f5, metalness: 1, roughness: 0.14, side: THREE.DoubleSide }),
  hair: new THREE.MeshStandardMaterial({ color: 0x3a5ec4, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }),
  drum: new THREE.MeshStandardMaterial({ color: 0xd8ad62, metalness: 1, roughness: 0.3, side: THREE.DoubleSide }),
  dial: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.35, roughness: 0.38, map: SUNBURST, envMapIntensity: 1.6 }),
  case: new THREE.MeshStandardMaterial({ color: 0xe6e9ed, metalness: 1, roughness: 0.12 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.6, roughness: 0.5 }),
};
M.lid = M.drum.clone(); M.lid.transparent = true; M.lid.side = THREE.FrontSide;
M.ratchet = M.steel.clone(); M.ratchet.transparent = true;

// ------------------------------------------------------------------ geometry helpers (plan coordinates)
const PLAN = new THREE.Group(); PLAN.rotation.x = Math.PI / 2; scene.add(PLAN);   // plan (x, y) -> world (x, z); plan z = -height
const geoCache = new Map();
function extrude(key, shapeFn, depth, bevel = 0.12) {
  const k = key + '|' + depth + '|' + bevel; if (geoCache.has(k)) return geoCache.get(k);
  const g = new THREE.ExtrudeGeometry(shapeFn(), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, 0); geoCache.set(k, g); return g;
}
// a mesh in plan coordinates whose top face sits at height h
function placed(geo, mat, x, y, h, parent = PLAN) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, -h); parent.add(m); return m; }
function gearShape(N, r, spokes = 0, bore = 0, saw = false) {
  const m = (2 * r) / N, rTip = r + m * 0.92, rRoot = r - m * 1.18, h = Math.PI / N, s = new THREE.Shape();
  for (let k = 0; k < N; k++) {
    const c = k * 2 * h;
    const pts = saw ? [[c - h, rRoot], [c + h * 0.85, rTip], [c + h, rRoot]]
      : [[c - h, rRoot], [c - h * 0.66, rRoot + (rTip - rRoot) * 0.5], [c - h * 0.42, rTip], [c + h * 0.42, rTip], [c + h * 0.66, rRoot + (rTip - rRoot) * 0.5], [c + h, rRoot]];
    pts.forEach(([a, rr], i) => { const x = Math.cos(a) * rr, y = Math.sin(a) * rr; (k === 0 && i === 0) ? s.moveTo(x, y) : s.lineTo(x, y); });
  }
  s.closePath();
  if (spokes) {
    const ro = rRoot * 0.84, ri = Math.max(m * 2.4, r * 0.24), sw = Math.max(m * 0.9, rRoot * 0.09);
    for (let k = 0; k < spokes; k++) {
      const a0 = (k * TAU) / spokes, a1 = ((k + 1) * TAU) / spokes, ho = Math.asin(sw / 2 / ro), hi = Math.asin(Math.min(0.95, sw / 2 / ri));
      const p = new THREE.Path(); p.absarc(0, 0, ro, a0 + ho, a1 - ho, false); p.lineTo(Math.cos(a1 - hi) * ri, Math.sin(a1 - hi) * ri); p.absarc(0, 0, ri, a1 - hi, a0 + hi, true); p.closePath(); s.holes.push(p);
    }
  }
  if (bore) { const p = new THREE.Path(); p.absarc(0, 0, bore, 0, TAU, true); s.holes.push(p); }
  return s;
}
function gear(N, r, thick, mat, spokes = 0, bore = 0, saw = false) { return extrude(`g${N}_${r}_${spokes}_${bore}_${saw}`, () => gearShape(N, r, spokes, bore, saw), thick, Math.min(0.12, thick * 0.12)); }
function cyl(r, h, mat, seg = 32) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, h / 2); return g; }  // along +plan z (downwards), top at 0
function ring(r0, r1, thick) { return extrude(`ring${r0}_${r1}`, () => { const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, TAU); const p = new THREE.Path(); p.absarc(0, 0, r0, 0, TAU, true); s.holes.push(p); return s; }, thick, 0.1); }
function polyShape(pts, holes = []) { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); holes.forEach(([x, y, r]) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, TAU, true); s.holes.push(p); }); return s; }
// rounded polygon (bridges)
function roundPoly(pts, rad) {
  const s = new THREE.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const v0 = [p0[0] - p1[0], p0[1] - p1[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]], l0 = Math.hypot(...v0), l2 = Math.hypot(...v2), rr = Math.min(rad, l0 / 2.2, l2 / 2.2);
    const a = [p1[0] + (v0[0] / l0) * rr, p1[1] + (v0[1] / l0) * rr], b = [p1[0] + (v2[0] / l2) * rr, p1[1] + (v2[1] / l2) * rr];
    i ? s.lineTo(...a) : s.moveTo(...a); s.quadraticCurveTo(p1[0], p1[1], ...b);
  }
  s.closePath(); return s;
}
function jewelAt(x, y, h, r = 1.5, parent = PLAN) {
  const g = new THREE.Group(); g.position.set(x, y, -h); parent.add(g);
  const ch = new THREE.Mesh(cyl(r * 1.75, 0.5, M.gold), M.gold); ch.position.z = -0.5; g.add(ch);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, TAU, 0, Math.PI / 2), M.ruby); dome.rotation.x = -Math.PI / 2; dome.scale.set(1, 1, 0.45); dome.position.z = -0.45; g.add(dome);
  return g;
}
function screwAt(x, y, h, r = 2.2, rot = 0.6) {
  const g = new THREE.Group(); g.position.set(x, y, -h); g.rotation.z = rot; PLAN.add(g);
  const head = new THREE.Mesh(cyl(r, 0.9, M.blue), M.blue); head.position.z = -0.9; g.add(head);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 0.28, 0.5), M.dark); slot.position.z = -0.95; g.add(slot);
}

// ------------------------------------------------------------------ the movement
const L = {};   // layout (plan coordinates, 0.1 mm)
function meshPhase(A, B, NA, phaseA, NB) { const phi = Math.atan2(B.y - A.y, B.x - A.x), fA = mod((phi - phaseA) / (TAU / NA), 1); return phi + Math.PI - (TAU / NB) * (0.5 - fA); }
let TR, ESC, WIND;
const S_ESC = 0.0957, ER = 230;            // escapement is designed in "macro" units (escape wheel radius 230) and scaled
const X0 = { x: 69.8, y: 33.0 }, DIR = { x: Math.cos(130 * D2R), y: Math.sin(130 * D2R) };
const ESC_ROT = Math.atan2(DIR.x, -DIR.y);  // turns macro "up" (towards the balance) onto DIR
function macroToPlan(mx, my) { const vx = mx * S_ESC, vy = (my - 380) * S_ESC, c = Math.cos(ESC_ROT), s = Math.sin(ESC_ROT); return { x: X0.x + vx * c - vy * s, y: X0.y + vx * s + vy * c }; }
const PALLETS = [-1, 1].map((sd) => { const a = -Math.PI / 2 + sd * 30 * D2R, d = [Math.cos(a), Math.sin(a)]; return [[300 * d[0], 380 + 300 * d[1] - 70], [ER * d[0], 380 + ER * d[1] - 70]]; });
const ESC_PHASE = -0.038;

function build() {
  // ---- going train (module 1.6), the same chain as the 2D film, scaled to the movement
  TR = [
    { id: 'barrel', x: -44, y: -32, wheel: { N: 60, r: 48 } },
    { id: 'centre', x: 0, y: 0, pinion: { N: 8, r: 6.4 }, wheel: { N: 52, r: 41.6 } },
    { id: 'third', x: 40.88, y: -23.6, pinion: { N: 7, r: 5.6 }, wheel: { N: 44, r: 35.2 } },
    { id: 'fourth', x: 76.21, y: -3.2, pinion: { N: 7, r: 5.6 }, wheel: { N: 40, r: 32 } },
    { id: 'escape', x: X0.x, y: X0.y, pinion: { N: 6, r: 4.8 } },
  ];
  TR[0].g = 1; TR[0].phase = 0;
  for (let i = 1; i < TR.length; i++) { const A = TR[i - 1], B = TR[i]; B.g = -A.g * (A.wheel.N / B.pinion.N); B.phase = meshPhase(A, B, A.wheel.N, A.phase, B.pinion.N); }
  const H_ = { barrel: [9, 8], centre: [6.2, 1.2], third: [4.2, 1.0], fourth: [7.4, 1.0] };
  TR.forEach((a) => {
    a.group = new THREE.Group(); a.group.position.set(a.x, a.y, 0); PLAN.add(a.group);
    if (a.pinion) { const p = new THREE.Mesh(gear(a.pinion.N, a.pinion.r, 7.5, M.steel), M.steel); p.position.z = -8.5; a.group.add(p); }
    const arb = new THREE.Mesh(cyl(a.pinion ? a.pinion.r * 0.35 : 4, 12, M.steel), M.steel); arb.position.z = -11.5; a.group.add(arb);
    if (a.id !== 'barrel' && a.wheel) { const [h, th] = H_[a.id]; const w = new THREE.Mesh(gear(a.wheel.N, a.wheel.r, th, M.gold, 4, 1.2), wheelMat(a.wheel.r)); w.position.z = -h; a.group.add(w); }
  });
  // barrel: toothed drum with walls you can fly between, lid (fades as we enter), arbor, the mainspring inside
  const B = TR[0];
  const teeth = new THREE.Mesh(gear(60, 48, 1.6, M.drum, 0, 40), M.drum); teeth.position.z = -2.6; B.group.add(teeth);
  const wallG = new THREE.CylinderGeometry(44, 44, 8, 96, 1, true); wallG.rotateX(Math.PI / 2); wallG.translate(0, 0, 4);
  const wall = new THREE.Mesh(wallG, M.drum); wall.position.z = -9; B.group.add(wall);
  const floor = new THREE.Mesh(cyl(44, 0.6, M.drum, 96), M.drum); floor.position.z = -1.6; B.group.add(floor);
  L.lid = new THREE.Mesh(cyl(44.5, 0.7, M.lid, 96), M.lid); L.lid.position.z = -9.7; B.group.add(L.lid);
  L.barrelArbor = new THREE.Mesh(cyl(5, 14, M.steel), M.steel); L.barrelArbor.position.z = -15; PLAN.add(L.barrelArbor); L.barrelArbor.position.x = B.x; L.barrelArbor.position.y = B.y;
  L.spring = springMesh(); L.spring.position.set(B.x, B.y, 0); PLAN.add(L.spring);
  // mainplate, dial side and case
  const plateG = new THREE.CylinderGeometry(150, 150, 6, 160); const plate = new THREE.Mesh(plateG, M.plate); plate.position.y = -3; scene.add(plate);
  // automatic winding: rotor wheel -> reverser -> reduction -> ratchet on the barrel arbor (module 1.6)
  WIND = { rw: { x: 0, y: 0, N: 15, r: 12, h: 18.5 }, rv: { x: -18.4, y: -26.2, N: 25, r: 20, pN: 8, pr: 6.4, h: 17 }, rd: { x: -18.8, y: -56.7, N: 30, r: 24, pN: 8, pr: 6.4, h: 15.6 }, rt: { x: B.x, y: B.y, N: 36, r: 28.8, h: 15.2 } };
  const W_ = WIND;
  W_.rw.m = placed(gear(15, 12, 1.4, M.gold, 0, 2), wheelMat(12), 0, 0, W_.rw.h);
  W_.rv.m = placed(gear(25, 20, 1.2, M.gold, 5, 1.5), wheelMat(20), W_.rv.x, W_.rv.y, W_.rv.h);
  W_.rv.pm = placed(gear(8, 6.4, 3.5, M.steel), M.steel, W_.rv.x, W_.rv.y, W_.rv.h - 1.2);
  W_.rd.m = placed(gear(30, 24, 1.2, M.gold, 5, 1.5), wheelMat(24), W_.rd.x, W_.rd.y, W_.rd.h + 2.4);
  W_.rd.pm = placed(gear(8, 6.4, 3.4, M.steel), M.steel, W_.rd.x, W_.rd.y, W_.rd.h + 1.2);
  W_.rt.m = placed(gear(36, 28.8, 1.4, M.ratchet, 4, 5.2, true), M.ratchet, W_.rt.x, W_.rt.y, W_.rt.h);
  W_.rv.ph = meshPhase(W_.rw, W_.rv, W_.rw.N, 0, W_.rv.N);
  W_.rd.ph = meshPhase(W_.rv, W_.rd, W_.rv.pN, 0, W_.rd.N);
  W_.rt.ph = meshPhase(W_.rd, W_.rt, W_.rd.pN, W_.rd.ph, W_.rt.N);
  [[W_.rv.x, W_.rv.y, W_.rv.h + 0.1], [W_.rd.x, W_.rd.y, W_.rd.h + 2.5]].forEach(([x, y, h]) => jewelAt(x, y, h, 1.1));
  // bridges: the architecture overhead
  const bridges = [
    { pts: [[-120, -70], [-62, -60], [-12, -38], [-4, -16], [-50, -10], [-118, -42]], h: 14, holes: [] },
    { pts: [[-8, -10], [34, -36], [84, -22], [86, 14], [72, 40], [60, 30], [70, 6], [42, -16], [6, 8]], h: 13.5, holes: [] },
    { pts: [[-30, 146], [44, 146], [34, 116], [26, 96], [14, 84], [2, 96], [-8, 116]], h: 15.5, holes: [] },
  ];
  L.bridges = bridges.map((b, i) => { const m = placed(extrude('br' + i, () => roundPoly(b.pts, 9), 3.2, 0.7), M.bridge, 0, 0, b.h); return m; });
  // pallet bridge
  const P = macroToPlan(0, 70);
  // jewels and screws on the bridges
  TR.slice(1).forEach((a) => jewelAt(a.x, a.y, 14 + 0.2, 1.4));
  [[-80, -60], [-20, -70], [-90, -10], [70, -40], [92, 4], [50, 30], [20, 132], [-12, 136]].forEach(([x, y], i) => screwAt(x, y, i < 3 ? 14.9 : i < 6 ? 14.4 : 16.4, 2.4, i * 1.3));
  // escapement assembly in macro units
  ESC = { f: null };
  const EG = new THREE.Group(); EG.position.set(X0.x, X0.y, 0); EG.rotation.z = ESC_ROT; EG.scale.set(S_ESC, S_ESC, 1); PLAN.add(EG); L.EG = EG;
  L.escWheel = new THREE.Mesh(extrude('esc', escapeShape, 0.8, 0.08), wheelMat(ER, M.steel)); L.escWheel.position.set(0, 0, -5.0); EG.add(L.escWheel);
  L.fork = new THREE.Group(); L.fork.position.set(0, 70 - 380, 0); EG.add(L.fork);
  const fork = new THREE.Mesh(extrude('fork', forkShape, 0.7, 0.06), M.steel); fork.position.z = -6.1; L.fork.add(fork);
  L.pallets = PALLETS.map(([o, tip]) => {
    const len = Math.hypot(tip[0] - o[0], tip[1] - o[1]), sh = new THREE.Shape(); sh.moveTo(-13, -6); sh.lineTo(13, -6); sh.lineTo(13, len - 4); sh.lineTo(4, len); sh.lineTo(-13, len - 6); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 2.2, bevelSegments: 2 });
    // level with the escape wheel (heights 5.5 to 4.2)
    const m = new THREE.Mesh(g, M.ruby); m.position.set(o[0], o[1], -5.5); m.rotation.z = Math.atan2(tip[1] - o[1], tip[0] - o[0]) - Math.PI / 2; L.fork.add(m); return m;
  });
  const Pp = macroToPlan(0, 70); jewelAt(Pp.x, Pp.y, 6.3, 1.15);
  // balance: rim, arms, timing screws, roller with impulse jewel, hairspring; the cock above with its shock spring
  L.balance = new THREE.Group(); L.balance.position.set(0, -900, 0); EG.add(L.balance);
  const BR = 439;
  const rim = new THREE.Mesh(ring(BR * 0.9, BR, 3.0), wheelMat(BR)); rim.position.z = -9.6; L.balance.add(rim);
  for (let k = 0; k < 3; k++) { const a = new THREE.Mesh(new THREE.BoxGeometry(BR * 0.92, 26, 0.9), M.gold); a.geometry.translate(BR * 0.46, 0, 0); a.rotation.z = (k * TAU) / 3 + 0.5; a.position.z = -9.1; L.balance.add(a); }
  for (let k = 0; k < 16; k++) { const a = (k * TAU) / 16; const sc = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 22, 12), k % 4 === 0 ? M.blue : M.gold); sc.rotation.z = a + Math.PI / 2; sc.scale.z = S_ESC; sc.position.set(Math.cos(a) * (BR + 10), Math.sin(a) * (BR + 10), -8.1); L.balance.add(sc); }
  const roller = new THREE.Mesh(cyl(86, 0.6, M.steel), M.steel); roller.position.z = -6.4; L.balance.add(roller);
  const ij = new THREE.Mesh(new THREE.BoxGeometry(18, 28, 1.4), M.ruby); ij.position.set(0, 80, -5.6); L.balance.add(ij);
  const staff = new THREE.Mesh(cyl(14, 9, M.steel), M.steel); staff.position.z = -12; L.balance.add(staff);
  L.hair = hairMesh(); L.hair.position.set(0, -900, 0); EG.add(L.hair);
  const BL = macroToPlan(0, -520);
  L.BL = BL; L.P = P;
  jewelAt(BL.x, BL.y, 15.7 + 0.3, 1.6);
  const shock = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 40, Math.PI * 1.6), M.gold); shock.position.set(BL.x, BL.y, -16.2); PLAN.add(shock);
  // rotor: Côtes de Genève sector on a ball bearing, heavy gold rim
  L.rotor = new THREE.Group(); L.rotor.position.set(0, 0, -24.5); PLAN.add(L.rotor);
  const sector = () => { const s = new THREE.Shape(); s.moveTo(0, -14); s.absarc(0, 0, 120, -Math.PI / 2, Math.PI / 2, false); s.lineTo(0, 14); s.absarc(0, 0, 14, Math.PI / 2, -Math.PI / 2, true);
    [[-1.0, -0.2], [0.2, 1.0]].forEach(([a0, a1]) => { const p = new THREE.Path(); p.absarc(0, 0, 92, a0, a1, false); p.absarc(0, 0, 40, a1, a0, true); p.closePath(); s.holes.push(p); }); return s; };
  const plateR = new THREE.Mesh(extrude('rotor', sector, 1.8, 0.35), M.rotor); L.rotor.add(plateR);
  const rimG = extrude('rotorRim', () => { const s = new THREE.Shape(); s.absarc(0, 0, 121, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02, false); s.absarc(0, 0, 100, Math.PI / 2 - 0.02, -Math.PI / 2 + 0.02, true); return s; }, 6.5, 0.6);
  const rimM = new THREE.Mesh(rimG, M.gold); rimM.position.z = -1.4; L.rotor.add(rimM);
  const bearing = new THREE.Mesh(ring(5, 14, 3.2), M.steel); bearing.position.z = -0.8; L.rotor.add(bearing);
  for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), M.steel); const a = (k * TAU) / 14; b.position.set(Math.cos(a) * 9.5, Math.sin(a) * 9.5, 0.2); L.rotor.add(b); }
  const rs = new THREE.Mesh(cyl(4.5, 1.2, M.blue), M.blue); rs.position.z = -1.6; L.rotor.add(rs);
  // dial side: motion works under the plate, the dial, indices, hands (dial faces -y; 12 o'clock at -z, 3 o'clock at -x)
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(146, 146, 1.6, 160), M.dial); dial.position.y = -9; dial.rotation.y = 0; scene.add(dial);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.8, 24), M.dark); hole.position.y = -9; scene.add(hole);
  const hourWheel = new THREE.Mesh(gear(48, 15, 0.8, M.gold, 4, 3), M.gold); hourWheel.rotation.x = Math.PI / 2; hourWheel.position.y = -7.2; scene.add(hourWheel); L.hourWheel = hourWheel;
  const minWheel = new THREE.Mesh(gear(30, 9, 0.8, M.gold, 0, 1), M.gold); minWheel.rotation.x = Math.PI / 2; minWheel.position.set(19.5, -6.6, 13); scene.add(minWheel); L.minWheel = minWheel;
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 6, 20), M.steel); cannon.position.y = -10; scene.add(cannon);
  for (let k = 0; k < 12; k++) {
    const th = k * 30 * D2R, v = [-Math.sin(th), -Math.cos(th)], g = k === 0 ? new THREE.BoxGeometry(9, 1.4, 22) : new THREE.BoxGeometry(5, 1.4, 18);
    const ix = new THREE.Mesh(g, M.steel); ix.position.set(v[0] * 120, -10.3, v[1] * 120); ix.rotation.y = th; scene.add(ix);
  }
  for (let k = 0; k < 60; k++) { if (k % 5 === 0) continue; const th = k * 6 * D2R; const mk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 5), M.steel); mk.position.set(-Math.sin(th) * 138, -9.95, -Math.cos(th) * 138); mk.rotation.y = th; scene.add(mk); }
  const dauphine = (len, w) => { const s = new THREE.Shape(); s.moveTo(0, 14); s.lineTo(w, 0); s.lineTo(0, -len); s.lineTo(-w, 0); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.8, bevelSegments: 1 }); g.rotateX(Math.PI / 2); return g; };
  L.hour = new THREE.Mesh(dauphine(78, 5.5), M.steel); L.hour.position.y = -11; scene.add(L.hour);
  L.minute = new THREE.Mesh(dauphine(118, 4.5), M.steel); L.minute.position.y = -12.2; scene.add(L.minute);
  const sec = new THREE.Group(); const sb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 150), M.steel); sb.position.z = -50; sec.add(sb); const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 18), new THREE.MeshStandardMaterial({ color: 0xc81e2a, metalness: 0.4, roughness: 0.35 })); tip.position.z = -116; sec.add(tip);
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 24), M.gold); capM.position.y = -0.4; sec.add(capM); sec.position.y = -13.2; scene.add(sec); L.second = sec;
  // case: polished middle case around everything, lugs at 12 and 6, crown at 3
  const prof = [[152, -17], [176, -17], [184, -10], [186, 8], [182, 26], [170, 31], [152, 31]].map(([r, y]) => new THREE.Vector2(r, y));
  const caseM = new THREE.Mesh(new THREE.LatheGeometry(prof, 160), M.case); scene.add(caseM);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(160, 9, 20, 160), M.case); bezel.rotation.x = Math.PI / 2; bezel.position.y = -18; scene.add(bezel);
  [-1, 1].forEach((sz) => [-1, 1].forEach((sx) => { const lug = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 70), M.case); lug.position.set(sx * 92, 4, sz * 186); lug.rotation.y = sx * sz * 0.12; scene.add(lug); }));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 22, 40), M.case); crown.rotation.z = Math.PI / 2; crown.position.set(-196, 6, 0); scene.add(crown);
  // lights: key from above (through the sapphire), cool rim, energy lights that travel with the power, a lamp near the camera
  L.key = new THREE.DirectionalLight(0xfff0dc, 1.25); L.key.position.set(-120, 300, -160); scene.add(L.key);
  const rimL = new THREE.DirectionalLight(0x9fb8ff, 0.45); rimL.position.set(160, -120, 200); scene.add(rimL);
  L.dialKey = new THREE.DirectionalLight(0xfff1dc, 0); L.dialKey.position.set(-200, -400, -260); scene.add(L.dialKey);
  L.dialSpot = new THREE.PointLight(0xfff4e6, 0, 900, 1.2); L.dialSpot.position.set(-120, -260, -160); scene.add(L.dialSpot);
  L.dialFill = new THREE.DirectionalLight(0xbfd2ff, 0); L.dialFill.position.set(260, -300, 200); scene.add(L.dialFill);
  L.elights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffb45a, 0, 70, 1.6); scene.add(l); return l; });
  L.camLight = new THREE.PointLight(0xfff2e0, 9, 30, 1.8); scene.add(L.camLight);
  L.barrelLight = new THREE.PointLight(0xffe2b8, 0, 60, 1.4); L.barrelLight.position.set(-44, 11, -32); scene.add(L.barrelLight);
  // energy glints: soft additive sprites at contact points
  L.glints = [];
  // dust: a few motes catching the light
  const dn = 500, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) { const r = Math.sqrt(rnd(i)) * 140, a = rnd(i + 3) * TAU; dp[i * 3] = Math.cos(a) * r; dp[i * 3 + 1] = rnd(i + 7) * 30 - 2; dp[i * 3 + 2] = Math.sin(a) * r; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  L.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe6c0, size: 0.18, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(L.dust);
  // light shafts through the sapphire
  L.shafts = [[-60, -30, 0.25], [40, 60, -0.3]].map(([x, z, tilt]) => {
    const g = new THREE.CylinderGeometry(6, 34, 80, 32, 1, true); g.translate(0, -40, 0);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { k: { value: 0.05 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform float k; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(vN, vV)), 2.0); float f = smoothstep(-80., -10., vY) * (1.-smoothstep(-10., 0., vY)); gl_FragColor = vec4(vec3(1.0,0.86,0.62)*k*e*f, 1.0); }' });
    const s = new THREE.Mesh(g, m); s.position.set(x, 60, z); s.rotation.z = tilt; scene.add(s); return s;
  });
  initMechanics();
}
function escapeShape() {
  const s = new THREE.Shape(), N = 15, P = TAU / N, R = ER, rr = R * 0.72;
  for (let k = 0; k < N; k++) {
    const c = k * P;
    [[c - P * 0.6, rr], [c - P * 0.45, rr * 1.04], [c - P * 0.27, R * 0.9], [c - P * 0.24, R * 0.95], [c, R], [c - P * 0.04, rr]]
      .forEach(([a, r], i) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; (k === 0 && i === 0) ? s.moveTo(x, y) : s.lineTo(x, y); });
  }
  s.closePath();
  const ro = rr * 0.86, ri = R * 0.16;
  for (let k = 0; k < 5; k++) { const a0 = (k * TAU) / 5, a1 = ((k + 1) * TAU) / 5, ho = Math.asin((R * 0.05) / ro), hi = Math.asin((R * 0.05) / ri);
    const p = new THREE.Path(); p.absarc(0, 0, ro, a0 + ho, a1 - ho, false); p.lineTo(Math.cos(a1 - hi) * ri, Math.sin(a1 - hi) * ri); p.absarc(0, 0, ri, a1 - hi, a0 + hi, true); p.closePath(); s.holes.push(p); }
  return s;
}
function forkShape() {
  return polyShape([[-18, -8], [-14, -470], [-44, -500], [-30, -520], [-8, -488], [8, -488], [30, -520], [44, -500], [14, -470], [18, -8], [160, 22], [172, 66], [126, 80], [14, 52], [-14, 52], [-126, 80], [-172, 66], [-160, 22]]);
}
// mainspring: a steel ribbon wound in a spiral, rebuilt every frame from its tension
const SP_N = 1400;
function springMesh() {
  const g = new THREE.BufferGeometry(), pos = new Float32Array((SP_N + 1) * 4 * 3), idx = [];
  for (let i = 0; i < SP_N; i++) { const a = i * 4, b = a + 4; // inner face (0,1), outer face (2,3), each bottom/top
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, M.spring); m.frustumCulled = false; return m;   // rebuilt every frame: never culled on stale bounds
}
function updateSpring(T, aArb, aDrum) {
  const pos = L.spring.geometry.attributes.position.array, n = 7, th = 0.9;
  for (let i = 0; i <= SP_N; i++) {
    const s = i / SP_N, rw = 6.2 + 15 * s, ru = 20 + 22.6 * s, r = lerp(ru, rw, T), a = aArb * (1 - s) + aDrum * s + s * n * TAU, c = Math.cos(a), si = Math.sin(a);
    const o = i * 12; [[r, -2.1], [r, -8.2], [r + th, -2.1], [r + th, -8.2]].forEach(([rr, z], j) => { pos[o + j * 3] = c * rr; pos[o + j * 3 + 1] = si * rr; pos[o + j * 3 + 2] = z; });
  }
  L.spring.geometry.attributes.position.needsUpdate = true; L.spring.geometry.computeVertexNormals();
}
const HS_N = 900;
function hairMesh() {
  const g = new THREE.BufferGeometry(), pos = new Float32Array((HS_N + 1) * 2 * 3), idx = [];
  for (let i = 0; i < HS_N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, M.hair); m.frustumCulled = false; return m;
}
function updateHair(beta) {
  const pos = L.hair.geometry.attributes.position.array;
  for (let i = 0; i <= HS_N; i++) { const s = i / HS_N, r = lerp(40, 190, s), a = -1.2 + s * 11 * TAU + beta * (1 - s);
    const x = Math.cos(a) * r, y = Math.sin(a) * r, o = i * 6; pos[o] = x; pos[o + 1] = y; pos[o + 2] = -10.4; pos[o + 3] = x; pos[o + 4] = y; pos[o + 5] = -11.3; }
  L.hair.geometry.attributes.position.needsUpdate = true; L.hair.geometry.computeVertexNormals();
}

// ------------------------------------------------------------------ mechanics in time
// playback speed of the balance: real 4 Hz, slowed to almost a standstill at the pallet, back to real speed at the balance
const SLOW = (t) => kf([[0, 1], [15.0, 1], [16.2, 0.012, 'out'], [20.3, 0.012], [21.6, 0.06, 'in'], [23.4, 1, 'inOut'], [30, 1]], t);
let PHI, ESCS;
function initMechanics() {
  const raw = integral((t) => TAU * 4 * SLOW(t));
  const tc = 18.45, phiC = raw(tc), k = Math.round(phiC / Math.PI) + 0.0;     // a beat lands at 18.45 s, in the slow motion
  PHI = (t) => raw(t) - phiC + k * Math.PI;
  ESCS = { A: 230 * D2R, bw: 32 * D2R, step: 12 * D2R, rRoll: 80, L: 510 };
  // rotor swing (rad) and the winding train it drives; barrel and train time-lapsed so whatever is in view turns
  ROTOR = (t) => kf([[0, -0.6], [1.4, 0.9], [2.9, -0.4], [4.6, 1.3], [6.4, 0.2], [8.5, 1.1], [24, 1.6], [25.6, 0.9], [30, 0.9]], t);
  const rotorRate = (t) => (ROTOR(t + 0.01) - ROTOR(t - 0.01)) / 0.02;
  WIND.aRV = integral((t) => (-rotorRate(t) * WIND.rw.N) / WIND.rv.N);                 // reverser input follows the rotor both ways
  WIND.aRVo = integral((t) => (Math.abs(rotorRate(t)) * WIND.rw.N) / WIND.rv.N);        // its output only ever turns one way
  const tl = (t) => kf([[0, 0.4], [9.5, 0.4], [10.6, 0.06], [12.0, 0.012], [13.4, 0.0016], [15.2, 0.0004], [24, 0.0004], [24.5, 0.0035], [30, 0.0035]], t);
  TRAINPHI = integral(tl);
  SPRING = (t) => kf([[0, 0.12], [6.5, 0.3], [9.8, 0.95, 'inOut'], [30, 0.9]], t);
}
let ROTOR, TRAINPHI, SPRING;
function escState(phi) {
  const { A, bw, step, rRoll, L: LL } = ESCS, beta = A * Math.sin(phi), alpha = (-rRoll / LL) * clamp(beta, -bw, bw);
  const w = Math.asin(bw / A), done = Math.floor((phi - w) / Math.PI), p = clamp((phi - ((done + 1) * Math.PI - w)) / (2 * w));
  const drop = p < 0.18 ? -0.12 * Math.sin((p / 0.18) * Math.PI) : E.out((p - 0.18) / 0.82);
  return { beta, alpha, esc: step * (done + drop), p, beat: done };
}
function pose(t) {
  // rotor and winding
  const rho = ROTOR(t); L.rotor.rotation.z = rho;
  WIND.rw.m.rotation.z = rho;
  WIND.rv.m.rotation.z = WIND.rv.ph + WIND.aRV(t); WIND.rv.pm.rotation.z = WIND.aRVo(t);
  const aRD = WIND.rd.ph - (WIND.aRVo(t) * WIND.rv.pN) / WIND.rd.N; WIND.rd.m.rotation.z = aRD; WIND.rd.pm.rotation.z = aRD;
  const aRT = WIND.rt.ph - ((aRD - WIND.rd.ph) * WIND.rd.pN) / WIND.rt.N; WIND.rt.m.rotation.z = aRT;
  // barrel, spring and train
  const PHIt = TRAINPHI(t);
  TR.forEach((a) => { a.group.rotation.z = a.phase + a.g * PHIt; });
  L.barrelArbor.rotation.z = aRT;
  updateSpring(SPRING(t), aRT * 6, TR[0].phase + PHIt);
  // escapement and balance
  const s = escState(PHI(t));
  L.escWheel.rotation.z = s.esc + ESC_PHASE;
  L.fork.rotation.z = s.alpha;
  L.balance.rotation.z = s.beta; updateHair(s.beta);
  // dial side: hands at 10:09:xx, seconds in 8 small steps a second
  const secs = 30 + Math.floor((t - 26.9) * 8) / 8, hh = 10 + 10 / 60;
  L.second.rotation.y = (secs / 60) * TAU; L.minute.rotation.y = ((10 + secs / 60 - 0.5) / 60) * TAU; L.hour.rotation.y = (hh / 12) * TAU;
  L.hourWheel.rotation.z = (hh / 12) * TAU; L.minWheel.rotation.z = -((9 + secs / 60) / 60) * TAU * 3;
  return s;
}

// ------------------------------------------------------------------ the journey
const toW = (p, h) => new THREE.Vector3(p.x, h, p.y);                 // plan point at height h -> world
const BW = () => ({ x: TR[0].x, y: TR[0].y });
let PATH;
function buildPath() {
  const B = BW(), C = TR[1], T = TR[2], F = TR[3], X = X0, P = L.P, BL = L.BL;
  const pl = (o, ang, r) => ({ x: o.x + Math.cos(ang * D2R) * r, y: o.y + Math.sin(ang * D2R) * r });
  const pal = macroToPlan(PALLETS[1][1][0], PALLETS[1][1][1] + 70);   // the exit pallet's tip
  const fe = macroToPlan(0, -440);                                       // fork end, at the impulse jewel
  // [time, camera position, look target, fov, aperture]
  const W3 = (x, h, z) => new THREE.Vector3(x, h, z);
  PATH = [
    // skim the rotor's gold rim, then over its Côtes de Genève, then dive past its edge into the open half
    [0.0, W3(150, 62, -125), W3(0, 16, 0), 50, 0.0004],
    [1.3, W3(60, 36, -92), W3(-24, 20, -22), 56, 0.0006],
    [2.5, W3(-40, 22.5, -50), toW(WIND.rv, 17), 62, 0.0008],
    // follow the winding wheels under the rotor to the ratchet
    [3.6, W3(-6, 22.5, -50), toW(WIND.rv, 17), 60, 0.0009],
    [4.8, W3(-40, 22, -76), toW(WIND.rd, 16), 60, 0.0009],
    [5.9, W3(-72, 24, -56), toW(B, 15), 58, 0.0008],
    // slow reveal over the barrel, then down into it as its lid falls away
    [6.9, W3(-50, 36, -10), toW(B, 8), 54, 0.0006],
    [7.8, toW(pl(B, 140, 30), 13), toW(B, 4), 62, 0.0008],
    [8.8, toW(pl(B, 70, 32), 9), toW(pl(B, 160, 8), 4), 62, 0.001],
    [9.8, toW(pl(B, -10, 32), 8), toW(pl(B, 60, 10), 4), 62, 0.001],
    // out over the wall and down through the centre wheel's open spokes into the train
    [10.5, toW(pl(B, -40, 42), 12), toW(C, 5), 62, 0.0009],
    [11.1, toW(pl(C, 200, 20), 10), toW(pl(C, 330, 26), 5), 62, 0.0009],
    [11.7, toW(pl(C, 330, 26), 4.0), toW(pl(T, 0, 10), 2.5), 66, 0.0008],
    [12.4, toW(pl(T, 160, 14), 2.3), toW(pl(T, 30, 20), 5), 66, 0.0008],
    [13.1, toW(pl(T, 30, 22), 5.4), toW(F, 6), 64, 0.0008],
    // rush to the escape wheel, then brake hard beside the exit pallet
    [13.9, toW(pl(F, 120, 26), 5.6), toW(X, 4.6), 62, 0.0009],
    [14.8, W3(62, 17, 16), toW(pal, 4.6), 50, 0.0012],
    [15.7, W3(45, 13, 29), toW(pal, 4.6), 44, 0.0018],
    [18.0, W3(40, 10.5, 33), toW(pal, 4.8), 42, 0.002],
    // the impulse runs up the lever to the balance
    [19.4, W3(34, 13, 46), toW(P, 5.8), 48, 0.0016],
    [20.6, toW(pl(fe, 290, 22), 15), toW(fe, 6), 52, 0.0012],
    // orbit the balance as it comes up to speed
    [22.0, toW(pl(BL, 240, 75), 22), toW(BL, 8), 52, 0.0009],
    [23.4, toW(pl(BL, 160, 72), 16), toW(BL, 8), 52, 0.0009],
    // pull back: the whole movement alive, then straight down through it, the dial, among the hands, out to the watch
    [24.5, W3(60, 120, 170), W3(0, 8, 0), 52, 0.0003],
    [25.5, W3(30, 190, 70), W3(0, 0, 0), 50, 0.0002],
    [26.2, W3(6, 30, 8), W3(0, -30, 0), 70, 0.0002],
    [26.9, W3(1, -13.5, 2), W3(0, -12, -60), 76, 0.0004],
    [28.0, W3(0, -130, 40), W3(0, 0, 0), 46, 0.0002],
    [29.3, W3(0, -760, 34), W3(0, 0, 0), 33, 0.0001],
    [30.0, W3(0, -800, 32), W3(0, 0, 0), 32, 0.0001],
  ];
}
// Catmull-Rom through keys at their own times (Hermite with finite-difference tangents)
function hermite(keys, t, get) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = clamp((t - k1[0]) / (k2[0] - k1[0])), dt = k2[0] - k1[0];
  const p0 = get(k0), p1 = get(k1), p2 = get(k2), p3 = get(k3);
  const m1 = p2.clone().sub(p0).multiplyScalar(dt / Math.max(1e-3, k2[0] - k0[0])), m2 = p3.clone().sub(p1).multiplyScalar(dt / Math.max(1e-3, k3[0] - k1[0]));
  if (i === 0) m1.copy(p2.clone().sub(p1)); if (i + 2 >= keys.length) m2.copy(p2.clone().sub(p1));
  const u2 = u * u, u3 = u2 * u;
  return p1.clone().multiplyScalar(2 * u3 - 3 * u2 + 1).add(m1.multiplyScalar(u3 - 2 * u2 + u)).add(p2.clone().multiplyScalar(-2 * u3 + 3 * u2)).add(m2.multiplyScalar(u3 - u2));
}
const num = (v) => new THREE.Vector3(v, 0, 0);
function shot(t) {
  const pos = hermite(PATH, t, (k) => k[1]), look = hermite(PATH, t, (k) => k[2]);
  const fov = hermite(PATH, t, (k) => num(k[3])).x, ap = Math.max(0.00002, 0.45 * hermite(PATH, t, (k) => num(k[4])).x);
  return { pos, look, fov, ap };
}
function placeCamera(t) {
  const s = shot(t);
  if (window.DEBUG_CAM) { const [p, l, f] = window.DEBUG_CAM; s.pos = new THREE.Vector3(...p); s.look = new THREE.Vector3(...l); s.fov = f || 50; s.ap = 0.00002; }
  camera.position.copy(s.pos);
  // below the dial we look up at it, 12 o'clock at the top of the frame
  camera.up.set(0, t > 26.4 ? 0 : 1, t > 26.4 ? -1 : 0);
  if (t > 26.0 && t <= 26.4) camera.up.set(0, lerp(1, 0, (t - 26) / 0.4), -lerp(0, 1, (t - 26) / 0.4)).normalize();
  camera.lookAt(s.look); camera.fov = s.fov; camera.updateProjectionMatrix();
  bokeh.uniforms.focus.value = s.pos.distanceTo(s.look); bokeh.uniforms.aperture.value = s.ap;
  L.camLight.position.copy(s.pos).add(new THREE.Vector3(0, 3, 0));
  return s;
}

// ------------------------------------------------------------------ energy: where the power is, lit as it passes
// contact points along the route, and when the energy reaches each one
function contacts() {
  const C = TR[1], T = TR[2], F = TR[3], B = BW(), X = X0;
  const mid = (A, Bp, ra) => { const d = Math.hypot(Bp.x - A.x, Bp.y - A.y); return { x: A.x + ((Bp.x - A.x) * ra) / d, y: A.y + ((Bp.y - A.y) * ra) / d }; };
  const pal = macroToPlan(PALLETS[1][1][0], PALLETS[1][1][1] + 70), fe = macroToPlan(0, -440);
  return [
    [2.6, toW(mid(WIND.rw, WIND.rv, 12), 17.8)], [3.6, toW(mid(WIND.rv, WIND.rd, 6.4), 15.4)], [4.8, toW(mid(WIND.rd, B, 6.4 + 0), 14.6)],
    [5.9, toW(mid(B, WIND.rd, 28.8), 15.0)], [10.4, toW(mid(B, C, 48), 2.2)], [11.4, toW(mid(C, T, 41.6), 5.6)], [12.2, toW(mid(T, F, 35.2), 3.8)],
    [13.2, toW(mid(F, X, 32), 6.9)], [18.45, toW(pal, 4.8)], [19.3, toW(fe, 5.8)], [20.0, toW(L.BL, 8.5)],
  ];
}
let CONTACTS;
function energy(t) {
  // each contact flares when the energy arrives, then keeps a low steady glow while the power flows; in the finale
  // a pulse runs along the whole route again
  const vals = CONTACTS.map(([ta], i) => {
    const a = t - ta, flare = a < 0 ? 0 : Math.exp(-a / 1.1) * clamp(a / 0.15), steady = a < 0 ? 0 : 0.22 * clamp(a / 0.6);
    const fin = t > 24.3 && t < 26.2 ? Math.exp(-Math.pow((t - 24.4 - i * 0.12) / 0.18, 2)) : 0;
    return Math.min(1.4, flare + steady + fin);
  });
  CONTACTS.forEach(([, p], i) => { const g = L.glints[i]; g.position.copy(p); g.material.opacity = 0.75 * Math.min(1, vals[i]);
    const d = camera.position.distanceTo(p), sc = (1.0 + 2.2 * vals[i]) * clamp(d / 30, 0.15, 1); g.scale.set(sc, sc, 1); g.material.opacity *= 0.55 * clamp((d - 2) / 6); });
  // the three lights go to the three brightest contacts and light the metal around them
  const order = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
  order.forEach(([v, i], j) => { L.elights[j].position.copy(CONTACTS[i][1]).add(new THREE.Vector3(0, 2.5, 0)); L.elights[j].intensity = 45 * v; });
  // spring and escape wheel warm up as they carry the energy
  M.spring.emissive = new THREE.Color(0xff9a3a); M.spring.emissiveIntensity = clamp((t - 7.6) / 2.2) * 0.045 * (t < 11 ? 1 : 0.4);
  return vals;
}

// ------------------------------------------------------------------ the exterior: the reference photograph, unaltered
// The film opens and closes on the actual watch image (assets/exterior.png, 1451x2160, dial centred at 725,1080, radius
// about 216 px). It is only scaled and moved, never redrawn: in at the start, through the dial into the movement; out
// through the dial at the end, back to the whole watch.
const EXT = new Image(), EXT_C = [725, 1080.5], EXT_FIT = 1080 / 1451;
function exterior(t) {
  let a = 0, k = 1, blur = 0;
  if (t < 2.0) { a = 1 - clamp((t - 1.45) / 0.45); k = kf([[0, 1.0], [1.1, 1.32, 'sine'], [1.95, 7.5, 'in']], t); blur = clamp((t - 1.15) / 0.6); }
  else if (t > 26.65) { a = clamp((t - 26.65) / 0.45); k = kf([[26.65, 3.4], [29.4, 1.1, 'out'], [30, 1.07]], t); blur = clamp((27.05 - t) / 0.4) * 0.6; }
  if (a <= 0 || !EXT.width) return;
  const draw = (kk, al) => { const sc = EXT_FIT * kk; octx.globalAlpha = al; octx.drawImage(EXT, W / 2 - EXT_C[0] * sc, H / 2 - EXT_C[1] * sc, EXT.width * sc, EXT.height * sc); };
  octx.save(); octx.globalAlpha = a; octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H);
  // a zoom through the dial: a few scaled copies smear outwards like a fast push
  const n = blur > 0.05 ? 5 : 1;
  for (let i = 0; i < n; i++) draw(k * (1 + blur * 0.06 * i), a * (i === 0 ? 1 : 0.35 / n));
  // the photograph ends where its frame cuts the bracelet: let it fall off into black instead of a hard edge
  const top = H / 2 - EXT_C[1] * EXT_FIT * k, bot = top + EXT.height * EXT_FIT * k;
  [[top, 1], [bot, -1]].forEach(([y, d]) => { if ((d > 0 && y < -260) || (d < 0 && y > H + 260)) return;
    const g = octx.createLinearGradient(0, y, 0, y + d * 260); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    octx.globalAlpha = a; octx.fillStyle = g; octx.fillRect(0, Math.min(y, y + d * 260) - (d > 0 ? 400 : 0), W, 260 + 400); });
  octx.restore();
}
let ready = false;
const words = [['CAPTURE', 1.9, 3.5], ['STORE', 8.2, 9.8], ['TRANSFER', 11.3, 12.8], ['REGULATE', 18.9, 20.6]];
function overlay(t) {
  // grade: vignette, a little grain, the few words
  const vg = octx.createRadialGradient(W / 2, H * 0.48, W * 0.3, W / 2, H / 2, H * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.62)');
  octx.fillStyle = vg; octx.fillRect(0, 0, W, H);
  const txt = (s, y, a, size, ls) => { if (a <= 0) return; octx.save(); octx.globalAlpha = a; octx.font = `800 ${size}px "Inter Tight"`; octx.letterSpacing = ls + 'px'; octx.textAlign = 'center';
    octx.shadowColor = 'rgba(0,0,0,.8)'; octx.shadowBlur = 30; octx.fillStyle = '#f4efe4'; octx.fillText(s, W / 2 + ls / 2, y); octx.restore(); };
  words.forEach(([w, a, b]) => txt(w, 1580, win(t, a, b, 0.35, 0.4), 46, 22));
  exterior(t);
  const endA = win(t, 28.2, 31, 0.7, 0.1);
  if (endA > 0) { const g = octx.createLinearGradient(0, H - 420, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,.82)'); g.addColorStop(1, 'rgba(0,0,0,.95)'); octx.save(); octx.globalAlpha = endA; octx.fillStyle = g; octx.fillRect(0, H - 420, W, 420); octx.restore(); }
  txt('MOTION BECOMES TIME.', 1800, endA, 50, 14);
  const fin = clamp(t / 0.5) * clamp((DUR - t) / 0.2);
  if (fin < 1) { octx.fillStyle = `rgba(0,0,0,${1 - fin})`; octx.fillRect(0, 0, W, H); }
}
function renderAt(t) {
  pose(t); placeCamera(t); energy(t);
  // fade the lid, ratchet and barrel bridge as the camera goes into the barrel
  const inside = win(t, 6.9, 10.6, 0.6, 0.4);
  M.lid.opacity = 1 - inside; L.lid.visible = M.lid.opacity > 0.02; M.ratchet.opacity = 1 - inside; WIND.rt.m.visible = M.ratchet.opacity > 0.02; L.bridges[0].material = inside > 0.02 ? M.bridgeFade : M.bridge; M.bridgeFade.forEach((m) => (m.opacity = 1 - inside));
  L.dust.position.y = Math.sin(t * 0.3) * 0.6;
  L.barrelLight.intensity = 20 * inside;
  const under = clamp((t - 26.0) / 0.8); L.dialKey.intensity = 3.2 * under; L.dialFill.intensity = 1.0 * under; L.dialSpot.intensity = 5200 * under;
  scene.environmentIntensity = 1.15 * (1 - 0.45 * win(t, 24.7, 26.0, 0.4, 0.3)) + 0.5 * under;   // the top-down view is not blown out; the watch gets more light
  L.barrelLight.position.set(-44, 14, -32);
  scene.fog.density = 0.0026 * (1 - under);
  L.key.intensity = 1.25 * (1 - 0.6 * win(t, 24.6, 26.0, 0.5, 0.3)) * (1 - under);
  L.shafts.forEach((s, i) => (s.material.uniforms.k.value = 0.04 + 0.02 * Math.sin(t * 0.7 + i)));
  composer.render();
}
window.render = function (t, sub = 0) {
  t = clamp(t, 0, DUR - 1e-4);
  // motion blur: average a few moments inside the shutter when the camera moves fast
  const dt = 1 / 60, a = shot(Math.max(0, t - dt)), b = shot(Math.min(DUR - 1e-3, t + dt));
  const speed = a.pos.distanceTo(b.pos) / Math.max(4, b.pos.distanceTo(b.look)) * 30;
  const n = sub || Math.min(3, Math.max(1, Math.round(speed * 1.2)));
  octx.globalCompositeOperation = 'source-over'; octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  for (let i = 0; i < n; i++) { renderAt(t + (n > 1 ? (i / (n - 1) - 0.5) / 60 : 0)); octx.globalAlpha = 1 / (i + 1); octx.drawImage(renderer.domElement, 0, 0, W, H); }
  octx.globalAlpha = 1; overlay(t);
  return n;
};
window.ready = (async () => {
  await new Promise((r) => { EXT.onload = r; EXT.onerror = r; EXT.src = './assets/exterior.png'; });
  await Promise.all([['Inter Tight', 'inter-tight-latin-800-normal.woff2', '800']].map(([f, file, w]) => new FontFace(f, `url(../../.claude/skills/paper-story/assets/fonts/${file})`, { weight: w }).load().then((ff) => document.fonts.add(ff))));
  M.bridgeFade = M.bridge.map((m) => { const c = m.clone(); c.transparent = true; return c; });
  build(); buildPath(); CONTACTS = contacts();
  CONTACTS.forEach(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(sp); L.glints.push(sp); });
  renderer.domElement.style.display = 'none'; document.body.appendChild(renderer.domElement);
  ready = true; return true;
})();
window.blurPlan = () => { const o = []; for (let f = 0; f < 900; f++) { const t = f / 30, dt = 1 / 60, a = shot(Math.max(0, t - dt)), b = shot(Math.min(DUR - 1e-3, t + dt)); const sp = a.pos.distanceTo(b.pos) / Math.max(4, b.pos.distanceTo(b.look)) * 30; o.push(Math.min(3, Math.max(1, Math.round(sp * 1.2)))); } return o; };
window.where2 = () => { scene.updateMatrixWorld(true); const w = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]; }; const bb = (o) => { const b = new THREE.Box3().setFromObject(o); return [b.min.toArray().map((x) => +x.toFixed(1)), b.max.toArray().map((x) => +x.toFixed(1))]; }; return { pallets: L.pallets.map(bb), esc: bb(L.escWheel), fork: bb(L.fork), balance: bb(L.balance) }; };
window.where = () => ({ BL: L.BL, P: L.P, X: X0, B: BW(), pal: macroToPlan(PALLETS[1][1][0], PALLETS[1][1][1] + 70), C: TR[1], T: TR[2], F: TR[3] });
window.events = function () {
  const ev = []; let last = escState(PHI(0)).beat;
  for (let t = 0; t < DUR; t += 1 / 600) { const s = escState(PHI(t)); if (s.beat !== last) { ev.push({ t: +t.toFixed(3), name: s.beat % 2 ? 'tick' : 'tock', gain: t > 16 && t < 21 ? 0 : -16 }); last = s.beat; } }
  let lr = 0; for (let t = 2.5; t < 7; t += 1 / 600) { const k = Math.floor(WIND.rt.m ? (WIND.aRVo(t) * 8 / 30 * 8 / 36) / (TAU / 36) : 0); if (k !== lr) { ev.push({ t: +t.toFixed(3), name: 'click', gain: -10 }); lr = k; } }
  return ev;
};

// cover: the exit pallet in the slow motion, with the line
window.cover = function () {
  window.render(16.4, 1);
  const g = octx.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(3,4,5,0)'); g.addColorStop(0.45, 'rgba(3,4,5,.75)'); g.addColorStop(1, 'rgba(3,4,5,.92)');
  octx.fillStyle = g; octx.fillRect(0, H * 0.55, W, H * 0.45);
  const line = (s, y, size, ls, col) => { octx.save(); octx.font = `800 ${size}px "Inter Tight"`; octx.letterSpacing = ls + 'px'; octx.textAlign = 'center'; octx.fillStyle = col; octx.shadowColor = 'rgba(0,0,0,.8)'; octx.shadowBlur = 30; octx.fillText(s, W / 2 + ls / 2, y); octx.restore(); };
  line('INSIDE AN AUTOMATIC MOVEMENT', 1560, 30, 10, '#e9c27a');
  line('MOTION BECOMES TIME.', 1660, 64, 12, '#f4efe4');
};
