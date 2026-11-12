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
import { isRetiredGame, type GameInviteType } from '@kurda/shared';

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
  impostor: 'games.impostor.name',
  'who-am-i': 'games.whoAmI.name',
};

export const INVITE_BLURB_KEY: Record<GameInviteType, MessageKey> = {
  'wordle-battle': 'games.invite.blurb.battle',
  'rhyme-match': 'games.invite.blurb.rhymeMatch',
  stories: 'games.invite.blurb.stories',
  'last-letter': 'games.invite.blurb.lastLetter',
  impostor: 'games.invite.blurb.impostor',
  'who-am-i': 'games.whoAmI.blurb',
};

/**
 * A lobby link to a game that is no longer part of Hevalo (Don't Say the
 * Word!, Kurdish Bluff), still sitting in a chat from when it was sent. The
 * shared reader knows only the games that are played, so it does not see
 * these; a retired game's lobby lived at its own name, which is all this
 * needs to know. Whoever draws the message says the game is no longer played
 * instead of showing a bare address that leads nowhere.
 */
const LOBBY_LINK = String.raw`\S*/app/games/([a-z][a-z-]*)\?id=[A-Za-z0-9-]+\S*`;

/** Whether `text` carries a lobby link to a retired game. */
export function hasRetiredInvite(text: string): boolean {
  return [...text.matchAll(new RegExp(LOBBY_LINK, 'g'))].some((m) => isRetiredGame(m[1]));
}

/** `text` without its lobby links to retired games, for showing what the sender wrote round them. */
export function withoutRetiredInvites(text: string): string {
  return text.replace(new RegExp(LOBBY_LINK, 'g'), (whole, segment: string) => (isRetiredGame(segment) ? ' ' : whole));
}
