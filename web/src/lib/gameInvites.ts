/**
 * Shareable links to MyKurda online-game lobbies. A link points at a lobby route
 * that anyone can open (in the app it deep-links to the lobby; pasted into a
 * MyKurda DM it renders as an invite card — see the chat invite box). We only
 * ever recognize our own game-lobby path shape, and act on it by routing inside
 * the app with the extracted id, so parsing arbitrary message text is safe.
 */
import type { MessageKey } from '../i18n/en';

export type GameInviteType = 'wordle-battle' | 'rhyme-match';

export interface GameInvite {
  type: GameInviteType;
  id: string;
}

/**
 * What a lobby is called, and what it is, as catalogue keys.
 *
 * Keys rather than words: this module is plain TypeScript with no React in it,
 * so it has nowhere to read the reader's language from. Whoever renders one of
 * these has a `t` and does the looking up.
 */
export const INVITE_NAME_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.battle.name',
  'rhyme-match': 'games.rhymeMatch.name',
};

export const INVITE_BLURB_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.invite.blurb.battle',
  'rhyme-match': 'games.invite.blurb.rhymeMatch',
};

/** The in-app route for a lobby (also the path segment used in a share link). */
export function invitePath(invite: GameInvite): string {
  return `/app/games/${invite.type}?id=${encodeURIComponent(invite.id)}`;
}

/** An absolute, shareable URL (uses the current origin so it works per-deploy). */
export function buildInviteUrl(type: GameInviteType, id: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://mykurda.com';
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
