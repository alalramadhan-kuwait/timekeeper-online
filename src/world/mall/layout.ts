import type { SectionKey, SlotKind } from './data';

/* The Watch Mall's plan, in mall cells (one cell is one floor tile).
   50 cells along, 17 across: a back row 6 deep (y 0-5), a walkway 5 wide (y 6-10) and a
   front row 6 deep (y 11-16). Three sections of 16 cells, joined by 1-cell archway strips.
   A boutique is 8 x 6 and a display area 4 x 6, so a section holds two boutiques or four
   display areas on each side. The places (slots) are the database's own (world.mall_slots);
   this file only says where each one stands, so the plan can change without moving a brand.
   The mall sits in the World at MALL.x0, MALL.y0: its east end opens onto the corridor to
   the loading dock, and its near side stays clear of the office wall.

   Why so deep: on a phone held upright the mall is seen as a band sloping down the screen.
   At 17 cells the band is taller than the screen at the section view's scale, so a section
   fills the screen instead of leaving empty corners. */

const BACK = 6, WALK_W = 5, FRONT = 6, SEC_W = 16;
const BQ: [number, number] = [8, 6], BAY: [number, number] = [4, 6];

export const MALL = { x0: -37, y0: -8, w: 3 * SEC_W + 2, d: BACK + WALK_W + FRONT };
export const WALK = { y0: BACK, y1: BACK + WALK_W };
/* The back walls' height, in world units, for framing. */
export const WALL_HEIGHT = 160;
/* People and display cases are drawn a little larger than the floor grid's own scale: the
   plan has room for them, and they read better on a phone. */
export const FIGURE_SCALE = 1.2;

export interface Section { key: SectionKey; name: string; short: string; x0: number; x1: number; tiles: [string, string] }
const secX = (i: number) => i * (SEC_W + 1);
export const SECTIONS: Section[] = [
  { key: 'grand_gallery', name: 'Grand Gallery', short: 'Gallery', x0: secX(0), x1: secX(0) + SEC_W, tiles: ['mall-tile-gg-a', 'mall-tile-gg-b'] },
  { key: 'collectors_arcade', name: 'Collectors’ Arcade', short: 'Arcade', x0: secX(1), x1: secX(1) + SEC_W, tiles: ['mall-tile-ca-a', 'mall-tile-ca-b'] },
  { key: 'discovery_court', name: 'Discovery Court', short: 'Court', x0: secX(2), x1: secX(2) + SEC_W, tiles: ['mall-tile-dc-a', 'mall-tile-dc-b'] },
];
export const ARCHES = [SEC_W, 2 * SEC_W + 1];          // the archway strips, one cell wide

export interface SlotGeo { slot: string; kind: SlotKind; side: 'n' | 's' | 'mid'; section: number; x: number; y: number; w: number; d: number }

const g = (slot: string, kind: SlotKind, side: SlotGeo['side'], section: number, x: number, y: number, w: number, d: number): SlotGeo =>
  ({ slot, kind, side, section, x, y, w, d });
const [BW, BD] = BQ, [YW, YD] = BAY;
const S_ROW = BACK + WALK_W;                          // the front row's first cell
const I_ROW = BACK + Math.floor(WALK_W / 2);           // the islands stand in the walkway's middle row
const islandX = (sec: number, k: number) => secX(sec) + (k ? 10 : 2);

export const SLOT_GEO: Record<string, SlotGeo> = Object.fromEntries([
  g('GG-N1', 'boutique', 'n', 0, secX(0), 0, BW, BD), g('GG-N2', 'boutique', 'n', 0, secX(0) + BW, 0, BW, BD),
  g('GG-S1', 'boutique', 's', 0, secX(0), S_ROW, BW, BD), g('GG-S2', 'boutique', 's', 0, secX(0) + BW, S_ROW, BW, BD),
  g('CA-N1', 'boutique', 'n', 1, secX(1), 0, BW, BD), g('CA-N2', 'boutique', 'n', 1, secX(1) + BW, 0, BW, BD),
  g('CA-S1', 'boutique', 's', 1, secX(1), S_ROW, BW, BD),
  g('CA-S2', 'bay', 's', 1, secX(1) + BW, S_ROW, YW, YD), g('CA-S3', 'bay', 's', 1, secX(1) + BW + YW, S_ROW, YW, YD),
  ...[0, 1, 2, 3].map((i) => g(`DC-N${i + 1}`, 'bay', 'n', 2, secX(2) + YW * i, 0, YW, YD)),
  ...[0, 1, 2, 3].map((i) => g(`DC-S${i + 1}`, 'bay', 's', 2, secX(2) + YW * i, S_ROW, YW, YD)),
  g('GG-I1', 'island', 'mid', 0, islandX(0, 0), I_ROW, 4, 1), g('GG-I2', 'island', 'mid', 0, islandX(0, 1), I_ROW, 4, 1),
  g('CA-I1', 'island', 'mid', 1, islandX(1, 0), I_ROW, 4, 1), g('CA-I2', 'island', 'mid', 1, islandX(1, 1), I_ROW, 4, 1),
  g('DC-I1', 'island', 'mid', 2, islandX(2, 0), I_ROW, 4, 1), g('DC-I2', 'island', 'mid', 2, islandX(2, 1), I_ROW, 4, 1),
].map((s) => [s.slot, s]));

