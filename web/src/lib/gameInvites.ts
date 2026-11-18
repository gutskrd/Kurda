/**
 * Lobby names as catalogue keys, and old invite links. Games are shared by code now (play/CodeTicket.tsx), but links
 * already sent must still open their lobby; their shape lives in `@kurda/shared`, which the phone reads too.
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

/** What a lobby is called, and what it is, as catalogue keys; this module has no React to translate with. */
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
 * A lobby link to a retired game, still sitting in an old chat. The shared reader only knows current games, so these
 * are matched by path; the message then says the game is no longer played instead of showing a dead address.
 */
const LOBBY_LINK = String.raw`\S*/app/games/([a-z][a-z-]*)\?id=[A-Za-z0-9-]+\S*`;

/** Whether `text` carries a lobby link to a retired game. */
export function hasRetiredInvite(text: string): boolean {
  return [...text.matchAll(new RegExp(LOBBY_LINK, 'g'))].some((m) => isRetiredGame(m[1]));
}

/** `text` without its links to retired games, to show what the sender wrote around them. */
export function withoutRetiredInvites(text: string): string {
  return text.replace(new RegExp(LOBBY_LINK, 'g'), (whole, segment: string) => (isRetiredGame(segment) ? ' ' : whole));
}
