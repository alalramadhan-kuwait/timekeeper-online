import Phaser from 'phaser';
import { DOCK_AT } from '../model';
import { DOCK_PLAN, markOf, shortName, type DockBay, type DockData } from '../dock/data';
import { FloorBatch } from './FloorBatch';
import { depthAt, iso } from './iso';
import type { WorldScene } from './WorldScene';

/* The Loading Dock on the Dock tab, as approved in the v3 design: supplier bays in rows of four
   with the main aisle in front, receiving by the yard door and payments in the corner nearest
   the office.

   One bay per supplier with open orders, the largest outstanding value first. Its rack's lower
   deck holds one carton per order (open once part of it has come in), at most three, all the
   same size: the size of a carton says nothing. The top deck holds the dock's own storage totes,
   which are equipment, not stock. A bay with something to review has an amber beacon. Each bay
   carries a small tag with its number and one dot; the supplier's name shows on the selected one.
   Nothing here moves to suggest a shipment: no record says where one is. */

const { W, MAIN, SOUTH, DEPTH } = DOCK_PLAN;
const OUT = 0x141c2c;
const LABEL_DEPTH = 1_000_000;
type Pt = { x: number; y: number };

/* A plan point (x, y) at height z, in world units. */
const P = (x: number, y: number, z = 0): Pt => { const p = iso(DOCK_AT.x + x, DOCK_AT.y + y); return { x: p.x, y: p.y - z }; };
const D = (x: number, y: number, bias = 0) => depthAt(DOCK_AT.x + x, DOCK_AT.y + y, bias);

/* The parts of the dock a camera frames, in plan cells. */
export const DOCK_AREAS = {
  orders: { x0: 0, y0: 0, x1: W, y1: MAIN + 2 },
  recv: { x0: 6, y0: SOUTH, x1: W + 3, y1: DEPTH },
  pay: { x0: 0, y0: SOUTH, x1: 6, y1: DEPTH },
} as const;
export type DockArea = keyof typeof DOCK_AREAS;
/* How far the camera may go round the dock, in world units: the paved ground and the roof. */
export const DOCK_BOUNDS = (() => {
  const a = P(-3, DEPTH + 2), b = P(W + 4, -1), c = P(-1, -1), d = P(W + 4, DEPTH + 2);
  return { x: a.x, y: c.y - 300, w: b.x - a.x, h: d.y - (c.y - 300) };
})();
/* Where a sheet about a bay or a station keeps the camera pointed. */
export const bayFocus = (b: { x: number; y: number }) => P(b.x + 1, b.y + 1, 40);
export const AREA_FOCUS = { recv: P(8.5, SOUTH + 2), pay: P(2.4, SOUTH + 2.6) };

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function poly(g: Phaser.GameObjects.Graphics, pts: Pt[], fill: number, alpha = 1, sw = 1.6) {
  g.fillStyle(fill, alpha).fillPoints(pts as Phaser.Math.Vector2[], true);
  if (sw > 0) g.lineStyle(sw, OUT, 1).strokePoints(pts as Phaser.Math.Vector2[], true, true);
}
function prism(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, d: number, z0: number, h: number,
  top: number, left: number, right: number, sw = 1.6) {
  poly(g, [P(x, y + d, z0 + h), P(x + w, y + d, z0 + h), P(x + w, y + d, z0), P(x, y + d, z0)], left, 1, sw);
  poly(g, [P(x + w, y, z0 + h), P(x + w, y + d, z0 + h), P(x + w, y + d, z0), P(x + w, y, z0)], right, 1, sw);
  poly(g, [P(x, y, z0 + h), P(x + w, y, z0 + h), P(x + w, y + d, z0 + h), P(x, y + d, z0 + h)], top, 1, sw);
}
const upright = (g: Phaser.GameObjects.Graphics, x: number, y: number, h: number) => prism(g, x, y, 0.08, 0.08, 0, h, 0x3b4a68, 0x22304d, 0x1b2740, 1.3);
const tote = (g: Phaser.GameObjects.Graphics, x: number, y: number, z: number) => {
  prism(g, x, y, 0.5, 0.42, z, 26, 0x33425f, 0x22304d, 0x1b2740, 1.3);
  prism(g, x + 0.12, y + 0.42, 0.26, 0.01, z + 9, 8, 0xe5c06a, 0xe5c06a, 0xcba454, 0.8);
};
const TOTES = [[0.1, 0.75, 1.4], [0.1, 0.75], [0.75, 1.4], [0.1]];

