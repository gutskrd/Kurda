import { isPlayGame, type ChatGameRef, type ChatMessageKind } from '@kurda/shared';

/**
 * Message kinds, shared by direct messages and group chat: both tables carry
 * the same columns (migration 1751000148000), and a gift or a game card reads
 * the same in either.
 */

/** The kind columns a message row carries. */
export interface KindColumns {
  kind: ChatMessageKind;
  gift_batch_id: string | null;
  game: string | null;
  game_lobby_id: string | null;
}

/**
 * A game card's reference, from its columns. Only a game the shared contract
 * knows is passed on: a client would have nothing to draw for any other.
 */
export function gameRef(row: KindColumns): ChatGameRef | null {
  if (row.kind !== 'game' || !row.game_lobby_id || !isPlayGame(row.game)) return null;
  return { game: row.game, lobbyId: row.game_lobby_id };
}

/**
 * What a conversation list shows for a gift or a game card.
 *
 * They have no body, and the apps write their own localized line from the
 * kind; these are only for phone builds from before kinds existed, which print
 * the preview as it is — a string they can show, rather than a null they
 * cannot.
 */
export const PREVIEW_FALLBACK: Readonly<Record<Exclude<ChatMessageKind, 'text'>, string>> = {
  gift: '🎁 Gift',
  game: '🎮 Game invite',
};

/** The last-message line for a conversation list: the text, or the stand-in for its kind. */
export function previewText(kind: ChatMessageKind, body: string | null): string {
  return kind === 'text' ? body ?? '' : PREVIEW_FALLBACK[kind];
}
