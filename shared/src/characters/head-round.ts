import { mapMarkup, type PlaneMap } from '../art/warp.js';
import { headHalfWidth } from './hevalo.js';
import { PEEK_TURN } from './peek-lean.js';
import type { CharacterPoint } from './types.js';

/**
 * Hevalo's head as a solid, for drawing it turned aside: each point of his front view stands at a depth on a round skull
 * with a snout coming forward from its lower half, and turning the head carries every point round the upright line
 * through its middle. Points on the skull keep its outline where it is (a round head shows the same edge however it
 * turns), so the face slides across, closing up on the far side and opening out on the near; points on the snout swing
 * round at their own depth, further than the skull, so the snout comes out past the cheek on the side he turns to and
 * the jaw follows it. In his own units.
 */
export const HEAD_SOLID = {
  /** the upright line the head turns about */
  axis: 255,
  /** the snout: the middle of its front, how far out its tip stands from that line, and how far it spreads across and up and down */
  snout: { y: 404, depth: 178, across: 104, up: 92, down: 70 },
  /** how far the snout stands out from the skull, in his units, before it turns as itself rather than with the skull */
  blend: 40,
  /** how far round the near side of the skull, in radians, the face turns whole before easing into the edge that stays */
  nearBand: (58 * Math.PI) / 180,
  /** how far his eyes stand proud of his fur */
  eyeLift: 6,
} as const;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** The larger of two depths, rounded where they are close so the surface has no crease, and exact where either is 0. */
const smoothMax = (a: number, b: number): number => (a ** 6 + b ** 6) ** (1 / 6);

/** How far in front of the turning line the skull's surface is at `dx` across, height `y`, and the skull's half-width there. */
function skull(dx: number, y: number): { depth: number; half: number } {
  const half = Math.max(1, headHalfWidth(y, dx < 0 ? 'left' : 'right'));
  return { depth: Math.sqrt(Math.max(0, half * half - dx * dx)), half };
}

/** How far in front of the turning line the snout's surface is at `dx` across, height `y` (0 off the snout). */
function snout(dx: number, y: number): number {
  const s = HEAD_SOLID.snout;
  const dy = y - s.y;
  const u = (dx / s.across) ** 2 + (dy / (dy < 0 ? s.up : s.down)) ** 2;
  return u >= 1 ? 0 : s.depth * Math.pow(1 - u, 0.6);
}

/**
 * The map that turns his front view `yaw` radians aside (above 0 to our right), with `lift` more depth for what stands
 * proud of his fur (an eye). Up and down stay where they are.
 */
export function turnedHeadMap(yaw: number, lift = 0): PlaneMap {
  const c = HEAD_SOLID.axis;
  if (yaw === 0) return (x, y) => [x, y];
  return (x, y) => {
    const dx = x - c;
    const { depth: onSkull, half } = skull(dx, y);
    const onSnout = snout(dx, y);
    const surface = smoothMax(onSkull, onSnout);
    // What stands proud stands out from the surface, and so not at all at its edge.
    const depth = surface + lift * Math.min(1, surface / Math.max(1, half));
    // Beside his head, off the skull and the snout, a point stays where it is, as his outline does.
    if (depth <= 0) return [x, y];
    const reach = Math.hypot(dx, depth);
    const angle = Math.atan2(dx, depth);
    // On the skull the turn eases to nothing at its edge, so its outline stays: gradually across the far side, which
    // closes up as it goes round, and only in the last band of the near side, which opens out over the side of his head
    // coming into view while the face itself turns whole. On the snout it is the whole turn.
    const proud = Math.max(0, Math.min(1, (surface - onSkull) / HEAD_SOLID.blend));
    const near = angle * yaw < 0;
    const edge = Math.cos(angle);
    const ease = (near ? smoothstep(Math.min(1, edge / Math.cos(HEAD_SOLID.nearBand))) : edge) * (1 - proud) + proud;
    const turned = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, angle + yaw * ease));
    return [c + reach * Math.sin(turned), y];
  };
}

/** What a layer of his head is drawn on: his fur (the face, mouth and nose) or his eyes, which stand proud of it. */
export type RoundLayer = 'fur' | 'eyes';

/**
 * A turn as a player draws it: one of `PEEK_TURN.steps` steps either way to a full turn of `PEEK_TURN.yawDeg`, so each
 * drawing of a step is made once and kept.
 */
export function turnStep(share: number): number {
  const s = PEEK_TURN.steps;
  return Math.max(-s, Math.min(s, Math.round(share * s)));
}

const maps = new Map<string, PlaneMap>();

/** The map that draws a layer turned `step` steps aside. */
export function roundMap(step: number, layer: RoundLayer): PlaneMap {
  const key = `${layer}${step}`;
  let map = maps.get(key);
  if (!map) {
    map = turnedHeadMap((step / PEEK_TURN.steps) * PEEK_TURN.yawDeg * (Math.PI / 180), layer === 'eyes' ? HEAD_SOLID.eyeLift : 0);
    maps.set(key, map);
  }
  return map;
}

/** Where a point of a layer is seen with his head turned `step` steps aside. */
export function roundPoint(p: CharacterPoint, step: number, layer: RoundLayer): CharacterPoint {
  const [x, y] = roundMap(step, layer)(p.x, p.y);
  return { x, y };
}

/** How many drawings of turned layers are kept: every layer a player shows, at every step it has passed lately. */
const KEPT = 400;
const drawn = new Map<string, string>();

/** A layer's markup drawn with his head turned `step` steps aside, made once and kept for the steps used lately. */
export function roundLayer(markup: string, step: number, layer: RoundLayer): string {
  if (step === 0 || !markup) return markup;
  const key = `${layer}${step}|${markup}`;
  const kept = drawn.get(key);
  if (kept !== undefined) {
    drawn.delete(key);
    drawn.set(key, kept);
    return kept;
  }
  const made = mapMarkup(markup, roundMap(step, layer));
  drawn.set(key, made);
  if (drawn.size > KEPT) drawn.delete(drawn.keys().next().value!);
  return made;
}
