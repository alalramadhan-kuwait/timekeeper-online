#!/usr/bin/env node
/* Builds assets/geo/world.json (country and US-state outlines in lon/lat) for the `map` element.
 * Needs: npm i world-atlas us-atlas topojson-client   (run once; the output is committed).
 * Data: Natural Earth via world-atlas (public domain) and US Census via us-atlas.
 *   node build-geo.mjs <path-to-node_modules> */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const nm = process.argv[2] || 'node_modules';
const req = createRequire(path.resolve(nm, 'x.js'));
const topo = req('topojson-client');
const world = req('world-atlas/countries-50m.json');
const us = req('us-atlas/states-10m.json');

function dp(pts, tol) { // Douglas-Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const r2 = (n) => Math.round(n * 100) / 100;
function rings(geom, tol, minPts = 4) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const out = [];
  for (const p of polys) for (const ring of p.slice(0, 1)) { // outer ring only; holes are lakes we ignore
    // a closed ring starts and ends on the same point, which breaks the distance test, so simplify its two halves
    const mid = Math.floor(ring.length / 2);
    const simp = dp(ring.slice(0, mid + 1), tol).concat(dp(ring.slice(mid), tol).slice(1));
    const s = simp.map(([x, y]) => [r2(x), r2(y)]);
    if (s.length >= minPts) out.push(s.flat());
  }
  return out;
}
const countries = topo.feature(world, world.objects.countries).features
  .filter((f) => f.properties.name !== 'Antarctica')
  .map((f) => ({ n: f.properties.name, r: rings(f.geometry, 0.06) }))
  .filter((c) => c.r.length);
const states = topo.feature(us, us.objects.states).features
  .map((f) => ({ n: f.properties.name, r: rings(f.geometry, 0.04) }))
  .filter((c) => c.r.length);
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'geo', 'world.json');
fs.writeFileSync(out, JSON.stringify({ countries, states }));
console.log("wrote", out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB', countries.length, 'countries', states.length, 'states');
