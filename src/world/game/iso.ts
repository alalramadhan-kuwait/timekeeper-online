/* Isometric maths. One cell is 128 x 64 in world units (the art is drawn at 2x).
   iso(x, y) is the top corner of cell (x, y); its front corner is iso(x + 1, y + 1). */

export const HALF_W = 64;
export const HALF_H = 32;

export const iso = (x: number, y: number) => ({ x: (x - y) * HALF_W, y: (x + y) * HALF_H });

/* The cell under a world point. */
export function cellAt(wx: number, wy: number): [number, number] {
  const a = wy / HALF_H, b = wx / HALF_W;
  return [Math.floor((a + b) / 2), Math.floor((a - b) / 2)];
}

/* Draw order: whatever reaches further towards the viewer is drawn later. */
export const depthAt = (frontX: number, frontY: number, bias = 0) => (frontX + frontY) * HALF_H + bias;

/* Shortest walk between two cells, four ways, avoiding blocked cells. */
export function findPath(
  from: [number, number], to: [number, number],
  open: (x: number, y: number) => boolean, limit = 4000,
): [number, number][] | null {
  const key = (x: number, y: number) => `${x},${y}`;
  if (!open(to[0], to[1])) return null;
  const prev = new Map<string, string | null>([[key(...from), null]]);
  const queue: [number, number][] = [from];
  let steps = 0;
  while (queue.length && steps++ < limit) {
    const [x, y] = queue.shift()!;
    if (x === to[0] && y === to[1]) {
      const path: [number, number][] = [];
      let k: string | null = key(x, y);
      while (k) { const [px, py] = k.split(',').map(Number); path.unshift([px, py]); k = prev.get(k) ?? null; }
      return path.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (!prev.has(k) && open(nx, ny)) { prev.set(k, key(x, y)); queue.push([nx, ny]); }
    }
  }
  return null;
}
