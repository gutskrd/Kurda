import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { SELECTOR_LENS, celebrationEndMs, celebrationPlan, lensAt, magnifier, planSwitch } from '@kurda/shared';
import { dropLens, lensSupported, takeLens, type Lens } from '@kurda/shared/src/glass-lens';
import { haptic } from './haptics';
import { insideOf, playInside, type InsideFrame } from './selectorLens';

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

/**
 * Keeps a segmented control's chosen ground (`capsule`) under its chosen option (`chosen`, a selector within the
 * control) and moves it there when the choice changes as every selector does (shared selector-lens.ts): lifted into a
 * lens, glided and settled, transform and opacity only. With a `lens` (ui/SwitchLens.tsx) the lens shows the options
 * magnified as it goes, on the switch's own ground. It is placed before the first paint and again when the control is
 * resized, without moving; under Reduce Motion it is simply placed.
 */
export function useSlidingCapsule(
  control: RefObject<HTMLElement | null>,
  capsule: RefObject<HTMLElement | null>,
  chosen: string,
  value: string,
  lens?: RefObject<HTMLElement | null>,
): void {
  const last = useRef<{ x: number; y: number; w: number } | null>(null);
  const bend = useRef<{ shape: string; lens: Lens } | null>(null);
  const place = useCallback(
    (slide: boolean): void => {
      const box = control.current;
      const cap = capsule.current;
      const on = box?.querySelector<HTMLElement>(chosen);
      if (!box || !cap || !on) return;
      const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth };
      const h = on.offsetHeight;
      const where = { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${h}px` };
      Object.assign(cap.style, where);
      const glass = lens?.current ?? null;
      if (glass) Object.assign(glass.style, where);
      const from = last.current;
      last.current = to;
      if (!slide || !from || !playsMotion() || typeof cap.animate !== 'function') return;
      if (from.x === to.x && from.y === to.y && from.w === to.w) return;
      if (glass) {
        fillLens(box, cap, glass);
        bend.current = bendLens(glass, to.w, h, bend.current);
      }
      // The move every selector makes (shared selector-lens.ts): sampled a frame at a time, from here to there, the
      // ground lifting into a lens, stretching with its speed and settling back.
      const move = planSwitch(0, 1, 0);
      const frames: Keyframe[] = [];
      const shown: Keyframe[] = [];
      const inside: InsideFrame[] = [];
      let t = 0;
      for (;;) {
        const f = lensAt(move, t);
        const x = from.x + (to.x - from.x) * f.at;
        const w = (from.w + (to.w - from.w) * f.at) * (1 + f.stretch) * f.scale;
        const left = x - (w - (from.w + (to.w - from.w) * f.at)) / 2;
        const dy = (from.y - to.y) * (1 - f.at);
        const tall = f.scale * f.squash;
        const transform = `translate(${left - to.x}px, ${dy}px) scale(${w / to.w}, ${tall})`;
        frames.push({ transform, opacity: 0.35 + 0.65 * f.tint });
        shown.push({ transform, opacity: f.lens > 0 ? 1 : 0 });
        const m = magnifier({ left, right: left + w, slot: to.w, height: h, tall, top: to.y + dy }, f.magnify);
        inside.push({ copy: `translate(${m.x}px, ${m.y}px) scale(${m.sx}, ${m.sy})`, tint: f.tint, rim: f.lens, swell: f.swell });
        if (f.phase === 'rest') break;
        t += 1000 / 60;
      }
      cap.classList.add('is-lens');
      const run = cap.animate(frames, { duration: t, easing: 'linear' });
      const lensRuns = glass ? [glass.animate(shown, { duration: t, easing: 'linear' }), ...playInside(insideOf(glass), inside, t)] : [];
      const done = () => {
        cap.classList.remove('is-lens');
        if (last.current !== to) return;
        for (const a of lensRuns) a.cancel();
        for (const copy of insideOf(glass).copies) copy.replaceChildren();
      };
      void run.finished.then(done, () => cap.classList.remove('is-lens'));
    },
    [control, capsule, chosen, lens],
  );
  useLayoutEffect(() => place(true), [place, value]);
  useEffect(() => {
    const box = control.current;
    if (!box || typeof ResizeObserver !== 'function') return;
    const watch = new ResizeObserver(() => place(false));
    watch.observe(box);
    return () => watch.disconnect();
  }, [control, place]);
  useEffect(
    () => () => {
      if (bend.current) dropLens(bend.current.lens);
      bend.current = null;
    },
    [],
  );
}

/**
 * Fills a switch's lens for a move: its glass stands on the switch's own ground as it is drawn on the page, so the
 * options beneath never show through, with the chosen ground's colour as its tint, and holds a copy of the switch's
 * options, the switch's own size and layout without their inputs or names.
 */
function fillLens(box: HTMLElement, cap: HTMLElement, lens: HTMLElement): void {
  const inside = insideOf(lens);
  if (inside.glass) inside.glass.style.background = groundOf(box);
  const tint = getComputedStyle(cap).backgroundColor;
  for (const el of inside.tints) el.style.background = tint;
  for (const copy of inside.copies) {
    const row = box.cloneNode(false) as HTMLElement;
    row.removeAttribute('id');
    row.removeAttribute('style');
    row.classList.add('seg-lens-row');
    // Its exact size, fractions and all, so its options are laid out just as the real ones are, to the same ellipsis.
    const size = box.getBoundingClientRect();
    Object.assign(row.style, { width: `${size.width}px`, height: `${size.height}px` });
    for (const option of box.querySelectorAll<HTMLElement>(':scope > .seg-btn')) {
      const twin = option.cloneNode(true) as HTMLElement;
      for (const input of twin.querySelectorAll('input')) input.remove();
      for (const named of [twin, ...twin.querySelectorAll('[id]')]) named.removeAttribute('id');
      row.append(twin);
    }
    copy.replaceChildren(row);
  }
}

/** Where the browser can bend with an SVG filter (Chromium), the lens's rim for a ground of this size; once per size. */
function bendLens(lens: HTMLElement, width: number, height: number, had: { shape: string; lens: Lens } | null): { shape: string; lens: Lens } | null {
  if (!lensSupported()) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const shape = `${width}x${height}@${dpr}`;
  if (had?.shape === shape) return had;
  const made = takeLens({ width, height, radius: height / 2 }, dpr, true, SELECTOR_LENS.rim);
  if (had) dropLens(had.lens);
  if (made.filter) {
    lens.style.setProperty('--lens-filter', `url(#${made.filter})`);
    lens.dataset.bends = '';
  }
  return { shape, lens: made };
}

/** The colour drawn on and behind `el` as one opaque colour: its own background over its ancestors', down to the page. */
export function groundOf(el: HTMLElement): string {
  const layers: number[][] = [];
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(node).backgroundColor);
    if (!m) continue;
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha <= 0) continue;
    layers.push([Number(m[1]), Number(m[2]), Number(m[3]), alpha]);
    if (alpha >= 1) break;
  }
  let [r, g, b] = [255, 255, 255];
  for (const [lr, lg, lb, la] of layers.reverse()) {
    r = lr! * la! + r * (1 - la!);
    g = lg! * la! + g * (1 - la!);
    b = lb! * la! + b * (1 - la!);
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
