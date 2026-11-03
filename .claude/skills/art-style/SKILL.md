---
name: art-style
description: House rules for Hevalo's art — characters, icons, backgrounds, badges, emblems. Read before drawing or changing anything visual in shared/src.
---

# Hevalo art style

All app art is SVG generated from TypeScript in the `shared` workspace (the
art kit, backgrounds, icons, characters, badges). Never add binary images for
app art: change the drawing code, regenerate with the generator scripts, and
run the shared workspace tests, which enforce the surface rules (no frames,
no frosted glass, every colour drawn, every corner on the shared scale).

## The look

- Flat, painted cut-outs: soft rounded shapes, flat colour planes, at most
  one highlight and one shade step per form. No 3D-looking gradient bubbles,
  no bevels, no drop-shadow stacks.
- Foliage, fire, water and cloth are painterly and flat, never rendered or
  photographic. Kilim and carpet patterns follow real Kurdish weaving motifs.
- No humans in backgrounds. No third-party imagery or brand references.
- Icons follow the Phosphor glyph vocabulary; tests check the set.

## The deer and the characters

- Hevalo's deer anatomy is traced from the owner's reference silhouette:
  real proportions, never thinner, cuter, or more cartoonish than the
  reference. When the owner supplies a reference image, trace it exactly —
  stylising away from it has been rejected every time.
- Hevalo, Hamo and Xezal are layered SVG rigs with mouth shapes for
  lip-sync. Keep layer structure and ids stable: animation code binds to
  them. Edit layers in place rather than redrawing the rig.

## Working method (keeps iteration cheap)

1. Ask for or locate the reference first; pin down acceptance criteria
   ("head centred", "legs reach the ground") before drawing.
2. Change the drawing code, regenerate, and render one small preview grid
   of the affected pieces.
3. Show the preview and wait for the owner's reaction before another round.
   One traced, verified round beats several guessed ones.
4. Run the shared tests and the size checks before committing.
