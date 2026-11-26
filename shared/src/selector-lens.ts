/**
 * How a selection moves, the same in every selector of both apps (the tab bar, Learn's switch, the segmented controls):
 * the chosen capsule lifts into a clear lens, glides over its neighbours to the new choice on a spring, and settles back
 * into the dark tinted capsule. Timed from frame-by-frame measurement of the platform's own glass tab bar at 60 fps.
 *
 * `planSwitch` starts a move, `lensAt` says where the lens is and how it looks at a moment, and `retarget` sends a move
 * already under way somewhere else from where it is, at the speed it has, so quick taps never jump.
 */
import { springFor, type SpringSpec } from './motion-physics.js';

export const SELECTOR_LENS = {
  /** From the tap until the tint has gone and the lens is up, in milliseconds (measured: about 67). */
  liftMs: 70,
  /** The glide to the new choice: about 95% of the way at 200 ms and still at 230, with a breath of overshoot. */
  glide: { duration: 0.34, bounce: 0.12 } satisfies SpringSpec,
  /** How much larger than the capsule at rest the lens is, both ways (it rises a little past the bar's height). */
  lensScale: 1.12,
  /** How much wider it stretches at the height of the glide, as a share of its width (measured: about 0.45). */
  stretch: 0.45,
  /** When the tint starts to come back over the new choice, and how long it and the shrink take (measured: 317, ~70). */
  settleAtMs: 300,
  settleMs: 90,
  /** A move never takes longer than this, whatever the spring is still doing in its last hundredths. */
  longestMs: 520,
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
}

/** A move from `from` to `to`, starting now. */
export function planSwitch(from: number, to: number, now: number): SelectorMove {
  return { from, to, start: now, velocity: 0, lifted: now };
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
    return { phase: 'rest', at: move.to, velocity: 0, scale: 1, stretch: 0, tint: 1, lens: 0 };
  }
  const { x, v } = springAt(SELECTOR_LENS.glide, Math.max(ms, 0) / 1000, span !== 0 ? move.velocity / span : 0);
  const at = move.from + span * x;
  const velocity = span * v;
  // Lifting: the tint goes and the lens rises over the first `liftMs` of the run, not again for a retarget.
  const rise = smooth(since / SELECTOR_LENS.liftMs);
  // Settling: the tint returns and the lens sinks over `settleMs`, from `settleAtMs` of this move.
  const fall = smooth((ms - SELECTOR_LENS.settleAtMs) / SELECTOR_LENS.settleMs);
  const up = rise * (1 - fall);
  // The stretch follows the speed: widest at the height of the glide, gone as it arrives.
  const pace = Math.min(Math.abs(v) / 6, 1);
  const phase: SelectorPhase = since < SELECTOR_LENS.liftMs ? 'lifting' : ms < SELECTOR_LENS.settleAtMs ? 'moving' : 'settling';
  return {
    phase,
    at,
    velocity,
    scale: 1 + (SELECTOR_LENS.lensScale - 1) * up,
    stretch: SELECTOR_LENS.stretch * pace * up,
    tint: 1 - up,
    lens: up,
  };
}

/** Sends a move under way to `to` from where it is now, keeping its speed and its lens up; at rest, a new move. */
export function retarget(move: SelectorMove, to: number, now: number): SelectorMove {
  const frame = lensAt(move, now);
  if (frame.phase === 'rest') return planSwitch(frame.at, to, now);
  return { from: frame.at, to, start: now, velocity: frame.velocity, lifted: frame.phase === 'settling' ? now - SELECTOR_LENS.liftMs * frame.lens : move.lifted };
}