interface Carton { u: number; level: 0 | 1; key: string; scale: number }

/* A bay's tag: its number, one dot, and the supplier's name when chosen. Drawn in CSS pixels and
   scaled so it stays the same size on screen whatever the zoom. */
class BayTag {
  c: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private num: Phaser.GameObjects.Text;
  private nm: Phaser.GameObjects.Text;
  selected = false;
  hang = 6;
  w = 0; h = 22;
  shiftX = 0;                   // CSS px the tag slides sideways to stay on screen

  constructor(private scene: WorldScene, public bay: DockBay, public at: Pt, dpr: number) {
    const font = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif';
    this.bg = scene.add.graphics();
    this.num = scene.add.text(0, 0, String(bay.no).padStart(2, '0'), { fontFamily: font, fontSize: '12px', fontStyle: '800', color: '#17233b', resolution: dpr }).setOrigin(0, 0.5);
    const name = bay.suppliers.map((s) => shortName(s.name)).join(' · ');
    this.nm = scene.add.text(0, 0, name, { fontFamily: font, fontSize: '12.5px', fontStyle: '600', color: '#ffffff', resolution: dpr }).setOrigin(0, 0.5).setVisible(false);
    this.c = scene.add.container(at.x, at.y, [this.bg, this.num, this.nm]).setDepth(LABEL_DEPTH);
    this.c.setData('sel', { type: 'bay', no: bay.no });
    this.draw();
  }

  setSelected(on: boolean) { if (on !== this.selected) { this.selected = on; this.draw(); } }
  setHang(px: number) { if (px !== this.hang) { this.hang = px; this.draw(); } }

  private draw() {
    const sel = this.selected, mark = this.bay.mark;
    const h = sel ? 28 : 22, padX = sel ? 9 : 6, gap = 4, dot = mark === 'wait' ? 0 : 8;
    this.num.setFontSize(sel ? 12.5 : 12).setColor(sel ? '#ffffff' : '#17233b');
    this.nm.setVisible(sel);
    const nw = this.num.width, mw = sel ? this.nm.width + 2 : 0;
    // at least 28 px wide, so with its margins the tap area is never under 44 px
    const w = Math.max(28, padX + nw + (dot ? gap + dot : 0) + (sel ? gap + mw : 0) + padX);
    this.w = w; this.h = h;
    const top = -this.hang - h, left = -w / 2;
    const g = this.bg.clear();
    // the hanger down to the rack
    g.fillStyle(0xb8893b, 1).fillRect(-1, -this.hang, 2, this.hang);
    if (sel) g.fillStyle(0xf6d58b, 0.45).fillRoundedRect(left - 3, top - 3, w + 6, h + 6, 9);
    g.fillStyle(0x000000, 0.22).fillRoundedRect(left, top + 2, w, h, 6);
    g.fillStyle(sel ? 0x22304d : 0xfbf7ee, 1).fillRoundedRect(left, top, w, h, 6);
    g.lineStyle(1.5, sel ? 0xf6d58b : 0xb8893b, 1).strokeRoundedRect(left, top, w, h, 6);
    let x = left + padX;
    this.num.setPosition(x, top + h / 2); x += nw;
    if (dot) {
      const cx = x + gap + dot / 2, cy = top + h / 2;
      if (mark === 'review') { g.fillStyle(0xe8962a, 0.3).fillCircle(cx, cy, 6); g.fillStyle(0xe8962a, 1).fillCircle(cx, cy, 4); }
      else { g.fillStyle(0xc9cfdb, 1).fillCircle(cx, cy, 4); g.fillStyle(0xb8893b, 1).beginPath().slice(cx, cy, 4, -Math.PI / 2, Math.PI / 2, false).fillPath(); }
      x += gap + dot;
    }
    if (sel) this.nm.setPosition(x + gap + 2, top + h / 2);
    // the tap area reaches 8 px beyond the sides and 11 px above and below (44 px tall at rest)
    const hit = new Phaser.Geom.Rectangle(left - 8, top - 11, w + 16, h + 22);
    if (!this.c) return;
    if (this.c.input) this.c.input.hitArea = hit;
    else { this.c.setInteractive(hit, Phaser.Geom.Rectangle.Contains); this.c.input!.cursor = 'pointer'; }
  }

  destroy() { this.c.destroy(); }
}

