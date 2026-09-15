/**
 * What a game lobby is called, in the browser's catalogue.
 *
 * The link shape itself moved to `@kurda/shared` so the phone builds and parses
 * exactly the same URL — an invite made in one app has to be readable in the
 * other, and a copy that drifts by one query parameter breaks that silently.
 * What stayed is the part that is a `MessageKey`, which is web's own type.
 */
import type { MessageKey } from '../i18n/en';
import { buildInviteUrl as buildUrl, type GameInviteType } from '@kurda/shared';

export {
  invitePath,
  inviteLinkPattern,
  parseInvite,
  type GameInvite,
  type GameInviteType,
} from '@kurda/shared';

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

/** An absolute, shareable URL — this deploy's origin, so a preview links to itself. */
export function buildInviteUrl(type: GameInviteType, id: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://mykurda.com';
  return buildUrl(type, id, origin);
}
