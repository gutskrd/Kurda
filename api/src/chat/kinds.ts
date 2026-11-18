import { isPlayGame, type ChatGameRef, type ChatMessageKind } from '@kurda/shared';

/** Message kinds shared by direct messages and group chat, whose tables carry the same kind columns. */

/** The kind columns a message row carries. */
export interface KindColumns {
  kind: ChatMessageKind;
  gift_batch_id: string | null;
  game: string | null;
  game_lobby_id: string | null;
}

/** A game card's reference from its columns; only games the shared contract knows, since clients draw no other. */
export function gameRef(row: KindColumns): ChatGameRef | null {
  if (row.kind !== 'game' || !row.game_lobby_id || !isPlayGame(row.game)) return null;
  return { game: row.game, lobbyId: row.game_lobby_id };
}

/**
 * Conversation-list previews for a gift or a game card. The apps write their own localized line from the kind;
 * these are for older phone builds, which print the preview as it is and cannot show a null.
 */
export const PREVIEW_FALLBACK: Readonly<Record<Exclude<ChatMessageKind, 'text'>, string>> = {
  gift: '🎁 Gift',
  game: '🎮 Game invite',
};

/** The last-message line for a conversation list: the text, or the stand-in for its kind. */
export function previewText(kind: ChatMessageKind, body: string | null): string {
  return kind === 'text' ? body ?? '' : PREVIEW_FALLBACK[kind];
}