export class DockLayer {
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private tags: BayTag[] = [];
  private paint: Phaser.Textures.CanvasTexture | null = null;
  private paintImg: Phaser.GameObjects.Image | null = null;
  private selectedBay: number | null = null;
  private shown = false;
  data: DockData | null = null;

  constructor(private s: WorldScene) {}

  /* ── what never changes ─────────────────────────────────────────────── */

  drawStatic() {
    const s = this.s;
    this.drawGroundCanvas();
    // floors: concrete, the payments corner in parquet, a hazard strip along the yard door
    const floor = new FloorBatch(s, -1e6);
    for (let x = 0; x < W; x++) for (let y = 0; y < DEPTH; y++) {
      const pay = y >= SOUTH && x <= 4, door = x === W - 1 && y >= SOUTH;
      const p = P(x, y);
      floor.add(pay ? 'tile-parquet' : door ? 'tile-hazard' : 'tile-concrete', p.x, p.y);
    }
    // the corridor from the Watch Mall, in marble
    for (let x = -2; x < 0; x++) for (let y = MAIN; y < MAIN + 2; y++) { const p = P(x, y); floor.add('tile-marble-a', p.x, p.y); }
    floor.draw();

    // the building: its roof edge, cut away, behind the back walls (open over the doorway)
    const roof = s.add.graphics().setDepth(-8e5);
    const RH = 104, T = 1.4;
    prism(roof, -T, -T, W + T, T, 0, RH, 0x2c3448, 0x232a3b, 0x1d2333);
    prism(roof, -T, 0, T, MAIN, 0, RH, 0x2c3448, 0x232a3b, 0x1d2333);
    prism(roof, -T, MAIN + 2, T, DEPTH - MAIN - 2, 0, RH, 0x2c3448, 0x232a3b, 0x1d2333);
    roof.lineStyle(5, 0xcba454, 1).lineBetween(P(-T, DEPTH, RH).x, P(-T, DEPTH, RH).y, P(0, DEPTH, RH).x, P(0, DEPTH, RH).y);
    roof.lineStyle(3, 0xcba454, 0.6).lineBetween(P(0, -T, RH).x, P(0, -T, RH).y, P(W, -T, RH).x, P(W, -T, RH).y);

    // the walls: the World's dock walls along the back and the west side, open onto the corridor
    const wall = (key: string, x: number, y: number) => { const p = P(x, y); s.fit(s.add.image(p.x, p.y, key), key).setDepth(D(x, y, -2)); };
    for (let x = 0; x < W; x++) wall('wall-dock-r', x, 0);
    for (let y = 0; y < DEPTH; y++) if (y < MAIN || y >= MAIN + 2) wall('wall-dock-l', 0, y);
    { const p = P(5.5, 0, 170); s.fit(s.add.image(p.x, p.y, 'sign-dock'), 'sign-dock', 0.95).setDepth(D(5.5, 0, -1)); }
    // lamps on the back wall
    const lamps = s.add.graphics().setDepth(D(W, 0, -1));
    for (const x of [1.5, 5.5, 9.5]) {
      const p = P(x, 0, 205);
      lamps.fillStyle(0x22304d, 1).fillRoundedRect(p.x - 20, p.y - 6, 40, 10, 3).lineStyle(1.5, OUT, 1).strokeRoundedRect(p.x - 20, p.y - 6, 40, 10, 3);
      lamps.fillStyle(0xfff3c6, 1).fillEllipse(p.x, p.y + 6, 32, 10);
    }
    // the clock on the payments wall, palms by the corridor
    { const p = P(0, SOUTH + 1.6, 120); s.fit(s.add.image(p.x, p.y, 'wall-clock'), 'wall-clock', 0.85).setDepth(D(0, SOUTH + 1.5, -1)); }
    for (const y of [MAIN - 0.6, MAIN + 2.9]) { const p = P(-1.4, y); s.fit(s.add.image(p.x, p.y, 'palm'), 'palm').setDepth(D(-1.4, y)); }

    // the door frame on the east side, open onto the yard
    const door = s.add.graphics().setDepth(D(W, DEPTH, 0.5));
    const z = 210;
    prism(door, W - 0.1, DEPTH - 0.14, 0.14, 0.14, 0, z, 0x3b4a68, 0x22304d, 0x1b2740, 1.4);
    const back = s.add.graphics().setDepth(D(W, SOUTH, 0.5));
    prism(back, W - 0.1, SOUTH, 0.14, 0.14, 0, z, 0x3b4a68, 0x22304d, 0x1b2740, 1.4);
    prism(back, W - 0.1, SOUTH, 0.14, DEPTH - SOUTH, z, 26, 0xe5c06a, 0xcba454, 0xa8853f, 1.4);
    // two trolleys parked out of the way
    this.trolley(W - 1.6, 2.9);
    this.trolley(9.2, DEPTH - 1.2);
    // payments: an accounts desk and a filing cabinet; no money is drawn
    const cab = P(1.05, SOUTH + 1.05), desk = P(3.2, SOUTH + 3), plant = P(4.6, DEPTH - 0.3);
    const files = s.fit(s.add.image(cab.x, cab.y, 'file-cabinet'), 'file-cabinet').setDepth(D(1.05, SOUTH + 1.05));
    const deskImg = s.fit(s.add.image(desk.x, desk.y, 'desk'), 'desk').setDepth(D(3.2, SOUTH + 3));
    s.fit(s.add.image(plant.x, plant.y, 'plant'), 'plant', 0.9).setDepth(D(4.6, DEPTH - 0.3));
    for (const o of [files, deskImg]) {
      o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
      s.tag(o, { type: 'dock-area', area: 'pay' }, 0);
    }
    // receiving: the inspection table by the door
    const table = s.add.graphics().setDepth(D(10, SOUTH + 2));
    this.inspection(table, 8, SOUTH + 1);
    this.hit(table, [P(8, SOUTH + 1, 200), P(10, SOUTH + 1, 200), P(10, SOUTH + 2, 0), P(8, SOUTH + 2, 0), P(8, SOUTH + 2, 100)], { type: 'dock-area', area: 'recv' });
  }

