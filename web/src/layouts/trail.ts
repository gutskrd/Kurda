import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isFocusedPath } from './focus';

/**
 * The pages visited in this tab, keyed by the router's history index (`idx`), so the back button (BackButton.tsx) knows
 * what is behind the current page. Index 0 means the page was opened cold. Each shell notes its address (`useTrail`)
 * so back can skip lessons, reviews and the same page (`pageOf`), avoiding a loop back into a finished lesson. Kept in
 * memory only; after a reload nothing is noted and back takes one step.
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
 * The page an address belongs to, usually the address itself. A game (its start, lobby and play differ only by query)
 * counts as one page, so back leaves it in one press.
 */
function pageOf(address: string): string {
  const pathname = address.split('?')[0]!.replace(/\/+$/, '');
  if (pathname.startsWith('/app/games/')) return pathname;
  return address;
}

/**
 * How many entries back to step from `here` (path and query), as a negative count, or null when only lessons or the
 * same page lie behind, or the page was opened cold, so its root is the destination instead.
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
