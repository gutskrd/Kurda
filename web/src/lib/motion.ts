import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { celebrationEndMs, celebrationPlan } from '@kurda/shared';
import { haptic } from './haptics';

/**
 * Timing that components need from JavaScript; the motion tokens live in styles/tokens.css and the movements in
 * styles/motion.css.
 */

/** The reader asked for less motion: everything becomes a fade, or jumps to its end. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** How long a closing element takes to leave; matches `--dur` in styles/tokens.css. */
export const LEAVE_MS = 200;

/** Whether this browser plays movement: `matchMedia` exists and reduced motion is off. */
export function playsMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether something just closed (a dialog, a sheet) is still playing its exit: true for `LEAVE_MS` from the render in
 * which `open` turns false, and false at once where motion is off. Reopening ends it. The caller returns focus and
 * marks the leaving element inert and hidden from assistive technology straight away.
 */
export function useLeaving(open: boolean): boolean {
  const [was, setWas] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (was !== open) {
    setWas(open);
    setLeaving(!open && playsMotion());
  }
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(false), LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);
  return leaving && !open;
}

/** How long a number takes to count, by how far it moves (the phone's `countUpMs`). */
export function countUpMs(delta: number, reduce: boolean): number {
  if (reduce) return 0;
  const d = Math.abs(Math.round(delta));
  if (d === 0) return 0;
  return Math.round(Math.min(1000, 350 + d * 12));
}

/**
 * A number counting from `from` to `to` once, after `delayMs`; straight to `to` under reduced motion. Give screen
 * readers the final number (an aria-label or visually hidden text), not each step.
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
 * A celebration (shared celebration.ts): felt once as the art lands, over when the last fleck falls or when skipped.
 * The stylesheet keys on `playing`, which starts `delayMs` after mount.
 */
export function useCelebrationMoment(delayMs = 0): { playing: boolean; skip: () => void } {
  const [playing, setPlaying] = useState(true);
  const felt = useRef(false);
  const feel = useCallback(() => {
    if (felt.current) return;
    felt.current = true;
    haptic('celebrate');
  }, []);
  useEffect(() => {
    const plan = celebrationPlan(prefersReducedMotion());
    const landed = window.setTimeout(feel, delayMs + plan.hapticAtMs);
    const over = window.setTimeout(() => setPlaying(false), delayMs + celebrationEndMs(plan));
    return () => {
      window.clearTimeout(landed);
      window.clearTimeout(over);
    };
  }, [feel, delayMs]);
  const skip = useCallback(() => {
    // Skipped before landing: still felt.
    feel();
    setPlaying(false);
  }, [feel]);
  return { playing, skip };
}

/** How long a list counts as arriving after its first content, while its first rows rise in. */
export const ARRIVAL_MS = 900;

/** Lists that have already risen in this tab; each rises once. */
const ARRIVED = new Set<string>();

/** Lets every list arrive again, for tests. */
export function forgetArrivals(): void {
  ARRIVED.clear();
}

/**
 * Whether a newly filled list is still arriving, for the class that lets its first screenful rise in. True briefly
 * after `ready` first turns true, and only once per tab for each `name`, since lists like Home are opened many times a
 * day. A list drawn from memory (lib/apiMemory.ts) does not rise at all.
 */
export function useArrival(ready: boolean, name: string): boolean {
  const [arriving, setArriving] = useState(false);
  const since = useRef<number | null>(null);
  // Decided on the first draw: rows already in hand came from memory, and a list seen before has had its moment.
  const [may] = useState(() => !ready && !ARRIVED.has(name));
  useEffect(() => {
    if (!ready || !may) return;
    ARRIVED.add(name);
    since.current ??= Date.now();
    const left = ARRIVAL_MS - (Date.now() - since.current);
    if (left <= 0) {
      setArriving(false);
      return;
    }
    setArriving(true);
    const id = window.setTimeout(() => setArriving(false), left);
    return () => window.clearTimeout(id);
  }, [ready, may, name]);
  return arriving;
}

/**
 * Whether an element is in front of the reader: its tab is visible and it is on screen. Decorative loops run only
 * then. Without IntersectionObserver (old browsers, tests) the element counts as on screen.
 */
export function useInFront(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const onVisibility = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    const el = ref.current;
    const watcher =
      el && typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (last) setOnScreen(last.isIntersecting);
          })
        : null;
    if (el) watcher?.observe(el);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      watcher?.disconnect();
    };
  }, [ref]);
  return visible && onScreen;
}
