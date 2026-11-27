/**
 * How a selection moves, the same in every selector of both apps (the tab bar, Learn's switch, the segmented controls):
 * the chosen capsule lifts into a clear lens that magnifies what it passes over, glides over its neighbours to the new
 * choice on a spring, and settles back into the dark tinted capsule. Timed from frame-by-frame measurement of the
 * platform's own glass tab bar at 60 fps.
 *
 * `planSwitch` starts a move, `lensAt` says where the lens is and how it looks at a moment, and `retarget` sends a move
 * already under way somewhere else from where it is, at the speed it has, so quick taps never jump. `magnifier` places
 * the magnified copy of the row that the lens shows.
 */
import { springFor, type SpringSpec } from './motion-physics.js';

export const SELECTOR_LENS = {
  /** From the tap until the tint has gone and the lens is up, in milliseconds (measured: two frames from the first change). */
  liftMs: 50,
  /** How long the lens rises in place before it sets off, in milliseconds, as the reference's does. */
  holdMs: 40,
  /**
   * The glide to the new choice, fitted to the reference frame by frame: after the hold, a spring set off with a kick
   * (`kick`, in spans per second), two thirds of the way by 100 ms from the tap and nine tenths by 200, with a breath of
   * overshoot.
   */
  glide: { duration: 0.45, bounce: 0.15 } satisfies SpringSpec,
  kick: 10,
  /**
   * How much larger than the capsule at rest the lens is, both ways: barely, since it stays inside the bar, and as tall
   * as the capsule once it flattens a little on the move (measured: 0.97 to 1.03).
   */
  lensScale: 1.04,
  /** How much wider it stretches at the height of the glide, as a share of its width (measured: 1.26 capsules at most). */
  stretch: 0.22,
  /** When the tint starts to come back over the new choice, and how long it and the shrink take (measured: ~300, ~85). */
  settleAtMs: 298,
  settleMs: 85,
  /** How much flatter it gets as it stretches, and how far its leading edge runs ahead, both with its speed. */
  squash: 0.02,
  lead: 0.14,
  /** A move never takes longer than this, whatever the spring is still doing in its last hundredths. */
  longestMs: 520,
  /** How much the lens magnifies what it passes over, in its middle (measured: about 1.3 on the glyphs). */
  magnify: 1.28,
  /**
   * Where the platform can bend at the rim: how far in from the edge it curves and how thick it is, in points, and how
   * much further red bends than green, and blue less. The middle stays clear; the fringe is wider than the bar's glass.
   */
  rim: { bezel: 14, thickness: 16, split: 0.6 },
} as const;

export type SelectorPhase = 'rest' | 'lifting' | 'moving' | 'settling';

/** A move from one place to another, in places along the selector (0 is the first). */
export interface SelectorMove {
  from: number;
  to: number;
  /** When it started, in milliseconds on any clock the caller keeps. */
  start: number;
  /** The speed it already had, in places per second, when it was sent on from another move. */
  velocity: number;
  /** When the lens was lifted: the start of the first move of a run of quick taps. */
  lifted: number;
  /** How long after `start` it sets off: the hold for a move from rest, nothing for one sent on from another. */
  hold: number;
}

/** How the selector looks at one moment. */
export interface LensFrame {
  phase: SelectorPhase;
  /** The capsule's centre, in places (2.5 is halfway between the third and fourth). */
  at: number;
  /** Its speed, in places per second, for a move sent on from here. */
  velocity: number;
  /** How large it is against the capsule at rest. */
  scale: number;
  /** How much wider it is stretched, as a share of its width. */
  stretch: number;
  /** How much of the dark tint shows, 1 at rest and 0 as a clear lens. */
  tint: number;
  /** How much the lens bends what lies under it, 0 to 1: nothing at rest. */
  lens: number;
  /** Its height against its width's scale: below 1 as it stretches, flattening like a drop on the move. */
  squash: number;
  /** How far its middle runs ahead of `at` toward where it is going, in places. */
  lead: number;
  /** How much it magnifies the row under it, about its own middle: 1 at rest. */
  magnify: number;
}

/** A move from `from` to `to`, starting now. */
export function planSwitch(from: number, to: number, now: number): SelectorMove {
  return { from, to, start: now, velocity: SELECTOR_LENS.kick * (to - from), lifted: now, hold: SELECTOR_LENS.holdMs };
}

const smooth = (k: number): number => {
  const t = Math.min(Math.max(k, 0), 1);
  return t * t * (3 - 2 * t);
};

