import { useEffect, useState } from 'react';

/**
 * True while a CSS media query matches, and re-renders when that changes.
 *
 * Used where a layout decision cannot be expressed in CSS alone — the Wordle
 * keyboard needs a different ROW SPLIT on a narrow screen, not just different
 * sizes, and rendering both layouts to toggle with CSS would duplicate every key
 * in the accessibility tree.
 *
 * Returns false where matchMedia is unavailable (jsdom under test), which lands
 * on the wide layout — the safe default, since it is the one with no assumptions
 * about the viewport.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return;
    const onChange = (): void => setMatches(mq.matches);
    onChange(); // the query may already differ from the initial guess
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
