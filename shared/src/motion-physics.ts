/**
 * How things move on iOS, as numbers with no screen behind them: Apple's
 * springs, the rubber band past an edge, and where a flick would come to rest.
 *
 * The phone's sheets, its side menu and its springs are built on these, so a
 * sheet let go of halfway decides the way a system sheet does, and the
 * numbers can be tested without a device.
 *
 * Units are the platform's: points, seconds for a spring, points per second
 * for a finger's speed (React Native's gesture reports points per
 * millisecond: multiply by 1000).
 */

/** A spring as React Native's `Animated.spring` takes it. */
export interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

/**
 * A spring as SwiftUI describes it: by `response` (seconds to settle, roughly)
 * and `dampingFraction` (1 settles without overshoot, less bounces), or by
 * `duration` and `bounce` (0 no bounce, up to 1; below 0 slower than critical).
 */
export type SpringSpec = { response: number; dampingFraction: number } | { duration: number; bounce: number };

/**
 * The physical spring for a SwiftUI one, with a mass of 1:
 * stiffness = (2π / response)², damping = 4π · dampingFraction / response,
 * and a `bounce` of b is a damping fraction of 1 − b (1 / (1 + b) below 0).
 */
export function springFor(spec: SpringSpec): Spring {
  const response = 'response' in spec ? spec.response : spec.duration;
  const fraction = 'response' in spec ? spec.dampingFraction : spec.bounce >= 0 ? 1 - spec.bounce : 1 / (1 + spec.bounce);
  if (!(response > 0) || !(fraction >= 0) || !Number.isFinite(fraction)) throw new RangeError('a spring needs a response above 0 and a bounce between -1 and 1');
  const omega = (2 * Math.PI) / response;
  return { stiffness: omega * omega, damping: (4 * Math.PI * fraction) / response, mass: 1 };
}

/**
 * Apple's named springs. `default` is `Animation.spring()`; `smooth`, `snappy`
 * and `bouncy` are the presets of the same names; `interactive` is
 * `interactiveSpring()`, the quick, nearly critical one used while a finger
 * is still on what moves.
 */
export const APPLE_SPRINGS = {
  default: { response: 0.55, dampingFraction: 0.825 },
  smooth: { duration: 0.5, bounce: 0 },
  snappy: { duration: 0.5, bounce: 0.15 },
  bouncy: { duration: 0.5, bounce: 0.3 },
  interactive: { response: 0.15, dampingFraction: 0.86 },
} as const satisfies Record<string, SpringSpec>;

/** How much speed a scroll keeps each millisecond after the finger lifts: `UIScrollView.DecelerationRate`. */
export const DECELERATION = { normal: 0.998, fast: 0.99 } as const;

/** Apple's rubber-band constant: how stiff the give past an edge is. */
export const RUBBER_BAND = 0.55;

/**
 * How far something dragged `offset` points past its limit is drawn: Apple's
 * rubber band, (1 − 1 / (c · x / d + 1)) · d. It follows the finger at first
 * and gives less and less, never reaching `dimension` however far the finger
 * goes. Signed: a drag past the other edge comes out negative.
 */
export function rubberBand(offset: number, dimension: number, c: number = RUBBER_BAND): number {
  if (offset === 0 || !(dimension > 0)) return 0;
  const x = Math.abs(offset);
  return Math.sign(offset) * (1 - 1 / ((c * x) / dimension + 1)) * dimension;
}

/**
 * How much further something let go at `velocityPtPerS` would travel before
 * coming to rest, decelerating as a scroll view does: (v / 1000) · r / (1 − r).
 */
export function project(velocityPtPerS: number, decelerationRate: number = DECELERATION.normal): number {
  return ((velocityPtPerS / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * Where something let go at `position`, moving at `velocity` (points per
 * second), should settle: the stop nearest to where the flick would have
 * carried it, not to where the finger happened to lift. With no stops, where
 * it is.
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
 * Whether a sheet dragged `position` points down from where it rests, let go
 * at `velocity` (points per second, down is positive), should go: when the
 * flick would carry it past half of its `height`. A slow drag past halfway
 * goes, a quick flick from near the top goes, and a flick back up keeps it.
 */
export function shouldDismiss(position: number, velocity: number, height: number): boolean {
  return position + project(velocity) > height / 2;
}
