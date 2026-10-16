import Phaser from 'phaser';
import { BRAND_LOGOS } from '../assets/brandLogos';
import { curated, matches, shelfOf, type BoutiqueData, type Lens, type Watch } from '../boutique/data';
import { BENCH, BOARD, BOUTIQUE_AT, COUNTER, DOOR, PEDESTALS, PLANTS, ROOM, WALL_H, toWorldB } from '../boutique/layout';
import { FloorBatch } from './FloorBatch';
import { depthAt, iso } from './iso';
import type { WorldScene } from './WorldScene';

/* Inside a boutique: a marble floor, panelled walls, a counter and a bench, six glass cases with a
   watch in each (the best sellers on the shelf now), and the Collection Board on the back wall,
   which opens the catalogue of every watch. Each watch is shown by its own photograph.

   Nothing in the room carries a figure: no counts, classes or prices beside a watch. A watch is
   tapped to see what it is doing. */

const PHOTO = 52;
const CASE_CARD = 50;     // a watch in a glass case, world units
const BAND = 8;           // photographs across the Collection Board
const BAND_CARD = 56;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

type Item = { watch: Watch; card: Phaser.GameObjects.Rectangle; shade: Phaser.GameObjects.Rectangle; photo: Phaser.GameObjects.Image | null; text: Phaser.GameObjects.Text | null; ring: Phaser.GameObjects.Rectangle; box: Phaser.GameObjects.Image | null; at: { x: number; y: number } };

export class BoutiqueLayer {
  private fixed: Phaser.GameObjects.GameObject[] = [];
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private items = new Map<string, Item>();
  private bandPhotos = new Map<string, Phaser.GameObjects.Image>();
  private lens: Lens = 'all';
  private shown = false;
  brand: string | null = null;
  data: BoutiqueData | null = null;
  overflow: Watch[] = [];          // watches not in a case (all of them are in the catalogue)

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
    // the left wall: tall panels in a moulding, lit from above
    const V = (side: 'back' | 'left', t: number, h: number) => {
      const [wx, wy] = side === 'back' ? toWorldB(t, 0) : toWorldB(0, t);
      const p = iso(wx, wy);
      return new Phaser.Math.Vector2(p.x, p.y - h);
    };
    for (let t = 1; t + 1.6 <= ROOM.D; t += 2.2) {
      const q = [V('left', t, 236), V('left', t + 1.6, 236), V('left', t + 1.6, 40), V('left', t, 40)];
      g.fillStyle(0xdccaa8, 1).fillPoints(q, true);
      g.lineStyle(2, 0xc79b4a, 0.9).strokePoints(q, true);
      g.fillStyle(0xfff3d6, 0.5).fillPoints([q[0], q[1], new Phaser.Math.Vector2(q[1].x, q[1].y + 14), new Phaser.Math.Vector2(q[0].x, q[0].y + 14)], true);
      // a brass sconce above it, and its warm light on the wall
      const c = V('left', t + 0.8, 262);
      g.fillStyle(0xffd98a, 0.16).fillEllipse(c.x, c.y + 26, 120, 90);
      g.fillStyle(0xffe6a8, 0.28).fillEllipse(c.x, c.y + 8, 56, 40);
      g.fillStyle(0xb8893b, 1).fillRect(c.x - 3, c.y - 2, 6, 14);
      g.fillStyle(0xfff1c9, 1).fillTriangle(c.x - 12, c.y + 2, c.x + 12, c.y + 2, c.x, c.y - 14);
    }
    // the Collection Board: a walnut frame built into the back wall, a deep navy face lit along
    // its top; its pictures and words are put on it with the boutique's watches
    const B = BOARD;
    const outer = [V('back', B.x0, B.hi), V('back', B.x1, B.hi), V('back', B.x1, B.lo), V('back', B.x0, B.lo)];
    const inner = [V('back', B.x0 + 0.18, B.hi - 12), V('back', B.x1 - 0.18, B.hi - 12), V('back', B.x1 - 0.18, B.lo + 12), V('back', B.x0 + 0.18, B.lo + 12)];
    g.fillStyle(0x000000, 0.18).fillPoints(outer.map((v) => new Phaser.Math.Vector2(v.x + 8, v.y + 10)), true);
    g.fillStyle(0x4a2f1f, 1).fillPoints(outer, true);
    g.fillStyle(0x1b2741, 1).fillPoints(inner, true);
    g.lineStyle(3, 0xc79b4a, 1).strokePoints(inner, true);
    g.fillStyle(0xffe9b8, 0.22).fillPoints([inner[0], inner[1], new Phaser.Math.Vector2(inner[1].x, inner[1].y + 30), new Phaser.Math.Vector2(inner[0].x, inner[0].y + 30)], true);
    // a brass picture light over it
    g.lineStyle(5, 0xb8893b, 1).lineBetween(V('back', B.x0 + 1, B.hi + 14).x, V('back', B.x0 + 1, B.hi + 14).y, V('back', B.x1 - 1, B.hi + 14).x, V('back', B.x1 - 1, B.hi + 14).y);
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
    const pools = s.add.graphics().setDepth(depthAt(BOUTIQUE_AT.x, BOUTIQUE_AT.y, -14));
    for (const c of PEDESTALS) { const p = iso(...toWorldB(c[0] + 0.5, c[1] + 0.5)); pools.fillStyle(0xffe9b8, 0.22).fillEllipse(p.x, p.y, 190, 92); }
    this.fixed.push(pools);
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

