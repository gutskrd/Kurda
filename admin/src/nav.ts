import { useEffect, useState } from 'react';
import { parseRoute, type Route } from './navigation';

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
 * The address, read: which page, the parts below it, and its query
 * (#/audio/lessons?show=missing), with old page names translated (navigation.ts).
 */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Go to an address: go('audio/lessons') or go('#/audio/lessons'). */
export function go(to: string): void {
  location.hash = `/${to.replace(/^#?\/?/, '')}`;
}

/**
 * Asked before the address changes, by a page with unsaved work; true lets it
 * change. The back button, a link in the nav and a typed #/… address change
 * only the hash, which `beforeunload` never hears of, so without this they
 * would throw the work away without a word. One at a time: the page on screen
 * sets it while it has something to lose, and clears it before it moves on
 * by itself (after asking in its own words).
 */
let leaveGuard: (() => boolean | Promise<boolean>) | null = null;

/**
 * The guard answers at once (true/false), or later — a promise, for a page that
 * asks in a dialog of its own rather than the browser's confirm. Until a later
 * answer comes the page stays where it was; a yes then goes on to the address
 * that was asked for.
 */
export function setLeaveGuard(guard: (() => boolean | Promise<boolean>) | null): void {
  leaveGuard = guard;
}

// Added when this module loads, so ahead of every useHashRoute listener (they
// are added by effects, later): a refused change never reaches them. The old
// address comes back as a new history entry, with the refused one kept behind
// it — so Back after a "no" to Back still goes back (and asks again), where
// putting the old address in the refused entry's place would lose that entry.
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', (e) => {
    if (!leaveGuard) return;
    const verdict = leaveGuard();
    if (verdict === true) return;
    e.stopImmediatePropagation();
    history.pushState(null, '', e.oldURL);
    if (verdict instanceof Promise) {
      void verdict.then((yes) => {
        if (!yes) return;
        leaveGuard = null;
        location.href = e.newURL;
      });
    }
  });
}
