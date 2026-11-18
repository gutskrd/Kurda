/**
 * How things move on the phone's system, as numbers with no screen behind them: springs, the rubber band past an edge,
 * and where a flick comes to rest. The phone's sheets, side menu and springs use these, so a half-dragged sheet decides as
 * a system sheet does and the numbers test without a device. Units are points, seconds for a spring, and points per second
 * for a finger's speed (the gesture library reports points per millisecond: multiply by 1000).
 */

/** A spring as the animation library's `Animated.spring` takes it. */
export interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * A spring as the system's UI framework describes it: by `response` (about seconds to settle) and `dampingFraction` (1
 * settles without overshoot, less bounces), or by `duration` and `bounce` (0 none, up to 1; below 0 slower than critical).
 */
export type SpringSpec = { response: number; dampingFraction: number } | { duration: number; bounce: number };

/**
 * The physical spring for such a spec, with a mass of 1: stiffness = (2π / response)², damping = 4π · dampingFraction /
 * response, and a `bounce` of b is a damping fraction of 1 − b (1 / (1 + b) below 0).
 */
export function springFor(spec: SpringSpec): Spring {
  const response = 'response' in spec ? spec.response : spec.duration;
  const fraction = 'response' in spec ? spec.dampingFraction : spec.bounce >= 0 ? 1 - spec.bounce : 1 / (1 + spec.bounce);
  if (!(response > 0) || !(fraction >= 0) || !Number.isFinite(fraction)) throw new RangeError('a spring needs a response above 0 and a bounce between -1 and 1');
  const omega = (2 * Math.PI) / response;
  return { stiffness: omega * omega, damping: (4 * Math.PI * fraction) / response, mass: 1 };
}

/**
 * The system's named springs: `default` (since version 17), the `smooth`, `snappy` and `bouncy` presets, and `interactive`,
 * the quick, nearly critical one used while a finger still holds what moves. The platform's advice: no bounce unless a
 * gesture with momentum just ended, and little even then.
 */
export const APPLE_SPRINGS = {
  default: { response: 0.55, dampingFraction: 1 },
  smooth: { duration: 0.5, bounce: 0 },
  snappy: { duration: 0.5, bounce: 0.15 },
  bouncy: { duration: 0.5, bounce: 0.3 },
  interactive: { response: 0.15, dampingFraction: 0.86 },
} as const satisfies Record<string, SpringSpec>;

/** How much speed a scroll keeps each millisecond after the finger lifts, as the system's scroll views decelerate. */
export const DECELERATION = { normal: 0.998, fast: 0.99 } as const;

/** The system's rubber-band constant: how stiff the give past an edge is. */
export const RUBBER_BAND = 0.55;

/**
 * How far something dragged `offset` points past its limit is drawn, by the rubber band (1 − 1 / (c · x / d + 1)) · d: it
 * follows the finger at first and gives less and less, never reaching `dimension`. Signed, so past the other edge it is
 * negative.
 */
export function rubberBand(offset: number, dimension: number, c: number = RUBBER_BAND): number {
  if (offset === 0 || !(dimension > 0)) return 0;
  const x = Math.abs(offset);
  return Math.sign(offset) * (1 - 1 / ((c * x) / dimension + 1)) * dimension;
}

/** How much further something let go at `velocityPtPerS` travels before resting, decelerating like a scroll view: (v / 1000) · r / (1 − r). */
export function project(velocityPtPerS: number, decelerationRate: number = DECELERATION.normal): number {
  return ((velocityPtPerS / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Where something let go at `position`, moving at `velocity` points per second, should settle: the stop nearest where the
 * flick would carry it, not where the finger lifted. With no stops, where it is.
 */
export function snapTarget(position: number, velocity: number, stops: readonly number[]): number {
  const end = position + project(velocity);
  let best = position;
  let distance = Number.POSITIVE_INFINITY;
  for (const stop of stops) {
    const d = Math.abs(stop - end);
    if (d < distance) {
      best = stop;
      distance = d;
    }
  }
  return best;
}

/**
 * Whether a sheet dragged `position` points down from rest and let go at `velocity` (points per second, down positive)
 * should close: when the flick would carry it past half its `height`. A slow drag past halfway closes, a quick flick from
 * near the top closes, and a flick back up keeps it.
 */
export function shouldDismiss(position: number, velocity: number, height: number): boolean {
  return position + project(velocity) > height / 2;
}

/** Where a dragging finger was and when, in milliseconds. */
export interface DragSample {
  time: number;
  position: number;
}

/** The speed a finger lifts at in points per second, from its travel over the last `windowMs`: steadier than two samples, and zero after holding still. */
export function releaseVelocity(samples: readonly DragSample[], now: number, windowMs = 100): number {
  const recent = samples.filter((s) => now - s.time <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0]!;
  const last = recent[recent.length - 1]!;
  const dt = last.time - first.time;
  return dt > 0 ? ((last.position - first.position) / dt) * 1000 : 0;
}
