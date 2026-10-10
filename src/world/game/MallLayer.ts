import Phaser from 'phaser';
import { ASSET } from '../assets/manifest';
import { ARCHES, MALL, PILLARS, PLANTERS, SECTIONS, SLOT_GEO, WALK, bayDecor, boutiquePlan, kioskCell, mallBlocked, toWorld, type SlotGeo } from '../mall/layout';
import { displayName, type MallBrand, type MallModel, type MallSpot } from '../mall/model';
import type { Ownership, StockClass } from '../types';
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

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lighten = (c: number, k: number) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v: number) => Math.round(v + (255 - v) * k);
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

type Obj = Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Particles.ParticleEmitter;
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
  private targets = new Map<string, { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; cell: [number, number]; boutique: boolean }>();
  blocked = new Set<string>();                // world cells

  constructor(private scene: WorldScene) {}

  /* ── fixed parts: floor, walls, archways ─────────────────────────────── */

  drawStatic() {
    const s = this.scene;
    const tile = (key: string, lx: number, ly: number) => {
      const [x, y] = toWorld(lx, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key), key).setDepth(-1e6 + (x + y));
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
    for (const g of Object.values(SLOT_GEO)) {
      if (g.kind !== 'bay') continue;
      const [x, y] = toWorld(g.x, g.y);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'bay-floor-border'), 'bay-floor-border').setDepth(-9e5);
    }
    // the back wall: a feature wall per boutique, a plainer one per display bay, plain in the archways
    const backAt = (key: string, lx: number) => {
      const [x, y] = toWorld(lx, 0);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key), key).setDepth(depthAt(x, y, -2));
    };
    for (let lx = 0; lx < MALL.w;) {
      const g = slotAt.get(`${lx},0`);
      if (g?.kind === 'boutique') { backAt('bq-wall', lx); lx += 6; }
      else if (g?.kind === 'bay') { backAt('bay-wall', lx); lx += 3; }
      else { backAt('mall-wall-r', lx); lx += 1; }
    }
    for (let ly = 0; ly < MALL.d; ly++) {
      const [x, y] = toWorld(0, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'mall-wall-l'), 'mall-wall-l').setDepth(depthAt(x, y, -2));
    }
    // the near sides are cut away to a low wall, so the camera sees in
    for (let lx = 0; lx < MALL.w;) {
      const g = slotAt.get(`${lx},${MALL.d - 1}`);
      const [key, n] = g?.kind === 'boutique' ? ['bq-front', 6] as const : g?.kind === 'bay' ? ['bay-front', 3] as const : ['mall-ledge-r', 1] as const;
      const [x, y] = toWorld(lx, MALL.d);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key), key).setDepth(depthAt(x + n, y, 1));
      lx += n;
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

  private flat(key: string, lx: number, ly: number, depth = -8e5) {
    const [x, y] = toWorld(lx, ly);
    const p = iso(x, y);
    return this.keep(this.scene.fit(this.scene.add.image(p.x, p.y, key), key).setDepth(depth)) as Phaser.GameObjects.Image;
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
      const sign = this.billboard('sign-section', p.x, p.y - 330, TOP - 20, 1.4);
      const t = this.textIn(sign, 'sign-section', sec.name, { size: 40, colour: '#f3e7cf', serif: true });
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
    this.flat('bq-floor-accent', g.x, g.y).setTint(accent).setAlpha(0.85);
    if (plan.rug) this.flat('rug', plan.rug[0], plan.rug[1], -7.5e5).setTint(lighten(accent, 0.55));
    for (const [px, py] of plan.plants) this.place('plant', px, py, 1, 1, 0, true);
    if (plan.counter) {
      const c = this.place('counter', plan.counter[0], plan.counter[1], 2, 1, 0, true);
      c.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(c, sel);
    }
    // the pavilion, in its own finish
    const pav = this.place('boutique-pavilion', plan.pavilion[0], plan.pavilion[1], 2, 2, 0, true);
    pav.setTint(b.colour ? lighten(accent, 0.7) : FINISH[i % FINISH.length]);
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
    // the name over the shop, with a health bar under it: on the back wall, or over the low front wall
    const [x, y] = toWorld(g.x + plan.sign, g.side === 'n' ? 0 : g.y + g.d);
    const p = iso(x, y);
    const sign = this.billboard('sign-section', p.x, p.y - (g.side === 'n' ? 170 : 52), TOP - 12, 0.55);
    const t = this.textIn(sign, 'sign-section', b.brand.toUpperCase(), { size: 30, colour: '#f3e7cf', bold: true });
    sign.setInteractive({ useHandCursor: true }); s.tag(sign, sel, 0);
    // the sign's panel (the picture itself has a clear margin): name above, health bar below
    const r = this.area(sign, 'sign-section');
    t.y -= r.h * 0.12;
    sign.setData('panel', new Phaser.Geom.Rectangle(r.x - r.w * 0.08, r.y - r.h * 0.12, r.w * 1.16, r.h * 1.3));
    const bar = this.healthBar(b, r.x + r.w * 0.12, r.y + r.h * 0.74, r.w * 0.76, Math.max(5, r.h * 0.14), TOP - 11.9);
    const items: Obj[] = [sign, t, bar];
    if (b.featured) items.push(this.text(r.x + 6, r.y + 2, '★', { size: 16, colour: '#f2c230', depth: TOP - 11.8 }).setOrigin(0.5, 0.5));
    this.signs.push({ items, prio: 3, dy: 0 });
    if (rank) this.badge(rank, r.x + r.w + 4, r.y, sel);
    this.targets.set(b.brand, { obj: sign, cell: toWorld(plan.pavilion[0], plan.pavilion[1]), boutique: true });
  }

  /* A display case: the base by ownership, watches by units, the glass over them. */
  private vitrine(own: Ownership, units: number, lx: number, ly: number, lift: number, dusty: boolean) {
    const s = this.scene;
    const [wx, wy] = toWorld(lx, ly);
    const base = depthAt(wx + 1, wy + 1);
    const fp = iso(wx + 1, wy + 1);
    const plinth = this.keep(s.fit(s.add.image(fp.x, fp.y - lift, PLINTH[own]), PLINTH[own]).setDepth(base)) as Phaser.GameObjects.Image;
    const onPlinth = ASSET[PLINTH[own]].surface;
    const glassOnFloor = ASSET['case-glass'].onFloor;
    const inside = (glassOnFloor ? onPlinth : onPlinth + ASSET['case-glass'].surface) + lift;
    const spots: [number, number][] = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5], [0.5, 0.18]];
    const n = watchesFor(units);
    for (let k = 0; k < n; k++) {
      const p = iso(wx + spots[k][0], wy + spots[k][1]);
      this.keep(s.fit(s.add.image(p.x, p.y - inside, 'watch'), 'watch').setDepth(base + 0.1 + k * 0.001));
    }
    const glass = this.keep(s.fit(s.add.image(fp.x, fp.y - (glassOnFloor ? 0 : onPlinth) - lift, 'case-glass'), 'case-glass').setDepth(base + 0.3)) as Phaser.GameObjects.Image;
    if (dusty) this.keep(s.fit(s.add.image(fp.x, fp.y - onPlinth - lift, 'case-dust'), 'case-dust').setDepth(base + 0.35));
    return [plinth, glass];
  }

  private kiosk(sp: MallSpot, rank: number) {
    const s = this.scene, b = sp.brand, g = sp.slot;
    const [lx, ly] = kioskCell(g, sp.position);
    const lift = g.kind === 'island' ? ASSET['island-platform'].surface : 0;
    const sel = { type: 'brand' as const, brand: b.brand };
    // until the kiosk art arrives, a small brand's stock stands in a display case like the boutiques'
    const objs = this.vitrine(b.inStock ? b.mainOwnership : 'unknown', b.inStock ? b.units : 0, lx, ly, lift, b.inStock && b.dusty);
    for (const o of objs) { if (!b.inStock) o.setAlpha(0.5); o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(o, sel); }
    const [x, y] = toWorld(lx, ly);
    const top = objs[1].getBounds().top;
    const c = iso(x + 0.5, y + 0.5);
    if (b.openPos.length) {
      const cr = this.keep(s.fit(s.add.image(c.x + 44, c.y + 24 - lift, 'crate-po'), 'crate-po', 0.55).setDepth(depthAt(x + 1, y + 1, 0.4))) as Phaser.GameObjects.Image;
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
  private badge(n: number, x: number, y: number, sel: { type: 'brand'; brand: string }, follow?: Phaser.GameObjects.Text) {
    const s = this.scene;
    const t = this.text(x, y, String(n), { size: 14, colour: '#22304d', bg: '#f2c230', bold: true, depth: TOP - 1.9 }).setOrigin(0.5, 0.5).setPadding(6, 2, 6, 2);
    t.setInteractive({ useHandCursor: true }); s.tag(t, sel, 0);
    t.setData('follow', follow ?? null);
    this.badges.push({ items: [t], prio: 4, dy: 0 });
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
      const t = gr.items[0] as Phaser.GameObjects.Text;
      t.setScale(badgeScale);
      const f = t.getData('follow') as Phaser.GameObjects.Text | null;
      if (f) {
        // on a kiosk: beside its chip close up, otherwise above the case
        const fb = f.getBounds();
        if (f.visible) t.setPosition(fb.right + 2 * badgeScale, fb.top + 4 * badgeScale);
        else t.setPosition(f.x, f.y - 6);
      }
    }
    for (const o of this.sectionSigns) (o as Phaser.GameObjects.Image).setVisible(on && overview);
    this.declutter();
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
