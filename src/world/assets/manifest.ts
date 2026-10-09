/* Every picture the World draws, by key.

   The artwork is replaceable without touching the game: put a file with the same
   key in ./final/ (PNG, WebP or SVG) and it is used instead of the placeholder in
   ./placeholder/. A character can also be an animated sheet, named
   `<key>@<frameWidth>x<frameHeight>.png`: row 1 is standing still, row 2 walking.
   Sizes and anchor points are listed in ./README.md. */

const placeholder = import.meta.glob('./placeholder/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const final = import.meta.glob('./final/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface AssetDef {
  key: string;
  url: string;
  type: 'svg' | 'image' | 'sheet';
  width: number;                    // drawn size, at 2x (one floor tile is 128 x 64)
  height: number;
  frame?: { width: number; height: number };
  /* Where the picture touches the floor, as a fraction of its size. */
  origin: [number, number];
}

const fileKey = (path: string) => path.split('/').pop()!.replace(/\.(svg|png|webp)$/, '');

const finals = new Map<string, { url: string; svg: boolean; frame?: { width: number; height: number } }>();
for (const [path, url] of Object.entries(final)) {
  const m = fileKey(path).match(/^(.+?)(?:@(\d+)x(\d+))?$/)!;
  finals.set(m[1], { url, svg: path.endsWith('.svg'), frame: m[2] ? { width: +m[2], height: +m[3] } : undefined });
}
const placeholders = new Map(Object.entries(placeholder).map(([p, url]) => [fileKey(p), url]));

/* key, size, anchor. Objects standing on the floor are anchored at the front
   corner of their footprint; flat things (tiles) at their top corner. */
const SPECS: [string, number, number, number, number][] = [
  ['tile-marble-a', 128, 64, 0.5, 0], ['tile-marble-b', 128, 64, 0.5, 0], ['tile-concrete', 128, 64, 0.5, 0],
  ['tile-hazard', 128, 64, 0.5, 0], ['tile-parquet', 128, 64, 0.5, 0], ['tile-sand', 128, 64, 0.5, 0],
  ['tile-road', 128, 64, 0.5, 0], ['tile-pavement', 128, 64, 0.5, 0],
  ['wall-floor-l', 64, 134, 1, 102 / 134], ['wall-floor-r', 64, 134, 0, 102 / 134],
  ['wall-dock-l', 64, 134, 1, 102 / 134], ['wall-dock-r', 64, 134, 0, 102 / 134],
  ['wall-office-l', 64, 134, 1, 102 / 134], ['wall-office-r', 64, 134, 0, 102 / 134],
  ['case-plinth-owned', 128, 116, 0.5, 1], ['case-plinth-consignment', 128, 116, 0.5, 1],
  ['case-plinth-preowned', 128, 116, 0.5, 1], ['case-plinth-unknown', 128, 116, 0.5, 1],
  ['case-glass', 128, 160, 0.5, 1], ['case-dust', 128, 160, 0.5, 1],
  ['watch', 36, 28, 0.5, 0.6], ['tag-new', 56, 26, 0.5, 0.5],
  ['wall-cabinet', 128, 196, 0.5, 1], ['counter', 192, 180, 2 / 3, 1], ['rug', 384, 192, 0.5, 0],
  ['plant', 72, 120, 0.5, 0.97], ['palm', 160, 260, 0.5, 0.97],
  ['pallet', 128, 78, 0.5, 1], ['box-wrapped', 128, 134, 0.5, 1], ['box-sealed', 128, 134, 0.5, 1], ['box-open', 128, 134, 0.5, 1],
  ['van', 192, 216, 1 / 3, 1],
  ['desk', 192, 192, 2 / 3, 1], ['desk-small', 128, 134, 0.5, 1], ['mission-board', 192, 166, 0, 70 / 166], ['mission-card', 24, 30, 0.5, 0.5],
  ['file-cabinet', 128, 174, 0.5, 1], ['flag', 30, 36, 0.15, 1], ['bench', 192, 148, 2 / 3, 1],
  ['wall-clock', 80, 80, 0.5, 0.5],
  ['sign-boutique', 240, 46, 0.5, 0.5], ['sign-dock', 240, 46, 0.5, 0.5], ['sign-office', 240, 46, 0.5, 0.5],
  ['sparkle', 24, 24, 0.5, 0.5], ['mote', 10, 10, 0.5, 0.5], ['alert', 34, 34, 0.5, 1],
  ['shadow', 64, 24, 0.5, 0.5], ['ring', 96, 48, 0.5, 0.5], ['select', 140, 72, 0.5, 0.5],
  ['char-owner', 72, 128, 0.5, 0.96], ['char-mohammed', 72, 128, 0.5, 0.96],
  ['char-staff-sales', 72, 128, 0.5, 0.96], ['char-staff-manager', 72, 128, 0.5, 0.96],
  ['char-staff-ops', 72, 128, 0.5, 0.96], ['char-staff-office', 72, 128, 0.5, 0.96],
  ['char-rep', 72, 128, 0.5, 0.96], ['char-driver', 72, 128, 0.5, 0.96],
];

export const ASSETS: AssetDef[] = SPECS.map(([key, width, height, ox, oy]) => {
  const f = finals.get(key);
  const url = f?.url ?? placeholders.get(key);
  if (!url) throw new Error(`World asset "${key}" has no file`);
  const type: AssetDef['type'] = f ? (f.frame ? 'sheet' : f.svg ? 'svg' : 'image') : 'svg';
  return { key, url, type, width, height, frame: f?.frame, origin: [ox, oy] };
});

export const ASSET = Object.fromEntries(ASSETS.map((a) => [a.key, a])) as Record<string, AssetDef>;

/* Placeholders that have been replaced, for the credits line. */
export const FINAL_ART = ASSETS.filter((a) => finals.has(a.key)).length;
