import { useEffect, useState } from 'react';

/**
 * Minimal hash-based navigation (no react-router — it carries high-severity
 * advisories across its 7.x line, and an admin tool needs only a page switch).
 * The active page lives in `location.hash` so links are bookmarkable and the
 * back button works.
 */
export function useHashRoute(fallback: string): [string, (page: string) => void] {
  const read = (): string => location.hash.replace(/^#\/?/, '') || fallback;
  const [page, setPage] = useState(read);

  useEffect(() => {
    const onChange = (): void => setPage(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = (next: string): void => {
    location.hash = `/${next}`;
  };
  return [page, navigate];
}

/**
 * Asked before the address changes, by a page with unsaved work; true lets it
 * change. The back button, a link in the nav and a typed #/… address change
 * only the hash, which `beforeunload` never hears of, so without this they
 * would throw the work away without a word. One at a time: the page on screen
 * sets it while it has something to lose, and clears it before it moves on
 * by itself (after asking in its own words).
 */
let leaveGuard: (() => boolean) | null = null;

export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

// Added when this module loads, so ahead of every useHashRoute listener (they
// are added by effects, later): a refused change never reaches them. The old
// address comes back as a new history entry, with the refused one kept behind
// it — so Back after a "no" to Back still goes back (and asks again), where
// putting the old address in the refused entry's place would lose that entry.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', (e) => {
    if (!leaveGuard || leaveGuard()) return;
    e.stopImmediatePropagation();
    history.pushState(null, '', e.oldURL);
  });
}
