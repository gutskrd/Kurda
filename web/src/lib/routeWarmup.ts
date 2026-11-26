/**
 * Fetches a page's code before the router asks for it: the page at the address the tab opened with, while the stored
 * session is still being checked, and the page behind a link as a finger or pointer comes to it. The imports are the
 * routes' own (App.tsx), so each names the same chunk; a page missing here only loads when it is opened, as before.
 */
const PAGES: ReadonlyArray<readonly [RegExp, () => Promise<unknown>]> = [
  [/^\/app\/learn\/?$/, () => import('../pages/Learn')],
  [/^\/app\/learn\/course\/[^/]+\/?$/, () => import('../pages/CourseMap')],
  [/^\/app\/learn\/stories\/?$/, () => import('../stories/StoriesLibrary')],
  [/^\/app\/learn\/practice\/?$/, () => import('../practice/PracticeHub')],
  [/^\/app\/games\/?$/, () => import('../pages/Games')],
  [/^\/app\/profile\/?$/, () => import('../pages/Profile')],
  [/^\/app\/users\/[^/]+\/?$/, () => import('../pages/UserProfile')],
  [/^\/app\/messages\/?$/, () => import('../pages/Messages')],
  [/^\/app\/letters\/?$/, () => import('../letters/LettersPage')],
  [/^\/app\/shop\/?$/, () => import('../pages/Shop')],
  [/^\/app\/rankings\/?$/, () => import('../pages/Rankings')],
  [/^\/app\/friends\/?$/, () => import('../pages/Friends')],
  [/^\/app\/settings(\/.*)?$/, () => import('../pages/Settings')],
  [/^\/login\/?$/, () => import('../pages/Login')],
  [/^\/register\/?$/, () => import('../pages/Register')],
];

/** The places a signed-in reader moves between most, fetched once the page has settled. */
const PLACES = ['/app/learn', '/app/messages', '/app/profile'];

const warmed = new Set<() => Promise<unknown>>();

/** Starts fetching the code of the page at `pathname`, once; failures are left for the router to meet. */
export function warmRoute(pathname: string): void {
  const page = PAGES.find(([address]) => address.test(pathname))?.[1];
  if (!page || warmed.has(page)) return;
  warmed.add(page);
  page().catch(() => warmed.delete(page));
}

/** The places' pages, for a reader who has an account. */
export function warmPlaces(): void {
  for (const place of PLACES) warmRoute(place);
}

/** Warms the page behind any link on this site as a pointer or finger reaches it, or keyboard focus lands on it. */
export function warmLinksOnIntent(): void {
  const onIntent = (e: Event): void => {
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin) return;
    warmRoute(link.pathname);
  };
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('focusin', onIntent);
}
