/**
 * Which pages are place roots and which are deeper. On a phone, roots get the bar of places (layouts/PlacesBar.tsx)
 * and the brand at the top; deeper pages get a back button and leave the bottom to their own controls.
 */

/** The width at which the app switches to phone chrome, where the top bar runs out of room (layout.css). */
export const PHONE_CHROME = '(max-width: 768px)';

/** `/app/x` and everything under it, but not `/app/xyz`. */
export const under = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

const HOME = '/app';
const MESSAGES = '/app/messages';

/**
 * Every root but Home, most specific first so the first match is the nearest (`rootAbove`). Learn has five, switched
 * by replacing the address (learn/LearnHeader.tsx, lore/LoreParts.tsx), so the bar stays under all of them.
 */
const ROOTS: readonly string[] = ['/app/learn/stories', '/app/learn/riddles', '/app/learn/proverbs', '/app/learn', '/app/games', MESSAGES, '/app/profile'];

/** An address as the router reads it: `/app/` is `/app`. */
const trimmed = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/**
 * Whether a page is a place root, which decides the bar of places and the brand or back button on a phone. Roots are
 * listed, as `OWNS` is (navLinks.tsx), since addresses do not say it. A query keeps a root a root, except
 * /app/messages with `to` or `group`, which is an open conversation.
 */
export function isPlaceRoot(pathname: string, search = ''): boolean {
  const path = trimmed(pathname);
  if (path === MESSAGES) {
    const query = new URLSearchParams(search);
    // as the page itself reads them (pages/Messages.tsx): an empty `group=` is the list of groups, not a group
    return !query.get('to') && !query.get('group');
  }
  return path === HOME || ROOTS.includes(path);
}

/** The root a deeper page sits under by its address, or null where only the owning place (`OWNS`) says. */
export function rootAbove(pathname: string): string | null {
  const path = trimmed(pathname);
  return ROOTS.find((root) => under(path, root)) ?? null;
}
