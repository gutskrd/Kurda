import {
  MOUTH_SHAPES,
  characterArt,
  cropBody,
  cropBox,
  eyesFor,
  type BrowState,
  type CharacterBox,
  type CharacterCrop,
  type CharacterPoint,
  type EyeState,
  type MouthShape,
  type SpeakerId,
} from '@kurda/shared';

/**
 * A speaking character as the phone draws it: each part its own small SVG in
 * the same frame, so the parts can be stacked one over the other and only the
 * one that changes is drawn again.
 *
 * Every part carries its own gradients and clip paths (`characterArt`), so a
 * mouth or a pair of eyes needs nothing from the layers beside it. The face
 * is drawn in its moving layers: the head without its brows and loose hair
 * (`bare`), then the hair, the eyes, the brows as they sit, the cheeks if
 * they blush, the mouth, and the overlay — Hamo's moustache in two pieces, so
 * its near end can lift.
 */
export type { CharacterCrop } from '@kurda/shared';

/** A point as a share of the frame, from its top left: what a view's `transformOrigin` takes. */
export interface Share {
  x: number;
  y: number;
}

/** The deer's parts that move on their own (`CharacterRig`), each a layer of its own. */
export interface RigLayers {
  face: string;
  crown: string;
  earLeft: string;
  earRight: string;
  earLeftPivot: Share;
  earRightPivot: Share;
  whites: string;
  pupilLeft: string;
  pupilRight: string;
  /** the lids half down, over the whites and the pupils */
  half: string;
  /** where the nose swells from */
  sniff: Share;
}

export interface CharacterLayers {
  /** the frame every layer shares, in the drawing's own units */
  frame: CharacterBox;
  /** where the head turns for a nod, as a share of the frame from its top left */
  pivot: Share;
  /** the middle of the eyes, as a share of the frame: what a look is measured from */
  eyesAt: Share;
  body: string;
  /** the head without its eyes or mouth, whole: its brows at rest and its loose hair in place */
  head: string;
  /** the head without its brows and loose hair, drawn in place of `head` when those are drawn as layers; the deer's is his head */
  bare: string;
  /** the eyes in each state, each drawn whole */
  eyes: Record<EyeState, string>;
  /** the brows as they sit in each state ('' for a state that draws nothing, as the deer's raised brows are) */
  brows: Record<BrowState, string>;
  /** the cheeks blushing, over the head; null for a character drawn without a blush */
  cheeks: string | null;
  /** a lock of hair that swings about its pivot; null for a character drawn without one */
  hair: { art: string; pivot: Share } | null;
  mouths: Record<MouthShape, string>;
  /** what lies over the mouth (a moustache, a nose); '' when there is nothing */
  overlay: string;
  /** the overlay as two layers, the near end of a moustache turning about its root; null for everyone but Hamo */
  moustache: { body: string; end: string; pivot: Share } | null;
  rig: RigLayers | null;
}

const made = new Map<string, CharacterLayers>();

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;

/** A length in drawing units, to a hundredth: enough for an iris to sit where it should. */
const units = (v: number): string => String(Math.round(v * 100) / 100 || 0);

/**
 * A person's open eyes with each iris moved `shift` drawing units from where
 * it is drawn, to look aside: each iris is a group of its own (`data-iris`)
 * inside its eye's clip, so it never leaves the eye.
 */
export function irisesMoved(open: string, shift: { left: CharacterPoint; right: CharacterPoint }): string {
  return open.replace(
    /<g data-iris="(left|right)">/g,
    (_, side: 'left' | 'right') => `<g data-iris="${side}" transform="translate(${units(shift[side].x)} ${units(shift[side].y)})">`,
  );
}

/**
 * One character's layers for a crop, made the first time they are asked for
 * and kept. Given an `idPrefix` the drawing's gradient and clip ids carry it
 * instead of the character's own: in a browser every drawing on the page
 * shares one document, so two Hevalos with the same ids leave one without
 * its fur; on a phone each drawing is its own root and the ids never meet.
 * Prefixed layers belong to one mounted character and are not kept.
 */
export function characterLayers(speaker: SpeakerId, crop: CharacterCrop, idPrefix?: string): CharacterLayers {
  const key = `${speaker}|${crop}`;
  const kept = idPrefix ? undefined : made.get(key);
  if (kept) return kept;
  const art = characterArt(speaker, idPrefix);
  const frame = cropBox(art, crop);
  const svg = (inner: string): string => (inner ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}">${inner}</svg>` : '');
  const share = (p: CharacterPoint): Share => ({ x: (p.x - frame.x) / frame.w, y: (p.y - frame.y) / frame.h });
  const rig = art.rig;
  const middle = rig
    ? { x: (rig.look.left.centre.x + rig.look.right.centre.x) / 2, y: (rig.look.left.centre.y + rig.look.right.centre.y) / 2 }
    : { x: art.bust.x + art.bust.w / 2, y: art.bust.y + art.bust.h * 0.48 };
  const brows = art.brows;
  const layers: CharacterLayers = {
    frame,
    pivot: share(art.headPivot),
    eyesAt: share(middle),
    body: svg(cropBody(art, crop)),
    head: svg(art.head),
    bare: svg(brows ? brows.bare : art.head),
    eyes: {
      open: svg(art.eyes.open),
      half: svg(eyesFor(art, 'half')),
      closed: svg(art.eyes.closed),
      happy: svg(art.eyes.happy),
      wink: svg(art.eyes.wink),
      wide: svg(art.eyes.wide),
    },
    brows: {
      neutral: svg(brows?.states.neutral ?? ''),
      raised: svg(brows?.states.raised ?? ''),
      one: svg(brows?.states.one ?? ''),
      knit: svg(brows?.states.knit ?? ''),
    },
    cheeks: art.cheeks ? svg(art.cheeks.blush) : null,
    hair: art.hair ? { art: svg(art.hair.art), pivot: share(art.hair.pivot) } : null,
    mouths: Object.fromEntries(MOUTH_SHAPES.map((v) => [v, svg(art.mouths[v])])) as Record<MouthShape, string>,
    overlay: svg(art.overlay),
    moustache: art.moustache ? { body: svg(art.moustache.body), end: svg(art.moustache.end.art), pivot: share(art.moustache.end.pivot) } : null,
    rig: rig
      ? {
          face: svg(rig.face),
          crown: svg(rig.crown),
          earLeft: svg(rig.ears.left.art),
          earRight: svg(rig.ears.right.art),
          earLeftPivot: share(rig.ears.left.pivot),
          earRightPivot: share(rig.ears.right.pivot),
          whites: svg(rig.look.whites),
          pupilLeft: svg(rig.look.left.art),
          pupilRight: svg(rig.look.right.art),
          half: svg(rig.look.half),
          sniff: share(rig.sniff),
        }
      : null,
  };
  if (!idPrefix) made.set(key, layers);
  return layers;
}
