/**
 * Chat messages that are more than text: a gift (unwrapped in the chat) and a
 * game card (join a friend's game from the chat, with its live state). Stored
 * as a message kind with a reference, never as text to be parsed, so a card
 * can change state — open, started, finished — without anyone editing a
 * message.
 *
 * Plain text messages that happen to contain an old invite link still render
 * as cards through `parseInvite`; new invites are cards from the start.
 */
import type { GiftCard } from './gifts.js';
import type { PlayGame } from './play.js';

export const CHAT_MESSAGE_KINDS = ['text', 'gift', 'game'] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

/** The lobby a game card points at. Its state is fetched live (see LobbyCard). */
export interface ChatGameRef {
  game: PlayGame;
  lobbyId: string;
}

/**
 * What a DM or group message carries besides its text, by kind. `body` is null
 * for 'gift' and 'game' messages; the clients write the line shown in
 * conversation lists ("🎁 Gift", "Peyvok Battle") from the kind.
 */
export interface ChatMessageExtras {
  kind: ChatMessageKind;
  gift: GiftCard | null;
  game: ChatGameRef | null;
}
