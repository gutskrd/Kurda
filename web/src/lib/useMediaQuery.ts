import { useEffect, useState } from 'react';

/**
 * Whether a media query matches, re-rendering on change. For layout choices CSS cannot make alone, such as the Peyvok
 * keyboard's row split. False without matchMedia (tests), which gives the wide layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return;
    const onChange = (): void => setMatches(mq.matches);
    onChange(); // The query may already differ from the initial guess.
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
