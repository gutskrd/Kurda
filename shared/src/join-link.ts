/**
 * A game's join code as a link, what Share hands to a message outside Hevalo:
 *
 *   https://hevalo.app/join/<game>/<CODE>?from=<the host's user id>
 *
 * A bare code is for reading out across a room; a link opens a page that names the game and joins with one tap (web:
 * play/InvitePage.tsx), and chats unfurl it with the game's card (web: worker.ts). The game is in the path, so neither
 * has to ask the server what a code belongs to and nobody can enumerate codes. The link grants nothing: a tap is the same
 * `POST /play/join` as typing the code, with the same rule about who may join, and names the host so a friend who is not
 * one yet can ask to be.
 *
 * Nothing is imported: the website's edge script reads links with this file and must not carry the rest of the package.
 */

/** The games a code can join, by their address word, the same as their lobby's. */
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

/** A code as a link holds it: six characters of the join alphabet (no 0/O, no 1/I/L) with nothing between. */
const CODE = /^[A-HJKMNP-Z2-9]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** `/join/<game>/<CODE>`, with `?from=` when the sharer is known; null for an invalid code, so nothing links to nowhere. */
export function joinLinkPath(game: JoinLinkGame, code: string, from?: string | null): string | null {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (!CODE.test(clean)) return null;
  const who = from && UUID.test(from) ? `?from=${from.toLowerCase()}` : '';
  return `/join/${segmentOf(game)}/${clean}${who}`;
}

/** The whole address; `origin` lets the browser use the deploy it is on. */
export function buildJoinLink(game: JoinLinkGame, code: string, opts: { from?: string | null; origin?: string } = {}): string | null {
  const path = joinLinkPath(game, code, opts.from);
  return path === null ? null : `${opts.origin ?? 'https://hevalo.app'}${path}`;
}

/**
 * What a path says, or null for anything else. Only this exact shape is read (a known game word, a plausible code, a
 * sharer only when it is a user id), and everything else is ignored, so nothing from an address reaches a page as text.
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
