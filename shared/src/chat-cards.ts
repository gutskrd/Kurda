/**
 * Chat messages that are more than text: a gift and a game card with its live state. Stored as a message kind with a
 * reference, never as text to parse, so a card can change state without editing the message. Old text messages holding an
 * invite link still render as cards through `parseInvite`.
 */
import type { GiftCard } from './gifts.js';
import type { PlayGame } from './play.js';

export const CHAT_MESSAGE_KINDS = ['text', 'gift', 'game'] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

/** The lobby a game card points at; its state is fetched live. */
export interface ChatGameRef {
  game: PlayGame;
  lobbyId: string;
}

/** What a message carries besides its text, by kind. `body` is null for 'gift' and 'game'; clients write the list line ("🎁 Gift") from the kind. */
export interface ChatMessageExtras {
  kind: ChatMessageKind;
  gift: GiftCard | null;
  game: ChatGameRef | null;
}
