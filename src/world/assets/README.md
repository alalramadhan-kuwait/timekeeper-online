# Time Keeper World artwork

Everything the World draws is listed in `manifest.ts`, by key. The pictures in
`placeholder/` are temporary. To replace one, put the final file in `final/`
with the **same key** as its name (`char-owner.png`, `van.webp`, `rug.svg`…).
It is picked up at the next build; no code changes.

## Rules for every file

- **Drawn at 2x.** One floor tile is 128 × 64 px. Keep each file at the size
  below (or an exact multiple, scaled down in the file itself) so it lines up.
- **Isometric 2:1.** Floor diamonds are twice as wide as they are tall.
- **Anchor.** The anchor is the point that touches the floor, as a fraction of
  the picture's width and height. For furniture it is the front corner of the
  footprint; for people, between the feet; for tiles, the top corner. Keep the
  same anchor in the final art.
- **Transparent background** (PNG, WebP or SVG).
- **Characters can be animated.** Name the file `<key>@<frameWidth>x<frameHeight>.png`,
  for example `char-owner@72x128.png`. Row 1 is standing still (any number of
  frames), row 2 is walking (the same number of frames). Without a sheet, the
  game bobs the single picture as the person walks.

## Placement settings: final/art.json

Final art can be any resolution and any proportion. For each key it replaces,
`final/art.json` can say:

- `width`: how wide it is drawn, in world units (one floor tile is 128). The
  picture is scaled to this.
- `origin`: where it touches the floor, as a fraction of the picture (x, y).
  A y above 1 means the floor corner lies below the picture's bottom edge.
- `surface`: for case bases and boxes, how high their top surface is above the
  anchor, in world units: the glass stands on it, a box stacks on it.
- `cards`: for the mission board, `false` if the art has its own printed notes.

Keys it leaves out keep the placeholder's values.

## Current artwork (V1 concept pack, 9 Oct 2026)

From the owners' V1 pack, cleaned up: `box-open`, `box-sealed`, `box-wrapped`, `case-glass`, `case-plinth-consignment`, `case-plinth-owned`, `case-plinth-preowned`, `case-plinth-unknown`, `char-driver`, `char-mohammed`, `char-owner`, `char-rep`, `char-staff-manager`, `char-staff-office`, `char-staff-ops`, `char-staff-sales`, `counter`, `desk`, `file-cabinet`, `palm`, `plant`, `rug`, `sign-boutique`, `sign-dock`, `sign-office`, `sparkle`, `van`, `wall-cabinet`, `watch`.

Still placeholders, because the V1 version could not be used: the floor tiles
and walls (cut off and drawn at a 30° angle that does not fit the 2:1 floor
grid), `alert`, `tag-new`, `pallet`, `ring`, `shadow`, `case-dust` (cut or
mostly empty), `flag` (cut), `wall-clock` (cut, and its painted hands would show
the wrong time), `desk-small` (cut), `select` (caption baked in, off-palette),
`mission-board` (misspelt "MISSSIONS"), `bench` (cut at one end), `mission-card`
(a framed watch card, too detailed for the small cards pinned on the board),
`mote` (not in the pack). `note` is in the pack but nothing uses it yet. `char-staff-ops` uses the office figure until a whole one exists.

Repairs made to V1 pieces, all to be replaced by proper art: every character was
cut off at the thigh, so plain legs and shoes were added; box corners and the
cabinet and desk bases were cut flat, so the two lower faces were continued to
a point; the signs lost their bottom frame line, rebuilt from the side frame.
The case bases were left cut and anchored from their outline.

## The list

