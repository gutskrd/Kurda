/**
 * Reduce Motion foundation (KUR-266). Pure logic so it is unit-testable; the
 * thin React hook that reads the live OS setting lives in useReducedMotion.ts.
 *
 * Every *decorative* animation in the app — the onboarding globe's breathing
 * pulse, the rotating welcome subtitle, non-essential transitions — resolves
 * its timing through resolveMotion() so a single OS toggle can calm the whole
 * UI. Essential motion that conveys meaning (progress spinners, a value
 * changing) is not routed through here.
 */

/** A decorative animation's requested timing. */
export interface MotionSpec {
  /** Full-motion duration in ms. */
  durationMs: number;
  /** ms to wait before the animation starts. */
  delayMs?: number;
  /** Repeat count; use Infinity for a looping animation (e.g. breathing). */
  iterations?: number;
}

/** The timing to actually use, after applying the Reduce Motion setting. */
export interface ResolvedMotion {
  durationMs: number;
  delayMs: number;
  iterations: number;
  /** False when motion is reduced — the caller renders the resting state. */
  animate: boolean;
}

/**
 * Resolve a decorative animation against the Reduce Motion setting.
 *
 * When motion is reduced the animation is dropped *entirely* — zero duration,
 * a single pass, `animate: false` — so callers snap to the final/resting state
 * rather than playing a shortened version that still moves (which defeats the
 * accessibility setting). When motion is allowed, a zero-duration spec still
 * reports `animate: false` so there is nothing to run.
 */
export function resolveMotion(spec: MotionSpec, reduceMotion: boolean): ResolvedMotion {
  if (reduceMotion) {
    return { durationMs: 0, delayMs: 0, iterations: 1, animate: false };
  }
  return {
    durationMs: spec.durationMs,
    delayMs: spec.delayMs ?? 0,
    iterations: spec.iterations ?? 1,
    animate: spec.durationMs > 0,
  };
}

/**
 * Named specs for the shared decorative animations, kept in one place so the
 * onboarding slides (and anything else) consume identical timing.
 */

/** Onboarding globe "breathing" pulse — a slow, endless scale in/out. */
export const GLOBE_BREATH: MotionSpec = { durationMs: 2600, iterations: Infinity };

/** Rotating welcome subtitle — dwell per phrase, then a quick crossfade. */
export const WELCOME_ROTATE: MotionSpec = { durationMs: 450, delayMs: 2200, iterations: Infinity };

/** Standard highlight flash when a selection is made (e.g. tap a language). */
export const SELECT_HIGHLIGHT: MotionSpec = { durationMs: 220, iterations: 1 };
