import { n } from '../art/svg.js';
import type { CharacterArt, CharacterPoint } from './types.js';

/**
 * Hevalo's head in the round, as parts that move rigidly: each part moves as a point on a turned head would, so the
 * face's features, in front, go the way he turns, parts behind go the other way, and each ear and antler narrows as its
 * side turns away and widens coming round. The companion turns his head this way toward what he looks at; the head
 * through the page turns its antlers and ears this way and draws the face itself turned (head-round.ts). In his own
 * units, about the middle of his head.
 */
export const HEAD_ROUND = {
  /** the middle of his head, which it turns about */
  centre: { x: 255, y: 300 },
  /** how far it turns, in degrees, looking all the way to a side, up or down */
  yaw: 17,
  pitch: 6,
  /** how far each part stands in front of the middle (behind it below 0): the face's features, his jaw at the chin, the ears and antlers */
  features: 62,
  jaw: 30,
  ear: -10,
  antler: -24,
  /** how far each ear and antler faces out to its side, and how far each leans back, in degrees */
  earOut: 26,
  earBack: 14,
  /** how far in from where an ear turns its foot ends, under the head */
  earRoot: 20,
  antlerOut: 18,
  antlerBack: 24,
  /** how far his nose and mouth stand in front of the middle, at the tip of his muzzle, for a player that moves them on their own */
  nose: 96,
  /** how high on the head the outline starts coming round with the jaw */
  brow: 175,
  /** the bottom of his head's outline, under his chin */
  chin: 461,
} as const;

/** The shade on the right of his face as it turns away (the left mirrors it): just outside his outline, and how far in it comes at a full turn. */
export const CHEEK = { x: 490, y: 318, rx: 84, ry: 200, reach: 80 } as const;

const DEG = Math.PI / 180;
const f3 = (v: number): string => String(Math.round(v * 1000) / 1000);

/** How a point `depth` in front of the head's middle moves as the head turns `yaw` across (his left, our right, above 0) and `pitch` down, in radians. */
export function inTheRound(p: CharacterPoint, depth: number, yaw: number, pitch: number): CharacterPoint {
  const x = p.x - HEAD_ROUND.centre.x;
  const y = p.y - HEAD_ROUND.centre.y;
  const across = x * Math.cos(yaw) + depth * Math.sin(yaw);
  const nearer = depth * Math.cos(yaw) - x * Math.sin(yaw);
  return { x: across - x, y: y * Math.cos(pitch) + nearer * Math.sin(pitch) - y };
}

/** An ear or antler on the turned head, as numbers: how far it moves, its lean (degrees), how wide and tall it is seen, all about `root`. */
export interface PartTurn {
  x: number;
  y: number;
  skew: number;
  wide: number;
  tall: number;
  root: CharacterPoint;
}

/**
 * An ear or antler on the turned head. It moves with the point it grows from (`root`, `depth` in front of the head's
 * middle); it leans back `back` degrees, so its tip swings opposite its foot and it shortens as the head tips back; and
 * it narrows as its side turns away and widens coming round (facing `out` degrees to its side), as far as it has turned
 * itself (`own`; an ear lags the head).
 */
export function partTurn(side: 'left' | 'right', root: CharacterPoint, depth: number, yaw: number, pitch: number, out: number, back: number, own = yaw): PartTurn {
  const move = inTheRound(root, depth, yaw, pitch);
  const o = out * DEG;
  const b = back * DEG;
  return {
    x: move.x,
    y: move.y,
    skew: Math.atan(Math.tan(b) * Math.sin(yaw)) / DEG,
    wide: Math.cos(o + (side === 'left' ? -own : own)) / Math.cos(o),
    tall: Math.cos(b - pitch) / Math.cos(b),
    root,
  };
}

/** `partTurn` as an SVG transform; `lift` first turns the part about `pivot` (an ear's twitch). */
export function partTransform(t: PartTurn, lift = 0, pivot: CharacterPoint = t.root): string {
  const { root } = t;
  return (
    `translate(${n(t.x + root.x)} ${n(t.y + root.y)}) skewX(${n(t.skew)}) scale(${f3(t.wide)} ${f3(t.tall)}) translate(${n(-root.x)} ${n(-root.y)})` +
    (lift ? ` rotate(${n(lift)} ${n(pivot.x)} ${n(pivot.y)})` : '')
  );
}

/** Where an ear is held to his head as it turns: a little in from where it twitches, under the head. */
export const earRoot = (side: 'left' | 'right', pivot: CharacterPoint): CharacterPoint => ({
  x: pivot.x + (side === 'left' ? HEAD_ROUND.earRoot : -HEAD_ROUND.earRoot),
  y: pivot.y,
});

/** His antlers and ears on a head turned aside, each as numbers (`partTurn`). */
export interface HeadParts {
  antlerLeft: PartTurn;
  antlerRight: PartTurn;
  earLeft: PartTurn;
  earRight: PartTurn;
}

/**
 * His antlers and ears on his head turned `share` of a full turn of `yawDeg` aside (above 0 to our right): standing
 * behind the middle of his head, they move the other way from his face, and each narrows as its side turns away. With
 * `turn.behind`, the head turns about a point that far behind its middle (his neck), so they ride with the whole head
 * as well; `turn.earOut` and `turn.antlerOut` say how far each faces out to its side, so how much it turns with him.
 * The face itself is drawn turned as a whole (head-round.ts).
 */
export function headParts(
  art: CharacterArt,
  share: number,
  yawDeg: number = HEAD_ROUND.yaw,
  turn: { behind?: number; earOut?: number; antlerOut?: number } = {},
): HeadParts {
  const rig = art.rig;
  if (!rig?.antlers) throw new Error('headParts: drawn without antlers on their own');
  const yaw = Math.max(-1, Math.min(1, share)) * yawDeg * DEG;
  const R = HEAD_ROUND;
  const behind = turn.behind ?? 0;
  const earOut = turn.earOut ?? R.earOut;
  const antlerOut = turn.antlerOut ?? R.antlerOut;
  return {
    antlerLeft: partTurn('left', rig.antlers.left.pivot, R.antler + behind, yaw, 0, antlerOut, R.antlerBack),
    antlerRight: partTurn('right', rig.antlers.right.pivot, R.antler + behind, yaw, 0, antlerOut, R.antlerBack),
    earLeft: partTurn('left', earRoot('left', rig.ears.left.pivot), R.ear + behind, yaw, 0, earOut, R.earBack),
    earRight: partTurn('right', earRoot('right', rig.ears.right.pivot), R.ear + behind, yaw, 0, earOut, R.earBack),
  };
}

/** The `data-turn` groups a player turns, one for each antler and ear. */
export const PART_GROUPS = ['antler-left', 'antler-right', 'ear-left', 'ear-right'] as const;
export type PartGroup = (typeof PART_GROUPS)[number];

/** `headParts` as SVG transforms, keyed as a player marks the groups (`data-turn`). */
export function partTransforms(t: HeadParts): Record<PartGroup, string> {
  return {
    'antler-left': partTransform(t.antlerLeft),
    'antler-right': partTransform(t.antlerRight),
    'ear-left': partTransform(t.earLeft),
    'ear-right': partTransform(t.earRight),
  };
}
