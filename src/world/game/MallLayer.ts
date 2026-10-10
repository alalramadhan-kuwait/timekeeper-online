import Phaser from 'phaser';
import { ASSET } from '../assets/manifest';
import { ARCHES, MALL, PILLARS, PLANTERS, SECTIONS, SLOT_GEO, WALK, boutiquePlan, kioskCell, mallBlocked, toWorld, type SlotGeo } from '../mall/layout';
import { displayName, type MallBrand, type MallModel, type MallSpot } from '../mall/model';
import type { Ownership, StockClass } from '../types';
import { depthAt, iso } from './iso';
import type { WorldScene } from './WorldScene';

/* The Watch Mall on the Floor tab: three sections, boutiques for the major brands, kiosks in
   display areas for the rest. Everything here follows world_mall()'s stored places, so a
   brand stands where an owner put it, whatever its stock does. */

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const TOP = 1_000_000;                         // the scene's label layer
const HEALTH: [StockClass, number][] = [['fast', 0x3f8f5a], ['healthy', 0x7fb38f], ['new', 0x5f7ea8], ['slow', 0xd9a441], ['dead', 0x9a958b]];
const OWN_COLOUR: Record<Ownership, number> = { owned: 0x9b6a43, consignment: 0x7a5a96, pre_owned: 0x3f8f8a, unknown: 0x9aa0a6 };
const PLINTH: Record<Ownership, string> = {
  owned: 'case-plinth-owned', consignment: 'case-plinth-consignment', pre_owned: 'case-plinth-preowned', unknown: 'case-plinth-unknown',
};
const KIOSK: Record<Ownership, string> = {
  owned: 'kiosk-base-owned', consignment: 'kiosk-base-consignment', pre_owned: 'kiosk-base-preowned', unknown: 'kiosk-base-unknown',
};
const DEFAULT_COLOURS = [0x22304d, 0x7a2e35, 0x2d6f7a, 0x5a4a8a, 0x8a6a2e, 0x3f6b4a, 0x6b3f5a];

export const kd0 = (n: number) => `${Math.round(n).toLocaleString('en-US')} KD`;
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type Obj = Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics | Phaser.GameObjects.Particles.ParticleEmitter;

export class MallLayer {
  private dyn: Obj[] = [];
  /* level of detail: what shows at which zoom */
  private kioskDetail: Obj[] = [];            // kiosk boards: zoomed in
  private boutiqueDetail: Obj[] = [];         // boutique boards: zoomed in
  private kioskTags: Phaser.GameObjects.Text[] = [];   // a display area's names: section view
  private sectionSigns: Obj[] = [];
  private displayTags: Phaser.GameObjects.Text[] = [];
  private lastCss = -1;
  private shown = true;                         // false while another area is chosen
  private targets = new Map<string, { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; cell: [number, number]; boutique: boolean }>();
  blocked = new Set<string>();       // world cells
  private lastSign: Phaser.GameObjects.Image | null = null;

  constructor(private scene: WorldScene) {}

  /* ── fixed parts: floor, walls, archways ─────────────────────────────── */

