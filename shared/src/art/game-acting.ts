/**
 * How a game's cover moves (game-covers.ts), kept apart from the drawing. Each part of a cover has keyframes over a
 * loop a few seconds long, with anticipation, overshoot, staggered follow-through and rests, because a picture that
 * only bobs says nothing about its game. Keys are sampled once into poses (`sample`), which the apps play with
 * transforms and opacity only, so nothing is redrawn while a cover moves.
 */
import type { Drawing } from './svg.js';

/**
 * A part's pose at one moment: moved by (x, y) in picture units (120 across), turned `r` degrees and scaled (sx, sy)
 * about its pivot, at opacity `o`. At rest a part is where it was drawn.
 */
export interface GamePose {
  x: number;
  y: number;
  r: number;
  sx: number;
  sy: number;
  o: number;
}

const REST: GamePose = { x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1 };

/**
 * How a move eases from one key to the next:
 *   hold   — nothing until the key's moment, then there at once
 *   in     — starts slowly (dropping, or leaving)
 *   out    — arrives gently
 *   inOut  — slow at both ends
 *   back   — overshoots and settles: a landing, a pop
 */
export type Ease = 'hold' | 'linear' | 'in' | 'out' | 'inOut' | 'back';

/** A key: its moment in the loop (0 to 1), what changes by then (the rest holds; `s` sets both scales), and the easing. */
export type Key = readonly [t: number, to: Partial<GamePose> & { s?: number }, ease?: Ease];

const EASES: Record<Ease, (u: number) => number> = {
  hold: (u) => (u >= 1 ? 1 : 0),
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) ** 3,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  back: (u) => 1 + 2.70158 * (u - 1) ** 3 + 1.70158 * (u - 1) ** 2,
};

/** Samples per loop: enough that a quick pop keeps its shape between two of them. */
export const GAME_EMBLEM_SAMPLES = 90;

/** A part's keys as its pose at every sample; the last sample repeats the first. */
export function sample(keys: readonly Key[]): GamePose[] {
  const stops: Array<{ t: number; pose: GamePose; ease: Ease }> = [];
  let pose = REST;
  for (const [t, to, ease] of keys) {
    const { s, ...rest } = to;
    pose = { ...pose, ...(s === undefined ? {} : { sx: s, sy: s }), ...rest };
    stops.push({ t, pose, ease: ease ?? 'inOut' });
  }
  if (stops.length === 0) stops.push({ t: 0, pose: REST, ease: 'hold' });
  const out: GamePose[] = [];
  for (let i = 0; i <= GAME_EMBLEM_SAMPLES; i++) {
    const t = i / GAME_EMBLEM_SAMPLES;
    let next = stops.findIndex((stop) => stop.t > t);
    if (next === -1) next = stops.length;
    const from = stops[Math.max(0, next - 1)]!;
    const to = stops[Math.min(stops.length - 1, next)]!;
    if (next === 0 || next === stops.length || to.t === from.t) {
      out.push(next === 0 ? stops[0]!.pose : from.pose);
      continue;
    }
    const u = EASES[to.ease]((t - from.t) / (to.t - from.t));
    const mix = (a: number, b: number): number => Math.round((a + (b - a) * u) * 1000) / 1000;
    // A landing may overshoot in place and size, but opacity is clamped to 0–1.
    out.push({ x: mix(from.pose.x, to.pose.x), y: mix(from.pose.y, to.pose.y), r: mix(from.pose.r, to.pose.r), sx: mix(from.pose.sx, to.pose.sx), sy: mix(from.pose.sy, to.pose.sy), o: Math.min(1, Math.max(0, mix(from.pose.o, to.pose.o))) });
  }
  return out;
}

/** One part of a cover: what it draws, the point it turns and grows about, and its acting. */
export interface Part {
  draw: (dr: Drawing) => void;
  /** The point it turns and scales about; the middle of the picture by default. */
  pivot?: readonly [number, number];
  /** Its keys; without them it stays where it is drawn. */
  keys?: readonly Key[];
}

/** A game's cover: its parts back to front, and how long its acting takes to go round once. */
export interface Cover {
  title: string;
  loopMs: number;
  parts: readonly Part[];
}
