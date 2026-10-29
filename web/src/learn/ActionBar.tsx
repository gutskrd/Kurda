import { useLayoutEffect, useRef } from 'react';

/** The bar's height, kept on the root while it is there, so the page scrolls things clear of it (learn.css). */
export const BAR_VAR = '--lesson-bar-h';

/** The colour a verdict sheet takes: right, almost, or not yet. */
export type SheetTone = 'right' | 'almost' | 'notyet';

/**
 * The foot of the lesson, where the learner acts: one bar across the bottom
 * of the screen, always in the same place, holding Check while an exercise is
 * answered — with "Can't listen now" or "Can't speak now" at its start — and,
 * once it is graded, the verdict sheet that rises into the same place in the
 * verdict's colour, with Continue exactly where Check was. The thumb never
 * moves, and Enter, Enter is the rhythm. The results' next step sits here too.
 *
 * It sticks to the bottom of the page rather than floating over it, so it
 * takes its own room under the last of the exercise and a phone's keyboard
 * pushes it up rather than covering it. Its height is kept on the root
 * (`--lesson-bar-h`) for the page's scroll padding: a field or an option
 * scrolled to is brought clear of it, never left underneath.
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

/**
 * The bar's own row: what goes at its start, and its one button at the end —
 * Check, Continue, or the results' next step — the same size and in the same
 * place each time (`.lesson-bar-go`).
 */
export function BarRow({ start, children }: { start?: React.ReactNode; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="lesson-bar-row">
      <div className="lesson-bar-start">{start}</div>
      {children}
    </div>
  );
}
