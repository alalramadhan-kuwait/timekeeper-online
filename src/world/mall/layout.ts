import type { SectionKey, SlotKind } from './data';

/* The Watch Mall's plan, in mall cells (one cell is one floor tile).
   38 cells along, 11 across: a back row 4 deep (y 0-3), the walkway 3 wide (y 4-6) and a
   front row 4 deep (y 7-10). Three sections of 12 cells, joined by 1-cell archway strips.
   The places (slots) are the database's own (world.mall_slots); this file only says where
   each one stands. The mall sits in the World at MALL.x0, MALL.y0, so its east end opens
   onto the corridor to the loading dock, and its near side stays clear of the office wall. */

export const MALL = { x0: -25, y0: -3, w: 38, d: 11 };
export const WALK = { y0: 4, y1: 7 };

export interface Section { key: SectionKey; name: string; short: string; x0: number; x1: number; tiles: [string, string] }
export const SECTIONS: Section[] = [
  { key: 'grand_gallery', name: 'Grand Gallery', short: 'Gallery', x0: 0, x1: 12, tiles: ['mall-tile-gg-a', 'mall-tile-gg-b'] },
  { key: 'collectors_arcade', name: 'Collectors’ Arcade', short: 'Arcade', x0: 13, x1: 25, tiles: ['mall-tile-ca-a', 'mall-tile-ca-b'] },
  { key: 'discovery_court', name: 'Discovery Court', short: 'Court', x0: 26, x1: 38, tiles: ['mall-tile-dc-a', 'mall-tile-dc-b'] },
];
export const ARCHES = [12, 25];          // the archway strips, one cell wide

export interface SlotGeo { slot: string; kind: SlotKind; side: 'n' | 's' | 'mid'; section: number; x: number; y: number; w: number; d: number }

const g = (slot: string, kind: SlotKind, side: SlotGeo['side'], section: number, x: number, y: number, w: number, d: number): SlotGeo =>
  ({ slot, kind, side, section, x, y, w, d });

export const SLOT_GEO: Record<string, SlotGeo> = Object.fromEntries([
  g('GG-N1', 'boutique', 'n', 0, 0, 0, 6, 4), g('GG-N2', 'boutique', 'n', 0, 6, 0, 6, 4),
  g('GG-S1', 'boutique', 's', 0, 0, 7, 6, 4), g('GG-S2', 'boutique', 's', 0, 6, 7, 6, 4),
  g('CA-N1', 'boutique', 'n', 1, 13, 0, 6, 4), g('CA-N2', 'boutique', 'n', 1, 19, 0, 6, 4),
  g('CA-S1', 'boutique', 's', 1, 13, 7, 6, 4),
  g('CA-S2', 'bay', 's', 1, 19, 7, 3, 4), g('CA-S3', 'bay', 's', 1, 22, 7, 3, 4),
  ...[0, 1, 2, 3].map((i) => g(`DC-N${i + 1}`, 'bay', 'n', 2, 26 + 3 * i, 0, 3, 4)),
  ...[0, 1, 2, 3].map((i) => g(`DC-S${i + 1}`, 'bay', 's', 2, 26 + 3 * i, 7, 3, 4)),
  g('GG-I1', 'island', 'mid', 0, 1, 5, 4, 1), g('GG-I2', 'island', 'mid', 0, 7, 5, 4, 1),
  g('CA-I1', 'island', 'mid', 1, 14, 5, 4, 1), g('CA-I2', 'island', 'mid', 1, 20, 5, 4, 1),
  g('DC-I1', 'island', 'mid', 2, 27, 5, 4, 1), g('DC-I2', 'island', 'mid', 2, 33, 5, 4, 1),
].map((s) => [s.slot, s]));

/* The cell a kiosk stands on, by its position (0-3) in a display area. Position 0 holds
   the area's most valuable brand and stands nearest the walkway. */
export function kioskCell(s: SlotGeo, position: number): [number, number] {
  if (s.kind === 'island') return [s.x + position, s.y];
  const col = position % 2 ? 2 : 0;
  if (s.side === 'n') return [s.x + col, s.y + (position < 2 ? 3 : 1)];
  return [s.x + col, s.y + (position < 2 ? 0 : 2)];
}

/* Inside a boutique (6 x 4), in three arrangements so neighbouring boutiques differ: the
   pavilion against the far side (the back wall in the back row, the walkway in the front
   row), cases for its stock, a cash desk, plants and a rug. Cells are the slot's own. */
