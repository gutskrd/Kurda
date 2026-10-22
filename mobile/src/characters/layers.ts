import {
  VISEMES,
  characterArt,
  cropBox,
  eyesFor,
  type CharacterBox,
  type CharacterCrop,
  type CharacterPoint,
  type EyeState,
  type SpeakerId,
  type Viseme,
} from '@kurda/shared';

/**
 * A speaking character as the phone draws it: each part its own small SVG in
 * the same frame, so the parts can be stacked one over the other and only the
 * one that changes is drawn again.
 *
 * Every part carries its own gradients and clip paths (`characterArt`), so a
 * mouth or a pair of eyes needs nothing from the layers beside it.
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
  /** the head without its eyes or mouth */
  head: string;
  /** the eyes in each state, each drawn whole */
  eyes: Record<EyeState, string>;
  mouths: Record<Viseme, string>;
  /** what lies over the mouth (a moustache, a nose); '' when there is nothing */
  overlay: string;
  rig: RigLayers | null;
}

const made = new Map<string, CharacterLayers>();

const box = (b: CharacterBox): string => `${b.x} ${b.y} ${b.w} ${b.h}`;

/** One character's layers for a crop, made the first time they are asked for and kept. */
export function characterLayers(speaker: SpeakerId, crop: CharacterCrop): CharacterLayers {
  const key = `${speaker}|${crop}`;
  const kept = made.get(key);
  if (kept) return kept;
  const art = characterArt(speaker);
  const frame = cropBox(art, crop);
  const svg = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box(frame)}">${inner}</svg>`;
  const share = (p: CharacterPoint): Share => ({ x: (p.x - frame.x) / frame.w, y: (p.y - frame.y) / frame.h });
  const rig = art.rig;
  const middle = rig
    ? { x: (rig.look.left.centre.x + rig.look.right.centre.x) / 2, y: (rig.look.left.centre.y + rig.look.right.centre.y) / 2 }
    : { x: art.bust.x + art.bust.w / 2, y: art.bust.y + art.bust.h * 0.48 };
  const layers: CharacterLayers = {
    frame,
    pivot: share(art.headPivot),
    eyesAt: share(middle),
    body: svg(art.body),
    head: svg(art.head),
    eyes: {
      open: svg(art.eyes.open),
      half: svg(eyesFor(art, 'half')),
      closed: svg(art.eyes.closed),
      happy: svg(art.eyes.happy),
    },
    mouths: Object.fromEntries(VISEMES.map((v) => [v, svg(art.mouths[v])])) as Record<Viseme, string>,
    overlay: art.overlay ? svg(art.overlay) : '',
    rig: rig
      ? {
          face: svg(rig.face),
          crown: rig.crown ? svg(rig.crown) : '',
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
  made.set(key, layers);
  return layers;
}
