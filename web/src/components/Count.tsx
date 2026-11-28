/**
 * Counts of people and things that grow without bound (likes, gifts, reads): shown short by the shared `compactCount`
 * (300, 3.4K, 5.6M) and given whole (3,400) to screen readers, in the reader's language.
 */
import { useLayoutEffect, useMemo } from 'react';
import { compactCount } from '@kurda/shared';
import { useLocale } from '../i18n/I18nProvider';

export interface CountForms {
  /** For the eye, where room is short: "3.4K". */
  short: (n: number) => string;
  /** For screen readers and labels: "3,400". */
  whole: (n: number) => string;
}

export function useCountForms(): CountForms {
  const locale = useLocale();
  return useMemo(() => ({ short: (n: number) => compactCount(n, locale), whole: (n: number) => wholeCount(n, locale) }), [locale]);
}

/** A count in full, grouped as the reader's language groups digits. */
export function wholeCount(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(n);
  } catch {
    return String(n);
  }
}

/** Words with a count in them, shown with the count short and read with it whole; plain text when the two agree. */
export function CountWords({ shown, said }: { shown: string; said: string }): React.JSX.Element {
  if (shown === said) return <>{shown}</>;
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{said}</span>
    </>
  );
}

/**
 * Shrinks the counts matched by `selector` inside `box` together, never past `least`, until the widest fits the room
 * its stylesheet gives it (a max-width, with overflow hidden and no wrapping): sets `--count-fit` on `box` for the
 * counts' font size. Measured in place, so it holds in every language; `key` changes whenever the counts do.
 */
export function useCountFit(box: React.RefObject<HTMLElement | null>, selector: string, key: string, least = 0.6): void {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let seen = -1;
    const measure = (): void => {
      const width = el.clientWidth;
      if (width === 0 || width === seen) return;
      seen = width;
      el.style.removeProperty('--count-fit');
      let fit = 1;
      for (const count of el.querySelectorAll<HTMLElement>(selector)) {
        const over = count.scrollWidth - count.clientWidth;
        if (over <= 0) continue;
        const style = getComputedStyle(count);
        const words = count.scrollWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
        fit = Math.min(fit, words > 0 ? (words - over) / words : least);
      }
      if (fit < 1) el.style.setProperty('--count-fit', String(Math.max(least, Math.floor(fit * 100) / 100)));
    };
    measure();
    void document.fonts?.ready.then(() => {
      seen = -1;
      measure();
    });
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watch?.observe(el);
    return () => watch?.disconnect();
  }, [box, selector, key, least]);
}