export interface BoutiquePlan {
  variant: number;
  pavilion: [number, number];
  cases: [number, number][];
  counter: [number, number] | null;     // 2 x 1
  plants: [number, number][];
  rug: [number, number] | null;          // 3 x 3, flat
  crate: [number, number];
  sign: number;                          // where along the shop front the name hangs (0-6)
}
const PLANS: Omit<BoutiquePlan, 'variant'>[] = [
  { pavilion: [2, 0], cases: [[0, 1], [5, 1], [0, 3]], counter: null, plants: [[0, 0], [5, 0]], rug: [1, 1], crate: [5, 3], sign: 3 },
  { pavilion: [0, 0], cases: [[3, 1], [5, 1], [5, 3]], counter: [2, 3], plants: [[2, 0]], rug: [2, 0], crate: [0, 3], sign: 2.5 },
  { pavilion: [4, 0], cases: [[0, 1], [2, 1], [0, 3]], counter: [3, 3], plants: [[3, 0], [5, 3]], rug: [0, 0], crate: [2, 3], sign: 3.5 },
];
export function boutiquePlan(s: SlotGeo): BoutiquePlan {
  const order = ['GG-N1', 'GG-N2', 'GG-S1', 'GG-S2', 'CA-N1', 'CA-N2', 'CA-S1'];
  const variant = Math.max(0, order.indexOf(s.slot)) % PLANS.length;
  const p = PLANS[variant];
  const at = ([x, y]: [number, number]): [number, number] => [s.x + x, s.y + y];
  return {
    variant, pavilion: at(p.pavilion), cases: p.cases.map(at), counter: p.counter ? at(p.counter) : null,
    plants: p.plants.map(at), rug: p.rug ? at(p.rug) : null, crate: at(p.crate), sign: p.sign,
  };
}

/* A display bay's furnishing: a wall cabinet against the back wall (back row) or a plant by
   the low wall (front row), and a rug under its four kiosks. */
export function bayDecor(s: SlotGeo): { fixture: [number, number]; kind: 'cabinet' | 'plant'; rug: [number, number] } {
  return s.side === 'n'
    ? { fixture: [s.x + 1, s.y], kind: 'cabinet', rug: [s.x, s.y + 1] }
    : { fixture: [s.x + 1, s.y + 3], kind: 'plant', rug: [s.x, s.y] };
}

/* Pillars at the ends of each archway, planters in the strips' corners. */
export const PILLARS: [number, number][] = ARCHES.flatMap((x) => [[x, 3], [x, 7]] as [number, number][]);
export const PLANTERS: [number, number][] = ARCHES.flatMap((x) => [[x, 0], [x, 10]] as [number, number][]);

export const toWorld = (lx: number, ly: number): [number, number] => [lx + MALL.x0, ly + MALL.y0];
export const toLocal = (wx: number, wy: number): [number, number] => [wx - MALL.x0, wy - MALL.y0];

export function sectionOfLocalX(lx: number): number {
  return lx < 12.5 ? 0 : lx < 25.5 ? 1 : 2;
}

/* Cells something stands on, in mall cells. */
export function mallBlocked(places: { slot: string; position: number }[]): Set<string> {
  const b = new Set<string>();
  const add = (x: number, y: number, w = 1, d = 1) => { for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) b.add(`${x + i},${y + j}`); };
  for (const s of Object.values(SLOT_GEO)) {
    if (s.kind === 'boutique') {
      const p = boutiquePlan(s);
      add(p.pavilion[0], p.pavilion[1], 2, 2);
      p.cases.forEach(([x, y]) => add(x, y));
      p.plants.forEach(([x, y]) => add(x, y));
      if (p.counter) add(p.counter[0], p.counter[1], 2, 1);
      add(p.crate[0], p.crate[1]);
    } else if (s.kind === 'island') {
      // an island in use is a platform; a spare one holds a bench and a plant
      if (places.some((pl) => pl.slot === s.slot)) add(s.x, s.y, s.w, s.d);
      else { add(s.x, s.y, 2, 1); add(s.x + 3, s.y); }
    } else {
      const d = bayDecor(s);
      add(d.fixture[0], d.fixture[1]);
    }
  }
  for (const pl of places) {
    const s = SLOT_GEO[pl.slot];
    if (s && s.kind === 'bay') { const [x, y] = kioskCell(s, pl.position); add(x, y); }
  }
  PILLARS.forEach(([x, y]) => add(x, y));
  PLANTERS.forEach(([x, y]) => add(x, y));
  return b;
}
