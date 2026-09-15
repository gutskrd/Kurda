/**
 * Shareable links to MyKurda online-game lobbies.
 *
 * A link points at a lobby route that anyone can open: in the browser it routes
 * to the lobby, pasted into a MyKurda DM it renders as an invite card, and on
 * the phone it is what the share sheet hands to whichever app the person you
 * sent it to opens.
 *
 * Shared rather than web-only, for the reason the locale and country rosters
 * are: the two apps have to agree on the *exact* shape of this URL or an invite
 * made on one is unreadable to the other. A copy that drifts by a single query
 * parameter breaks the feature silently, in the one direction nobody tests —
 * someone else's link, in someone else's app.
 *
 * Only our own game-lobby path shape is ever recognized, and the only thing
 * done with a match is routing inside the app with the extracted id, so parsing
 * arbitrary message text is safe.
 *
 * What is NOT here: what a lobby is *called*. That is a catalogue key, and the
 * two apps key their catalogues differently, so each keeps its own map.
 */

export type GameInviteType = 'wordle-battle' | 'rhyme-match';

export interface GameInvite {
  type: GameInviteType;
  id: string;
}

/** The in-app route for a lobby (also the path segment used in a share link). */
export function invitePath(invite: GameInvite): string {
  return `/app/games/${invite.type}?id=${encodeURIComponent(invite.id)}`;
}

/** An absolute, shareable URL. `origin` lets the browser use the current deploy. */
export function buildInviteUrl(type: GameInviteType, id: string, origin = 'https://mykurda.com'): string {
  return `${origin}${invitePath({ type, id })}`;
}

// matches "/app/games/<type>?id=<id>" anywhere in a string, any origin (or none)
const INVITE_RE = /\/app\/games\/(wordle-battle|rhyme-match)\?id=([A-Za-z0-9][A-Za-z0-9-]{5,63})/;

/**
 * The link itself, for removing it from displayed text. Global so a body with
 * several links is fully cleaned; built fresh per call because a global regex
 * carries lastIndex between uses.
 */
export function inviteLinkPattern(): RegExp {
  // built from a raw source string rather than a literal: the escaping stays
  // readable, and `/` needs none inside the constructor
  return new RegExp(String.raw`\S*/app/games/(?:wordle-battle|rhyme-match)\?id=[A-Za-z0-9-]+\S*`, 'g');
}

/** Extract the first game invite from arbitrary text, or null. */
export function parseInvite(text: string): GameInvite | null {
  const m = INVITE_RE.exec(text);
  if (!m) return null;
  return { type: m[1] as GameInviteType, id: m[2]! };
}
