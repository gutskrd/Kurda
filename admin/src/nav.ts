import { useEffect, useState } from 'react';
import { parseRoute, type Route } from './navigation';

/**
 * Hash-based navigation: the console needs only a page switch, so it keeps no router dependency. The page lives in
 * `location.hash`, so links can be bookmarked and Back works.
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

/** The address read into its page, the parts below it and its query, old page names translated (navigation.ts). */
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
 * Asked before the address changes by a page with unsaved work; true lets it change. Hash changes never reach
 * `beforeunload`, so this is what stops Back or a nav link from dropping the work. The page on screen sets it while it
 * has something to lose and clears it before moving on by itself.
 */
let leaveGuard: (() => boolean | Promise<boolean>) | null = null;

/** The guard answers at once, or with a promise for a page that asks in its own dialog; a later yes goes on to the address. */
export function setLeaveGuard(guard: (() => boolean | Promise<boolean>) | null): void {
  leaveGuard = guard;
}

// Added at load, ahead of every useHashRoute listener, so a refused change never reaches them. The old address returns
// as a new history entry with the refused one kept behind it, so Back after a "no" still goes back (and asks again).
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
