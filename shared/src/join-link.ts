/**
 * A game's join code as a link: what Share hands to a message outside Hevalo.
 *
 *   https://hevalo.app/join/<game>/<CODE>?from=<the host's user id>
 *
 * A code alone is something to read out across a room. Sent in a message it
 * is a sentence with nothing to tap and no picture, and a friend who has
 * never opened Hevalo has to find Games, then "Join with a code", then type
 * it. The link carries the same code to a page that says which game it is,
 * shows it, and joins with one tap (web: play/InvitePage.tsx), and whatever
 * unfurls it draws the game's own card (web: worker.ts). The code is still in
 * the message beside it, for the friend sitting across the room.
 *
 * The link says everything a page or a preview needs by itself: the game is
 * in its path, so neither has to ask the server what a code belongs to, and
 * nobody can walk through codes by asking. What it does not carry is any
 * right to join: a tap on it is the same `POST /play/join` as typing the
 * code, with the same rule about who may (a friends game takes the host's
 * friends), which is why the host is named in it: a friend who is not one
 * yet can ask to be.
 *
 * A file of its own, with nothing imported: the website's edge script reads
 * links with it, and must not carry the rest of the package for that.
 */

/** The games a code can join, by the word each has in an address (the same one its lobby's address has). */
export const JOIN_LINK_SEGMENTS = {
  'peyvok-battle': 'wordle-battle',
  'rhyme-match': 'rhyme-match',
  stories: 'stories',
  'last-letter': 'last-letter',
  impostor: 'impostor',
  'who-am-i': 'who-am-i',
} as const;

export type JoinLinkSegment = keyof typeof JOIN_LINK_SEGMENTS;
export type JoinLinkGame = (typeof JOIN_LINK_SEGMENTS)[JoinLinkSegment];

/** A code as a link holds it: six characters of the join alphabet (no 0/O, no 1/I/L), with nothing between them. */
const CODE = /^[A-HJKMNP-Z2-9]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The route's own shape, for a router: the game's word, then the code. */
export const JOIN_LINK_ROUTE = 'join/:game/:code';

export interface JoinLink {
  game: JoinLinkGame;
  /** the code, upper case, as the server reads it */
  code: string;
  /** the user id of whoever shared it, when the link says */
  from: string | null;
}

function segmentOf(game: JoinLinkGame): JoinLinkSegment {
  return (Object.keys(JOIN_LINK_SEGMENTS) as JoinLinkSegment[]).find((s) => JOIN_LINK_SEGMENTS[s] === game)!;
}

/** `/join/<game>/<CODE>`, with `?from=` when the sharer is known. A code that is not one gives null: nothing is shared rather than a link to nowhere. */
export function joinLinkPath(game: JoinLinkGame, code: string, from?: string | null): string | null {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (!CODE.test(clean)) return null;
  const who = from && UUID.test(from) ? `?from=${from.toLowerCase()}` : '';
  return `/join/${segmentOf(game)}/${clean}${who}`;
}

/** The whole address. `origin` lets the browser use the deploy it is on. */
export function buildJoinLink(game: JoinLinkGame, code: string, opts: { from?: string | null; origin?: string } = {}): string | null {
  const path = joinLinkPath(game, code, opts.from);
  return path === null ? null : `${opts.origin ?? 'https://hevalo.app'}${path}`;
}

/**
 * What a path says, or null for anything that is not one of these links.
 * Only this exact shape is read: a game's word from the table, a code that
 * could be a code, and a sharer only when it is a user id. Whatever else a
 * link carries is ignored, so nothing from an address reaches a page as text.
 */
export function parseJoinLink(pathname: string, search = ''): JoinLink | null {
  const m = /^\/join\/([a-z-]+)\/([A-Za-z0-9]+)\/?$/.exec(pathname);
  if (!m) return null;
  const segment = m[1]!;
  if (!Object.hasOwn(JOIN_LINK_SEGMENTS, segment)) return null;
  const code = m[2]!.toUpperCase();
  if (!CODE.test(code)) return null;
  const from = new URLSearchParams(search).get('from');
  return { game: JOIN_LINK_SEGMENTS[segment as JoinLinkSegment], code, from: from && UUID.test(from) ? from.toLowerCase() : null };
}