  private hit(g: Phaser.GameObjects.Graphics, pts: Pt[], sel: object) {
    g.setInteractive(new Phaser.Geom.Polygon(pts.map((p) => [p.x, p.y]).flat()), Phaser.Geom.Polygon.Contains);
    if (g.input) g.input.cursor = 'pointer';
    g.setData('sel', sel); g.setData('ringDy', 0);
  }

  private trolley(x: number, y: number) {
    const g = this.s.add.graphics().setDepth(D(x + 1, y + 0.6));
    prism(g, x, y, 1, 0.6, 14, 8, 0x3b4a68, 0x22304d, 0x1b2740, 1.3);
    prism(g, x + 0.92, y, 0.06, 0.6, 22, 60, 0xcba454, 0xa8853f, 0x8a6b30, 1.2);
    for (const [a, c] of [[0.1, 0.1], [0.8, 0.1], [0.1, 0.5], [0.8, 0.5]]) {
      const p = P(x + a, y + c, 4);
      g.fillStyle(0x1b2740, 1).fillCircle(p.x, p.y, 7).lineStyle(1.2, OUT, 1).strokeCircle(p.x, p.y, 7);
    }
    return g;
  }

  private inspection(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    for (const [a, c] of [[0.05, 0.05], [1.87, 0.05], [0.05, 0.87], [1.87, 0.87]]) prism(g, x + a, y + c, 0.08, 0.08, 0, 78, 0xcfd6df, 0x9aa5b4, 0x8792a2, 1.2);
    prism(g, x, y, 2, 1, 78, 9, 0xdfe4ea, 0xaeb8c6, 0x9aa5b4);
    prism(g, x + 1.35, y + 0.25, 0.45, 0.45, 87, 10, 0x22304d, 0x17233b, 0x101828, 1.2);   // scale
    prism(g, x + 0.25, y + 0.3, 0.55, 0.38, 87, 4, 0x2b3650, 0x22304d, 0x1b2740, 1.2);     // tablet
    const l = P(x + 0.15, y + 0.15, 87), h = P(x + 0.7, y + 0.5, 190);
    g.lineStyle(5, 0x22304d, 1).beginPath().moveTo(l.x, l.y).lineTo(l.x, h.y + 10).lineTo(h.x, h.y).strokePath();
    g.fillStyle(0x22304d, 1).fillEllipse(h.x, h.y + 6, 36, 14).lineStyle(1.2, OUT, 1).strokeEllipse(h.x, h.y + 6, 36, 14);
    g.fillStyle(0xfff3c6, 1).fillEllipse(h.x, h.y + 9, 24, 8);
  }