  drawStatic() {
    const s = this.scene;
    const tile = (key: string, lx: number, ly: number, tint?: number) => {
      const [x, y] = toWorld(lx, ly);
      const p = iso(x, y);
      const o = s.fit(s.add.image(p.x, p.y, key), key).setDepth(-1e6 + (x + y));
      if (tint !== undefined) o.setTint(tint);
    };
    const slotAt = new Map<string, SlotGeo>();
    for (const g of Object.values(SLOT_GEO)) if (g.kind !== 'island') for (let i = 0; i < g.w; i++) for (let j = 0; j < g.d; j++) slotAt.set(`${g.x + i},${g.y + j}`, g);
    for (let lx = 0; lx < MALL.w; lx++) for (let ly = 0; ly < MALL.d; ly++) {
      const g = slotAt.get(`${lx},${ly}`);
      if (ARCHES.includes(lx)) tile('mall-tile-arch', lx, ly);
      else if (g?.kind === 'boutique') tile('mall-tile-boutique', lx, ly);
      else if (g?.kind === 'bay') tile('mall-tile-bay', lx, ly);
      else {
        const sec = SECTIONS.find((x) => lx >= x.x0 && lx < x.x1)!;
        tile(sec.tiles[(lx + ly) % 2], lx, ly);
      }
    }
    // flat inlays: a border round each display bay
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
    // the far end wall (the Grand Gallery's), full height
    for (let ly = 0; ly < MALL.d; ly++) {
      const [x, y] = toWorld(0, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'mall-wall-l'), 'mall-wall-l').setDepth(depthAt(x, y, -2));
    }
    // the near sides are cut away to a low wall, so the camera sees in
    for (let lx = 0; lx < MALL.w;) {
      const g = slotAt.get(`${lx},${MALL.d - 1}`);
      const [key, n] = g?.kind === 'boutique' ? ['bq-front', 6] : g?.kind === 'bay' ? ['bay-front', 3] : ['mall-ledge-r', 1];
      const [x, y] = toWorld(lx, MALL.d);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, key as string), key as string).setDepth(depthAt(x + (n as number), y, 1));
      lx += n as number;
    }
    // the near end opens onto the corridor to the loading dock, along the walkway
    for (let ly = 0; ly < MALL.d; ly++) {
      if (ly >= WALK.y0 && ly < WALK.y1) continue;
      const [x, y] = toWorld(MALL.w, ly);
      const p = iso(x, y);
      s.fit(s.add.image(p.x, p.y, 'mall-ledge-l'), 'mall-ledge-l').setDepth(depthAt(x, y + 1, 1));
    }
    // archway pillars and planters
    for (const [lx, ly] of PILLARS) this.standFixed('arch-pillar', lx, ly);
    for (const [lx, ly] of PLANTERS) this.standFixed('planter-mall', lx, ly);
  }

  private standFixed(key: string, lx: number, ly: number, w = 1, d = 1) {
    const [x, y] = toWorld(lx, ly);
    const p = iso(x + w, y + d);
    return this.scene.fit(this.scene.add.image(p.x, p.y, key), key).setDepth(depthAt(x + w, y + d));
  }

  /* ── what follows the data ───────────────────────────────────────────── */

  build(m: MallModel) {
    for (const o of this.dyn) o.destroy();
    this.dyn = []; this.kioskDetail = []; this.boutiqueDetail = []; this.kioskTags = []; this.sectionSigns = []; this.displayTags = [];
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

    // display areas: in the section view, one label with the area's brands; a tap lists them
    for (const g of Object.values(SLOT_GEO)) {
      if (g.kind === 'boutique') continue;
      const here = m.spots.filter((sp) => sp.slot.slot === g.slot).sort((a, b) => a.position - b.position);
      if (!here.length) continue;
      const [x, y] = toWorld(g.x + g.w / 2, g.kind === 'island' ? g.y + 0.5 : g.side === 'n' ? g.y : g.y + g.d);
      const p = iso(x, y);
      const names = here.map((sp) => short(sp.brand.brand, 14) + (sp.brand.missions.length ? ' !' : ''));
      const lines = [displayName(g.slot).toUpperCase()];
      for (let i = 0; i < names.length; i += 2) lines.push(names.slice(i, i + 2).join(' · '));
      const tag = this.text(p.x, p.y - (g.side === 'n' ? 120 : g.kind === 'island' ? 40 : 10), lines.join('\n'),
        { size: 13, colour: '#ffffff', bg: '#22304de6', depth: TOP - 6 }).setAlign('center').setLineSpacing(2);
      tag.setOrigin(0.5, g.side === 's' ? 0 : 1);
      tag.setInteractive({ useHandCursor: true });
      this.scene.tag(tag, { type: 'display', slot: g.slot }, 0);
      this.kioskTags.push(tag);
    }

    // walkway islands, where brands stand on them (spare ones stay clear floor until used)
    for (const g of Object.values(SLOT_GEO)) {
      if (g.kind === 'island' && m.spots.some((sp) => sp.slot.slot === g.slot)) this.keep(this.standFixed('island-platform', g.x, g.y, g.w, g.d));
    }
    for (const sp of m.spots) {
      if (sp.slot.kind === 'boutique') this.boutique(sp, m);
      else this.kiosk(sp);
    }
    this.applyLod(true);
  }

  private boutique(sp: MallSpot, m: MallModel) {
    const s = this.scene, b = sp.brand, g = sp.slot, plan = boutiquePlan(g);
    const colour = b.colour ? parseInt(b.colour.slice(1), 16) : DEFAULT_COLOURS[Object.values(SLOT_GEO).indexOf(g) % DEFAULT_COLOURS.length];
    // the brand colour on the floor inlay
    {
      const [x, y] = toWorld(g.x, g.y);
      const p = iso(x, y);
      this.keep(s.fit(s.add.image(p.x, p.y, 'bq-floor-accent'), 'bq-floor-accent').setDepth(-8e5).setTint(colour).setAlpha(0.8));
    }
    const sel = { type: 'brand' as const, brand: b.brand };
    // the pavilion: the brand's shop-in-shop
    const pav = this.stand('boutique-pavilion', plan.pavilion[0], plan.pavilion[1], 2, 2);
    pav.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    s.tag(pav, sel, -24);
    // cases: one per kind of ownership it holds (up to three), watches by units
    const owns = (Object.entries(b.ownership) as [Ownership, { units: number; cost: number }][])
      .filter(([, v]) => v.units > 0).sort((a, c) => c[1].cost - a[1].cost).slice(0, 3);
    if (owns.length === 1 && b.units > 10) owns.push(owns[0]);
    owns.forEach(([own, v], i) => {
      const [cx, cy] = plan.cases[i];
      const [wx, wy] = toWorld(cx, cy);
      const plinth = s.stand(PLINTH[own], wx, wy);
      const onPlinth = ASSET[PLINTH[own]].surface;
      const glassOnFloor = ASSET['case-glass'].onFloor;
      const inside = glassOnFloor ? onPlinth : onPlinth + ASSET['case-glass'].surface;
      const spots: [number, number][] = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.5], [0.5, 0.18]];
      const n = watchesFor(owns.length > 1 && owns[0][0] === owns[1][0] ? v.units / 2 : v.units);
      for (let k = 0; k < n; k++) {
        const p = iso(wx + spots[k][0], wy + spots[k][1]);
        s.img('watch', p.x, p.y - inside, depthAt(wx + 1, wy + 1) + 0.1 + k * 0.001);
      }
      const glass = s.stand('case-glass', wx, wy, 1, 1, glassOnFloor ? 0 : onPlinth, 0.3);
      if (b.dusty) s.stand('case-dust', wx, wy, 1, 1, onPlinth, 0.35);
      for (const o of [plinth, glass]) { o.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(o, sel); }
    });
    // open orders: a crate by the door
    if (b.openPos.length) {
      const c = this.stand('crate-po', plan.crate[0], plan.crate[1]);
      c.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
      s.tag(c, sel, 0);
    }
    // the name over the shop: on the back wall, or hung over the walkway
    {
      const [x, y] = toWorld(g.x + g.w / 2, g.side === 'n' ? 0 : g.y + g.d);
      const p = iso(x, y);
      const sign = this.billboard('sign-section', p.x, p.y - (g.side === 'n' ? 168 : 46), TOP - 12, 0.55);
      const t = this.textIn(sign, 'sign-section', b.brand.toUpperCase(), { size: 30, colour: '#f3e7cf', bold: true });
      this.lastSign = sign;
      sign.setInteractive({ useHandCursor: true }); s.tag(sign, sel, 0);
      if (b.featured) this.keep(this.text(t.x, sign.getBounds().top - 6, '★ Featured', { size: 14, colour: '#22304d', bg: '#f2c230', depth: TOP - 11 }).setOrigin(0.5, 1));
    }
    // the board: units, value, health, ownership and orders
    const [bx, by] = toWorld(plan.board[0], plan.board[1]);
    const bp = iso(bx + 0.55, by + 0.85);
    const board = this.billboard('board-major', bp.x, bp.y, depthAt(bx + 1, by + 1, 0.6), 1);
    board.setInteractive({ useHandCursor: true }); s.tag(board, sel, 0);
    this.boutiqueDetail.push(board, ...this.writeBoard(board, 'board-major', b, false, depthAt(bx + 1, by + 1, 0.61)));
    if (b.missions.length) {
      // a mission: a marker by the shop's name (and on its board, close up)
      const sb = this.lastSign!.getBounds();
      this.keep(s.bobbing(s.fit(s.add.image(sb.right - 4, sb.top + 8, 'alert'), 'alert', 0.8).setDepth(TOP - 1)));
    }
    this.targets.set(b.brand, { obj: board, cell: [bx, by], boutique: true });
    void m;
  }

  private kiosk(sp: MallSpot) {
    const s = this.scene, b = sp.brand, g = sp.slot;
    const [lx, ly] = kioskCell(g, sp.position);
    const [x, y] = toWorld(lx, ly);
    const lift = g.kind === 'island' ? ASSET['island-platform'].surface : 0;
    const sel = { type: 'brand' as const, brand: b.brand };
    const p = iso(x + 1, y + 1);
    const k = this.keep(s.fit(s.add.image(p.x, p.y - lift, KIOSK[b.mainOwnership]), KIOSK[b.mainOwnership])
      .setDepth(depthAt(x + 1, y + 1, 0.2))) as Phaser.GameObjects.Image;
    if (!b.inStock) k.setAlpha(0.45);
    k.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 });
    s.tag(k, sel, 0);
    const top = k.getBounds().top;
    const c = iso(x + 0.5, y + 0.5);
    if (b.openPos.length) {
      const cr = this.keep(s.fit(s.add.image(c.x + 40, c.y + 20 - lift, 'crate-po'), 'crate-po', 0.6).setDepth(depthAt(x + 1, y + 1, 0.25))) as Phaser.GameObjects.Image;
      cr.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 1 }); s.tag(cr, sel, 0);
    }
    if (b.sparkle && !this.scene.reducedMotion) {
      const e = s.add.particles(c.x, top + 20, 'sparkle', {
        x: { min: -30, max: 30 }, y: { min: -16, max: 16 }, lifespan: 900, frequency: 700,
        scale: { start: 0.7 * (ASSET.sparkle.drawWidth / (s.textures.get('sparkle').get().width || ASSET.sparkle.drawWidth)), end: 0 },
        alpha: { start: 1, end: 0 }, quantity: 1,
      }).setDepth(depthAt(x + 1, y + 1, 0.4));
      this.keep(e);
    }
    // zoomed in: a small board with the name, units, value and health
    // neighbours on an island stand a cell apart: alternate boards are raised so none overlap
    const raise = g.kind === 'island' && sp.position % 2 ? 78 : 0;
    const board = this.billboard('board-minor', c.x, top + 4 - raise, TOP - 5, 0.72);
    board.setInteractive({ useHandCursor: true }); s.tag(board, sel, 0);
    this.kioskDetail.push(board, ...this.writeBoard(board, 'board-minor', b, true, TOP - 4.9));
    if (b.missions.length) {
      const a = this.keep(s.fit(s.add.image(board.getBounds().right - 6, board.getBounds().top + 4, 'alert'), 'alert', 0.8).setDepth(TOP - 1)) as Phaser.GameObjects.Image;
      s.bobbing(a);
      this.kioskDetail.push(a);
    }
    this.targets.set(b.brand, { obj: k, cell: [x, y], boutique: false });
  }

  /* Writes a board: name, units and value, a health bar, ownership and orders. */
  private writeBoard(board: Phaser.GameObjects.Image, key: string, b: MallBrand, small: boolean, depth: number): Obj[] {
    const s = this.scene;
    const r = this.area(board, key);
    const out: Obj[] = [];
    const g = s.add.graphics().setDepth(depth);
    g.fillStyle(0x22304d, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 6);
    out.push(this.keep(g));
    const pad = r.w * 0.06, inner = r.w - 2 * pad;
    const line = (txt: string, y: number, size: number, colour = '#f3e7cf', bold = false) => {
      const t = this.text(r.x + pad, y, txt, { size, colour, bold, depth: depth + 0.001 }).setOrigin(0, 0);
      if (t.displayWidth > inner) t.setScale((inner / t.displayWidth) * t.scaleX);
      out.push(t);
      return t;
    };
    const fs = small ? r.h / 5.2 : r.h / 7.2;
    let y = r.y + pad * 0.6;
    line(b.brand, y, fs * 1.05, '#ffffff', true); y += fs * 1.45;
    line(`${b.units.toLocaleString('en-US')} units · ${kd0(b.cost)}`, y, fs * 0.92, '#f2d58a', true); y += fs * 1.35;
    // health: stock at cost by class
    const total = HEALTH.reduce((n, [c]) => n + (b.classes[c]?.cost_value ?? 0), 0) || 1;
    let hx = r.x + pad;
    const hh = small ? fs * 0.55 : fs * 0.5;
    g.fillStyle(0x3a4560, 1).fillRect(r.x + pad, y, inner, hh);
    for (const [c, col] of HEALTH) {
      const w = ((b.classes[c]?.cost_value ?? 0) / total) * inner;
      if (w > 0) { g.fillStyle(col, 1).fillRect(hx, y, w, hh); hx += w; }
    }
    y += hh + fs * 0.45;
    if (small) return out;
    // ownership split, by cost
    const ownTotal = Object.values(b.ownership).reduce((n, o) => n + (o?.cost ?? 0), 0) || 1;
    let ox = r.x + pad;
    for (const own of ['owned', 'consignment', 'pre_owned', 'unknown'] as Ownership[]) {
      const w = ((b.ownership[own]?.cost ?? 0) / ownTotal) * inner;
      if (w > 0) { g.fillStyle(OWN_COLOUR[own], 1).fillRect(ox, y, w, hh * 0.6); ox += w; }
    }
    y += hh * 0.6 + fs * 0.4;
    const owned = Math.round(((b.ownership.owned?.cost ?? 0) / ownTotal) * 100);
    line(`Owned ${owned}% · consignment ${Math.round(((b.ownership.consignment?.cost ?? 0) / ownTotal) * 100)}%`, y, fs * 0.72); y += fs * 1.05;
    const po = b.openPos.length ? `${b.openPos.length} open PO${b.openPos.length === 1 ? '' : 's'}` : 'No open POs';
    line(`${po} · sold yesterday ${b.soldYesterday}`, y, fs * 0.72);
    return out;
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
    if (o === undefined) return t;
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

  private stand(key: string, lx: number, ly: number, w = 1, d = 1) {
    const [x, y] = toWorld(lx, ly);
    return this.keep(this.scene.stand(key, x, y, w, d)) as Phaser.GameObjects.Image;
  }

  private keep<T extends Obj>(o: T): T { this.dyn.push(o); return o; }

  /* ── level of detail and camera help ─────────────────────────────────── */

  /* The mall's labels and boards float above everything; another area's view hides them. */
  setShown(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.applyLod(true);
  }

  /* cssPerUnit: CSS pixels per world unit at the current zoom. */
  lod(cssPerUnit: number) {
    // re-applied whenever the level changes, and as the zoom moves (names keep their size)
    const level = (c: number) => (c >= 0.62 ? 3 : c >= 0.45 ? 2 : c >= 0.3 ? 1 : 0);
    if (level(cssPerUnit) === level(this.lastCss) && Math.abs(cssPerUnit - this.lastCss) < 0.01) return;
    this.lastCss = cssPerUnit;
    this.applyLod(false);
  }

  private applyLod(force: boolean) {
    const css = this.lastCss < 0 ? 0.5 : this.lastCss;
    // three levels: the whole mall (section names), a section (shop names and each display
    // area's brands), close up (every brand's board)
    const on = this.shown;
    const detail = on && css >= 0.62, overview = css < 0.3;
    for (const o of this.kioskDetail) (o as Phaser.GameObjects.Image).setVisible(detail);
    for (const o of this.boutiqueDetail) (o as Phaser.GameObjects.Image).setVisible(on && (detail || css >= 0.45));
    // display-area labels keep a readable size on screen (about 11 px), whatever the zoom
    const k = Phaser.Math.Clamp(0.85 / Math.max(css, 0.05), 0.6, 4);
    for (const t of this.kioskTags) t.setVisible(on && !detail && !overview).setScale(k);
    for (const o of this.sectionSigns) (o as Phaser.GameObjects.Image).setVisible(on && overview);
    void force;
  }

  /* Where a brand stands: the object to frame and select. */
  target(brand: string) { return this.targets.get(brand) ?? null; }

  /* A section's extent on screen, in world units. */
  sectionBounds(i: number) {
    const sec = SECTIONS[i];
    const [x0, y0] = toWorld(sec.x0 - 0.5, 0), [x1, y1] = toWorld(sec.x1 + 0.5, MALL.d);
    const left = iso(x0, y1).x, right = iso(x1, y0).x, top = iso(x0, y0).y - 260, bottom = iso(x1, y1).y + 30;
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
