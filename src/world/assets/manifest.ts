/* Every picture the World draws, by key.

   The artwork is replaceable without touching the game: put a file with the same
   key in ./final/ (PNG, WebP or SVG) and it is used instead of the placeholder in
   ./placeholder/. A character can also be an animated sheet, named
   `<key>@<frameWidth>x<frameHeight>.png`: row 1 is standing still, row 2 walking.
   Sizes and anchor points are listed in ./README.md.

   How a final picture is placed:
   - ./contract.json is the agreement with the artist, for every key: the
     picture's size in pixels (at twice world units), its anchor, and for
     things other things rest on, how high its top surface is. A PNG drawn to
     it needs nothing else; any multiple of that size works the same.
   - ./final/art.json holds placement tuned by hand for one particular file. Each
     entry records that file's pixel size and applies only while the file has
     that size, so a replacement picture never inherits the old one's tuning.
   `npm run world:art` checks every final file against both. */

import contract from './contract.json';

const placeholder = import.meta.glob('./placeholder/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const final = import.meta.glob('./final/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const artJson = import.meta.glob('./final/art.json', { eager: true, import: 'default' }) as Record<string, Record<string, ArtSettings>>;
const ART: Record<string, ArtSettings> = Object.values(artJson)[0] ?? {};

interface ArtSettings { size?: [number, number]; width?: number; origin?: [number, number]; surface?: number; cards?: boolean; onFloor?: boolean; text?: [number, number, number, number] }
interface Contract { px: [number, number]; origin: [number, number]; surface?: number; onFloor?: boolean }
const CONTRACT = contract as unknown as Record<string, Contract>;

export interface AssetDef {
  key: string;
  url: string;
  type: 'svg' | 'image' | 'sheet';
  width: number;                    // drawn size, at 2x (one floor tile is 128 x 64)
  height: number;
  frame?: { width: number; height: number };
  /* Where the picture touches the floor, as a fraction of its size. */
  origin: [number, number];
  /* How wide it is drawn, in world units; the texture is scaled to fit. */
  drawWidth: number;
  /* Height of the top surface above the anchor, for what stands on it (a case
     base, a box in a stack). */
  surface: number;
  /* The mission board: whether the game pins a card per open mission on it. */
  cards: boolean;
  /* The case glass: drawn as a whole cabinet standing on the floor, rather than
     a glass box resting on the case base. */
  onFloor: boolean;
  /* Boards and signs: the plain area the game writes on, as fractions of the picture
     (left, top, right, bottom). */
  text: [number, number, number, number] | null;
}

/* Where the game writes on boards and signs drawn to the contract (see the mall spec). */
const TEXT_AREA: Record<string, [number, number, number, number]> = {
  'board-major': [32 / 320, 30 / 400, 288 / 320, 204 / 400],
  'board-minor': [20 / 192, 18 / 256, 172 / 192, 102 / 256],
  'sign-section': [40 / 480, 16 / 92, 440 / 480, 76 / 92],
};

/* Surfaces of the placeholders, which were drawn to a common grid. */
const SURFACE: Record<string, number> = {
  'case-plinth-owned': 44, 'case-plinth-consignment': 44, 'case-plinth-preowned': 44, 'case-plinth-unknown': 44,
  'box-wrapped': 48, 'box-sealed': 48, 'box-open': 48, pallet: 10,
};

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
  // the glass and the dust stand on the case base, so they are anchored at their own foot
  ['case-glass', 128, 160, 0.5, 116 / 160], ['case-dust', 128, 160, 0.5, 116 / 160],
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

/* The Watch Mall's pictures (and any key added to the contract later) are placed by the
   contract alone: its size is twice the world size, and its surface is in world units. */
const LISTED = new Set(SPECS.map((s) => s[0]));
for (const [key, c] of Object.entries(CONTRACT)) {
  if (!LISTED.has(key)) {
    SPECS.push([key, c.px[0] / 2, c.px[1] / 2, c.origin[0], c.origin[1]]);
    if (c.surface !== undefined) SURFACE[key] = c.surface;
  }
}

export const ASSETS: AssetDef[] = SPECS.map(([key, width, height, ox, oy]) => {
  const f = finals.get(key);
  const url = f?.url ?? placeholders.get(key);
  if (!url) throw new Error(`World asset "${key}" has no file`);
  const type: AssetDef['type'] = f ? (f.frame ? 'sheet' : f.svg ? 'svg' : 'image') : 'svg';
  const a = f ? ART[key] ?? {} : {};
  return {
    key, url, type, width, height, frame: f?.frame,
    origin: a.origin ?? [ox, oy],
    drawWidth: a.width ?? width,
    surface: a.surface ?? SURFACE[key] ?? 0,
    cards: a.cards ?? true,
    onFloor: a.onFloor ?? false,
    text: a.text ?? TEXT_AREA[key] ?? null,
  };
});

export const ASSET = Object.fromEntries(ASSETS.map((a) => [a.key, a])) as Record<string, AssetDef>;

/* Once the pictures are loaded and their pixel sizes known: a final picture
   whose art.json entry was made for a different file (or that has none) is
   placed by the contract instead. Returns the keys placed by the contract. */
export function settleArt(sizeOf: (key: string) => [number, number] | null): string[] {
  const byContract: string[] = [];
  for (const a of ASSETS) {
    if (!finals.has(a.key)) continue;
    const tuned = ART[a.key];
    const size = sizeOf(a.key);
    if (tuned && (!tuned.size || !size || (tuned.size[0] === size[0] && tuned.size[1] === size[1]))) continue;
    const c = CONTRACT[a.key];
    if (!c) continue;
    a.drawWidth = c.px[0] / 2;
    a.origin = c.origin;
    a.surface = c.surface ?? SURFACE[a.key] ?? 0;
    a.onFloor = c.onFloor ?? false;
    a.cards = true;
    a.text = TEXT_AREA[a.key] ?? null;
    byContract.push(a.key);
  }
  return byContract;
}

/* Placeholders that have been replaced, for the credits line. */
export const FINAL_ART = ASSETS.filter((a) => finals.has(a.key)).length;