  /* A rack, 2 cells wide and 0.9 deep, drawn back to front so the cartons sit between the uprights. */
  private rack(x: number, y: number, cartons: Carton[], opts: { totes?: boolean; variant?: number; beacon?: boolean }) {
    const s = this.s, w = 2, d = 0.9, h = 132, lo = 12, hi = 74, base = D(x + w, y + 1);
    const back = s.add.graphics().setDepth(base);
    upright(back, x, y, h); upright(back, x + w - 0.08, y, h);
    prism(back, x, y, w, d, lo, 8, 0xc8955f, 0xa6713f, 0x8a5a33, 1.3);
    this.dyn.push(back);
    const box = (c: Carton, z: number, bias: number) => {
      const p = P(x + c.u + 0.4, y + 0.82, z);
      this.dyn.push(s.fit(s.add.image(p.x, p.y, c.key), c.key, c.scale).setDepth(base + bias));
    };
    cartons.filter((c) => c.level === 0).forEach((c) => box(c, lo + 8, 0.1));
    const mid = s.add.graphics().setDepth(base + 0.2);
    prism(mid, x, y + d - 0.05, w, 0.05, lo + 8, 6, 0xe5c06a, 0xcba454, 0xa8853f, 1.2);
    prism(mid, x, y, w, d, hi, 8, 0xc8955f, 0xa6713f, 0x8a5a33, 1.3);
    if (opts.totes !== false) for (const u of TOTES[(opts.variant ?? 0) % 4]) tote(mid, x + u, y + 0.25, hi + 8);
    this.dyn.push(mid);
    cartons.filter((c) => c.level === 1).forEach((c) => box(c, hi + 8, 0.3));
    const front = s.add.graphics().setDepth(base + 0.4);
    prism(front, x, y + d - 0.05, w, 0.05, hi + 8, 6, 0xe5c06a, 0xcba454, 0xa8853f, 1.2);
    upright(front, x, y + d - 0.08, h); upright(front, x + w - 0.08, y + d - 0.08, h);
    this.dyn.push(front);
    if (opts.beacon) {
      const b = P(x + 1.96, y + 0.86, 140);
      const glow = s.add.image(b.x, b.y, 'dock-glow').setDepth(base + 0.5).setDisplaySize(52, 52);
      const g = s.add.graphics().setDepth(base + 0.6);
      g.fillStyle(0xf5a524, 1).fillEllipse(b.x, b.y, 16, 18).lineStyle(1.6, OUT, 1).strokeEllipse(b.x, b.y, 16, 18);
      g.fillStyle(0xffe2a6, 1).fillEllipse(b.x - 2, b.y - 3, 5, 6);
      this.dyn.push(glow, g);
      if (!s.reducedMotion) s.tweens.add({ targets: glow, alpha: { from: 1, to: 0.35 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return front;
  }

  private bench(x: number, y: number) {
    const g = this.s.add.graphics().setDepth(D(x + 2, y + 1));
    for (const [a, c] of [[0.05, 0.05], [1.87, 0.05], [0.05, 0.77], [1.87, 0.77]]) prism(g, x + a, y + c, 0.08, 0.08, 0, 70, 0x3b4a68, 0x22304d, 0x1b2740, 1.2);
    prism(g, x, y, 2, 0.9, 70, 10, 0xc8955f, 0xa6713f, 0x8a5a33);
    prism(g, x + 0.2, y + 0.2, 0.5, 0.35, 80, 12, 0xefe6d3, 0xd8cdb7, 0xc9bea8, 1.2);
    prism(g, x + 1.2, y + 0.25, 0.25, 0.25, 80, 10, 0xcba454, 0xa8853f, 0x8a6b30, 1.2);
    this.dyn.push(g);
  }

  /* ── what follows the records ───────────────────────────────────────── */

  build(d: DockData | null) {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    for (const t of this.tags) t.destroy();
    this.tags = [];
    this.data = d;
    this.ensureTextures();
    const bays = d?.bays ?? [];
    for (let i = 0; i < 16; i++) {
      const b = bays[i], at = DOCK_PLAN.bay(i);
      if (!b) { this.bench(at.x, at.y + 0.2); continue; }
      const cartons: Carton[] = [];
      const halves = b.suppliers.length;
      b.suppliers.forEach((sp, k) => {
        const slots = halves === 1 ? [0.02, 0.62, 1.22] : [0.02 + k, 0.5 + k];
        sp.pos.slice(0, slots.length).forEach((p, j) => cartons.push({
          u: slots[j], level: 0, scale: halves === 1 ? 0.66 : 0.6,
          key: p.received > 0 && p.received < p.ordered ? 'box-open' : 'box-sealed',
        }));
      });
      const front = this.rack(b.x, b.y, cartons, { variant: (b.no * 7) % 4, beacon: b.suppliers.some((sp) => markOf(sp.pos) === 'review') });
      this.hit(front, [P(b.x, b.y, 150), P(b.x + 2, b.y, 150), P(b.x + 2, b.y + 2), P(b.x, b.y + 2), P(b.x, b.y + 0.9, 150)], { type: 'bay', no: b.no });
      this.tags.push(new BayTag(this.s, b, P(b.x + 1, b.y + 0.45, 146), this.s.dpr));
    }
    // the part-received rack: one open carton per order with part still to come (up to six)
    const parts: Carton[] = (d?.partial ?? []).slice(0, 6).map((_, i) => ({ u: [0.02, 0.62, 1.22][i % 3], level: (i < 3 ? 0 : 1) as 0 | 1, key: 'box-open', scale: 0.66 }));
    const pr = this.rack(6, DEPTH - 2, parts, { totes: false });
    this.hit(pr, [P(6, DEPTH - 2, 150), P(8, DEPTH - 2, 150), P(8, DEPTH), P(6, DEPTH), P(6, DEPTH - 1.1, 150)], { type: 'dock-area', area: 'partial' });
    this.board(d);
    this.drawPaint(d);
    this.tags.forEach((t) => t.setSelected(t.bay.no === this.selectedBay));
    this.setShown(this.shown);
  }

  /* The receiving history board: one pin per receipt on record, solid for Lightspeed's own time,
     hollow for when our sync first saw it. */
  private board(d: DockData | null) {
    const s = this.s, b = P(6.9, SOUTH + 0.6), w = 150, h = 92, top = b.y - 170;
    const g = s.add.graphics().setDepth(D(7.6, SOUTH + 0.8));
    g.lineStyle(6, 0x6e4630, 1).lineBetween(b.x - 55, top + h, b.x - 60, b.y).lineBetween(b.x + 55, top + h, b.x + 60, b.y);
    g.fillStyle(0x17233b, 1).fillRoundedRect(b.x - w / 2, top, w, h, 8).lineStyle(4, 0xcba454, 1).strokeRoundedRect(b.x - w / 2, top, w, h, 8);
    g.fillStyle(0x22304d, 1).fillRoundedRect(b.x - w / 2 + 8, top + 8, w - 16, 14, 3);
    g.fillStyle(0xcba454, 1).fillRoundedRect(b.x - w / 2 + 14, top + 12, 52, 6, 3);
    (d?.history ?? []).slice(0, 18).forEach((e, i) => {
      const px = b.x - w / 2 + 16 + (i % 9) * 15, py = top + 34 + Math.floor(i / 9) * 22;
      if (e.basis === 'ls') g.fillStyle(0xf6f1e6, 1).fillCircle(px, py, 5);
      else g.lineStyle(2, 0xcba454, 1).strokeCircle(px, py, 4.2);
    });
    this.hit(g, [{ x: b.x - w / 2 - 6, y: top - 6 }, { x: b.x + w / 2 + 6, y: top - 6 }, { x: b.x + 62, y: b.y + 4 }, { x: b.x - 62, y: b.y + 4 }], { type: 'dock-area', area: 'history' });
    this.dyn.push(g);
  }

  private ensureTextures() {
    const t = this.s.textures;
    if (t.exists('dock-glow')) return;
    const c = t.createCanvas('dock-glow', 64, 64)!, x = c.getContext();
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,180,58,0.75)'); gr.addColorStop(1, 'rgba(255,180,58,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); c.refresh();
  }

  /* The paved ground round the dock: asphalt with faint lines, the slab's edges and the yard's
     marked bay. Below the floor tiles. */
  private drawGroundCanvas() {
    const k = 0.5, pts = [P(-2, -9), P(W + 5, -9), P(W + 5, DEPTH + 2), P(-2, DEPTH + 2)];
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y)) + 30;
    const c = this.s.textures.createCanvas('dock-ground', Math.ceil((x1 - x0) * k), Math.ceil((y1 - y0) * k))!, g = c.getContext();
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    const path = (ps: Pt[]) => { g.beginPath(); ps.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
    path(pts); g.fillStyle = '#424857'; g.fill();
    g.strokeStyle = '#4b5262'; g.lineWidth = 2;
    for (let q = -1; q < W + 5; q += 2) { const a = P(q, -9), b = P(q, DEPTH + 2); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    // the slab's two near edges
    path([P(0, DEPTH), P(W, DEPTH), P(W, DEPTH, -22), P(0, DEPTH, -22)]); g.fillStyle = '#8b8676'; g.fill(); g.strokeStyle = '#141c2c'; g.lineWidth = 2; g.stroke();
    path([P(W, 0), P(W, DEPTH), P(W, DEPTH, -22), P(W, 0, -22)]); g.fillStyle = '#6f6b5e'; g.fill(); g.stroke();
    // the yard: an empty, marked bay outside the door (a van is drawn only when a delivery is on record)
    path([P(W + 0.4, SOUTH + 0.3), P(W + 3.4, SOUTH + 0.3), P(W + 3.4, DEPTH - 0.3), P(W + 0.4, DEPTH - 0.3)]);
    g.setLineDash([22, 14]); g.strokeStyle = '#f1c84b'; g.lineWidth = 5; g.stroke(); g.setLineDash([]);
    // the dock plate across the door
    path([P(W, SOUTH + 0.4), P(W + 0.7, SOUTH + 0.4), P(W + 0.7, DEPTH - 0.4), P(W, DEPTH - 0.4)]); g.fillStyle = '#9aa3b0'; g.fill(); g.strokeStyle = '#141c2c'; g.lineWidth = 1.5; g.stroke();
    c.refresh();
    this.s.add.image(x0, y0, 'dock-ground').setOrigin(0, 0).setScale(1 / k).setDepth(-1.5e6);
  }

  /* Paint on the dock floor, over the tiles: shadows under the racks, the aisle lines, the light
     from the lamps, each bay's number, the payments rug. Redrawn with the records (the numbers
     follow the bays in use). */
  private drawPaint(d: DockData | null) {
    const k = 0.75, pts = [P(-2, -1), P(W + 1, -1), P(W + 1, DEPTH + 1), P(-2, DEPTH + 1)];
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y));
    if (!this.paint) {
      this.paint = this.s.textures.createCanvas('dock-paint', Math.ceil((x1 - x0) * k), Math.ceil((y1 - y0) * k))!;
      this.paintImg = this.s.add.image(x0, y0, 'dock-paint').setOrigin(0, 0).setScale(1 / k).setDepth(-9e5);
    }
    const c = this.paint, g = c.getContext();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    const path = (ps: Pt[]) => { g.beginPath(); ps.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
    const line = (a: Pt, b: Pt, col = '#d9b25a', w = 4, dash: number[] = []) => {
      g.save(); g.globalAlpha = 0.85; g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.restore();
    };
    // light pools from the lamps above the aisles
    for (let r = 0; r <= 4; r++) for (const x of [1.5, 5.5, 9.5]) {
      const p = P(x, r === 4 ? MAIN + 1 : r * 4 + 3);
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.5);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 210);
      gr.addColorStop(0, 'rgba(255,246,220,0.55)'); gr.addColorStop(0.55, 'rgba(255,246,220,0.18)'); gr.addColorStop(1, 'rgba(255,246,220,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 210, 0, Math.PI * 2); g.fill(); g.restore();
    }
    // soft shadows under the racks and the stations
    // (blurred with a canvas shadow cast from a shape drawn far off the canvas, which every browser supports)
    g.save(); g.fillStyle = '#000'; g.shadowColor = 'rgba(0,0,0,0.26)'; g.shadowBlur = 18 * k; g.shadowOffsetX = -20000 * k;
    const shadow = (x: number, y: number, w: number, dd: number) => { path([P(x - 0.05, y + 0.1), P(x + w + 0.15, y + 0.1), P(x + w + 0.15, y + dd + 0.2), P(x - 0.05, y + dd + 0.2)].map((q) => ({ x: q.x + 20000, y: q.y }))); g.fill(); };
    for (let i = 0; i < 16; i++) { const b = DOCK_PLAN.bay(i); shadow(b.x, b.y + (d?.bays[i] ? 0 : 0.2), 2, 0.9); }
    shadow(8, SOUTH + 1, 2, 1); shadow(6, DEPTH - 2, 2, 0.9); shadow(1.6, SOUTH + 1.9, 1.6, 1); shadow(6.2, SOUTH + 0.5, 1.4, 0.3);
    g.restore();
    // painted bays and their numbers
    for (const b of d?.bays ?? []) {
      path([P(b.x - 0.1, b.y - 0.1), P(b.x + 2.1, b.y - 0.1), P(b.x + 2.1, b.y + 2.1), P(b.x - 0.1, b.y + 2.1)]);
      g.fillStyle = 'rgba(0,0,0,0.05)'; g.fill();
      const n = P(b.x + 1.05, b.y + 1.55);
      g.save(); g.setTransform(0.894 * k, 0.447 * k, -0.894 * k, 0.447 * k, (n.x - x0) * k, (n.y - y0) * k);
      g.font = '800 34px -apple-system, "Segoe UI", Roboto, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(34,48,77,0.55)';
      g.fillText(`B${String(b.no).padStart(2, '0')}`, 0, 0); g.restore();
    }
    // aisle edges in brass, the main aisle wider, a dashed walking line from the corridor
    for (let r = 0; r < 4; r++) { const y = r * 4 + 2; line(P(0.2, y), P(W - 0.2, y)); line(P(0.2, y + 2), P(W - 0.2, y + 2)); }
    line(P(0, MAIN), P(W, MAIN), '#e0b84f', 5); line(P(0, MAIN + 2), P(W, MAIN + 2), '#e0b84f', 5);
    line(P(-2, MAIN + 1), P(W + 0.3, MAIN + 1), '#ffffff', 3, [18, 14]);
    // the payments rug: navy with a brass border
    path([P(0.6, SOUTH + 1.2), P(4.3, SOUTH + 1.2), P(4.3, SOUTH + 3.9), P(0.6, SOUTH + 3.9)]); g.fillStyle = 'rgba(23,35,59,0.85)'; g.fill();
    path([P(0.8, SOUTH + 1.4), P(4.1, SOUTH + 1.4), P(4.1, SOUTH + 3.7), P(0.8, SOUTH + 3.7)]); g.strokeStyle = hex(0xcba454); g.lineWidth = 3; g.stroke();
    c.refresh();
  }

  /* ── tags ─────────────────────────────────────────────────────────── */

  select(no: number | null) {
    this.selectedBay = no;
    for (const t of this.tags) { t.setSelected(t.bay.no === no); t.c.setDepth(t.bay.no === no ? LABEL_DEPTH + 1 : LABEL_DEPTH); }
  }

  setShown(on: boolean) { this.shown = on; for (const t of this.tags) t.c.setVisible(on); }

  /* Bay tags anchor at the racks' world points (for framing the default view). */
  tagPoints(): Pt[] { return this.tags.map((t) => t.at); }

  /* Every frame: tags keep one size on screen, slide back inside its free part, and never sit on
     one another (one in the way first rises a step on a longer hanger; if that fails it gives way).
     `view` is the free part of the screen in CSS px; `u` is world units per CSS px. */
  layout(cam: Phaser.Cameras.Scene2D.Camera, u: number, view: { top: number; bottom: number; width: number }) {
    // thirteen-odd tags: cheap enough to place every frame, which also keeps them right mid-move
    if (!this.shown || !this.tags.length) return;
    const zCss = 1 / u, near = zCss >= 0.2;
    const sx = (wx: number) => (wx - cam.worldView.x) / u, sy = (wy: number) => (wy - cam.worldView.y) / u;
    type R = { l: number; r: number; t: number; b: number };
    const kept: R[] = [];
    const hits = (r: R) => kept.some((k) => r.l - 16 < k.r && k.l < r.r + 16 && r.t - 22 < k.b && k.t < r.b + 22);
    const order = [...this.tags].sort((a, b) => Number(b.selected) - Number(a.selected) || b.at.y - a.at.y);
    for (const t of order) {
      t.c.setScale(u);
      if (!near) { t.c.setVisible(false); continue; }
      t.setHang(6);
      const ax = sx(t.at.x), ay = sy(t.at.y);
      const half = t.w / 2;
      const x = Math.max(half + 6, Math.min(view.width - half - 6, ax));
      let r: R = { l: x - half, r: x + half, t: ay - 6 - t.h, b: ay - 6 };
      if (ay < view.top || ay > view.bottom || ax < -half || ax > view.width + half) { t.c.setVisible(false); continue; }
      let placed = !hits(r);
      for (const lift of [30, 60]) {
        if (placed) break;
        const r2 = { ...r, t: r.t - lift, b: r.b - lift };
        if (!hits(r2) && r2.t > view.top) { t.setHang(6 + lift); r = r2; placed = true; }
      }
      if (!placed && !t.selected) { t.c.setVisible(false); continue; }
      t.c.setVisible(true).setPosition(t.at.x + (x - ax) * u, t.at.y);
      kept.push(r);
    }
  }
}