/** Where a spring from 0 to 1 is after `t` seconds, starting at speed `v` (in its own units per second), and its speed. */
export function springAt(spec: SpringSpec, t: number, v = 0): { x: number; v: number } {
  const { stiffness, damping } = springFor(spec);
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  // Displacement from the end starts at -1 with speed v.
  const x0 = -1;
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const a = x0;
    const b = (v + zeta * omega * x0) / wd;
    const e = Math.exp(-zeta * omega * t);
    const x = e * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
    const dx = e * ((b * wd - zeta * omega * a) * Math.cos(wd * t) - (a * wd + zeta * omega * b) * Math.sin(wd * t));
    return { x: 1 + x, v: dx };
  }
  const b = v + omega * x0;
  const e = Math.exp(-omega * t);
  return { x: 1 + e * (x0 + b * t), v: e * (b - omega * (x0 + b * t)) };
}

/** The selector at `now` during `move`, or at rest on its choice once the move is over. */
export function lensAt(move: SelectorMove, now: number): LensFrame {
  const ms = now - move.start;
  const since = now - move.lifted;
  const span = move.to - move.from;
  if (ms >= SELECTOR_LENS.longestMs || span === 0) {
    return { phase: 'rest', at: move.to, velocity: 0, scale: 1, stretch: 0, tint: 1, lens: 0, squash: 1, lead: 0, magnify: 1 };
  }
  // Rising in place until the hold is over, then gliding from where it stood.
  const gliding = ms - move.hold;
  const { x, v } = gliding >= 0 ? springAt(SELECTOR_LENS.glide, gliding / 1000, move.velocity / span) : { x: 0, v: 0 };
  const at = move.from + span * x;
  const velocity = span * v;
  // Lifting: the tint goes and the lens rises over the first `liftMs` of the run, not again for a retarget.
  const rise = smooth(since / SELECTOR_LENS.liftMs);
  // Settling: the tint returns and the lens sinks over `settleMs`, from `settleAtMs` of this move.
  // The tint returns quickly at first, as it does in the reference, then eases in.
  const k = Math.min(Math.max((ms - SELECTOR_LENS.settleAtMs) / SELECTOR_LENS.settleMs, 0), 1);
  const fall = 1 - (1 - k) * (1 - k);
  const up = rise * (1 - fall);
  // The stretch follows the speed: widest at the height of the glide, and mostly gone well before it arrives. It grows
  // over the glide's first two frames rather than appearing at once with the kick.
  const pace = Math.min(Math.abs(v) / 6, 1) ** 1.5 * smooth(gliding / 33);
  const phase: SelectorPhase = since < SELECTOR_LENS.liftMs ? 'lifting' : ms < SELECTOR_LENS.settleAtMs ? 'moving' : 'settling';
  return {
    phase,
    at,
    velocity,
    scale: 1 + (SELECTOR_LENS.lensScale - 1) * up,
    stretch: SELECTOR_LENS.stretch * pace * up,
    tint: 1 - up,
    lens: up,
    squash: 1 - SELECTOR_LENS.squash * pace * up,
    lead: Math.sign(velocity) * SELECTOR_LENS.lead * pace * up,
    magnify: 1 + (SELECTOR_LENS.magnify - 1) * up,
  };
}

/** The lens along a selector, in pixels: its edges, one place's width, the row's height and how tall it is drawn. */
export interface LensBox {
  left: number;
  right: number;
  slot: number;
  height: number;
  /** Its height against the row's. */
  tall: number;
}

/**
 * Where the copy of the row inside the lens goes so that the lens shows the row magnified `magnify` times about its
 * own middle: a move and a scale from the copy's top left corner. The lens is an element one place wide and the row's
 * height, moved by `translateX(left) scale((right - left) / slot, tall)` from its left middle, which clips the copy to
 * its shape; the copy undoes that and magnifies, so it is drawn by transforms alone and slides through as the lens moves.
 */
export function magnifier({ left, right, slot, height, tall }: LensBox, magnify: number): { x: number; y: number; sx: number; sy: number } {
  const wide = slot > 0 ? (right - left) / slot : 0;
  if (wide <= 0 || tall <= 0) return { x: -left, y: 0, sx: 1, sy: 1 };
  return {
    x: (((left + right) / 2) * (1 - magnify) - left) / wide,
    y: height / 2 - (magnify * height) / (2 * tall),
    sx: magnify / wide,
    sy: magnify / tall,
  };
}

/** Sends a move under way to `to` from where it is now, keeping its speed and its lens up; at rest, a new move. */
export function retarget(move: SelectorMove, to: number, now: number): SelectorMove {
  const frame = lensAt(move, now);
  if (frame.phase === 'rest') return planSwitch(frame.at, to, now);
  // Still rising in place: the same hold, toward the new choice.
  if (now - move.start < move.hold) return { ...move, to, velocity: SELECTOR_LENS.kick * (to - move.from) };
  const lifted = frame.phase === 'settling' ? now - SELECTOR_LENS.liftMs * frame.lens : move.lifted;
  return { from: frame.at, to, start: now, velocity: frame.velocity, lifted, hold: 0 };
}
