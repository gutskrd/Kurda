import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { celebrationEndMs, celebrationPlan } from '@kurda/shared';
import { haptic } from './haptics';

/**
 * The few moving parts that need JavaScript rather than a stylesheet. The
 * tokens themselves (durations, curves, the press) are CSS custom properties
 * in styles/tokens.css, and the movements are in styles/motion.css; what is
 * here is the timing a component has to know about — when a celebration has
 * finished, how far a number has counted, whether a list is still arriving,
 * whether something is in front of the reader at all.
 */

/** The reader asked their device for less motion: everything becomes a fade, or simply the end. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/** How long something that is closing takes to leave: `--dur` in styles/tokens.css, which its stylesheet uses. */
export const LEAVE_MS = 200;

/**
 * Whether this browser will play a movement at all: it can be asked whether
 * the reader wants less of it, and the answer is no. Where it cannot be asked
 * (no `matchMedia`) nothing is waited for, and what would have moved is
 * simply where it ends.
 */
export function playsMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether something that has just been closed is still leaving — a dialog or
 * a sheet, which goes out the way it came in rather than vanishing.
 *
 * True from the very render in which `open` turns false, for `LEAVE_MS`,
 * which is how long whatever closes stays drawn (with its closing class) so
 * the stylesheet can take it away. It is false at once for a reader who asked
 * for less motion, and wherever motion cannot be played: there the thing is
 * simply gone. Opened again while leaving, it is no longer leaving.
 *
 * Only the picture stays. The caller hands the focus back and frees the page
 * the moment `open` turns false, and marks what is still drawn as inert and
 * hidden from assistive technology: nobody can reach into a dialog that has
 * been closed.
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
 * `playing` is what the stylesheet keys the movement on. It starts `delayMs`
 * after it mounts, for a moment that opens on something else first.
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
    // skipped before it landed: the moment still happened, and is still felt
    feel();
    setPlaying(false);
  }, [feel]);
  return { playing, skip };
}

/** How long a list is "arriving" after its first content: its first rows rise in during it, once. */
export const ARRIVAL_MS = 900;

/** The lists that have risen in already, while the tab is open: each rises once (as a unit of the path does). */
const ARRIVED = new Set<string>();

/** Every list may arrive again: for the tests, where one tab is many visits. */
export function forgetArrivals(): void {
  ARRIVED.clear();
}

/**
 * Whether a list that has just been filled is still arriving — for the class
 * that lets its first screenful rise in. True for a moment after `ready`
 * first turns true and never again, so a later refresh, a filter or a row
 * added at the top simply appears.
 *
 * And once in a tab, by the list's `name`: Home and Messages are opened many
 * times a day, and rows that rise in on every visit are movement on the most
 * used screens for nobody's benefit. Rows that are already there when the
 * list is first drawn — it was kept from the last visit (lib/apiMemory.ts) —
 * have not arrived at all, and do not rise.
 */
export function useArrival(ready: boolean, name: string): boolean {
  const [arriving, setArriving] = useState(false);
  const since = useRef<number | null>(null);
  // decided as the list is first drawn: rows in hand then came from memory, and a list seen before has had its moment
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
 * Whether an element is in front of the reader: its tab is the one being
 * looked at and the element is on the screen. A loop that is only decoration
 * (a code ticket's glint) runs only while this is true, as a speaking
 * character rests when it is not in front — a light crossing a ticket in a
 * background tab, or scrolled away under the fold, is work nobody sees.
 * Without an IntersectionObserver (an old browser, a test) the element counts
 * as on the screen.
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
