import Phaser from 'phaser';
import { BRAND_LOGOS } from '../assets/brandLogos';
import { matches, shelfOf, type BoutiqueData, type Lens, type Watch } from '../boutique/data';
import {
  BENCH, BOUTIQUE_AT, COUNTER, DOOR, NICHE_H, PEDESTALS, PLANTS, ROOM, SHELVES, WALL_H, displaySpots, toWorldB, type DisplaySpot,
} from '../boutique/layout';
import { FloorBatch } from './FloorBatch';
import { depthAt, iso } from './iso';
import type { WorldScene } from './WorldScene';

/* Inside a boutique: a marble floor, panelled walls with lit niches, glass pedestals, a counter and
   a bench, and the boutique's real watches, each shown by its own photograph.

   Nothing here is written in the room: no counts, classes or prices. A watch is tapped to see
   what it is doing. The optional discovery filters only light some watches and dim the rest. */

const CARD = 56;          // a watch's card, world units
const PHOTO = 52;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

type Item = { watch: Watch; card: Phaser.GameObjects.Rectangle; photo: Phaser.GameObjects.Image | null; text: Phaser.GameObjects.Text | null; ring: Phaser.GameObjects.Rectangle; box: Phaser.GameObjects.Image | null; at: { x: number; y: number } };

export class BoutiqueLayer {
  private fixed: Phaser.GameObjects.GameObject[] = [];
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private items = new Map<string, Item>();
  private lens: Lens = 'all';
  private shown = false;
  brand: string | null = null;
  data: BoutiqueData | null = null;
  overflow: Watch[] = [];          // watches with no place left in the room (shown in the browser)

  constructor(private scene: WorldScene) {}

  /* ── the room itself, drawn once ─────────────────────────────────────── */

  drawStatic() {
    const s = this.scene;
    // a dark surround, so the room reads as an inside space
    const P = (x: number, y: number, up = 0) => { const p = iso(...toWorldB(x, y)); return new Phaser.Math.Vector2(p.x, p.y - up); };
    const back = s.add.graphics().setDepth(depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -40));
    back.fillStyle(0x1d1814, 1).fillPoints([P(-3, -3, WALL_H + 200), P(ROOM.W + 4, -3, WALL_H + 200), P(ROOM.W + 4, ROOM.D + 4), P(-3, ROOM.D + 4)], true);
    this.fixed.push(back);

