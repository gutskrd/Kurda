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
  /** where the neck meets the head: the point the head turns about when it nods */
  headPivot: { x: number; y: number };
  /** everything that never moves, all of it behind the head */
  body: string;
  /** the head without its eyes or mouth */
  head: string;
  /** the eyes open, and shut for a blink */
  eyes: { open: string; closed: string };
  /** one mouth for each shape, all in the same place on the face */
  mouths: Record<Viseme, string>;
  /** what lies over the mouth (a moustache, a nose); may be '' */
  overlay: string;
}
