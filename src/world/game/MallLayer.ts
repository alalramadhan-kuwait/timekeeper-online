import Phaser from 'phaser';
import { ASSET } from '../assets/manifest';
import { BRAND_LOGOS, type BrandLogo } from '../assets/brandLogos';
import { ARCHES, FIGURE_SCALE, MALL, PILLARS, PLANTERS, SECTIONS, SLOT_GEO, WALK, WALL_HEIGHT, bayDecor, boutiquePlan, kioskCell, mallBlocked, toWorld, type SlotGeo } from '../mall/layout';
import { displayName, type MallBrand, type MallModel, type MallSpot } from '../mall/model';
import type { Ownership, StockClass } from '../types';
import { FloorBatch } from './FloorBatch';
import { depthAt, iso } from './iso';
import type { WorldScene } from './WorldScene';

/* The Watch Mall on the Floor tab: three sections, boutiques for the major brands, cases in
   display areas for the rest. Everything here follows world_mall()'s stored places, so a
   brand stands where an owner put it, whatever its stock does.

   What is written in the mall is kept short: a brand's name and its stock health. Units,
   values, orders and sales are in the board that opens when anything of the brand is
   tapped. Labels never overlap: after every change of zoom the lower-priority ones are
   lifted clear or hidden. */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TOP = 1_000_000;                         // the scene's label layer
const HEALTH: [StockClass, number][] = [['fast', 0x3f8f5a], ['healthy', 0x7fb38f], ['new', 0x5f7ea8], ['slow', 0xd9a441], ['dead', 0x9a958b]];
const PLINTH: Record<Ownership, string> = {
  owned: 'case-plinth-owned', consignment: 'case-plinth-consignment', pre_owned: 'case-plinth-preowned', unknown: 'case-plinth-unknown',
};
/* Pale tints, so each boutique's pavilion has its own finish (an owner's colour wins). */
const FINISH = [0xffe4b5, 0xd6ecff, 0xffd8de, 0xe4dcff, 0xd8f5e2, 0xfff0c2, 0xf0e0d0];
const ACCENT = [0x22304d, 0x7a2e35, 0x2d6f7a, 0x5a4a8a, 0x8a6a2e, 0x3f6b4a, 0x6b3f5a];
const SECTION_RUG = [0xffffff, 0xe8d8ff, 0xd8f0e8];

