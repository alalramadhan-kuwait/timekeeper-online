/* The inside of a boutique: one room, laid out like a watch boutique, not like a report.

   Watches stand where a shop puts them: in lit niches along the two walls, three shelves high,
   and two to a glass pedestal on the floor. They follow one another by their Lightspeed name, so
   a model's siblings (its dials, its steel and gold) stand side by side without anyone inventing
   a collection, and a sold-out watch keeps its place among them as an empty-looking card.

   The room stands on its own patch of the map, well away from the mall, so nothing else is ever
   in view while the owner is inside. Cell (0, 0) is its back corner; the walls run along x = 0
   (the left wall) and y = 0 (the back wall); the door is in the front edge, to the right. */

export const ROOM = { W: 14, D: 11 };
export const BOUTIQUE_AT = { x: -30, y: 45 };                 // world cell of the room's back corner
export const toWorldB = (x: number, y: number): [number, number] => [BOUTIQUE_AT.x + x, BOUTIQUE_AT.y + y];

export const WALL_H = 300;                                    // world units
export const SHELVES = [52, 128, 204];                         // each niche's floor, above the room's floor
export const NICHE_H = 68;

/* The door: two cells in the front edge, the mat just inside. */
export const DOOR: [number, number][] = [[11, ROOM.D - 1], [12, ROOM.D - 1]];
export const ENTRY: [number, number] = [11, ROOM.D - 2];       // where the owner stands on coming in

/* Furniture, in room cells. */
export const PEDESTALS: [number, number][] = [[4, 3], [7, 3], [10, 3], [4, 6], [7, 6], [10, 6], [4, 9], [7, 9], [10, 9]];
export const COUNTER: { cell: [number, number]; w: number; d: number } = { cell: [1, 8], w: 2, d: 1 };
export const BENCH: { cell: [number, number]; w: number; d: number } = { cell: [12, 4], w: 2, d: 1 };
export const PLANTS: [number, number][] = [[13, 8], [1, 1]];

export type DisplaySpot =
  | { kind: 'back'; cell: number; shelf: number }               // a niche in the back wall (y = 0), above cell x
  | { kind: 'left'; cell: number; shelf: number }               // a niche in the left wall (x = 0), above cell y
  | { kind: 'pedestal'; index: number; side: 0 | 1 };            // one of a pedestal's two places

/* Every place a watch can stand, in the order watches fill them: along the back wall from the
   left corner, top shelf to bottom, then down the left wall, then the pedestals. The middle of the
   back wall's top shelf is the brand's sign. */
export function displaySpots(): DisplaySpot[] {
  const spots: DisplaySpot[] = [];
  const sign = (x: number) => x === 6 || x === 7;
  for (let shelf = SHELVES.length - 1; shelf >= 0; shelf--) {
    for (let x = 1; x < ROOM.W; x++) if (!(shelf === SHELVES.length - 1 && sign(x))) spots.push({ kind: 'back', cell: x, shelf });
  }
  for (let shelf = SHELVES.length - 1; shelf >= 0; shelf--) {
    for (let y = 1; y < ROOM.D; y++) spots.push({ kind: 'left', cell: y, shelf });
  }
  PEDESTALS.forEach((_, index) => { spots.push({ kind: 'pedestal', index, side: 0 }, { kind: 'pedestal', index, side: 1 }); });
  return spots;
}

/* The cells people walk round. */
export function blockedB(): Set<string> {
  const b = new Set<string>();
  const add = ([x, y]: [number, number], w = 1, d = 1) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) { const [wx, wy] = toWorldB(x + i, y + j); b.add(`${wx},${wy}`); }
  };
  PEDESTALS.forEach((c) => add(c));
  add(COUNTER.cell, COUNTER.w, COUNTER.d);
  add(BENCH.cell, BENCH.w, BENCH.d);
  PLANTS.forEach((c) => add(c));
  return b;
}
