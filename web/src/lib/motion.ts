import { useCallback, useEffect, useRef, useState } from 'react';
import { celebrationEndMs, celebrationPlan } from '@kurda/shared';
import { haptic } from './haptics';

/**
 * The few moving parts that need JavaScript rather than a stylesheet. The
 * tokens themselves (durations, curves, the press) are CSS custom properties
 * in styles/tokens.css, and the movements are in styles/motion.css; what is
 * here is the timing a component has to know about — when a celebration has
 * finished, how far a number has counted, whether a list is still arriving.
 */

/** The reader asked their device for less motion: everything becomes a fade, or simply the end. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** How long a number takes to count, by how far it moves (the phone's `countUpMs`). */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1000, 350 + d * 12));
}

/**
 * A number counting up from `from` to `to`, once, after `delayMs`, on the
 * out-curve; straight to `to` under reduced motion. What a screen reader is
 * given should be the final number (the caller's job: an aria-label, or
 * visually-hidden text), not every number on the way.
 */
export function useCountUp(to: number, { from = 0, delayMs = 0 }: { from?: number; delayMs?: number } = {}): number {
  const [reduce] = useState(prefersReducedMotion);
  const total = countUpMs(to - from, reduce);
  const [value, setValue] = useState(total > 0 ? from : to);
  useEffect(() => {
    if (total <= 0) {
      setValue(to);
      return;
    }
    let frame = 0;
    let began: number | null = null;
    const wait = window.setTimeout(() => {
      const tick = (now: number): void => {
        began ??= now;
        const t = Math.min(1, (now - began) / total);
        setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(wait);
      cancelAnimationFrame(frame);
    };
  }, [to, from, total, delayMs]);
  return value;
}

/**
 * A celebration playing (shared celebration.ts): felt once as the art lands,
 * over when the last fleck has fallen — or at once, when it is skipped.
 * `playing` is what the stylesheet keys the movement on.
 */
export function useCelebrationMoment(): { playing: boolean; skip: () => void } {
  const [playing, setPlaying] = useState(true);
  const felt = useRef(false);
  const feel = useCallback(() => {
    if (felt.current) return;
    felt.current = true;
    haptic('celebrate');
  }, []);
  useEffect(() => {
    const plan = celebrationPlan(prefersReducedMotion());
    const landed = window.setTimeout(feel, plan.hapticAtMs);
    const over = window.setTimeout(() => setPlaying(false), celebrationEndMs(plan));
    return () => {
      window.clearTimeout(landed);
      window.clearTimeout(over);
    };
  }, [feel]);
  const skip = useCallback(() => {
    // skipped before it landed: the moment still happened, and is still felt
    feel();
    setPlaying(false);
  }, [feel]);
  return { playing, skip };
}

/** How long a list is "arriving" after its first content: its first rows rise in during it, once. */
export const ARRIVAL_MS = 900;

/**
 * Whether a list that has just been filled is still arriving — for the class
 * that lets its first screenful rise in. True for a moment after `ready`
 * first turns true and never again, so a later refresh, a filter or a row
 * added at the top simply appears.
 */
export function useArrival(ready: boolean): boolean {
  const [arriving, setArriving] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    since.current ??= Date.now();
    const left = ARRIVAL_MS - (Date.now() - since.current);
    if (left <= 0) {
      setArriving(false);
      return;
    }
    setArriving(true);
    const id = window.setTimeout(() => setArriving(false), left);
    return () => window.clearTimeout(id);
  }, [ready]);
  return arriving;
}