    // the floor: pale marble, alternating
    const floor = new FloorBatch(s, depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -30));
    for (let x = 0; x < ROOM.W; x++) for (let y = 0; y < ROOM.D; y++) {
      const p = iso(...toWorldB(x, y));
      floor.add((x + y) % 2 ? 'tile-marble-b' : 'tile-marble-a', p.x, p.y);
    }
    floor.draw();
    // a navy inlay down the middle of the room
    const inlay = s.add.graphics().setDepth(depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -20));
    inlay.lineStyle(3, 0xb8893b, 0.7).strokePoints([P(2.5, 1.6), P(ROOM.W - 0.5, 1.6), P(ROOM.W - 0.5, ROOM.D - 1.6), P(2.5, ROOM.D - 1.6)], true);
    this.fixed.push(inlay);

    // the two walls: panelled cream, a walnut skirting, a brass line and a warm light along the top
    const g = s.add.graphics().setDepth(depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -10));
    const wall = (a: Phaser.Math.Vector2, b: Phaser.Math.Vector2, fill: number) => {
      g.fillStyle(fill, 1).fillPoints([a, b, new Phaser.Math.Vector2(b.x, b.y - WALL_H), new Phaser.Math.Vector2(a.x, a.y - WALL_H)], true);
      g.fillStyle(0x5b3a24, 1).fillPoints([a, b, new Phaser.Math.Vector2(b.x, b.y - 16), new Phaser.Math.Vector2(a.x, a.y - 16)], true);
      g.lineStyle(3, 0xc79b4a, 1).lineBetween(a.x, a.y - WALL_H + 22, b.x, b.y - WALL_H + 22);
      g.fillStyle(0xfff3d6, 0.35).fillPoints([new Phaser.Math.Vector2(a.x, a.y - WALL_H + 22), new Phaser.Math.Vector2(b.x, b.y - WALL_H + 22),
        new Phaser.Math.Vector2(b.x, b.y - WALL_H), new Phaser.Math.Vector2(a.x, a.y - WALL_H)], true);
    };
    wall(P(0, 0), P(ROOM.W, 0), 0xf3e9d6);      // back wall, in the light
    wall(P(0, ROOM.D), P(0, 0), 0xe4d5b9);      // left wall, a shade darker
    // a cap along the walls' top edge
    g.lineStyle(6, 0x3a2a1e, 1).lineBetween(P(0, ROOM.D).x, P(0, ROOM.D).y - WALL_H, P(0, 0).x, P(0, 0).y - WALL_H);
    g.lineBetween(P(0, 0).x, P(0, 0).y - WALL_H, P(ROOM.W, 0).x, P(ROOM.W, 0).y - WALL_H);
    // the niches: one per cell and shelf, recessed and lit from above
    for (const spot of displaySpots()) {
      if (spot.kind === 'pedestal') continue;
      const q = this.nicheQuad(spot);
      g.fillStyle(spot.kind === 'back' ? 0xe6d8bf : 0xd6c4a3, 1).fillPoints(q, true);
      g.fillStyle(0xfff6e0, 0.55).fillPoints([q[0], q[1], new Phaser.Math.Vector2(q[1].x, q[1].y + 10), new Phaser.Math.Vector2(q[0].x, q[0].y + 10)], true);
      g.lineStyle(3, 0x6b4a2f, 1).lineBetween(q[3].x, q[3].y, q[2].x, q[2].y);   // the shelf's edge
    }
    this.fixed.push(g);

    // furniture
    const stand = (key: string, [x, y]: [number, number], w = 1, d = 1) => {
      const [wx, wy] = toWorldB(x, y);
      const p = iso(wx + w, wy + d);
      const o = s.fit(s.add.image(p.x, p.y, key), key).setDepth(depthAt(wx + w, wy + d));
      this.fixed.push(o);
      return o;
    };
    stand('bq-counter', COUNTER.cell, COUNTER.w, COUNTER.d);
    stand('bench', BENCH.cell, BENCH.w, BENCH.d);
    PLANTS.forEach((c) => stand('plant', c));
    for (const c of PEDESTALS) stand('case-plinth-owned', c);

    // the door: a mat just inside the front edge, and the light from the mall falling in
    const mat = s.add.graphics().setDepth(depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -15));
    const [d0, d1] = DOOR;
    mat.fillStyle(0xffe6a8, 0.35).fillPoints([P(d0[0] - 0.3, ROOM.D - 2.2), P(d1[0] + 1.3, ROOM.D - 2.2), P(d1[0] + 1.3, ROOM.D + 0.6), P(d0[0] - 0.3, ROOM.D + 0.6)], true);
    mat.fillStyle(0x22304d, 1).fillPoints([P(d0[0] + 0.1, d0[1] + 0.15), P(d1[0] + 0.9, d1[1] + 0.15), P(d1[0] + 0.9, d1[1] + 0.95), P(d0[0] + 0.1, d0[1] + 0.95)], true);
    mat.lineStyle(2, 0xc79b4a, 1).strokePoints([P(d0[0] + 0.1, d0[1] + 0.15), P(d1[0] + 0.9, d1[1] + 0.15), P(d1[0] + 0.9, d1[1] + 0.95), P(d0[0] + 0.1, d0[1] + 0.95)], true);
    this.fixed.push(mat);
    const door = s.add.zone(0, 0, 1, 1);
    const c0 = P(d0[0], d0[1] + 0.5), c1 = P(d1[0] + 1, d1[1] + 0.5);
    door.setPosition((c0.x + c1.x) / 2, (c0.y + c1.y) / 2).setSize(Math.abs(c1.x - c0.x) + 60, 70).setDepth(depthAt(...toWorldB(d1[0] + 1, d1[1] + 1)));
    door.setInteractive({ useHandCursor: true });
    s.tag(door, { type: 'boutique-exit' }, 0);
    this.fixed.push(door);
    this.setShown(false);
  }

  /* A niche's four corners on its wall: top left, top right, bottom right, bottom left. */
  private nicheQuad(spot: Exclude<DisplaySpot, { kind: 'pedestal' }>): Phaser.Math.Vector2[] {
    const h0 = SHELVES[spot.shelf], h1 = h0 + NICHE_H;
    const along = (t: number, h: number) => {
      const [wx, wy] = spot.kind === 'back' ? toWorldB(spot.cell + t, 0) : toWorldB(0, spot.cell + t);
      const p = iso(wx, wy);
      return new Phaser.Math.Vector2(p.x, p.y - h);
    };
    // the left wall runs towards the viewer, so its niches are read from the corner outwards
    return spot.kind === 'back'
      ? [along(0.1, h1), along(0.9, h1), along(0.9, h0), along(0.1, h0)]
      : [along(0.9, h1), along(0.1, h1), along(0.1, h0), along(0.9, h0)];
  }

  /* Where a watch's card stands, and how deep it is drawn. */
  private placeOf(spot: DisplaySpot): { x: number; y: number; depth: number } {
    if (spot.kind === 'pedestal') {
      const [x, y] = toWorldB(...PEDESTALS[spot.index]);
      const p = iso(x + 1, y + 1);
      return { x: p.x - 64 + (spot.side ? 34 : -34) + 64, y: p.y - 112, depth: depthAt(x + 1, y + 1, 0.6) };
    }
    const q = this.nicheQuad(spot);
    const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    const [wx, wy] = spot.kind === 'back' ? toWorldB(spot.cell + 1, 0.4) : toWorldB(0.4, spot.cell + 1);
    return { x: cx, y: cy + 2, depth: depthAt(wx, wy, -5) };
  }

  /* ── a boutique's watches ─────────────────────────────────────────────── */

  build(data: BoutiqueData | null) {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    this.items.clear();
    this.overflow = [];
    this.brand = data?.brand ?? null;
    this.data = data;
    if (!data) return;
    const s = this.scene;
    // the brand's own logo on a navy plate, in the middle of the back wall's top shelf
    const logo = BRAND_LOGOS[data.brand];
    {
      const [ax, ay] = toWorldB(6, 0), [bx, by] = toWorldB(8, 0);
      const a = iso(ax, ay), b = iso(bx, by), h = SHELVES[SHELVES.length - 1] + NICHE_H / 2;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2 - h;
      const plate = s.add.rectangle(cx, cy, 150, 58, 0x22304d).setStrokeStyle(3, 0xc79b4a).setDepth(depthAt(...toWorldB(8, 0.4), -4));
      this.dyn.push(plate);
      if (logo && s.textures.exists(logo.key)) {
        const img = s.add.image(cx, cy, logo.key).setDepth(plate.depth + 0.1);
        const k = Math.min(132 / img.width, 42 / img.height);
        img.setScale(k);
        this.dyn.push(img);
      } else {
        this.dyn.push(s.add.text(cx, cy, data.brand, { fontFamily: FONT, fontSize: '22px', fontStyle: '600', color: '#fbf3dc', resolution: 2 }).setOrigin(0.5).setDepth(plate.depth + 0.1));
      }
    }
    // watches fill the room's places in Lightspeed's name order
    const spots = displaySpots();
    const watches = [...data.products].sort((a, b) => a.name.localeCompare(b.name));
    const toLoad: Watch[] = [];
    watches.forEach((w, i) => {
      const spot = spots[i];
      if (!spot) { this.overflow.push(w); return; }
      const at = this.placeOf(spot);
      const card = s.add.rectangle(at.x, at.y, CARD, CARD, 0xffffff).setStrokeStyle(1.5, 0xd8c8a8).setDepth(at.depth);
      const ring = s.add.rectangle(at.x, at.y, CARD + 10, CARD + 10).setStrokeStyle(4, 0xe0b04a).setDepth(at.depth - 0.01).setVisible(false);
      card.setInteractive({ useHandCursor: true });
      s.tag(card, { type: 'watch', id: w.product_id }, 0);
      let photo: Phaser.GameObjects.Image | null = null, text: Phaser.GameObjects.Text | null = null;
      const key = `w:${w.product_id}`;
      if (w.image) {
        photo = s.add.image(at.x, at.y, s.textures.exists(key) ? key : '__WHITE').setDepth(at.depth + 0.01);
        if (s.textures.exists(key)) this.fitPhoto(photo); else { photo.setVisible(false); toLoad.push(w); }
        photo.setInteractive({ useHandCursor: true });
        s.tag(photo, { type: 'watch', id: w.product_id }, 0);
      } else {
        // no verified picture: the card carries the name instead, never a stand-in drawing
        text = s.add.text(at.x, at.y, w.name.replace(/\s+-\s+/g, '\n').slice(0, 40), {
          fontFamily: FONT, fontSize: '8px', color: '#5b4a35', align: 'center', wordWrap: { width: CARD - 6 }, resolution: 3,
        }).setOrigin(0.5).setDepth(at.depth + 0.01);
      }
      let box: Phaser.GameObjects.Image | null = null;
      if (w.open_pos.some((p) => p.outstanding > 0)) {
        box = s.add.image(at.x + CARD / 2 - 6, at.y + CARD / 2 - 6, 'box-sealed').setDepth(at.depth + 0.02);
        box.setScale(20 / box.width);
      }
      const item: Item = { watch: w, card, photo, text, ring, box, at: { x: at.x, y: at.y } };
      this.items.set(w.product_id, item);
      this.dyn.push(card, ring, ...(photo ? [photo] : []), ...(text ? [text] : []), ...(box ? [box] : []));
    });
    // the glass over each pedestal goes on last, over its watches
    for (const c of PEDESTALS) {
      const [x, y] = toWorldB(...c);
      const p = iso(x + 1, y + 1);
      const glass = s.fit(s.add.image(p.x, p.y, 'case-glass'), 'case-glass').setDepth(depthAt(x + 1, y + 1, 1)).setAlpha(0.85);
      this.dyn.push(glass);
    }
    this.load(toLoad);
    this.applyLens();
    this.setShown(this.shown);
  }

  /* The photographs come in after the room is drawn; each card fills as its picture arrives. */
  private load(list: Watch[]) {
    const s = this.scene;
    if (!list.length) return;
    s.load.setCORS('anonymous');
    for (const w of list) {
      const key = `w:${w.product_id}`;
      s.load.once(`filecomplete-image-${key}`, () => {
        const it = this.items.get(w.product_id);
        if (!it?.photo || !it.photo.active) return;
        it.photo.setTexture(key).setVisible(true);
        this.fitPhoto(it.photo);
        this.style(it);
      });
      s.load.image(key, w.image!.thumb);
    }
    s.load.start();
  }

  private fitPhoto(photo: Phaser.GameObjects.Image) {
    photo.setScale(Math.min(PHOTO / photo.width, PHOTO / photo.height));
  }

  /* ── the optional discovery filters ──────────────────────────────────── */

  setLens(lens: Lens) { this.lens = lens; this.applyLens(); }

  private applyLens() { for (const it of this.items.values()) this.style(it); }

  private style(it: Item) {
    const on = matches(it.watch, this.lens);
    const soldOut = shelfOf(it.watch) !== 'in_stock';
    // a sold-out watch keeps its place, its picture faint, as an empty case looks
    const base = soldOut ? 0.32 : 1;
    const k = this.lens === 'all' || on ? 1 : 0.14;
    it.card.setAlpha((soldOut ? 0.55 : 1) * k);
    it.photo?.setAlpha(base * k);
    it.text?.setAlpha(base * k);
    it.box?.setAlpha(k);
    it.ring.setVisible(this.lens !== 'all' && on);
  }

  /* ── showing and finding ─────────────────────────────────────────────── */

  setShown(on: boolean) {
    this.shown = on;
    for (const o of [...this.fixed, ...this.dyn]) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible?.(on);
    if (on) this.applyLens(); else for (const it of this.items.values()) it.ring.setVisible(false);
    for (const it of this.items.values()) if (it.photo && !this.scene.textures.exists(`w:${it.watch.product_id}`)) it.photo.setVisible(false);
  }

  /* Where a watch stands, to bring it into view. */
  pointOf(id: string) { return this.items.get(id)?.at ?? null; }
  cardOf(id: string) { return this.items.get(id)?.card ?? null; }

  /* The room's extent on screen, walls and all, in world units. */
  bounds() {
    const l = iso(...toWorldB(0, ROOM.D)).x, r = iso(...toWorldB(ROOM.W, 0)).x;
    const t = iso(...toWorldB(0, 0)).y - WALL_H - 30, b = iso(...toWorldB(ROOM.W, ROOM.D)).y + 30;
    return { x: l, y: t, w: r - l, h: b - t };
  }
}
