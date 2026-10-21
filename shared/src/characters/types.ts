import type { Viseme } from '../lipsync/visemes.js';

/** The characters who can say a recording. */
export const CHARACTER_IDS = ['hevalo', 'hamo', 'xezo'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** How each character is called on screen; names, so the same in every language. */
export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = {
  hevalo: 'Hevalo',
  hamo: 'Hamo',
  xezo: 'Xezo',
};

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

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

/**
 * How the eyes look: open; half shut, on the way into a blink and out of it;
 * shut; and shut in a smile, curved up, for a character pleased with you.
 */
export type EyeState = 'open' | 'half' | 'closed' | 'happy';

/** One part of the head that turns on its own (an ear), and the point it turns about. */
export interface RigPart {
  art: string;
  pivot: CharacterPoint;
}

/** One pupil, with its light: where it is drawn, and the middle of the eye it moves in. */
export interface RigPupil {
  art: string;
  /** the pupil's middle as drawn */
  rest: CharacterPoint;
  /** the middle of its eye: looking at something puts the pupil this far from it, and no further than `reach` */
  centre: CharacterPoint;
}

/**
 * The parts of a head that move on their own, for a player that can move
 * them: ears that twitch, pupils that look about, a nose that sniffs.
 *
 * Each is also drawn, in place, in the plain parts of `CharacterArt` (`head`
 * has the ears, `eyes.open` the pupils), so a player that moves none of them
 * draws those and loses nothing. A player that does draws `face` instead of
 * `head`, and the eyes as `look.whites`, the two pupils, then a lid from
 * `look.lids` (or `eyes.closed` and `eyes.happy`, which cover the whole eye).
 */
export interface CharacterRig {
  /** the head without the crown and the ears */
  face: string;
  /** what stands up behind the ears and moves with the head (antlers); may be '' */
  crown: string;
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
  /** the point the nose (the overlay) swells from when he sniffs */
  sniff: CharacterPoint;
}

/**
 * A character drawn in layers, so that while it speaks only the small parts
 * change. Each part is inner SVG markup in the same drawing units, and carries
 * the gradients and clip paths it uses in a `<defs>` of its own, so a part can
 * be swapped in or out of a page without leaving a reference behind.
 *
 * Drawn in this order: `body`, then one group holding `head`, `eyes`, the
 * mouth and `overlay`, which turns a little about `headPivot` for a nod.
 */
export interface CharacterArt {
  id: CharacterId;
  name: string;
  /** the whole figure, head to feet */
  viewBox: CharacterBox;
  /** head and shoulders: for small places, such as beside a play button */
  bust: CharacterBox;
  /** head to waist: for a place with room for more than a face but not for the whole figure */
  half: CharacterBox;
  /** where the neck meets the head: the point the head turns about when it nods */
  headPivot: CharacterPoint;
  /** everything that never moves, all of it behind the head */
  body: string;
  /** the head without its eyes or mouth */
  head: string;
  /**
   * The eyes in each state, each one whole: open; half shut (left out, a
   * blink goes straight from open to shut); shut; and smiling.
   */
  eyes: { open: string; half?: string; closed: string; happy: string };
  /** one mouth for each shape, all in the same place on the face */
  mouths: Record<Viseme, string>;
  /** what lies over the mouth (a moustache, a nose); may be '' */
  overlay: string;
  /** the parts that move on their own; only a character drawn for it has them */
  rig?: CharacterRig;
}