  /* A point on the back wall: t cells along it, h units up. */
  private onWall(t: number, h: number) {
    const p = iso(...toWorldB(t, 0));
    return { x: p.x, y: p.y - h };
  }

  /* A container whose children, laid out flat, appear on the back wall's slant: screen x = u,
     screen y = v + u/2 from the given point. The shear is split into rotate · scale · rotate (its
     singular value decomposition), which nested containers can each carry. */
  private sheared(x: number, y: number, depth: number) {
    const s = this.scene;
    const a = 1, b = 0, c = 0.5, d = 1;                         // [[a, b], [c, d]]: x' = x, y' = 0.5x + y
    const E = (a + d) / 2, F = (a - d) / 2, G = (c + b) / 2, H = (c - b) / 2;
    const Q = Math.hypot(E, H), R = Math.hypot(F, G);
    const a1 = Math.atan2(G, F), a2 = Math.atan2(H, E);
    const outer = s.add.container(x, y).setRotation((a2 + a1) / 2).setDepth(depth);
    const mid = s.add.container(0, 0).setScale(Q + R, Q - R);
    const inner = s.add.container(0, 0).setRotation((a2 - a1) / 2);
    outer.add(mid); mid.add(inner);
    this.dyn.push(outer);
    return inner;
  }

  /* Where a case's watch lies, under its glass, and how deep it is drawn. */
  private caseSpot(index: number): { x: number; y: number; depth: number } {
    const [x, y] = toWorldB(...PEDESTALS[index]);
    const p = iso(x + 1, y + 1);
    return { x: p.x, y: p.y - 96, depth: depthAt(x + 1, y + 1, 0.6) };
  }

  /* ── a boutique's watches ─────────────────────────────────────────────── */

