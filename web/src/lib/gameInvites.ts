/**
 * What a game lobby is called, in the browser's catalogue, and the invite
 * links from before join codes.
 *
 * Games are shared by their code now (play/CodeTicket.tsx); nothing here
 * builds a link to send any more. Links already sent in chats, emails and
 * pushes still have to open their lobby, so reading them stays: the shape
 * lives in `@kurda/shared`, where the phone reads exactly the same URL — a
 * copy that drifts by one query parameter breaks that silently. What stayed
 * here is the part that is a `MessageKey`, which is web's own type.
 */
import type { MessageKey } from '../i18n/en';
import type { GameInviteType } from '@kurda/shared';

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
  stories: 'games.stories.name',
  'last-letter': 'games.lastLetter.name',
};

export const INVITE_BLURB_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.invite.blurb.battle',
  'rhyme-match': 'games.invite.blurb.rhymeMatch',
  stories: 'games.invite.blurb.stories',
  'last-letter': 'games.invite.blurb.lastLetter',
};
