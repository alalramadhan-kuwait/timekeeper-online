# Founder characters

The founders are the protagonists, so they must stay recognisable. The draft uses plain stand-in figures (an articulated paper rig with an initial badge) so every pose and scene can be reviewed before any likeness is generated.

## Founders

| Id | Founder | Stand-in badge |
| --- | --- | --- |
| `ali-alramadhan` | Ali Al-Ramadhan | ع ر |
| `ali-alyousifi` | Ali Al-Yousifi | ع ي |
| `mohammad-alyousifi` | Mohammad bin Wail Al-Yousifi | م ي |

## What has to happen first (not started)

1. Time Keeper sends clear, labelled, front and three-quarter photographs of each founder and confirms they are happy to be generated as paper characters.
2. Approval to spend image-generation credits (Higgsfield is connected to this workspace). Nothing has been generated.
3. Generate **one master sheet per founder**, review for likeness, then **lock** it. Faces are never regenerated per scene.

## Generating the parts

Higgsfield makes the character art. paper-story controls the film. Do **not** ask Higgsfield for finished scenes.

For each locked founder produce transparent-background PNGs, exported at 4x the design sizes below, in `assets/characters/<id>/front/` and `assets/characters/<id>/side/` (profile, facing right, used for walking):

| File | Design size (w x h) | Joint position inside the image |
| --- | --- | --- |
| `head.png` | 70 x 82 | neck at bottom centre, 85% down |
| `torso.png` | 94 x 122 (side 66 x 122) | hips at bottom centre |
| `armU.png` | 24 x 66 | shoulder at top centre |
| `armL.png` | 20 x 62 | elbow at top centre |
| `hand.png` | 22 x 22 | wrist at top centre |
| `legU.png` | 34 x 74 | hip at top centre |
| `legL.png` | 28 x 70 | knee at top centre |
| `foot.png` | 46 x 16 | ankle at left third (side) or centre (front) |

Make the limbs hang straight down. Keep paper stiffness: simple, slightly cut-out shapes, thin white paper edge (the engine adds the shadow). Clothing may change by period; face, skin tone, hair, beard and proportions may not.

Drop the files in and the placeholder rig is replaced automatically for every scene that uses that `character`. Poses available in the rig: stand, hands, point, watch, phone, mic, cheer, wave, sit, sitTalk, sitWatch, side (walk cycle), sideWatch. Extra poses (traveling, holding a microphone, celebrating together) are added as presets, not regenerated per scene.

## Review gate

Before any master: faces match the photographs, the three are told apart at a glance, proportions and clothes are consistent within a period, nothing is turned into a generic cartoon.
