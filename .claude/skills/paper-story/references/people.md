# Real people: cut-outs and generated poses

For a film about real people (founders, a team), the figures are their own photos cut out with a paper border, not the
mascot. These rules come from making the Time Keeper success story (`video/success-story/story.py`), and every one of
them was a note from the people in it.

## Who is who

- The user labels each photo. Never identify a person by their face, and never guess who is who from a group photo.
- Keep one cut-out per person per outfit (`assets/figures/<person>_<outfit>.png`), git-ignored with the rest of the
  personal media.
- Relative heights come from a real group photo, as a factor per person (`HEIGHT = {...}` in story.py). Scale every
  shot by it so people never swap heights between scenes.
- Check proportions: an adult stands about 7 heads tall. Photos shot from above give big heads and short legs. The
  people called it looking like dwarfs. Fix it geometrically and leave the face alone: stretch only a plain band of
  clothing (a dishdasha between the hands and the shoes) until the figure is about 7 heads tall. Keep the face and
  shoes as they are (see the `-tall` cut-outs in `video/success-story/simple.py`).
- Show each person through what they do, never with a name or title on screen. Give each one a role the user has
  confirmed (in the story: one on camera, one researching and writing, one designing watches). Show the role as the
  person describes it. "Design" meant designing watches, so the designer holds a pencil drawing of a watch, not a logo.
  Make sure the role is clear and specific. Bring a person in only when the
  story gives them a part.

## Poses a photo cannot do: generate stills, not video

A standing photo cannot shake hands, sit or talk into a mic. Make new still images of the same people with an image
model that takes reference images (Higgsfield `nano_banana_2`, role `image_references`, 1.5 credits each, worked well),
then cut them out and animate them in the engine like any cut-out. Do not use video generation for this.

1. Upload each person's cut-out once and keep the media ids.
2. Make one image first and check the faces before making the rest.
3. Submit the rest as one batch. Review them on one contact sheet, cropping close on each face.
4. Cut them out with `scripts/cut-poses.py <folder>`. It removes the flat grey backdrop, including grey pockets
   between arms, legs and chair rungs. Check the result on a green sheet: leftover grey is easy to see there.

Prompt shape that worked:

> The three exact men from the reference images, same faces, glasses, hair and beards, same outfits as their
> references (spell each outfit out). [Pose, and who stands LEFT / MIDDLE / RIGHT.] Full body head to shoes, all fully
> inside the frame with margins. Photographic cut-out sticker look like the references: real photo people with a thin
> cream paper border around the silhouettes. Plain flat light grey background, no scenery, no text.

Notes from the reviews:

- **Say who stands where, then check it.** One image paired the wrong two people for the scene. Compare each image
  against the story order before using it.
- **Ask for margins.** A group sitting on cushions came back cropped at the edges. Regenerate rather than patch it.
- **Tone follows the brand.** For a luxury brand, people must look composed: calm faces, subtle dignified smiles,
  measured gestures, upright posture. Excited open-mouthed expressions read as shouting and were rejected. Write
  "no shouting, no wide open mouths, no exaggerated expressions" into the prompt.
- **Never AI-edit a face or build.** An edit to make one person slimmer changed his face, and the user wanted the
  original back. To adjust a build, narrow the cut-out geometrically (`aspect` times 0.93 or so) and leave the face
  alone. Keep the originals whenever you edit, so you can restore them.
- **Hero products are always real photos.** Never generate the product the story is about (here, watches). Prompt for
  empty hands, an open empty palm, an empty tabletop or a blank sheet. Then composite the real product photo onto it in
  the storyboard. The small watches that come on the wrists in a generated image are the only exception.

## Putting a pose in a scene

- A `pose()` helper is a `cutout` sized by height on screen. Its `in`/`out` times let it swap with the single figures
  in the same spot. The figures walk in, then cross-fade (0.2 s) into the pose: two people walk up, then they shake
  hands. See `pose()` and `gone()` in story.py.
- A generated pose holding a blank sheet can carry a drawing. Warp it onto the sheet's four corners and multiply it in,
  so it reads as pencil on that paper (`video/success-story/sketch_pose.py`).
- Measure positions on the cut-out, not by eye. Draw a 100 px grid over it, read off the palm or tabletop, and
  convert to stage coordinates (`dx`, `dy`, `TOP` in story.py).
- Size a product against the hands, but big enough to read on a phone. Watches shrunk to hand scale were called too
  small; about 1.5 hand lengths for a watch on a table was right.
- A waist-up crop of a group can sit on the bottom edge of the frame, with nothing below it.

## Historical figures with no photos supplied

For a story about someone the user has no cut-outs of (a designer in 1970, a founder long gone), show them as
silhouettes from behind and as hands at work: on a phone, holding a pencil, at a drafting table. Never generate a
face, and never pass off an illustration as an archive photo or their original drawing. The work they made carries
the scene instead (`video/royal-oak/`: the call, the night at the table, the sketch drawing itself).
