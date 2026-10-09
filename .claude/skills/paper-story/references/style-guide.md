# Style guide: paper-craft explainer

Measured from a 34.8 s, 720x1280, 30 fps reference video and rebuilt as a reusable style. Numbers are design pixels on a 720x1280 canvas.

## The look

- **Everything is paper.** Fibre texture on every shape, slightly irregular hand-cut edges, a soft drop shadow offset down and right (about 2px, 4px, 3px blur, 34% black), a thin light bevel on the top-left edge. No gradients on shapes, no outlines.
- **Backgrounds** are mottled flat colour with a visible paper grain and a gentle vignette. Never a plain digital fill.
- **Stage:** a back wall (top 75%) and a floor strip (bottom 25%) with a lighter lip along the horizon. The character stands on the floor line at y 960. Props lean against the wall or sit on the floor.
- **Camera is locked.** Motion comes from objects, not from camera moves. Scene changes are slides.

## Layout zones

| Zone | y range | Contents |
| --- | --- | --- |
| Banner | 175 to 255 (centre 215) | One-line takeaway on taped paper |
| Action | 260 to 960 | Hero prop, mascot, supporting props |
| Floor and captions | 960 to 1280 | Word tags at y 1004, rest of floor empty |

Keep side margins of at least 40 px. The bottom 200 px is left empty on purpose so platform UI does not cover the video.

## Banner

Cream torn paper, two pieces of masking tape on the top corners (about 32 degrees), uppercase heavy grotesque (Inter Tight 800 here), about 33 px, tight tracking, 540 to 640 px wide, tilted up to 1.2 degrees. It drops in from above with an overshoot and swing when its text changes. If the topic continues across a cut, the same banner stays and does not re-enter. Write it as a takeaway ("LOW: AN APP DRAFT IN 1.5 MIN"), not a label.

## Captions

- Terracotta paper tags, cream bold serif (Fraunces 700) about 38 px, lowercase.
- One tag per spoken word, appearing on the word with a quick spring (about 0.16 s, scale from 0.55).
- Each tag rotated within 3 degrees and offset a few pixels vertically so the row feels hand-placed.
- Groups of 1 to 3 words stay on screen; the next group replaces them. Never a full sentence at once.

## Mascot

A blocky cardboard creature: rectangular body, four stubby legs, two side arm stubs, two black rectangular eyes. It carries the story:

- **Outfit escalation shows intensity.** The reference runs six tiers: headband, hardhat, helmet, racer helmet, full robot armour with thrusters, then winged crown. Use the same idea for any ladder (levels, plans, seniority, stages).
- **Face shows mood:** neutral, happy, sleepy, wide, worried, smug, angry. Blinks about every 3.4 s on its own.
- Idle motion: slow bob or hop. Entrances: rise, drop with bounce, slide in. Walk by alternating leg pairs.
- Multiple characters share a scene when comparing options. Give each a different outfit and slightly different bob phase.

## Palette (approximate)

| Role | Hex |
| --- | --- |
| Teal wall | #6E9CA5 |
| Navy wall | #1F2C55 |
| Rust wall | #C5622E |
| Dusk violet | #3C2A66 |
| Cream paper | #F2EBDA |
| Floor brown | #9A693D |
| Mascot terracotta | #E5835A |
| Accent teal | #2AA6A6 |
| Accent mustard | #F2B632 |
| Accent blue | #3B7DDB |
| Accent red | #D63C3C |
| Accent violet | #7A5AF8 |
| Ink | #1B1A18 |

Alternate warm and cool walls scene to scene. Use the accent set for ladders so each tier has its own colour and keeps it everywhere (dial, nameplate, outfit, list dot).

## Motion language

- Springs and overshoot on entrances (`outBack`, `spring`). Bounce on drops. Slam plus tiny screen shake for verdict stamps.
- **Paper boil:** idle motion is quantised to 12 fps with 1 px jitter, so it feels stop-motion even in a 30 fps video. Leave `boil` on.
- Sparkles burst when a state changes (dial clicks to a new level, task done).
- Slide transitions: new scene pushes in from the right in about 0.45 s while the old one drifts left a quarter of the width.
- Terminal chips type their command in about 0.9 s with a blinking caret.

## Pacing

- Whole video 30 to 45 seconds. 6 to 12 scenes, 2 to 6 seconds each. The reference changes the visual idea about every 3 to 4 seconds.
- Hook in the first second with the hero prop already doing something.
- Typical arc: hook (selector or dial), compare (side-by-side cards), demonstrate (chip command, timer, stack), proof (stress test, meter), verdict (stamp), recap (list on a board).
- Voice-led: about 2.5 spoken words per second; the picture follows the voice, not the other way round.

## Do and do not

- Do keep one focal prop per scene, large, centred, with room around it.
- Do reuse the same colours for the same ideas through the whole video.
- Do keep copy short and literal. Numbers on banners and props must come from the user's script.
- Do not use gradients, glow, or smooth vector outlines on shapes. Do not use more than two fonts for text a viewer reads (banner and caption).
- Do not add third-party logos or recreate another brand's mascot.
