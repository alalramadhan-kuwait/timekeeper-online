# Element reference

Every element is `{ "type": "...", "x": 360, "y": 600, ...options }`. `x` and `y` place the element's anchor. Anchor is the centre unless noted (mascot, books, skyline, building anchor at the bottom, so `y` is where they stand). Override with `"anchor": "b"`, `"t"`, `"l"`, `"r"` or a pair such as `"bl"`.

## Options every element accepts

| Option | Meaning |
| --- | --- |
| `x`, `y`, `rot`, `scale`, `opacity` | Number, or keyframes `[[t, value, ease?], ...]` in scene seconds. The ease on a key shapes the segment that ends at it. |
| `in` | Entrance: `{ "type": "pop", "at": 0.3, "dur": 0.45, "from": 520 }`. Types: `pop`, `rise`, `drop`, `slideL`, `slideR`, `slideU`, `slideD`, `slam`, `flip`, `grow`, `fade`, `none`. Hidden before `at`. `from` is the slide distance in px. |
| `out` | Exit with the same fields; type defaults to the entrance type. Hidden afterwards. |
| `idle` | Looping motion: a name or `{ "type", "amp", "speed", "phase", "from", "until" }`. Names: `bob`, `float`, `sway`, `wiggle`, `pulse`, `hop`, `spin`, `shake`. |
| `z` | Stacking order. Default is the order in the list. |
| `behind` | `true` draws it on the back wall, under the floor and all normal elements (skylines, moon, clouds). |
| `still` / `noBoil` | Turn off the 12 fps paper jitter for this element. |
| `hidden` | `true` removes it (handy while iterating). |

Easing names: `linear`, `outCubic`, `inCubic`, `inOutCubic` (default), `outBack`, `outElastic`, `outBounce`, `spring`, `step` (jump at the key, good for dial clicks).

## Characters

**mascot** (anchor bottom)
`size` 200 (body width), `color` terracotta, `gear`: `none`, `headband`, `hardhat`, `helmet`, `racer`, `robot`, `wings`, `sunglasses`. `gearColor` recolours the main part. `look`: `neutral`, `happy`, `sleepy`, `wide`, `worried`, `smug`, `angry`, or a timeline `[[0,"neutral"],[2.4,"happy"]]`. `walk`: `true` or `[[t0,t1]]`. `thrusters: false` hides robot flames.

## Cards and text

**card** `w` 300, `h` 200, `style` (`plain`, `sticky`, `dark`), `color`, `ink`, `tex` (`paper`, `cork`, `wood`, `card`), `edge` (`cut`, `round`, `circle`, `torn`), `radius`, `header` (dark band with big title text) with `headerColor`, `headerInk`, `headerH`, `headerSize`, `title`, `titleSize`, `body`, `bodySize`, `label` (centred text), `align`, `pin`, `pinColor`, `tape`.
**sticky** a card preset: yellow, pinned, small.
**text** `text`, `font` (`title` default, `banner`, `cap`, `mono`, `ui`), `size` 90, `color`, `ls`, `upper`, `w` (wraps), `align`, `outline`, `shadow`, `paper` (`true` or a colour puts it on a paper strip).
**bubble** `text`, `w`, `h`, `kind` (`speech`, `thought`), `tail` (`l`, `r`), `size`.
**chip** terminal prompt. `text`, `prefix` (`>`), `size`, `typeAt`, `typeDur`, `type: false` (show fully).
**list** recap card. `title`, `rows: [{ label, color, note? }]`, `w`, `rowH`, `at` (first row time), `stagger`, `rtl: true` for Arabic (dots on the right, text right-aligned).

## Instruments and data

**dial** `size` 300, `segments` (colours), `labels` (screen text per step), `value` keyframes in step units (0 to n-1; use `step` or `outBack` eases), `knob`, `panel: false`.
**stopwatch** `size` 150, `sweep` keyframes in turns (0 to 1; red wedge shows elapsed).
**meter** `label`, `value` keyframes 0 to 1, `w`, `h`, `fill`, `warn` (turns amber above this).
**stamp** `text`, `color`, `size`. Use `in: { "type": "slam" }`.
**books** stack of blocks, `n`, `w`, `bookH`, `colors`, `at`, `stagger`. Anchor bottom.

## Scenery

**skyline** `h` 340, `w` full width, `color`, `lit`, `dim`, `density`, `litShare`, `gap`, `seed`, `twinkle: false`. Anchor bottom, usually `y: 960`, `behind: true`.
**building** `w`, `h`, `color`, `cols`, `rows`, `lit`, `litColor`, `glass`, `seed`. Anchor bottom.
**moon** `size`, `color`. **cloud** `w`, `color`.

## Shapes and effects

**shape** `kind` (`rect`, `round`, `pill`, `circle`, `tri`, `diamond`, `arrow`, `star`, `blob`), `w`, `h`, `color`, `tex`, optional label `text` with `font`, `size`, `ink`.
**burst** paper starburst. `size`, `points`, `inner`, `color`, `text`.
**sparkles** `count`, `radius`, `life`, `color` or `colors`, `shape` (`rect` for confetti), `at`, `loop`, `seed`. Place at the point of impact.

## Your own art

**image** `src` (path relative to the storyboard), `w`, `h`, `frame: false` for no paper border, `fit`, `pos` (crop focus such as `"50% 20%"`). Use it for the user's logo. For photos add `polaroid: true` (taped paper frame with a caption strip), `aspect` (the photo's width divided by height, so the frame fits it and nothing is cropped), `label` (caption text under the photo), `bottom` (strip height).
**svg** / **html** `svg` or `html` string with `w`, `h`. Use `PM.piece` in `engine/props.js` to add a reusable prop instead.

## Recipes

- **Ladder of levels:** one dial with a `step` value timeline, then one mascot per tier in the matching `gear`, each with its accent colour on a nameplate card (`header` + `headerColor`).
- **Before and after:** two mascots, one `look: "worried"` and one `"happy"`, a `shape` arrow between them.
- **Verdict:** hero prop, then `stamp` with `slam` and a `sparkles` burst at the same time.
- **Recap:** cork `card` (`tex: "cork"`) with `sticky` notes and a `list` that reveals rows on `stagger`.
