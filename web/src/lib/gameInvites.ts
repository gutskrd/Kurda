/**
 * Shareable links to MyKurda online-game lobbies. A link points at a lobby route
 * that anyone can open (in the app it deep-links to the lobby; pasted into a
 * MyKurda DM it renders as an invite card — see the chat invite box). We only
 * ever recognize our own game-lobby path shape, and act on it by routing inside
 * the app with the extracted id, so parsing arbitrary message text is safe.
 */
export type GameInviteType = 'wordle-battle' | 'rhyme-match';

export interface GameInvite {
  type: GameInviteType;
  id: string;
}

const LABELS: Record<GameInviteType, string> = {
  'wordle-battle': 'Wordle Battle',
  'rhyme-match': 'Rhyme Match',
};

const BLURBS: Record<GameInviteType, string> = {
  'wordle-battle': 'Race to guess the Kurdish word first.',
  'rhyme-match': 'Go head-to-head finding rhymes.',
};

export function inviteLabel(type: GameInviteType): string {
  return LABELS[type];
}
export function inviteBlurb(type: GameInviteType): string {
  return BLURBS[type];
}

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
