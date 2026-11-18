/**
 * Shareable links to online-game lobbies: the browser routes them, a DM shows them as an invite card, and the phone
 * shares and opens them. Shared because both apps must agree on the exact URL, or an invite from one is unreadable in
 * the other. Only our own lobby path is matched and only its id is used, so parsing any message text is safe. Lobby names
 * are catalogue keys and stay in each app.
 */

import { MULTI_GAME_SEGMENT, type MultiGame } from './games/multi/games.js';

export type GameInviteType = 'wordle-battle' | 'rhyme-match' | 'stories' | MultiGame;

export interface GameInvite {
  type: GameInviteType;
  id: string;
}

/** Each game's lobby path segment: the game's name as players know it, not its type in the server and database. */
const SEGMENT: Record<GameInviteType, string> = {
  'wordle-battle': 'peyvok-battle',
  'rhyme-match': 'rhyme-match',
  stories: 'stories',
  ...MULTI_GAME_SEGMENT,
};

/** Segments a lobby had before a rename, still read so links already sent keep working. */
const OLD_SEGMENT: Record<string, GameInviteType> = { 'wordle-battle': 'wordle-battle' };

const BY_SEGMENT: Record<string, GameInviteType> = {
  ...OLD_SEGMENT,
  ...Object.fromEntries(Object.entries(SEGMENT).map(([type, segment]) => [segment, type as GameInviteType])),
};

/** Every segment a lobby link may have, for the patterns below. */
const SEGMENTS = Object.keys(BY_SEGMENT).join('|');

/** The in-app route for a lobby, also the path of a share link. */
export function invitePath(invite: GameInvite): string {
  return `/app/games/${SEGMENT[invite.type]}?id=${encodeURIComponent(invite.id)}`;
}

/** The same path as a route pattern, with no leading slash or query, for the phone's link config; it must match `invitePath`. */
export function inviteRoutePath(type: GameInviteType): string {
  return invitePath({ type, id: 'x' }).replace(/^\//, '').split('?')[0]!;
}

// Matches "/app/games/<segment>?id=<id>" anywhere in a string, with any origin or none.
const INVITE_RE = new RegExp(String.raw`/app/games/(${SEGMENTS})\?id=([A-Za-z0-9][A-Za-z0-9-]{5,63})`);

/** The link itself, for removing it from shown text: global, and built per call because a global regex keeps lastIndex. */
export function inviteLinkPattern(): RegExp {
  return new RegExp(String.raw`\S*/app/games/(?:${SEGMENTS})\?id=[A-Za-z0-9-]+\S*`, 'g');
}

/** The first game invite in any text, or null. */
export function parseInvite(text: string): GameInvite | null {
  const m = INVITE_RE.exec(text);
  if (!m) return null;
  return { type: BY_SEGMENT[m[1]!]!, id: m[2]! };
}
