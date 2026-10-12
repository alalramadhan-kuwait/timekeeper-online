# Time Keeper World artwork

Everything the World draws is listed in `manifest.ts`, by key. To replace a
picture, put a PNG named by its key in `final/` (`wall-floor-l.png`). It is
used at the next build, with no code change, and nothing about the business
data, permissions or calculations is touched by it.

## Replacing a picture

- **`contract.json`** is the agreement with the artist: for every key, the size
  in pixels, the anchor (where it meets the floor, as a fraction of the
  picture), and for things other things rest on, the height of that surface. A
  PNG drawn to it needs nothing else. Any whole multiple of the size works the
  same (512 × 256 for a 256 × 128 tile): the game scales by width.
- **`final/art.json`** is placement tuned by hand for one particular file. Each
  entry records that file's pixel size (`size`) and is used only while the file
  in `final/` still has that size. A replacement of any other size is placed by
  the contract, so it never inherits the old picture's tuning. When a
  replacement lands, its old entry can be deleted.
- **`npm run world:art`** (also part of `npm run build`) reads every file in
  `final/` and fails on a key the World does not draw, a picture with no
  transparency, or one whose shape is more than 2% off the contract. It notes
  replaced pictures whose art.json entry is now unused.
- **Characters can be animated.** Name the file `<key>@<frameWidth>x<frameHeight>.png`:
  row 1 standing (any number of frames), row 2 walking (the same number). The
  frame is checked against the contract. Without a sheet, the game bobs the single
  picture as the person walks.

Units: world units are the game's own (one floor tile is 128 × 64). Contract
sizes are pixels at twice that (one floor tile is 256 × 128 px).

## The Watch Mall (Floor tab, 10 Oct 2026)

The mall's 64 keys (floors, walls, kiosks, boards, signs, archways, staff looks,
shoppers) are in `contract.json` like every other key: size at twice world units,
anchor, and surface where something stands on it. The full spec, with connection
points, lettering areas and a template PNG per key, was sent to the owners as the
"Watch Mall Artwork" page. Keys without a final picture use a placeholder drawn to
the same contract, so a final PNG drops in with no code change.

Starter pack v0.1 (owners, 10 Oct): the three floor tiles are exact 2:1 and used as
is; the storefront (`boutique-pavilion`), kiosk (all four `kiosk-base-…`), boards,
section sign, planter, crate and selection ring are placed by `final/art.json`.
Those objects are drawn at about 35°, not 2:1, so they are scaled to their
footprints until redrawn. `final/art.json` may also give a board or sign's writing
area as `text: [left, top, right, bottom]` (fractions of the picture).

