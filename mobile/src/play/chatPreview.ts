import type { Translate } from '../api/errors';

/**
 * The line a conversation list shows for its last message. A game card has
 * no text: the server sends an English stand-in for phone builds that predate
 * message kinds, and this writes the line in the reader's own language from
 * the kind instead. (A gift's line belongs with the gift bubbles; add it here.)
 */
export function chatPreview(row: { lastMessage: string; lastKind?: string | null }, t: Translate): string {
  if (row.lastKind === 'game') return t('play.chat.preview');
  return row.lastMessage;
}
