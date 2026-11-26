import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { releaseVelocity, type DragSample } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { QUICK_RELEASE_MS } from './Pressable';
import {
  CARD_TURN_MS,
  CARD_TURN_SETTLE,
  ENTRANCE,
  POP_SCALE,
  PRESS_SCALE,
  RING_MS,
  RING_STEPS,
  SHAKE_MS,
  SHAKE_STEPS,
  countAt,
  countUpMs,
  curve,
  duration,
  easeOut,
  entranceDelay,
  spring,
} from './motion';

/**
 * The motion tokens (motion.ts) as React Native easings and springs, plus the small animations screens share: press,
 * shake, pop, count-up, list entrance. All run on the native driver, move only transform and opacity, and check
 * Reduce Motion themselves.
 */

export const ease = {
  out: Easing.bezier(...curve.out),
  emphasis: Easing.bezier(...curve.emphasis),
};

/** A native-driver timing, out-curved unless told otherwise. */
export function timing(
  value: Animated.Value,
  toValue: number,
  ms: number,
  opts: { delay?: number; easing?: (t: number) => number } = {},
): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue, duration: ms, delay: opts.delay ?? 0, easing: opts.easing ?? ease.out, useNativeDriver: true });
}

/** One of the springs (motion.ts `spring`) on the native driver: `chrome` for the interface, the others for moments. */
export function springTo(value: Animated.Value, toValue: number, kind: keyof typeof spring = 'standard', delay = 0): Animated.CompositeAnimation {
  return Animated.spring(value, { toValue, ...spring[kind], delay, useNativeDriver: true });
}

/**
 * A game card turning over, `value` 0 to 1, in the shared `CARD_TURN_MS`: arriving quickly, a touch past flat, then
 * settling, like a card put down. Anything drawn from it must tolerate it passing 1 briefly (clamp opacities). The
 * caller leaves it at 1 under Reduce Motion.
 */
export function turnCard(value: Animated.Value): Animated.CompositeAnimation {
  return timing(value, 1, CARD_TURN_MS, { easing: Easing.out(Easing.back(CARD_TURN_SETTLE)) });
}

/**
 * A spring taking over from a finger: `value` (in points) goes to `toValue` starting at the release velocity (points
 * per second, `DragSamples.velocity`) on the release spring, so there is no seam. `clamp` stops it on arrival, for
 * something leaving the screen. A new touch can interrupt it with `stopAnimation`.
 */
export function releaseSpring(
  value: Animated.Value,
  toValue: number,
  velocity: number,
  { kind = 'release', clamp = false }: { kind?: keyof typeof spring; clamp?: boolean } = {},
): Animated.CompositeAnimation {
  return Animated.spring(value, {
    toValue,
    ...spring[kind],
    velocity,
    overshootClamping: clamp,
    // In points rather than 0…1: at rest within half a point.
    restDisplacementThreshold: 0.5,
    restSpeedThreshold: 0.5,
    useNativeDriver: true,
  });
}

/** Recent finger positions, for the release velocity: `add` on every move, `velocity` on release, in points per second. */
export class DragSamples {
  private samples: DragSample[] = [];

  add(position: number, time: number = Date.now()): void {
    this.samples.push({ time, position });
    // `releaseVelocity` reads only a tenth of a second; a little more is kept for a slow frame.
    if (this.samples.length > 12) this.samples.shift();
  }

  velocity(now: number = Date.now()): number {
    const v = releaseVelocity(this.samples, now);
    this.samples = [];
    return v;
  }
}

/** The dip's duration for a press released at once: quick enough that the spring back still feels like the press. */
const QUICK_DIP_MS = 70;

/**
 * A press that shrinks slightly under the finger and springs back, for buttons, cards and tiles; under Reduce Motion
 * it does not move and the caller's pressed dimming is the feedback. A release right after the press
 * (`QUICK_RELEASE_MS`) first dips fully, quickly, so every accepted press is seen.
 */
export function usePressScale(enabled = true): {
  scale: Animated.Value | number;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const reduce = useReducedMotion();
  const value = useRef(new Animated.Value(1)).current;
  const pressedAt = useRef(0);
  const live = enabled && !reduce;
  const onPressIn = useCallback(() => {
    if (!live) return;
    pressedAt.current = Date.now();
    value.stopAnimation();
    timing(value, PRESS_SCALE, duration.quick - 20).start();
  }, [live, value]);
  const onPressOut = useCallback(() => {
    if (!live) return;
    // Back on the interface spring: a button is used all day and must recover at once.
    if (Date.now() - pressedAt.current < QUICK_RELEASE_MS) {
      value.stopAnimation();
      Animated.sequence([timing(value, PRESS_SCALE, QUICK_DIP_MS), springTo(value, 1, 'chrome')]).start();
    } else {
      springTo(value, 1, 'chrome').start();
    }
  }, [live, value]);
  return { scale: live ? value : 1, onPressIn, onPressOut };
}

/**
 * A chunky button pushed down into its lip: `sink` runs 0 to `depth` points as the finger lands and springs back up with
 * a little bounce as it lifts. Under Reduce Motion it does not move; the caller dims it instead.
 */