| Key | Size (px) | Anchor (x, y) | What it is |
|---|---|---|---|
| `tile-marble-a` | 128 × 64 | 0.5, 0 | Boutique floor, marble, light |
| `tile-marble-b` | 128 × 64 | 0.5, 0 | Boutique floor, marble, dark with a gold inlay |
| `tile-concrete` | 128 × 64 | 0.5, 0 | Loading dock floor, concrete |
| `tile-hazard` | 128 × 64 | 0.5, 0 | Loading dock edge, hazard stripes |
| `tile-parquet` | 128 × 64 | 0.5, 0 | Manager's office floor, walnut parquet |
| `tile-sand` | 128 × 64 | 0.5, 0 | Outside, desert sand |
| `tile-road` | 128 × 64 | 0.5, 0 | Outside, road with a centre line |
| `tile-pavement` | 128 × 64 | 0.5, 0 | Outside, pavement |
| `wall-floor-l` | 64 × 134 | 1, 0.76 | floor wall, left side |
| `wall-floor-r` | 64 × 134 | 0, 0.76 | floor wall, right side |
| `wall-dock-l` | 64 × 134 | 1, 0.76 | dock wall, left side |
| `wall-dock-r` | 64 × 134 | 0, 0.76 | dock wall, right side |
| `wall-office-l` | 64 × 134 | 1, 0.76 | office wall, left side |
| `wall-office-r` | 64 × 134 | 0, 0.76 | office wall, right side |
| `case-plinth-owned` | 128 × 116 | 0.5, 1 | Display case base: our own stock |
| `case-plinth-consignment` | 128 × 116 | 0.5, 1 | Display case base: consignment (the supplier's stock) |
| `case-plinth-preowned` | 128 × 116 | 0.5, 1 | Display case base: pre-owned |
| `case-plinth-unknown` | 128 × 116 | 0.5, 1 | Display case base: ownership not set |
| `case-glass` | 128 × 160 | 0.5, 1 | Display case glass, drawn over the watches |
| `case-dust` | 128 × 160 | 0.5, 1 | Dust and a cobweb: stock classed dead |
| `watch` | 36 × 28 | 0.5, 0.6 | A watch on display |
| `tag-new` | 56 × 26 | 0.5, 0.5 | New arrivals tag |
| `wall-cabinet` | 128 × 196 | 0.5, 1 | Wall cabinet holding the smaller brands |
| `counter` | 192 × 180 | 0.67, 1 | Cash desk |
| `rug` | 384 × 192 | 0.5, 0 | Boutique rug with the monogram |
| `plant` | 72 × 120 | 0.5, 0.97 | Potted plant |
| `palm` | 160 × 260 | 0.5, 0.97 | Date palm outside |
| `pallet` | 128 × 78 | 0.5, 1 | Pallet |
| `box-wrapped` | 128 × 134 | 0.5, 1 | PO awaiting approval: wrapped, with a question mark |
| `box-sealed` | 128 × 134 | 0.5, 1 | PO ordered: sealed box |
| `box-open` | 128 × 134 | 0.5, 1 | PO partially received: half unpacked |
| `van` | 192 × 216 | 0.33, 1 | Delivery van |
| `desk` | 192 × 192 | 0.67, 1 | Owner's desk |
| `desk-small` | 128 × 134 | 0.5, 1 | Staff desk |
| `mission-board` | 192 × 166 | 0, 0.42 | Mission board on the office wall |
| `mission-card` | 24 × 30 | 0.5, 0.5 | A mission card pinned to the board |
| `file-cabinet` | 128 × 174 | 0.5, 1 | Filing cabinet: Data Issues |
| `flag` | 30 × 36 | 0.15, 1 | Red flag: records to check |
| `bench` | 192 × 148 | 0.67, 1 | Waiting bench for supplier visitors |
| `wall-clock` | 80 × 80 | 0.5, 0.5 | Wall clock (the hands are drawn live, in Kuwait time) |
| `sign-boutique` | 240 × 46 | 0.5, 0.5 | Boutique sign |
| `sign-dock` | 240 × 46 | 0.5, 0.5 | Loading dock sign |
| `sign-office` | 240 × 46 | 0.5, 0.5 | Manager's office sign |
| `sparkle` | 24 × 24 | 0.5, 0.5 | Sparkle: fast-selling stock |
| `mote` | 10 × 10 | 0.5, 0.5 | Dust mote |
| `alert` | 34 × 34 | 0.5, 1 | Something here needs a look |
| `shadow` | 64 × 24 | 0.5, 0.5 | Soft shadow |
| `ring` | 96 × 48 | 0.5, 0.5 | Where the owner is walking to |
| `select` | 140 × 72 | 0.5, 0.5 | Selected object |
| `char-owner` | 72 × 128 | 0.5, 0.96 | Owner: dishdasha, ghutra and agal |
| `char-mohammed` | 72 × 128 | 0.5, 0.96 | Mohammed (Ask Mohammed), navy blazer and glasses |
| `char-staff-sales` | 72 × 128 | 0.5, 0.96 | Sales staff, boutique uniform |
| `char-staff-manager` | 72 × 128 | 0.5, 0.96 | Shop manager |
| `char-staff-ops` | 72 × 128 | 0.5, 0.96 | Operations, loading dock |
| `char-staff-office` | 72 × 128 | 0.5, 0.96 | Office staff |
| `char-rep` | 72 × 128 | 0.5, 0.96 | Supplier visitor with a briefcase |
| `char-driver` | 72 × 128 | 0.5, 0.96 | Delivery driver |

## What the pictures mean

Every state the World shows comes from the data, so the art must keep these
apart:

- **Display case bases** by ownership: our stock, consignment (the supplier's
  money), pre-owned, ownership not set.
- **Watches in a case** (0 to 6): how many units the brand has.
- **Dust and cobweb**: at least half the brand's stock at cost is classed dead.
  It is capital tied up, not a loss.
- **Sparkle**: fast-selling stock. **NEW tag**: new arrivals.
- **Boxes on the dock**: wrapped with a question mark = waiting for approval;
  sealed = ordered; half open = part received (the bar shows how much).
- **Supplier visitors**: calm under 30 days, tapping a foot from 30 days,
  flagged for review after 45 days. Their recorded unpaid balance is always
  shown next to them.
- **The van** pulls in only when the receiving log has seen a delivery.
