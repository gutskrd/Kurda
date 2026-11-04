import { VISEMES, type Viseme } from '../lipsync/visemes.js';

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
 * shut; shut in a smile, curved up, for a character pleased with you; one
 * shut in a smile and the other open, a wink; and open wide, surprised.
 */
export type EyeState = 'open' | 'half' | 'closed' | 'happy' | 'wink' | 'wide';

export const EYE_STATES: readonly EyeState[] = ['open', 'half', 'closed', 'happy', 'wink', 'wide'];

/**
 * How the brows sit: at rest; both raised; one raised (the near one, the
 * quizzical look); and knitted, drawn down and together. The deer has no
 * brows: his ears say most of it, and these states lower his lids instead
 * (one eye narrowed for `one`, both for `knit`; `raised` draws nothing, the
 * wide eyes and the ears doing the work).
 */
export type BrowState = 'neutral' | 'raised' | 'one' | 'knit';

export const BROW_STATES: readonly BrowState[] = ['neutral', 'raised', 'one', 'knit'];

/** A mouth beyond the visemes, for an expression: a wide grin, and the tongue poked out. */
export type ExpressionMouth = 'grin' | 'tongue';

export const EXPRESSION_MOUTHS: readonly ExpressionMouth[] = ['grin', 'tongue'];

/** Every mouth a character is drawn with: the ten visemes, then the expressions. */
export type MouthShape = Viseme | ExpressionMouth;

export const MOUTH_SHAPES: readonly MouthShape[] = [...VISEMES, ...EXPRESSION_MOUTHS];

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
  /**
   * The same face as two layers, drawn in place of `face` by a player that
   * turns the head: its `outline`, and the `features` on it (the light round
   * the eyes, the muzzle), which move further as the head turns, kept inside
   * the outline's `shape` (a path).
   */
  faceLayers?: { outline: string; features: string; shape: string };
  /** what stands up behind the ears and moves with the head (antlers); may be '' */
  crown: string;
  /**
   * The same antlers one by one, for a player that turns the head in the
   * round: each drawn about the middle of its foot (`pivot`), where it stands
   * on the head, and run on down into the head below it, so a turn never
   * shows it ending there.
   */
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
  /**
   * The body cut off under the chest, for a portrait that shows only that
   * much of him (a badge): the same drawing as `body` down to there, under
   * the same ids, so it is drawn in place of `body`, never beside it. Only a
   * character drawn for it has one.
   */
  chest?: string;
  /**
   * Head and neck, for a picture of him putting his head in at a window:
   * `box` round the antlers, the ears, the head and the top of the neck;
   * `sill`, how far down the neck the window's sill crosses it, below which
   * nothing of him is seen; and `body`, drawn in place of `body` for it (cut
   * off under the chest as `chest` is, under the same ids), the daylight
   * outside catching the edges of the neck. Only a character drawn for it has
   * one.
   */
  neck?: { box: CharacterBox; sill: number; body: string };
  /** the head without its eyes or mouth */
  head: string;
  /**
   * The eyes in each state, each one whole: open; half shut (left out, a
   * blink goes straight from open to shut); shut; smiling; winking; and wide.
   */
  eyes: { open: string; half?: string; closed: string; happy: string; wink: string; wide: string };
  /** one mouth for each shape, all in the same place on the face */
  mouths: Record<MouthShape, string>;
  /** what lies over the mouth (a moustache, a nose); may be '' */
  overlay: string;
  /**
   * The brows as a layer of their own, for a player that can raise or knit
   * them. `head` is drawn with them at rest (and with any `hair` that moves);
   * a player that moves either draws `bare`, the head without them, in its
   * place, then the brows in one of their `states` after the eyes, and the
   * hair. A character whose brows are its lids (the deer) has `bare` the same
   * as `head`, and draws nothing for `neutral`.
   */
  brows?: { bare: string; states: Record<BrowState, string> };
  /** the cheeks blushing, drawn over the head (over `bare`) while a character is pleased or shy; only a character drawn for it has it */
  cheeks?: { blush: string };
  /** a lock of hair that swings on its own, turning about where it parts from the rest; drawn in `head` too, and left out of `bare` */
  hair?: RigPart;
  /**
   * The overlay as two layers, for a player that lifts the near end of a
   * moustache: `body`, all of it but that end, and `end`, the near end turning
   * about its root. Both are cut from the one outline, so drawn together at
   * rest they are the overlay to the pixel; a player draws them in place of
   * `overlay`, `body` first.
   */
  moustache?: { body: string; end: RigPart };
  /** the parts that move on their own; only a character drawn for it has them */
  rig?: CharacterRig;
  /**
   * How far each iris may move from where it is drawn, across, to look aside
   * (`data-iris` groups in `eyes.open`); only a character without a `rig`,
   * whose eyes are drawn for it, has one.
   */
  irisReach?: number;
  /** which way the face is drawn turned a little, as seen: a stage stands it so it turns toward whoever it talks to */
  turned?: 'left' | 'right';
}
