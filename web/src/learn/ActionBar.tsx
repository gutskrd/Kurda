import { useLayoutEffect, useRef } from 'react';

/** The bar's height on the root while shown, so the page scrolls things clear of it (learn.css). */
const BAR_VAR = '--lesson-bar-h';

/** A verdict sheet's colour: right, almost, or not yet. */
export type SheetTone = 'right' | 'almost' | 'notyet';

/**
 * The lesson's foot: one bar always in the same place, holding Check (with "Can't listen now" or "Can't speak now" at
 * its start), then the verdict sheet rising into it with Continue where Check was, so Enter, Enter is the rhythm. The
 * results' next step sits here too. It sticks to the page bottom rather than floating, so a phone keyboard pushes it up,
 * and its height (`--lesson-bar-h`) feeds the scroll padding so nothing scrolled to is left under it.
 */
export function ActionBar({ tone = null, children }: { tone?: SheetTone | null; children: React.ReactNode }): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = (): void => root.style.setProperty(BAR_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(BAR_VAR);
    };
  }, []);

  return (
    <div ref={bar} className={`lesson-bar${tone ? ` is-sheet is-${tone}` : ''}`}>
      <div className="lesson-bar-inner">{children}</div>
    </div>
  );
}

/** The bar's row: an optional start, and its one button (Check, Continue or the next step) at the end, always the same size and place. */
export function BarRow({ start, children }: { start?: React.ReactNode; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="lesson-bar-row">
      <div className="lesson-bar-start">{start}</div>
      {children}
    </div>
  );
}