First set, 39 pictures (owners, 10 Oct, alignment prototypes): every one passed
`npm run world:art` and `npm run world:geometry` (which measures floor lines,
connection points, kiosk tops and writing areas against `mall-geometry.json`).
Each was compared with what it would replace, in the game on an iPhone screen.
In use: the nine floor tiles, both floor inlays, all eight walls and low walls and
the two accent layers (the game tints them with the boutique's colour),
`arch-pillar`, `boutique-pavilion`, `bq-counter`, `crate-po`, `sign-section`,
`board-major`, `board-minor` and `mall-select`. Held back, kept out of `final/`:
the four `kiosk-base-…` and `kiosk-glass` (they measure correctly and are separate
layers, but the tall flat cabinets read worse than the V2 display cases the
kiosks use now), and the five neutral staff figures (thinner and plainer than the
V2 characters and the placeholders). The low walls draw no top thickness behind
their front edge; they still join.

The plan (owners' Option B, 10 Oct): the mall is 50 × 17 cells, boutiques 8 × 6 and
display areas 4 × 6 (`mall/layout.ts`). The walls and inlays above were drawn for the
first plan's 6-cell boutiques and 3-cell display areas, and are used as they are:
a boutique's back wall is `mall-wall-r`, the 6-cell `bq-wall` and `mall-wall-r`
again, joined at their connection points; a display area's is `bay-wall` and one
`mall-wall-r`; the low front walls are built the same way from `bq-front`,
`bay-front` and `mall-ledge-r`; `bq-floor-accent` and `bay-floor-border` are centred
in the larger floors. Pictures drawn for the new widths (an 8-cell `bq-wall`, a
4-cell `bay-wall`) would drop in by changing the run lengths in `drawStatic`.
People and display cases are drawn 20% larger than the floor grid
(`FIGURE_SCALE`), except the kiosks on a walkway island, which stand one cell apart.
Every floor tile, in the mall and in the other areas, is drawn through
`game/FloorBatch.ts`: one GPU layer per tile picture instead of one image per tile.

## Replacement specs for the pieces still to come

All pictures: one object per PNG, transparent background, no text labels, 2:1
isometric (a floor edge drops 1 px for every 2 px across, about 26.6°).

**Floor tiles** — `tile-marble-a`, `tile-marble-b`, `tile-concrete`,
`tile-hazard`, `tile-parquet`, `tile-pavement`, `tile-sand`, `tile-road`:
256 × 128 px. The diamond fills the canvas exactly: corners at top (128, 0),
right (256, 64), bottom (128, 128), left (0, 64). No side thickness (it shows as
a ledge between tiles). Anchor: the top corner. The road runs along the tile's
upper-left and lower-right edges (down-left on screen), one lane per tile, two
tiles wide, so markings that cross the lower-left and upper-right edges must
meet the next tile.

**Walls** — `wall-floor-l`, `wall-floor-r`, `wall-dock-l`, `wall-dock-r`,
`wall-office-l`, `wall-office-r`: one panel per floor-tile edge, 128 × 268 px.
- `-l` (the back-left wall): the floor line runs from (128, 204) down to (0, 268);
  the top edge from (128, 0) to (0, 64). Anchor: (128, 204), the right end.
- `-r` (the back-right wall): the floor line runs from (0, 204) down to (128, 268);
  the top edge from (0, 0) to (128, 64). Anchor: (0, 204), the left end.
- Connection points: each `-l` panel's left end (0, 268) is the next panel's
  right end (128, 204), and the same for `-r` the other way, so the panels join
  in a straight line. At the back corner of a room, an `-l` panel's anchor and an
  `-r` panel's anchor are the same point. Keep anything that must line up
  (skirting, top trim) on those lines and inside the canvas.

**Display cases** — `case-plinth-owned`, `case-plinth-consignment`,
`case-plinth-preowned`, `case-plinth-unknown` and `case-glass`: draw the whole
case on one 256 × 320 px canvas, then export the base and the glass as separate
layers at that same size. The case stands on one floor tile: footprint corners
front (128, 320), left (0, 256), right (256, 256), back (128, 192). Anchor: the
front corner (128, 320). The watches stand on the cushion inside, which is the
footprint raised 96 px: corners front (128, 224), left (0, 160), right
(256, 160), back (128, 96). Up to six watches stand between about 20% and 80% of
the way across it, so the cushion should cover most of that diamond. The glass
layer holds only the glass and its frame, see-through where the watches show.

**Wall clock** — `wall-clock`: 160 × 160 px, the face centred at (80, 80),
anchor in the centre. No hands: the game draws them in live Kuwait time,
reaching about 51 px from the centre, so keep that circle clear.

**Effects**
- `ring`, where the owner is walking to: 192 × 96 px, a flat ring on the floor,
  centred.
- `select`, around the selected object: 280 × 144 px, a flat 2:1 ring that
  frames one floor tile (256 × 128) with a little room, centred.
- `shadow`, under each person: 128 × 48 px, a soft dark ellipse, centred,
  partly transparent.
- `mote`, a speck of dust drifting off dead stock: 20 × 20 px, centred.
- `mission-card` (only with a plain mission board): 48 × 60 px, centred.

## Current artwork (V2 corrected sheets, 9 Oct 2026)

From the owners' four corrected sheets: every character, piece of furniture,
case, box, sign, tile and wall, plus `alert`, `tag-new`, `sparkle`, `case-dust`,
`watch`, `wall-clock`, `flag`, `pallet`, `bench`, `desk-small` and
`mission-board`. 51 files in `final/`; `art.json` places each one. All objects
came whole, with clean transparency.

Changed beyond scaling, by `build_v2.py` (kept outside the repo):

- **Floor tiles** were drawn at 30°; the floor grid is 2:1 (about 26.6°). Each
  is squashed to about 86% of its height to fit 128 × 64 exactly. Redrawn 2:1
  tiles would look crisper.
- **Walls**: each panel is assigned to the left or right side by the way its
  bottom edge runs, and scaled so one panel spans one tile edge. They are drawn
  at about 33° (the bottom edge drops 0.65 px per px; the grid needs 0.5), so
  the skirting steps down at every joint. To be redrawn.
- **Case glass**: the vitrines include their glass, so the watches would sit
  behind it. The glass panes and gold posts of the walnut vitrine are redrawn as
  a see-through overlay (`case-glass`, `onFloor`) over the watches, which stand
  on the cream cushion.
- **Wall clock**: the painted hands are removed (the TK monogram stays); the
  World draws the hands in live Kuwait time.
- Pictures larger than twice their drawn size are scaled down to that, to keep
  the download small (2.3 MB in all).

Still placeholders: `tile-road` (no road tile in the sheets), `ring` (the ring
in sheet 1 is a jewellery ring, not a floor marker), `select` and `shadow` (not
in the sheets), `mote`, and `mission-card` (unused while the board has printed
notes). `note` is in the sheets but nothing uses it yet.

## The list

| Key | World size (contract px are twice this) | Anchor (x, y) | What it is |
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

## Brand logos on the boutiques (TK Online 3.7.1)

`brands/` holds the seven boutique brands' own logos, each taken from the brand's
official website; `brands/brands.json` records the page, the file's URL and the
original's sha256. Each file is the original with its empty margin trimmed (2 px
kept for the edge's smoothing) and, if wider than 1024 px, scaled down evenly. Nothing
is redrawn, recoloured, cropped into or stretched. `brandLogos.ts` loads them; a
boutique whose brand has no file keeps its painted name.

The plaque is drawn by the game (a gold-framed rounded rectangle, so it stays sharp
at every zoom): navy `#17233B` behind a white logo (15.7:1), cream `#F6F1E6` behind a
black one (18.6:1). Its shape follows the logo: square (148 × 148) for a stacked
logo, 264 × 106 for a word mark, and a 470 × 56 band for a logo that is one long line
(West End). Measured on an iPhone 15, the brand name's letters at normal zoom: Gerald
Charles 8.7 px, Dennison 11.9, Delugs 21.1, Nivada Grenchen 10.7, Time Keeper 10.5,
Behrens 13.3, West End 5.8 (11.6 close up; its only official logo is one long line,
so it reads only when zoomed in). In the whole-mall view shop signs stay hidden: at
that zoom a logo would be 1-3 px tall.