  build(data: BoutiqueData | null) {
    for (const o of this.dyn) o.destroy();
    this.dyn = [];
    this.items.clear();
    this.bandPhotos.clear();
    this.overflow = [];
    this.brand = data?.brand ?? null;
    this.data = data;
    if (!data) return;
    const s = this.scene;
    const B = BOARD;
    const sel = { type: 'collection' as const };
    const boardDepth = depthAt(...toWorldB(B.x1, 0.3), -6);
    const tagBoard = (o: Phaser.GameObjects.GameObject & { setInteractive: (...a: never[]) => unknown }) => {
      (o as unknown as Phaser.GameObjects.Image).setInteractive({ useHandCursor: true });
      s.tag(o, sel, 0);
      this.dyn.push(o);
      return o;
    };
    // the whole board answers a tap, wherever it is touched
    {
      const a = this.onWall(B.x0, B.hi), b = this.onWall(B.x1, B.lo);
      const hit = s.add.zone((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x), Math.abs(b.y - a.y) + 40).setDepth(boardDepth - 0.5);
      tagBoard(hit);
    }
    // its title: the brand's logo where we have it, then the collection's size
    // the board's face is laid out flat (u along the wall, v down from its top edge), then set onto
    // the wall's slant: three nested containers, rotate · stretch · rotate, make the shear exactly
    const U = (B.x1 - B.x0) * 64, Hh = B.hi - B.lo;
    const o = this.onWall(B.x0, B.hi);
    const face = this.sheared(o.x, o.y, boardDepth);
    const put = <T extends Phaser.GameObjects.GameObject>(g: T) => { face.add(g); return g; };
    const logo = BRAND_LOGOS[data.brand];
    if (logo && s.textures.exists(logo.key)) {
      put(s.add.rectangle(U / 2, 38, 220, 46, logo.plate === 'dark' ? 0x0f1830 : 0xf6efe0).setStrokeStyle(2, 0xc79b4a));
      const img = put(s.add.image(U / 2, 38, logo.key));
      img.setScale(Math.min(190 / img.width, 34 / img.height));
    } else {
      put(s.add.text(U / 2, 38, data.brand.toUpperCase(), { fontFamily: FONT, fontSize: '26px', fontStyle: '600', color: '#f3e7cf', resolution: 2 }).setOrigin(0.5));
    }
    put(s.add.text(U / 2, 76, `THE COLLECTION · ${data.products.length} WATCHES`, {
      fontFamily: FONT, fontSize: '14px', fontStyle: '600', color: '#d8b45a', resolution: 3, letterSpacing: 2,
    }).setOrigin(0.5));
    // a band of the collection's own photographs, the next best sellers after the cases
    const cases = curated(data.products);
    const caseIds = new Set(cases.map((w) => w.product_id));
    const band = curated(data.products.filter((w) => !caseIds.has(w.product_id)), BAND);
    const toLoad: Watch[] = [];
    const gap = (U - 60) / BAND;
    band.forEach((w, i) => {
      const x = 30 + gap * (i + 0.5), y = 128;
      put(s.add.rectangle(x, y, BAND_CARD, BAND_CARD, 0xffffff));
      const photo = put(s.add.image(x, y, '__WHITE').setVisible(false));
      photo.setData('size', BAND_CARD - 4);
      this.bandPhotos.set(w.product_id, photo);
      toLoad.push(w);
    });
    put(s.add.text(U / 2, Hh - 24, 'Tap to browse every watch  ›', { fontFamily: FONT, fontSize: '13px', color: '#efe6d3', resolution: 3 }).setOrigin(0.5));

    // the glass cases: one watch in each, the best sellers on the shelf now
    cases.forEach((w, i) => {
      const at = this.caseSpot(i);
      const size = CASE_CARD;
      const card = s.add.rectangle(at.x, at.y, size, size, 0xffffff).setStrokeStyle(1, 0xe8dcc4).setDepth(at.depth);
      const shade = s.add.rectangle(at.x + 3, at.y + 4, size, size, 0x3a2414, 0.18).setDepth(at.depth - 0.02);
      const ring = s.add.rectangle(at.x, at.y, size + 8, size + 8).setStrokeStyle(4, 0xe0b04a).setDepth(at.depth - 0.01).setVisible(false);
      card.setInteractive({ useHandCursor: true });
      s.tag(card, { type: 'watch', id: w.product_id }, 0);
      const key = `w:${w.product_id}`;
      const photo = s.add.image(at.x, at.y, s.textures.exists(key) ? key : '__WHITE').setDepth(at.depth + 0.01);
      photo.setData('size', size - 4);
      if (s.textures.exists(key)) this.fitPhoto(photo); else { photo.setVisible(false); if (!toLoad.includes(w)) toLoad.push(w); }
      photo.setInteractive({ useHandCursor: true });
      s.tag(photo, { type: 'watch', id: w.product_id }, 0);
      let box: Phaser.GameObjects.Image | null = null;
      if (w.open_pos.some((p) => p.outstanding > 0)) {
        box = s.add.image(at.x + size / 2 - 6, at.y + size / 2 - 6, 'box-sealed').setDepth(at.depth + 0.02);
        box.setScale(20 / box.width);
      }
      this.items.set(w.product_id, { watch: w, card, shade, photo, text: null, ring, box, at: { x: at.x, y: at.y } });
      this.dyn.push(card, shade, ring, photo, ...(box ? [box] : []));
    });
    this.overflow = data.products.filter((w) => !caseIds.has(w.product_id));
    // the glass over each case goes on last, over its watch
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
        if (it?.photo?.active) { it.photo.setTexture(key).setVisible(this.shown); this.fitPhoto(it.photo); this.style(it); }
        const bp = this.bandPhotos.get(w.product_id);
        if (bp?.active) { bp.setTexture(key).setVisible(this.shown); this.fitPhoto(bp); }
      });
      s.load.image(key, w.image!.thumb);
    }
    s.load.start();
  }

  private fitPhoto(photo: Phaser.GameObjects.Image) {
    const size = (photo.getData('size') as number | undefined) ?? PHOTO;
    photo.setScale(Math.min(size / photo.width, size / photo.height));
  }

  /* ── the optional discovery filters ──────────────────────────────────── */

  setLens(lens: Lens) { this.lens = lens; this.applyLens(); }

  private applyLens() { for (const it of this.items.values()) this.style(it); }

  private style(it: Item) {
    const on = matches(it.watch, this.lens);
    const soldOut = shelfOf(it.watch) !== 'in_stock';
    // a sold-out watch keeps its place, its picture faint, as an empty case looks
    const base = soldOut ? 0.28 : 1;
    const k = this.lens === 'all' || on ? 1 : 0.14;
    it.card.setAlpha((soldOut ? 0 : 1) * k);
    it.shade.setAlpha(soldOut ? 0 : k);
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
    for (const [id, bp] of this.bandPhotos) if (!this.scene.textures.exists(`w:${id}`)) bp.setVisible(false);
  }

  /* The Collection Board's middle, in world units. */
  boardPoint() { return this.onWall((BOARD.x0 + BOARD.x1) / 2, (BOARD.lo + BOARD.hi) / 2); }

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
