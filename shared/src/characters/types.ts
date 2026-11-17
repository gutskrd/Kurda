import { VISEMES, type Viseme } from '../lipsync/visemes.js';

/** The characters who can say a recording. */
export const CHARACTER_IDS = ['hevalo', 'hamo', 'xezo'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** On-screen names, the same in every language. */
export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = {
  hevalo: 'Hevalo',
  hamo: 'Hamo',
  xezo: 'Xezo',
};

/** A rectangle in the character's own drawing units. */
export interface CharacterBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A point in the character's own drawing units. */
export interface CharacterPoint {
  x: number;
  y: number;
}

/** Open; half shut, mid-blink; shut; shut in a smile; a wink; and open wide in surprise. */
export type EyeState = 'open' | 'half' | 'closed' | 'happy' | 'wink' | 'wide';

export const EYE_STATES: readonly EyeState[] = ['open', 'half', 'closed', 'happy', 'wink', 'wide'];

/**
 * At rest, both raised, the near one raised, or knitted. The deer has no brows, so these lower his lids instead: one eye
 * narrowed for `one`, both for `knit`, and nothing for `raised`.
 */
export type BrowState = 'neutral' | 'raised' | 'one' | 'knit';

export const BROW_STATES: readonly BrowState[] = ['neutral', 'raised', 'one', 'knit'];

/** Mouths beyond the visemes, for expressions. */
export type ExpressionMouth = 'grin' | 'tongue';

export const EXPRESSION_MOUTHS: readonly ExpressionMouth[] = ['grin', 'tongue'];

/** Every mouth a character is drawn with: the ten visemes, then the expressions. */
export type MouthShape = Viseme | ExpressionMouth;

export const MOUTH_SHAPES: readonly MouthShape[] = [...VISEMES, ...EXPRESSION_MOUTHS];

/** A part of the head that turns on its own, such as an ear, and the point it turns about. */
export interface RigPart {
  art: string;
  pivot: CharacterPoint;
}

/** One pupil with its highlight: where it is drawn, and the middle of the eye it moves in. */
export interface RigPupil {
  art: string;
  /** the pupil's middle as drawn */
  rest: CharacterPoint;
  /** the middle of its eye; a look moves the pupil from here, at most `reach` */
  centre: CharacterPoint;
}

/**
 * The head's parts that move on their own: ears, pupils and the nose. Each is also drawn in place in the plain parts of
 * `CharacterArt`, so a player that moves none of them loses nothing. One that does draws `face` instead of `head`, then
 * `look.whites`, the pupils and a lid from `look.lids` (or `eyes.closed` and `eyes.happy`, which cover the whole eye).
 */
export interface CharacterRig {
  /** the head without the crown and the ears */
  face: string;
  /**
   * The face as two layers for a player that turns the head: its `outline`, and the `features` on it, which move further
   * as the head turns, kept inside the outline's `shape` path.
   */
  faceLayers?: { outline: string; features: string; shape: string };
  /** what stands up behind the ears and moves with the head (the antlers); may be '' */
  crown: string;
  /** The antlers one by one, each turning about the middle of its foot and running on into the head, so a turn shows no seam. */
  antlers?: { left: RigPart; right: RigPart };
  /** each ear on its own, behind the head, turning about where it meets it */
  ears: { left: RigPart; right: RigPart };
  look: {
    /** the open eyes without their pupils */
    whites: string;
    left: RigPupil;
    right: RigPupil;
    /** how far a pupil's middle may go from the middle of its eye, across and down */
    reach: CharacterPoint;
    /** the lids half down, drawn over the whites and the pupils */
    half: string;
  };
  /** the point the nose (the overlay) swells from in a sniff */
  sniff: CharacterPoint;
}

/**
 * A character in layers, so only small parts change while it speaks. Each part is inner SVG markup in the same units with
 * its own `<defs>`, so it can be swapped without leaving a dangling reference. Drawing order: `body`, then one group of
 * `head`, `eyes`, the mouth and `overlay`, which turns about `headPivot` to nod.
 */
export interface CharacterArt {
  id: CharacterId;
  name: string;
  /** the whole figure, head to feet */
  viewBox: CharacterBox;
  /** head and shoulders, for small places such as beside a play button */
  bust: CharacterBox;
  /** head to waist */
  half: CharacterBox;
  /** where the neck meets the head, the point the head turns about to nod */
  headPivot: CharacterPoint;
  /** everything that never moves, all of it behind the head */
  body: string;
  /** The body cut off under the chest, for a badge portrait; same drawing and ids as `body`, so drawn instead of it, never beside it. */
  chest?: string;
  /**
   * Head and neck, for a head put in at a window: `box` frames antlers, ears, head and the top of the neck; `sill` is how far
   * down the neck the sill crosses, below which nothing shows; `body` is drawn instead of `body`, cut like `chest`, under
   * the same ids, with daylight on the neck's edges.
   */
  neck?: { box: CharacterBox; sill: number; body: string };
  /** the head without its eyes or mouth */
  head: string;
  /** The eyes in each state, each drawn whole. Without `half`, a blink goes straight from open to shut. */
  eyes: { open: string; half?: string; closed: string; happy: string; wink: string; wide: string };
  /** one mouth for each shape, all in the same place on the face */
  mouths: Record<MouthShape, string>;
  /** what lies over the mouth, such as a moustache or a nose; may be '' */
  overlay: string;
  /**
   * The brows as their own layer. `head` has them at rest, with any moving `hair`; a player that moves them draws `bare`
   * instead, then one of the `states` after the eyes, then the hair. For the deer, whose brows are his lids, `bare` equals
   * `head` and `neutral` draws nothing.
   */
  brows?: { bare: string; states: Record<BrowState, string> };
  /** blushing cheeks, drawn over the head (over `bare`) when pleased or shy */
  cheeks?: { blush: string };
  /** a lock of hair that swings about where it parts; drawn in `head` too, and left out of `bare` */
  hair?: RigPart;
  /**
   * The overlay as two layers, for lifting the near end of a moustache: `body`, and `end` turning about its root. Cut from
   * one outline, so together at rest they match the overlay exactly; drawn instead of `overlay`, `body` first.
   */
  moustache?: { body: string; end: RigPart };
  /** the parts that move on their own */
  rig?: CharacterRig;
  /** How far each iris may move across to look aside (`data-iris` groups in `eyes.open`), for a character without a `rig`. */
  irisReach?: number;
  /** which way the face is drawn turned, as seen, so a stage can turn it toward whoever it talks to */
  turned?: 'left' | 'right';
}
