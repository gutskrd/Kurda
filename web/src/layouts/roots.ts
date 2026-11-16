/**
 * Which pages are the root of a place, and which are deeper.
 *
 * On a phone the app wears the phone app's chrome: the places in a bar that
 * floats over the bottom of the window (layouts/PlacesBar.tsx), and at the top
 * the brand with search and the bell opposite it. Both go with a place's
 * root: the page you stand on and choose from. A page you went into is a
 * pushed screen on the phone, and is treated as one here: it has the way back
 * where the brand was and no bar of places, which leaves the bottom of the
 * window to the page's own controls, a conversation's composer or a game's
 * button.
 */

/**
 * The width at and under which the app wears a phone's chrome. It is the
 * width at which the top bar has always run out of room for the places
 * (layout.css), so nothing changes hands anywhere else.
 */
export const PHONE_CHROME = '(max-width: 768px)';

/** `/app/x` and everything under it, but not `/app/xyz`. */
export const under = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

const HOME = '/app';
const MESSAGES = '/app/messages';

/**
 * Every root but Home, the most particular first, so the first one a page
 * stands under is the nearest (`rootAbove`).
 *
 * Learn has five: Lessons, Stories and Games are one place with a switch at
 * its top (learn/LearnHeader.tsx), and under Stories the riddles and the
 * proverbs are two more shelves beside the stories (lore/LoreParts.tsx). Each
 * switch replaces the address instead of adding to it, so none of the five is
 * inside another: flicking between them is standing in Learn, and the bar of
 * places stays under all of them.
 */
const ROOTS: readonly string[] = ['/app/learn/stories', '/app/learn/riddles', '/app/learn/proverbs', '/app/learn', '/app/games', MESSAGES, '/app/profile'];

/** An address as the router reads it: `/app/` is `/app`. */
const trimmed = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/**
 * Whether a page is the root of a place: the one rule for where the bar of
 * places is drawn, and for whether the top of a phone shows the brand or the
 * way back.
 *
 * Written out, as `OWNS` is (navLinks.tsx), because an address does not say
 * it. /app/games is a view of Learn and /app/games/peyvok a game you went
 * into; /app/learn/words is a list like /app/learn/stories, but it is opened
 * from a card on Lessons and has no switch back. So the roots are named: the
 * four places the bar leads to, and Learn's other views. What follows a `?`
 * narrows a root (a filter, a tab) and leaves it a root, with one exception:
 * a conversation is opened as /app/messages?to=… or ?group=…, fills a
 * phone's screen and has a composer along its bottom edge, so with either it
 * is a page you went into.
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

/**
 * The root a deeper page stands under, where its address says so: a story
 * under the stories, a game under the games, an open conversation under the
 * list. Null where it does not (Settings is behind your profile, the alphabet
 * is one of Learn's tools): the place that owns the page answers for those
 * (`OWNS`).
 */
export function rootAbove(pathname: string): string | null {
  const path = trimmed(pathname);
  return ROOTS.find((root) => under(path, root)) ?? null;
}