/* The cell a kiosk stands on, by its position (0-3) in a display area. Position 0 holds
   the area's most valuable brand and stands nearest the walkway. In a display area the
   kiosks stand in columns 0 and 2 and rows 0 and 3 from the walkway, so every kiosk has a
   free cell beside it, also across the border with the next display area. */
export function kioskCell(s: SlotGeo, position: number): [number, number] {
  if (s.kind === 'island') return [s.x + position, s.y];
  const col = position % 2 ? 2 : 0;
  const fromWalk = position < 2 ? 0 : 3;
  return s.side === 'n' ? [s.x + col, s.y + s.d - 1 - fromWalk] : [s.x + col, s.y + fromWalk];
}

/* Inside a boutique (8 x 6), in three arrangements so neighbouring boutiques differ: the
   pavilion against one side, three cases for the stock, a counter, a bench where clients
   sit, plants and a rug. Every piece has a free cell round it, and the shop front keeps two
   clear rows. The same plan serves both rows: in the front row the pavilion stands by the
   walkway, so the low front wall never hides the shop behind it. */
export interface BoutiquePlan {
  variant: number;
  pavilion: [number, number];            // 2 x 2
  cases: [number, number][];
  counter: [number, number] | null;      // 2 x 1
  bench: [number, number] | null;        // 2 x 1, where clients sit
  plants: [number, number][];
  rug: [number, number] | null;          // flat
  crate: [number, number];               // shown only while the brand has an open order; in a middle row, clear of the door
  sign: number;                          // where along the shop front the name hangs (0-8)
}
type Plan = Omit<BoutiquePlan, 'variant'>;
const PLANS: Plan[] = [
  // a display hall: the pavilion centred at the back, cases either side
  { pavilion: [3, 0], cases: [[1, 2], [6, 2], [3, 3]], counter: [0, 4], bench: [5, 4], plants: [[0, 0], [7, 0]], rug: [2, 2], crate: [7, 3], sign: 4 },
  // a salon: the pavilion in one corner, the cases along the far side, seating by the door
  { pavilion: [0, 0], cases: [[4, 1], [6, 1], [6, 3]], counter: [3, 3], bench: [0, 4], plants: [[3, 0], [0, 5]], rug: [0, 2], crate: [7, 2], sign: 3.5 },
  // a long counter: the pavilion in the other corner, cases grouped on the open side
  { pavilion: [6, 0], cases: [[0, 1], [2, 1], [1, 3]], counter: [4, 3], bench: [6, 4], plants: [[5, 0]], rug: [3, 1], crate: [3, 2], sign: 4.5 },
];
export function boutiquePlan(s: SlotGeo): BoutiquePlan {
  const order = ['GG-N1', 'GG-N2', 'GG-S1', 'GG-S2', 'CA-N1', 'CA-N2', 'CA-S1'];
  const variant = Math.max(0, order.indexOf(s.slot)) % PLANS.length;
  const p = PLANS[variant];
  const at = ([x, y]: [number, number]): [number, number] => [s.x + x, s.y + y];
  return {
    variant, pavilion: at(p.pavilion), cases: p.cases.map(at), counter: p.counter ? at(p.counter) : null,
    bench: p.bench ? at(p.bench) : null, plants: p.plants.map(at), rug: p.rug ? at(p.rug) : null, crate: at(p.crate), sign: p.sign,
  };
}

/* A display bay's furnishing: a wall cabinet against the back wall (back row) or a plant by
   the low wall (front row), and a rug under its four kiosks. */
export function bayDecor(s: SlotGeo): { fixture: [number, number]; kind: 'cabinet' | 'plant'; rug: [number, number] } {
  return s.side === 'n'
    ? { fixture: [s.x + 1, s.y], kind: 'cabinet', rug: [s.x, s.y + 2.5] }
    : { fixture: [s.x + 1, s.y + s.d - 1], kind: 'plant', rug: [s.x, s.y + 0.5] };
}

/* Pillars at the ends of each archway, planters in the strips' corners. */
export const PILLARS: [number, number][] = ARCHES.flatMap((x) => [[x, WALK.y0 - 1], [x, WALK.y1]] as [number, number][]);
export const PLANTERS: [number, number][] = ARCHES.flatMap((x) => [[x, 0], [x, MALL.d - 1]] as [number, number][]);

export const toWorld = (lx: number, ly: number): [number, number] => [lx + MALL.x0, ly + MALL.y0];
export const toLocal = (wx: number, wy: number): [number, number] => [wx - MALL.x0, wy - MALL.y0];

export function sectionOfLocalX(lx: number): number {
  return lx < ARCHES[0] + 0.5 ? 0 : lx < ARCHES[1] + 0.5 ? 1 : 2;
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
      if (p.bench) add(p.bench[0], p.bench[1], 2, 1);
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
