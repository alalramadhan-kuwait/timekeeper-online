/* The inside of a boutique: one room, laid out like a watch boutique, not like a report.

   A few watches stand in the glass cases on the floor, as a shop shows its pieces; the whole
   collection lives on the Collection Board, built into the back wall, which opens the catalogue.

   The room stands on its own patch of the map, well away from the mall, so nothing else is ever
   in view while the owner is inside. Cell (0, 0) is its back corner; the walls run along x = 0
   (the left wall) and y = 0 (the back wall); the door is in the front edge, to the right. */

export const ROOM = { W: 14, D: 11 };
export const BOUTIQUE_AT = { x: -30, y: 45 };                 // world cell of the room's back corner
export const toWorldB = (x: number, y: number): [number, number] => [BOUTIQUE_AT.x + x, BOUTIQUE_AT.y + y];

export const WALL_H = 300;                                    // world units
/* The Collection Board: a lit panel built into the back wall, between these cells and heights. */
export const BOARD = { x0: 2.6, x1: 11.4, lo: 46, hi: 252 };

/* The door: two cells in the front edge, the mat just inside. */
export const DOOR: [number, number][] = [[11, ROOM.D - 1], [12, ROOM.D - 1]];
export const ENTRY: [number, number] = [11, ROOM.D - 2];       // where the owner stands on coming in

/* Furniture, in room cells. Six glass cases, one watch in each. */
export const PEDESTALS: [number, number][] = [[4, 5], [7, 5], [10, 5], [4, 8], [7, 8], [10, 8]];
export const COUNTER: { cell: [number, number]; w: number; d: number } = { cell: [1, 8], w: 2, d: 1 };
export const BENCH: { cell: [number, number]; w: number; d: number } = { cell: [12, 3], w: 2, d: 1 };
export const PLANTS: [number, number][] = [[13, 7], [1, 1], [13, 1]];

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