/* Where a wall's drawn feature piece starts inside a wall n cells long. */
const featureOffset = (n: number, len: number) => Math.floor((n - len) / 2);

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lighten = (c: number, k: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v: number) => Math.round(v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

type Obj = Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Rectangle | Phaser.GameObjects.Particles.ParticleEmitter;
type Group = { items: Obj[]; prio: number; dy: number };

export class MallLayer {
  private dyn: Obj[] = [];
  /* level of detail: what shows at which zoom */
  private chips: Group[] = [];                // a kiosk's name and health: close up
  private lists: Group[] = [];                // a display area's brands: section view
  private signs: Group[] = [];                // boutique names and health: section view and closer
  private badges: Group[] = [];               // the three missions that matter most
  private sectionSigns: Obj[] = [];
  private lastCss = -1;
  private shown = true;                       // false while another area is chosen
  private targets = new Map<string, { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle; cell: [number, number]; boutique: boolean; centre?: { x: number; y: number } }>();
  blocked = new Set<string>();                // world cells

  constructor(private scene: WorldScene) {}

  /* ── fixed parts: floor, walls, archways ─────────────────────────────── */

  drawStatic() {
    const s = this.scene;
    // the floor: one batch for every tile in the mall
    const floor = new FloorBatch(s, -1e6);
    const tile = (key: string, lx: number, ly: number) => {
      const p = iso(...toWorld(lx, ly));
      floor.add(key, p.x, p.y);
    };
    const slotAt = new Map<string, SlotGeo>();
    for (const g of Object.values(SLOT_GEO)) if (g.kind !== 'island') for (let i = 0; i < g.w; i++) for (let j = 0; j < g.d; j++) slotAt.set(`${g.x + i},${g.y + j}`, g);
    for (let lx = 0; lx < MALL.w; lx++) for (let ly = 0; ly < MALL.d; ly++) {
      const g = slotAt.get(`${lx},${ly}`);
      if (ARCHES.includes(lx)) tile('mall-tile-arch', lx, ly);
      else if (g?.kind === 'boutique') tile('mall-tile-boutique', lx, ly);
      else if (g?.kind === 'bay') tile('mall-tile-bay', lx, ly);
      else tile(SECTIONS.find((x) => lx >= x.x0 && lx < x.x1)!.tiles[(lx + ly) % 2], lx, ly);
    }
    floor.draw();
    // a display area's brass border inlay (drawn for 3 x 4), centred in its 4 x 6
    for (const g of Object.values(SLOT_GEO)) {
      if (g.kind !== 'bay') continue;
      const p = iso(...toWorld(g.x + (g.w - 3) / 2, g.y + (g.d - 4) / 2));
      s.fit(s.add.image(p.x, p.y, 'bay-floor-border'), 'bay-floor-border').setDepth(-9e5);
    }
    // Walls are built from the drawn pieces: a boutique's 6-cell feature wall centred in its
    // 8 cells with plain pieces either side, a display area's 3-cell wall and a plain piece,
    // plain pieces in the archways. The pieces join end to end at their connection points.
    const run = (lx0: number, n: number, piece: (key: string, lx: number, len: number) => void, feature: string, len: number, plain: string) => {
      const off = featureOffset(n, len);
      for (let i = 0; i < off; i++) piece(plain, lx0 + i, 1);
      piece(feature, lx0 + off, len);
      for (let i = off + len; i < n; i++) piece(plain, lx0 + i, 1);
    };
    const back = (key: string, lx: number) => {
      const [x, y] = toWorld(lx, 0);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key), key).setDepth(depthAt(x, y, -2));
    };
    for (let lx = 0; lx < MALL.w;) {
      const g = slotAt.get(`${lx},0`);
      if (g?.kind === 'boutique') { run(lx, g.w, back, 'bq-wall', 6, 'mall-wall-r'); lx += g.w; }
      else if (g?.kind === 'bay') { run(lx, g.w, back, 'bay-wall', 3, 'mall-wall-r'); lx += g.w; }
      else { back('mall-wall-r', lx); lx += 1; }
    }
    for (let ly = 0; ly < MALL.d; ly++) {
      const [x, y] = toWorld(0, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'mall-wall-l'), 'mall-wall-l').setDepth(depthAt(x, y, -2));
    }
    // the near sides are cut away to a low wall, so the camera sees in
    const front = (key: string, lx: number, len: number) => {
      const [x, y] = toWorld(lx, MALL.d);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key), key).setDepth(depthAt(x + len, y, 1));
    };
    for (let lx = 0; lx < MALL.w;) {
      const g = slotAt.get(`${lx},${MALL.d - 1}`);
      if (g?.kind === 'boutique') { run(lx, g.w, front, 'bq-front', 6, 'mall-ledge-r'); lx += g.w; }
      else if (g?.kind === 'bay') { run(lx, g.w, front, 'bay-front', 3, 'mall-ledge-r'); lx += g.w; }
      else { front('mall-ledge-r', lx, 1); lx += 1; }
    }
    // the near end opens onto the corridor to the loading dock, along the walkway
    for (let ly = 0; ly < MALL.d; ly++) {
      if (ly >= WALK.y0 && ly < WALK.y1) continue;
      const [x, y] = toWorld(MALL.w, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'mall-ledge-l'), 'mall-ledge-l').setDepth(depthAt(x, y + 1, 1));
    }
    for (const [lx, ly] of PILLARS) this.place('arch-pillar', lx, ly);
    for (const [lx, ly] of PLANTERS) this.place('planter-mall', lx, ly);
  }

  /* Something standing on the floor, footprint w x d from mall cell (lx, ly). */
  private place(key: string, lx: number, ly: number, w = 1, d = 1, lift = 0, keep = false) {
    const [x, y] = toWorld(lx, ly);
    const p = iso(x + w, y + d);
    const o = this.scene.fit(this.scene.add.image(p.x, p.y - lift, key), key).setDepth(depthAt(x + w, y + d));
    if (keep) this.dyn.push(o);
    return o;
  }

  private flat(key: string, lx: number, ly: number, depth = -8e5, extra = 1) {
    const [x, y] = toWorld(lx, ly);
    const p = iso(x, y);
    return this.keep(this.scene.fit(this.scene.add.image(p.x, p.y, key), key, extra).setDepth(depth)) as Phaser.GameObjects.Image;
  }

  /* ── what follows the data ───────────────────────────────────────────── */

  build(m: MallModel) {
    for (const o of this.dyn) o.destroy();
    this.dyn = []; this.chips = []; this.lists = []; this.signs = []; this.badges = []; this.sectionSigns = [];
    this.targets.clear();
    this.lastCss = -1;
    this.blocked = new Set([...mallBlocked(m.data.places)].map((k) => {
      const [lx, ly] = k.split(',').map(Number);
      return toWorld(lx, ly).join(',');
    }));

    // section signs, read from the whole-mall view
    SECTIONS.forEach((sec, i) => {
      const [x, y] = toWorld((sec.x0 + sec.x1) / 2, 0);
      const p = iso(x, y);
      const ta = ASSET['sign-section'].text ?? [0.1, 0.1, 0.9, 0.9];
      const sign = this.billboard('sign-section', p.x, p.y - 330, TOP - 20, 380 / (ASSET['sign-section'].drawWidth * (ta[2] - ta[0])));
      const r = this.area(sign, 'sign-section');
      const t = this.textIn(sign, 'sign-section', sec.name, { size: Math.min(40, r.h * 0.75), colour: '#f3e7cf', serif: true });
      sign.setInteractive({ useHandCursor: true });
      this.scene.tag(sign, { type: 'section', index: i }, 0);
      this.sectionSigns.push(sign, t);
    });

    // the three brands whose missions weigh most get a numbered badge; the rest are in the boards
    const ranked = m.spots.filter((sp) => sp.brand.missions.length)
      .map((sp) => ({ sp, w: Math.max(...sp.brand.missions.map((x) => x.weight_kd ?? 0)) }))
      .sort((a, b) => b.w - a.w).slice(0, 3);
    const rank = new Map(ranked.map((r, i) => [r.sp.brand.brand, i + 1]));

    // display areas: furnishing, and in the section view one label listing the area's brands
    for (const g of Object.values(SLOT_GEO)) {
      if (g.kind === 'boutique') continue;
      const here = m.spots.filter((sp) => sp.slot.slot === g.slot).sort((a, b) => a.position - b.position);
      if (g.kind === 'island') {
        if (here.length) {
          const pl = this.place('island-platform', g.x, g.y, g.w, g.d, 0, true);
          pl.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); this.scene.tag(pl, { type: 'display', slot: g.slot }, 0);
        }
        else { this.place('bench', g.x, g.y, 2, 1, 0, true); this.place('plant', g.x + 3, g.y, 1, 1, 0, true); }
      } else {
        const d = bayDecor(g);
        this.flat('rug', d.rug[0], d.rug[1], -8.5e5).setTint(SECTION_RUG[g.section]).setAlpha(0.9);
        const fx = this.place(d.kind === 'cabinet' ? 'wall-cabinet' : 'plant', d.fixture[0], d.fixture[1], 1, 1, 0, true);
        if (here.length) { fx.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); this.scene.tag(fx, { type: 'display', slot: g.slot }, 0); }
      }
      if (!here.length) continue;
      const [x, y] = toWorld(g.x + g.w / 2, g.kind === 'island' ? g.y + 0.5 : g.side === 'n' ? g.y + 0.6 : g.y + g.d);
      const p = iso(x, y);
      const lines = [displayName(g.slot).toUpperCase()];
      const names = here.map((sp) => short(sp.brand.brand, 14));
      for (let i = 0; i < names.length; i += 2) lines.push(names.slice(i, i + 2).join(' · '));
      const tag = this.text(p.x, p.y - (g.side === 'n' ? 150 : g.kind === 'island' ? 70 : 30), lines.join('\n'),
        { size: 12.5, colour: '#ffffff', bg: '#22304de6', depth: TOP - 6 }).setAlign('center').setLineSpacing(2).setOrigin(0.5, 1);
      tag.setInteractive({ useHandCursor: true });
      this.scene.tag(tag, { type: 'display', slot: g.slot }, 0);
      this.lists.push({ items: [tag], prio: 2, dy: 0 });
    }

    m.spots.forEach((sp) => {
      if (sp.slot.kind === 'boutique') this.boutique(sp, rank.get(sp.brand.brand) ?? 0);
      else this.kiosk(sp, rank.get(sp.brand.brand) ?? 0);
    });
    this.applyLod();
  }

  private boutique(sp: MallSpot, rank: number) {
    const s = this.scene, b = sp.brand, g = sp.slot, plan = boutiquePlan(g);
    const i = Object.values(SLOT_GEO).indexOf(g);
    const accent = b.colour ? parseInt(b.colour.slice(1), 16) : ACCENT[i % ACCENT.length];
    const sel = { type: 'brand' as const, brand: b.brand };
    // the brand's colour in the floor inlay, a rug, plants and a cash desk where the plan has them
    // the inlay is drawn for 6 x 4: centred in the 8 x 6 shop, a border of plain floor round it
    this.flat('bq-floor-accent', g.x + (g.w - 6) / 2, g.y + (g.d - 4) / 2).setTint(accent).setAlpha(0.85);
    // a rug in the brand's colour; the TK monogram rug belongs only to Time Keeper's own boutique
    if (plan.rug) {
      if (b.brand === 'Time Keeper') this.flat('rug', plan.rug[0], plan.rug[1], -7.5e5).setTint(lighten(accent, 0.55));
      else this.flat('bq-rug', plan.rug[0], plan.rug[1], -7.5e5, 1.5).setTint(lighten(accent, 0.35));
    }
    for (const [px, py] of plan.plants) this.place('plant', px, py, 1, 1, 0, true);
    // a bench where clients sit while they look
    if (plan.bench) this.place('bench', plan.bench[0], plan.bench[1], 2, 1, 0, true);
    if (plan.counter) {
      const c = this.place('bq-counter', plan.counter[0], plan.counter[1], 2, 1, 0, true);
      c.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(c, sel);
    }
    // the brand's colour on the trims of its wall: the back wall in the back row, the low front wall in the front row
    {
      const [wx, wy] = toWorld(g.x + featureOffset(g.w, 6), g.side === 'n' ? 0 : MALL.d);
      const wp = iso(wx, wy), key = g.side === 'n' ? 'bq-wall-accent' : 'bq-front-accent';
      this.keep(s.fit(s.add.image(wp.x, wp.y, key), key).setDepth(g.side === 'n' ? depthAt(wx, wy, -1.9) : depthAt(wx + 6, wy, 1.1)).setTint(accent));
    }
    // the pavilion, in its own finish
    const pav = this.place('boutique-pavilion', plan.pavilion[0], plan.pavilion[1], 2, 2, 0, true);
    pav.setTint(lighten(b.colour ? accent : FINISH[i % FINISH.length], b.colour ? 0.7 : 0.45));
    if (plan.variant === 1) pav.setFlipX(true);
    pav.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    s.tag(pav, sel, -24);
    // cases: one per kind of ownership it holds (up to three), watches by units
    const owns = (Object.entries(b.ownership) as [Ownership, { units: number; cost: number }][])
      .filter(([, v]) => v.units > 0).sort((a, c) => c[1].cost - a[1].cost).slice(0, 3);
    while (owns.length && owns.length < 3 && b.units > 10 * owns.length) owns.push(owns[0]);
    owns.forEach(([own, v], k) => {
      const [cx, cy] = plan.cases[k];
      const share = owns.filter(([o]) => o === own).length;
      for (const o of this.vitrine(own, v.units / share, cx, cy, 0, b.dusty)) { o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(o, sel); }
    });
    if (b.openPos.length) {
      const c = this.place('crate-po', plan.crate[0], plan.crate[1], 1, 1, 0, true);
      c.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
      s.tag(c, sel, 0);
    }
    // the name on the shop's wall: high on the back wall in the back row; in the front row on the
    // name plate of the low wall that faces the camera (over the walkway it would cover the islands)
    const [x, y] = toWorld(g.x + plan.sign, g.side === 'n' ? 0 : g.y + g.d);
    const p = iso(x, y);
    // the brand's own logo where we have it; otherwise its name, painted
    const logo = BRAND_LOGOS[b.brand];
    const { sign, items, r } = logo && s.textures.exists(logo.key)
      ? this.logoSign(logo, b, p.x, p.y, g.side, sel)
      : this.nameSign(b, p.x, p.y - (g.side === 'n' ? 170 : 44), sel);
    if (b.featured) items.push(this.text(r.x + 6, r.y + 2, '★', { size: 16, colour: '#f2c230', depth: TOP - 11.8 }).setOrigin(0.5, 0.5));
    this.signs.push({ items, prio: 3, dy: 0 });
    if (rank) this.badge(rank, r.x + r.w + 4, r.y, sel, undefined, items);
    const mid = iso(...toWorld(g.x + g.w / 2, g.y + g.d / 2));
    this.targets.set(b.brand, { obj: sign as Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle, cell: toWorld(plan.pavilion[0], plan.pavilion[1]), boutique: true, centre: { x: mid.x, y: mid.y - 60 } });
  }

  /* The brand's name painted on a plaque, for a brand without a logo file. Sized by its writing
     area, so a square plaque and a long thin one carry the name at the same size. */
  private nameSign(b: MallBrand, x: number, y: number, sel: { type: 'brand'; brand: string }) {
    const s = this.scene;
    const ta = ASSET['sign-section'].text ?? [0.1, 0.1, 0.9, 0.9];
    const sign = this.billboard('sign-section', x, y, TOP - 12, 230 / (ASSET['sign-section'].drawWidth * (ta[2] - ta[0])));
    sign.setInteractive({ useHandCursor: true }); s.tag(sign, sel, 0);
    const r = this.area(sign, 'sign-section');
    let t: Phaser.GameObjects.Text, bar: Phaser.GameObjects.Graphics;
    if (r.h < r.w * 0.35) {
      // a long plaque: the name fills it, the health bar hangs just under it
      t = this.textIn(sign, 'sign-section', b.brand.toUpperCase(), { size: Math.min(26, r.h * 0.8), colour: '#f3e7cf', bold: true });
      const bd = sign.getBounds();
      bar = this.healthBar(b, r.x, bd.bottom + 2, r.w, 6, TOP - 11.9);
      sign.setData('panel', new Phaser.Geom.Rectangle(bd.x, bd.y, bd.width, bd.height + 9));
    } else {
      // a taller plaque (the picture itself has a clear margin): name above, health bar below, inside it
      t = this.textIn(sign, 'sign-section', b.brand.toUpperCase(), { size: 30, colour: '#f3e7cf', bold: true });
      t.y -= r.h * 0.12;
      sign.setData('panel', new Phaser.Geom.Rectangle(r.x - r.w * 0.08, r.y - r.h * 0.12, r.w * 1.16, r.h * 1.3));
      bar = this.healthBar(b, r.x + r.w * 0.12, r.y + r.h * 0.74, r.w * 0.76, Math.max(5, r.h * 0.14), TOP - 11.9);
    }
    return { sign: sign as Obj, items: [sign, t, bar] as Obj[], r };
  }

  /* The brand's own logo on a plaque in the colour that makes it stand out: navy behind a white
     logo, cream behind a black one, in a gold frame. The logo is only scaled, evenly, to fit. The
     plaque takes the logo's shape so the name reads at a section's zoom on a phone (about
     7 CSS px a letter): a square plaque for a stacked logo, a long one for a word mark, and for a
     logo that is one long line of small words, a band the width of the shop front. */
  private logoSign(logo: BrandLogo, b: MallBrand, x: number, wallY: number, side: SlotGeo['side'], sel: { type: 'brand'; brand: string }) {
    const s = this.scene;
    const [w, h, fw, fh] = logo.aspect < 1.4 ? [148, 148, 0.8, 0.8] : logo.aspect <= 12.5 ? [264, 106, 0.85, 0.72] : [470, 56, 0.94, 0.74];
    // the back row's hangs from the top of its wall; the front row's stands on the low front
    // wall and rises into the shop, so it never reaches over the walkway
    const cy = side === 'n' ? wallY - 196 + h / 2 : wallY - 17 - h / 2;
    const plate = this.keep(s.add.rectangle(x, cy, w, h, logo.plate === 'dark' ? 0x17233b : 0xf6f1e6)
      .setStrokeStyle(5, 0xcba454).setRounded(Math.min(14, h * 0.18)).setDepth(TOP - 12));
    const img = this.keep(s.add.image(x, cy, logo.key).setDepth(TOP - 11.99));
    img.setScale(Math.min((w * fw) / img.width, (h * fh) / img.height));
    plate.setInteractive({ useHandCursor: true }); s.tag(plate, sel, 0);
    const bd = plate.getBounds();
    const bar = this.healthBar(b, bd.x + 10, bd.bottom + 3, bd.width - 20, 6, TOP - 11.9);
    plate.setData('panel', new Phaser.Geom.Rectangle(bd.x, bd.y, bd.width, bd.height + 11));
    return { sign: plate as Obj, items: [plate, img, bar] as Obj[], r: { x: bd.x + 4, y: bd.y + 4, w: bd.width - 8, h: bd.height - 8 } };
  }

  /* A display case: the base by ownership, watches by units, the glass over them. */
  private vitrine(own: Ownership, units: number, lx: number, ly: number, lift: number, dusty: boolean, k = FIGURE_SCALE) {
    const s = this.scene;
    const [wx, wy] = toWorld(lx, ly);
    const base = depthAt(wx + 1, wy + 1);
    const fp = iso(wx + 1, wy + 1);
    const plinth = this.keep(s.fit(s.add.image(fp.x, fp.y - lift, PLINTH[own]), PLINTH[own], k).setDepth(base)) as Phaser.GameObjects.Image;
    const onPlinth = ASSET[PLINTH[own]].surface * k;
    const glassOnFloor = ASSET['case-glass'].onFloor;
    const inside = (glassOnFloor ? onPlinth : onPlinth + ASSET['case-glass'].surface * k) + lift;
    const spots: [number, number][] = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5], [0.5, 0.18]];
    const n = watchesFor(units);
    for (let i = 0; i < n; i++) {
      const p = iso(wx + 0.5 + (spots[i][0] - 0.5) * k, wy + 0.5 + (spots[i][1] - 0.5) * k);
      this.keep(s.fit(s.add.image(p.x, p.y - inside, 'watch'), 'watch', k).setDepth(base + 0.1 + i * 0.001));
    }
    const glass = this.keep(s.fit(s.add.image(fp.x, fp.y - (glassOnFloor ? 0 : onPlinth) - lift, 'case-glass'), 'case-glass', k).setDepth(base + 0.3)) as Phaser.GameObjects.Image;
    if (dusty) this.keep(s.fit(s.add.image(fp.x, fp.y - onPlinth - lift, 'case-dust'), 'case-dust', k).setDepth(base + 0.35));
    return [plinth, glass];
  }

  private kiosk(sp: MallSpot, rank: number) {
    const s = this.scene, b = sp.brand, g = sp.slot;
    const [lx, ly] = kioskCell(g, sp.position);
    const lift = g.kind === 'island' ? ASSET['island-platform'].surface : 0;
    const sel = { type: 'brand' as const, brand: b.brand };
    // until the kiosk art arrives, a small brand's stock stands in a display case like the boutiques'
    // on an island the four kiosks stand one cell apart, so they keep the grid's own size
    const objs = this.vitrine(b.inStock ? b.mainOwnership : 'unknown', b.inStock ? b.units : 0, lx, ly, lift, b.inStock && b.dusty, g.kind === 'island' ? 1 : FIGURE_SCALE);
    for (const o of objs) { if (!b.inStock) o.setAlpha(0.5); o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(o, sel); }
    const [x, y] = toWorld(lx, ly);
    const top = objs[1].getBounds().top;
    const c = iso(x + 0.5, y + 0.5);
    if (b.openPos.length) {
      // an open order's crate stands by the kiosk; on an island, where the kiosks fill the platform,
      // a smaller one waits on the platform behind it rather than out in the walkway
      const island = g.kind === 'island';
      const cr = this.keep(island
        ? s.fit(s.add.image(c.x + 30, c.y - 10 - lift, 'crate-po'), 'crate-po', 0.4).setDepth(depthAt(x + 1, y + 1, -0.05))
        : s.fit(s.add.image(c.x + 44, c.y + 24 - lift, 'crate-po'), 'crate-po', 0.55).setDepth(depthAt(x + 1, y + 1, 0.4))) as Phaser.GameObjects.Image;
      cr.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(cr, sel, 0);
    }
    if (b.sparkle && !s.reducedMotion) {
      const e = s.add.particles(c.x, top + 24, 'sparkle', {
        x: { min: -30, max: 30 }, y: { min: -16, max: 16 }, lifespan: 900, frequency: 800,
        scale: { start: 0.7 * (ASSET.sparkle.drawWidth / (s.textures.get('sparkle').get().width || ASSET.sparkle.drawWidth)), end: 0 },
        alpha: { start: 1, end: 0 }, quantity: 1,
      }).setDepth(depthAt(x + 1, y + 1, 0.5));
      this.keep(e);
    }
    // close up: a compact chip with the name and a health bar
    const t = this.text(c.x, top - 4, short(b.brand, 16), { size: 13, colour: '#ffffff', bg: '#22304de6', depth: TOP - 5 }).setOrigin(0.5, 1);
    t.setInteractive({ useHandCursor: true }); s.tag(t, sel, 0);
    const bar = this.keep(s.add.graphics().setDepth(TOP - 4.9)) as Phaser.GameObjects.Graphics;
    const chip = { items: [t, bar] as Obj[], prio: 1, dy: 0, brand: b };
    this.chips.push(chip);
    if (rank) this.badge(rank, 0, 0, sel, t);
    this.targets.set(b.brand, { obj: objs[1], cell: [x, y], boutique: false });
  }

  /* Stock health at cost, as one bar: fast, healthy, new, slow, dead. */
  private healthBar(b: MallBrand, x: number, y: number, w: number, h: number, depth: number, into?: Phaser.GameObjects.Graphics) {
    const g = into ?? (this.keep(this.scene.add.graphics().setDepth(depth)) as Phaser.GameObjects.Graphics);
    g.clear();
    const total = HEALTH.reduce((n, [c]) => n + (b.classes[c]?.cost_value ?? 0), 0);
    g.fillStyle(0x3a4560, 1).fillRect(x, y, w, h);
    let hx = x;
    if (total > 0) for (const [c, col] of HEALTH) {
      const ww = ((b.classes[c]?.cost_value ?? 0) / total) * w;
      if (ww > 0) { g.fillStyle(col, 1).fillRect(hx, y, ww, h); hx += ww; }
    }
    return g;
  }

  /* A mission badge: a small numbered disc, 1 for the mission that weighs most. It sits on
     the shop sign, or follows a kiosk's chip. */
  private badge(n: number, x: number, y: number, sel: { type: 'brand'; brand: string }, follow?: Phaser.GameObjects.Text, into?: Obj[]) {
    const s = this.scene;
    const t = this.text(x, y, String(n), { size: 14, colour: '#22304d', bg: '#f2c230', bold: true, depth: TOP - 1.9 }).setOrigin(0.5, 0.5).setPadding(6, 2, 6, 2);
    t.setInteractive({ useHandCursor: true }); s.tag(t, sel, 0);
    t.setData('follow', follow ?? null);
    // on a boutique's sign: part of the sign, so it moves with it
    if (into) { into.push(t); return; }
    this.badges.push({ items: [t], prio: 4, dy: 0 });
  }

  /* A shop sign or an area's list that the screen's edge would cut slides back inside the
     free part of the screen (between the page's bars). Called every frame; it only works
     when the view has moved. */
  private clampKey = '';
  clampLabels(view: { x: number; y: number; w: number; h: number }) {
    const key = `${Math.round(view.x)},${Math.round(view.y)},${Math.round(view.w)},${Math.round(view.h)}`;
    if (key === this.clampKey) return;
    this.clampKey = key;
    const move = (gr: Group & { cx?: number; cy?: number }, dx: number, dy: number) => {
      for (const o of gr.items) { (o as Phaser.GameObjects.Image).x += dx; (o as Phaser.GameObjects.Image).y += dy; }
      const panel = (gr.items[0] as Phaser.GameObjects.Image).getData?.('panel') as Phaser.Geom.Rectangle | undefined;
      if (panel) { panel.x += dx; panel.y += dy; }
    };
    for (const gr of [...this.signs, ...this.lists] as (Group & { cx?: number; cy?: number })[]) {
      if (gr.cx || gr.cy) move(gr, -(gr.cx ?? 0), -(gr.cy ?? 0));
      gr.cx = 0; gr.cy = 0;
      if (!(gr.items[0] as Phaser.GameObjects.Image).visible) continue;
      const rs = gr.items.filter((o) => !(o instanceof Phaser.GameObjects.Graphics))
        .map((o) => (o.getData('panel') as Phaser.Geom.Rectangle | undefined) ?? (o as Phaser.GameObjects.Image).getBounds());
      const r = rs.reduce((a, b) => Phaser.Geom.Rectangle.Union(a, b, a), Phaser.Geom.Rectangle.Clone(rs[0]));
      if (r.right <= view.x || r.x >= view.x + view.w || r.bottom <= view.y || r.y >= view.y + view.h) continue;
      const dx = r.x < view.x ? view.x - r.x : r.right > view.x + view.w ? view.x + view.w - r.right : 0;
      const dy = r.y < view.y ? view.y - r.y : r.bottom > view.y + view.h ? view.y + view.h - r.bottom : 0;
      if (dx || dy) { move(gr, dx, dy); gr.cx = dx; gr.cy = dy; }
    }
    // a kiosk's name chip: the name slides in, its health bar is drawn again under it
    let chipsMoved = false;
    for (const gr of this.chips as (Group & { cx?: number; cy?: number; brand: MallBrand })[]) {
      const [t, bar] = gr.items as [Phaser.GameObjects.Text, Phaser.GameObjects.Graphics];
      const was = !!(gr.cx || gr.cy);
      if (was) { t.x -= gr.cx ?? 0; t.y -= gr.cy ?? 0; }
      gr.cx = 0; gr.cy = 0;
      let r = t.getBounds();
      if (t.visible && !(r.right <= view.x || r.x >= view.x + view.w || r.bottom <= view.y || r.y >= view.y + view.h)) {
        const dx = r.x < view.x ? view.x - r.x : r.right > view.x + view.w ? view.x + view.w - r.right : 0;
        const dy = r.y < view.y ? view.y - r.y : r.bottom > view.y + view.h ? view.y + view.h - r.bottom : 0;
        if (dx || dy) { t.x += dx; t.y += dy; gr.cx = dx; gr.cy = dy; }
      }
      if (was || gr.cx || gr.cy) {
        chipsMoved = true;
        const k = t.scaleX;
        r = t.getBounds();
        // the bar may itself have been lifted clear of another label: draw it in its own coordinates
        this.healthBar(gr.brand, r.left + 4 * k - bar.x, r.bottom - 4 * k - bar.y, r.width - 8 * k, 3.5 * k, 0, bar);
      }
    }
    if (chipsMoved) for (const gr of this.badges) this.followChip(gr);
    // a label slid in from the edge must not land on another: it fades until the view moves on
    const all = [...this.badges, ...this.signs, ...this.lists, ...this.chips] as (Group & { cx?: number; cy?: number; faded?: boolean })[];
    const shown = all.filter((gr) => (gr.items[0] as Phaser.GameObjects.Image).visible);
    const rect = (gr: Group) => {
      const rs = gr.items.filter((o) => !(o instanceof Phaser.GameObjects.Graphics))
        .map((o) => (o.getData('panel') as Phaser.Geom.Rectangle | undefined) ?? (o as Phaser.GameObjects.Image).getBounds());
      return rs.reduce((a, b) => Phaser.Geom.Rectangle.Union(a, b, a), Phaser.Geom.Rectangle.Clone(rs[0]));
    };
    const fade = (gr: Group & { faded?: boolean }, on: boolean) => {
      if (!!gr.faded === on) return;
      gr.faded = on;
      for (const o of gr.items) { (o as Phaser.GameObjects.Image).setAlpha(on ? 0 : 1); if (o.input) o.input.enabled = !on; }
    };
    // a label wholly under the page's bars (seen through the gaps between its buttons) fades too
    const inView = (r: Phaser.Geom.Rectangle) => r.right > view.x && r.x < view.x + view.w && r.bottom > view.y && r.y < view.y + view.h;
    for (const gr of shown) {
      const r = rect(gr);
      if (!inView(r)) { fade(gr, true); continue; }
      if (!gr.cx && !gr.cy) { fade(gr, false); continue; }
      fade(gr, shown.some((o) => o !== gr && !o.faded && Phaser.Geom.Rectangle.Overlaps(rect(o), r)));
    }
  }

  /* A kiosk's ranked marker: beside its name chip close up, otherwise above the case. */
  private followChip(gr: Group) {
    const t = gr.items[0] as Phaser.GameObjects.Text, k = t.scaleX;
    const f = t.getData('follow') as Phaser.GameObjects.Text | null;
    if (!f) return;
    const fb = f.getBounds();
    if (f.visible) t.setPosition(fb.right + 2 * k, fb.top + 4 * k);
    else t.setPosition(f.x, f.y - 6);
  }

  /* The writing area of a board or sign, in world units. */
  private area(o: Phaser.GameObjects.Image, key: string) {
    const t = ASSET[key].text ?? [0.1, 0.1, 0.9, 0.9];
    const bd = o.getBounds();
    return { x: bd.x + t[0] * bd.width, y: bd.y + t[1] * bd.height, w: (t[2] - t[0]) * bd.width, h: (t[3] - t[1]) * bd.height };
  }

  private textIn(o: Phaser.GameObjects.Image, key: string, txt: string, st: { size: number; colour: string; bold?: boolean; serif?: boolean }) {
    const r = this.area(o, key);
    const t = this.text(r.x + r.w / 2, r.y + r.h / 2, txt, { ...st, depth: o.depth + 0.01 }).setOrigin(0.5, 0.5);
    if (t.displayWidth > r.w * 0.92) t.setScale((r.w * 0.92) / t.width);
    return t;
  }

  private text(x: number, y: number, txt: string, st: { size: number; colour: string; bg?: string; bold?: boolean; serif?: boolean; depth: number }) {
    const t = this.scene.add.text(x, y, txt, {
      fontFamily: st.serif ? 'Georgia, "Times New Roman", serif' : FONT, fontSize: `${st.size}px`,
      fontStyle: st.bold || st.bg ? '600' : '400', color: st.colour, backgroundColor: st.bg,
      padding: st.bg ? { x: 6, y: 3 } : undefined, resolution: 2,
    }).setOrigin(0.5, 0).setDepth(st.depth);
    this.dyn.push(t);
    return t;
  }

  private billboard(key: string, x: number, y: number, depth: number, extra: number) {
    return this.keep(this.scene.fit(this.scene.add.image(x, y, key), key, extra).setDepth(depth)) as Phaser.GameObjects.Image;
  }

  private keep<T extends Obj>(o: T): T { this.dyn.push(o); return o; }

  /* ── level of detail, and keeping labels apart ───────────────────────── */

  /* The mall's labels float above everything; another area's view hides them. */
  setShown(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.applyLod();
  }

  /* cssPerUnit: CSS pixels per world unit at the current zoom. Re-applied whenever the level
     changes, and as the zoom moves (labels keep their size on screen). */
  lod(cssPerUnit: number) {
    const level = (c: number) => (c >= 0.62 ? 3 : c >= 0.3 ? 1 : 0);
    if (level(cssPerUnit) === level(this.lastCss) && Math.abs(cssPerUnit - this.lastCss) < 0.015) return;
    this.lastCss = cssPerUnit;
    this.applyLod();
  }

  /* Three levels: the whole mall (section names), a section (shop names, health and each
     display area's brands), close up (every kiosk's name and health). */
  private applyLod() {
    const css = this.lastCss < 0 ? 0.5 : this.lastCss, on = this.shown;
    const close = on && css >= 0.62, overview = css < 0.3;
    const reset = (gs: Group[]) => {
      for (const gr of gs) if (gr.dy) { for (const o of gr.items) (o as Phaser.GameObjects.Image).y += gr.dy; gr.dy = 0; }
    };
    for (const gs of [this.chips, this.lists, this.signs, this.badges]) reset(gs);
    const vis = (gs: Group[], v: boolean) => { for (const gr of gs) for (const o of gr.items) (o as Phaser.GameObjects.Image).setVisible(v); };
    vis(this.chips, close);
    vis(this.lists, on && !close && !overview);
    vis(this.signs, on && !overview);
    vis(this.badges, on && !overview);
    // names keep a readable size on screen, whatever the zoom
    const listScale = Phaser.Math.Clamp(0.8 / Math.max(css, 0.05), 0.6, 4);
    for (const gr of this.lists) (gr.items[0] as Phaser.GameObjects.Text).setScale(listScale);
    const chipScale = Phaser.Math.Clamp(0.7 / Math.max(css, 0.05), 0.55, 2);
    for (const gr of this.chips as (Group & { brand: MallBrand })[]) {
      const [t, bar] = gr.items as [Phaser.GameObjects.Text, Phaser.GameObjects.Graphics];
      t.setScale(chipScale);
      const tb = t.getBounds();
      this.healthBar(gr.brand, tb.left + 4 * chipScale, tb.bottom - 4 * chipScale, tb.width - 8 * chipScale, 3.5 * chipScale, 0, bar);
    }
    const badgeScale = Phaser.Math.Clamp(0.75 / Math.max(css, 0.05), 0.6, 3);
    for (const gr of this.badges) {
      (gr.items[0] as Phaser.GameObjects.Text).setScale(badgeScale);
      this.followChip(gr);
    }
    // in the whole-mall view the section signs keep a readable size: they are the way in
    const sk = Phaser.Math.Clamp(0.36 / Math.max(css, 0.02), 1, 4);
    for (let k = 0; k < this.sectionSigns.length; k += 2) {
      const sign = this.sectionSigns[k] as Phaser.GameObjects.Image, t = this.sectionSigns[k + 1] as Phaser.GameObjects.Text;
      const base = (sign.getData('base') as number | undefined) ?? sign.scale;
      const tb = (t.getData('base') as number | undefined) ?? t.scale;
      sign.setData('base', base); t.setData('base', tb);
      sign.setScale(base * sk); t.setScale(tb * sk); t.setPosition(sign.x, sign.y);
    }
    for (const o of this.sectionSigns) (o as Phaser.GameObjects.Image).setVisible(on && overview);
    this.declutter();
    this.clampKey = '';                         // labels moved: keep them on screen again next frame
  }

  /* Higher-priority labels keep their place; a lower one that would overlap is lifted clear
     (up to three tries) or, failing that, hidden until the zoom changes. */
  private declutter() {
    const all = [...this.badges, ...this.signs, ...this.lists, ...this.chips]
      .filter((g) => (g.items[0] as Phaser.GameObjects.Image).visible)
      .sort((a, b) => b.prio - a.prio);
    const placed: Phaser.Geom.Rectangle[] = [];
    // a sign counts by its panel, not its picture's clear margin
    const boundsOf = (g: Group) => {
      const rs = g.items.filter((o) => !(o instanceof Phaser.GameObjects.Graphics))
        .map((o) => (o.getData('panel') as Phaser.Geom.Rectangle | undefined) ?? (o as Phaser.GameObjects.Image).getBounds());
      return rs.reduce((a, r) => Phaser.Geom.Rectangle.Union(a, r, a), Phaser.Geom.Rectangle.Clone(rs[0]));
    };
    for (const g of all) {
      let r = boundsOf(g);
      const hits = () => placed.some((p) => Phaser.Geom.Rectangle.Overlaps(p, r));
      if (g.prio >= 3 || !hits()) { placed.push(r); continue; }
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) {
        const step = r.height * 0.6 + 6;
        for (const o of g.items) (o as Phaser.GameObjects.Image).y -= step;
        g.dy += step;
        r = boundsOf(g);
        ok = !hits();
      }
      if (ok) placed.push(r);
      else for (const o of g.items) (o as Phaser.GameObjects.Image).setVisible(false);
    }
  }

  /* Where a brand stands: the object to frame and select. */
  target(brand: string) { return this.targets.get(brand) ?? null; }

  /* A section's extent on screen, in world units: its floor, and its back wall and signs. */
  /* The point a section view centres on: the walkway's middle, raised half a wall. */
  sectionCentre(i: number) {
    const sec = SECTIONS[i];
    const p = iso(...toWorld((sec.x0 + sec.x1) / 2, MALL.d / 2));
    return { x: p.x, y: p.y - WALL_HEIGHT / 2 };
  }

  sectionBounds(i: number) {
    const sec = SECTIONS[i];
    const [x0, y0] = toWorld(sec.x0 - 0.3, 0), [x1, y1] = toWorld(sec.x1 + 0.3, MALL.d);
    const left = iso(x0, y1).x, right = iso(x1, y0).x, top = iso(x0, y0).y - 200, bottom = iso(x1, y1).y + 10;
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
}

function watchesFor(units: number) {
  if (units <= 0) return 0;
  if (units <= 2) return 2;
  if (units <= 6) return 3;
  if (units <= 15) return 4;
  if (units <= 40) return 5;
  return 6;
}