export function usePressSink(depth: number, enabled = true): { sink: Animated.Value | number; onPressIn: () => void; onPressOut: () => void } {
  const reduce = useReducedMotion();
  const value = useRef(new Animated.Value(0)).current;
  const live = enabled && !reduce;
  const onPressIn = useCallback(() => {
    if (!live) return;
    value.stopAnimation();
    timing(value, depth, SINK_MS).start();
  }, [live, value, depth]);
  const onPressOut = useCallback(() => {
    if (!live) return;
    springTo(value, 0, 'bouncy').start();
  }, [live, value]);
  return { sink: live ? value : 0, onPressIn, onPressOut };
}

/** How quickly a button sinks into its lip: at once, so the press is felt under the finger. */
const SINK_MS = 60;

/** A wrong answer's short shake (about 300 ms, three diminishing swings); `run()` plays it, and under Reduce Motion the colour says it alone. */
export function useShake(): { translateX: Animated.Value; run: () => void } {
  const reduce = useReducedMotion();
  const translateX = useRef(new Animated.Value(0)).current;
  const run = useCallback(() => {
    if (reduce) return;
    translateX.stopAnimation();
    translateX.setValue(0);
    const step = SHAKE_MS / (SHAKE_STEPS.length - 1);
    Animated.sequence(SHAKE_STEPS.slice(1).map((x) => timing(translateX, x, step, { easing: Easing.inOut(Easing.quad) }))).start();
  }, [reduce, translateX]);
  return { translateX, run };
}

/**
 * Something with news: each time `ring` increases it swings once like a rung bell (`RING_STEPS`). Not on first
 * render, since what was already waiting is not news, and not under Reduce Motion, where the dot beside it says it.
 * `rotate` is for a transform with its origin at the top, where a bell hangs.
 */
export function useRing(ring: number): { rotate: Animated.AnimatedInterpolation<string> } {
  const reduce = useReducedMotion();
  const degrees = useRef(new Animated.Value(0)).current;
  const heard = useRef(ring);
  useEffect(() => {
    const rose = ring > heard.current;
    heard.current = ring;
    if (!rose || reduce) return;
    degrees.stopAnimation();
    degrees.setValue(0);
    const step = RING_MS / (RING_STEPS.length - 1);
    const swing = Animated.sequence(RING_STEPS.slice(1).map((d) => timing(degrees, d, step, { easing: Easing.inOut(Easing.quad) })));
    swing.start();
    return () => swing.stop();
  }, [ring, reduce, degrees]);
  return { rotate: degrees.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) };
}

/** A right answer's gentle pop on the spring; nothing under Reduce Motion. */
export function usePop(): { scale: Animated.Value; run: () => void } {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const run = useCallback(() => {
    if (reduce) return;
    scale.stopAnimation();
    scale.setValue(1);
    Animated.sequence([timing(scale, POP_SCALE, duration.quick), springTo(scale, 1, 'bouncy')]).start();
  }, [reduce, scale]);
  return { scale, run };
}

/**
 * A number counting from `from` up to `to` once, after `delayMs`; straight to `to` under Reduce Motion. Driven by
 * frames rather than the native driver, since the text itself changes.
 */
export function useCountUp(to: number, { from = 0, delayMs = 0, ms }: { from?: number; delayMs?: number; ms?: number } = {}): number {
  const reduce = useReducedMotion();
  const total = reduce ? 0 : (ms ?? countUpMs(to - from, reduce));
  const [value, setValue] = useState(total > 0 ? from : to);
  useEffect(() => {
    if (total <= 0 || reduce) {
      setValue(to);
      return;
    }
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    let began: number | null = null;
    const wait = setTimeout(() => {
      const tick = (now: number) => {
        began ??= now;
        const t = (now - began) / total;
        setValue(countAt(from, to, easeOut(t)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      clearTimeout(wait);
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // Counts once per set of numbers.
  }, [to, from, total, delayMs, reduce]);
  return value;
}

/**
 * Whether a freshly filled list's rows should rise in: only the first screenful, once, while the list is arriving.
 * Rows mounted later (scrolled to or recycled) and later refreshes just appear. `ready` is whether the list has its
 * first content.
 */
export function useListEntrance(ready: boolean): (index: number) => number | null {
  const reduce = useReducedMotion();
  const since = useRef<number | null>(null);
  if (ready && since.current === null) since.current = Date.now();
  return useCallback(
    (index: number) => {
      if (reduce || since.current === null || Date.now() - since.current > ENTRANCE.windowMs) return null;
      return entranceDelay(index);
    },
    [reduce],
  );
}

/** A value from 0 to 1, played once after `delayMs` when `play` is set at mount. */
export function useEnter(play: boolean, delayMs = 0, ms: number = duration.slow): Animated.Value {
  const [initial] = useState(play ? 0 : 1);
  const value = useRef(new Animated.Value(initial)).current;
  useEffect(() => {
    if (initial === 1) return;
    const run = timing(value, 1, ms, { delay: delayMs });
    run.start();
    return () => run.stop();
    // Only once, on mount.
  }, []);
  return value;
}

