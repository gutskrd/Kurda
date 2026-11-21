import { mapMarkup, mapPath, type PlaneMap } from '../art/warp.js';
import { HEVALO_SILHOUETTE, headHalfWidth } from './hevalo.js';
import { PEEK_TURN } from './peek-lean.js';
import type { CharacterPoint } from './types.js';

/**
 * Hevalo's head as a solid, for drawing it turned aside: each point of his front view stands at a depth on a round skull
 * with a short snout coming forward from its lower half, and turning the head carries every point truly round the
 * upright line through its middle, so what lies on his face slides round, closing up as it nears the far side and
 * passing behind the edge there. His outline is redrawn as the turned head's sides at each height: the round of the
 * skull stays where it is, and the snout and chin come out on the side he turns to. In his own units.
 */
export const HEAD_SOLID = {
  /** the upright line the head turns about */
  axis: 255,
  /** the snout: the middle of its front, how far out its tip stands from that line, and how far it spreads across and up and down */
  snout: { y: 404, depth: 150, across: 104, up: 92, down: 70 },
  /** how far his eyes stand proud of his fur */
  eyeLift: 6,
} as const;

/** The larger of two depths, rounded where they are close so the surface has no crease, and exact where either is 0. */
const smoothMax = (a: number, b: number): number => (a ** 6 + b ** 6) ** (1 / 6);

/** His head's half-width at height `y` on the side of `dx`. */
const half = (dx: number, y: number): number => Math.max(1, headHalfWidth(y, dx < 0 ? 'left' : 'right'));

/** How far in front of the turning line his head's surface is at `dx` across, height `y`: the skull's round, or the snout's. */
function surface(dx: number, y: number): number {
  const h = half(dx, y);
  const skull = Math.sqrt(Math.max(0, h * h - dx * dx));
  const s = HEAD_SOLID.snout;
  const dy = y - s.y;
  const u = (dx / s.across) ** 2 + (dy / (dy < 0 ? s.up : s.down)) ** 2;
  const snout = u >= 1 ? 0 : s.depth * Math.pow(1 - u, 0.6);
  return smoothMax(skull, snout);
}

/**
 * The map that carries what lies on his face round as the head turns `yaw` radians aside (above 0 to our right), with
 * `lift` more depth for what stands proud of his fur (an eye). A point keeps its depth and turns about the upright
 * line; one carried past the edge stays on it, where the turned outline hides it. Up and down stay where they are.
 */
export function turnedFaceMap(yaw: number, lift = 0): PlaneMap {
  const c = HEAD_SOLID.axis;
  if (yaw === 0) return (x, y) => [x, y];
  return (x, y) => {
    const dx = x - c;
    const s = surface(dx, y);
    if (s <= 0) return [x, y];
    // What stands proud stands out from the surface, and so not at all at its edge.
    const depth = s + lift * Math.min(1, s / half(dx, y));
    const turned = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(dx, depth) + yaw));
    return [c + Math.hypot(dx, depth) * Math.sin(turned), y];
  };
}

/** How many samples across his head find the turned head's sides at a height. */
const ACROSS = 160;

/**
 * The map that redraws his outline for the head turned `yaw` radians aside: at each height the turned head's sides are
 * his own, or further where the turned snout reaches past them, and each point is drawn as far between them as it was
 * between his own sides, so the round of his skull stays put and the snout and chin come out the way he turns.
 */
export function turnedOutlineMap(yaw: number): PlaneMap {
  const c = HEAD_SOLID.axis;
  if (yaw === 0) return (x, y) => [x, y];
  const sides = new Map<number, readonly [number, number]>();
  const turnedSides = (y: number): readonly [number, number] => {
    const key = Math.round(y * 4);
    let found = sides.get(key);
    if (!found) {
      const left = half(-1, y);
      const right = half(1, y);
      // A round skull shows the same sides however it turns; the snout and chin can only reach past them.
      let lo = -left;
      let hi = right;
      for (let i = 0; i <= ACROSS; i++) {
        const dx = -left + ((left + right) * i) / ACROSS;
        const across = dx * Math.cos(yaw) + surface(dx, y) * Math.sin(yaw);
        lo = Math.min(lo, across);
        hi = Math.max(hi, across);
      }
      found = [lo, hi];
      sides.set(key, found);
    }
    return found;
  };
  return (x, y) => {
    const dx = x - c;
    const share = dx / half(dx, y);
    const [lo, hi] = turnedSides(y);
    return [c + (lo + hi) / 2 + Math.max(-1.2, Math.min(1.2, share)) * ((hi - lo) / 2), y];
  };
}

/** What a layer of his head is drawn on: his outline, his fur (what lies on the face, the mouth and nose), or his eyes. */
export type RoundLayer = 'outline' | 'fur' | 'eyes';

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
    const yaw = (step / PEEK_TURN.steps) * PEEK_TURN.yawDeg * (Math.PI / 180);
    map = layer === 'outline' ? turnedOutlineMap(yaw) : turnedFaceMap(yaw, layer === 'eyes' ? HEAD_SOLID.eyeLift : 0);
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

const shapes = new Map<number, string>();

/** His head's outline turned `step` steps aside, as a path's `d`: what keeps the turned face within it. */
export function roundShape(step: number): string {
  let d = shapes.get(step);
  if (d === undefined) {
    d = step === 0 ? HEVALO_SILHOUETTE.head : mapPath(HEVALO_SILHOUETTE.head, roundMap(step, 'outline'));
    shapes.set(step, d);
  }
  return d;
}

/**
 * A layer drawn on his face turned `step` steps aside and kept within the turned outline, under the clip `clipId`, so
 * what passes the far edge goes out of sight. A whole SVG keeps its root and has the clip put inside it.
 */
export function roundClipped(markup: string, step: number, layer: RoundLayer, clipId: string): string {
  if (step === 0 || !markup) return markup;
  const turned = roundLayer(markup, step, layer);
  const clip = `<defs><clipPath id="${clipId}"><path d="${roundShape(step)}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
  const open = turned.startsWith('<svg') ? turned.indexOf('>') + 1 : 0;
  const close = turned.endsWith('</svg>') ? turned.length - '</svg>'.length : turned.length;
  return turned.slice(0, open) + clip + turned.slice(open, close) + '</g>' + turned.slice(close);
}
