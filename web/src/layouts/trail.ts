import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isFocusedPath } from './focus';
import { under } from './roots';

/**
 * The pages gone through in this tab, so the way back (BackButton.tsx) can
 * tell what is behind the page on screen.
 *
 * The browser keeps the history and shows nobody what is in it. The router
 * numbers its entries as it makes them and keeps the number in each entry's
 * own state (`idx`): the page a visit began on is 0, and every page gone to
 * from there is one more. So a page above 0 was reached from inside the
 * site, and one step back is still Hevalo; a page at 0 was opened cold (a
 * link in a message, a bookmark, a new tab), and whatever is behind it is
 * somewhere else or nothing at all.
 *
 * The number alone would send the way back into a trap. A lesson opened from
 * a course's page comes back to that page when it ends, so the lesson is the
 * entry behind it: one step back would start the lesson again, whose only
 * way out leads to the course's page, whose way back leads to the lesson. So
 * each shell notes the address of every page it draws under its number
 * (`useTrail`), and the way back passes over what is no place to go back to:
 * a lesson or a review, which is played alone with no bar to leave it by, and
 * the very page it is leaving, which would look like a press that did
 * nothing, or that left a game by halves (`pageOf`).
 *
 * Kept in memory for as long as the tab is open. A page loaded again starts
 * with nothing noted, and what is behind it then is the browser's to show:
 * one step back, as its own Back would take.
 */
const trail = new Map<number, string>();

/** The router's number for the page on screen, or null where it keeps none. */
export function pageNumber(): number | null {
  const state: unknown = window.history.state;
  const idx = state !== null && typeof state === 'object' ? (state as { idx?: unknown }).idx : undefined;
  return typeof idx === 'number' ? idx : null;
}

/** Notes the page on screen (its path, with what follows its `?`) under the router's number for it. */
export function notePage(address: string): void {
  const at = pageNumber();
  if (at !== null) trail.set(at, address);
}

/** Notes each page a shell draws. */
export function useTrail(): void {
  const { pathname, search, key } = useLocation();
  // as the page is drawn, and again for another entry of the same address (`key`): its number is not the same
  useLayoutEffect(() => notePage(pathname + search), [pathname, search, key]);
}

/** Everything noted is dropped: for the tests, where one file is many visits. */
export function forgetTrail(): void {
  trail.clear();
}

/**
 * The page an address is of. Nearly always the address itself: a page here
 * is narrowed (a filter, a tab) by replacing its address, and where one adds
 * an entry instead it is a step meant to be undone, as a word opened in
 * Search is. Two kinds of page are one page however their address moves, and
 * the way back leaves them whole, in one press, as their own arrow did
 * before a phone's top bar took its place (shell.css):
 *
 * - a game, whose start, lobby and game under way are one address with a
 *   different `?`, each added to the history as the game goes on;
 * - a game's ranks, where the switch at the top moves between the games by
 *   address, one entry a press.
 */
function pageOf(address: string): string {
  const pathname = address.split('?')[0]!.replace(/\/+$/, '');
  if (under(pathname, '/app/ranks')) return '/app/ranks';
  if (pathname.startsWith('/app/games/')) return pathname;
  return address;
}

/**
 * How far back the way back should step from `here` (a path with what
 * follows its `?`): a negative count of entries, or null when nothing behind
 * is worth going back to and the page's root is where to go instead. That is
 * so for a page opened cold, and for one with nothing behind it but lessons
 * and itself.
 */
export function stepsBack(here: string): number | null {
  const at = pageNumber();
  if (at === null || at <= 0) return null;
  for (let i = at - 1; i >= 0; i--) {
    const behind = trail.get(i);
    // not drawn by a shell since the tab was loaded: a public page, or one from before it was loaded again
    if (behind === undefined) return i - at;
    if (pageOf(behind) !== pageOf(here) && !isFocusedPath(behind.split('?')[0]!)) return i - at;
  }
  return null;
}
