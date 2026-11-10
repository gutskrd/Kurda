import type { ChatMessageKind } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { IconName } from '../theme/icon-paths';

/**
 * The line a conversation list shows for its last message.
 *
 * A gift or a game card has no words; the API sends an English stand-in in
 * `lastMessage` for installed builds and says what it was in `lastKind`, so
 * the phone writes its own line, in the reader's language. Text is shown as
 * it is.
 */
export function messagePreview(convo: { lastMessage: string; lastKind?: ChatMessageKind }, t: Translate): string {
  switch (convo.lastKind) {
    case 'gift':
      return t('chat.preview.gift');
    case 'game':
      return t('play.chat.preview');
    default:
      return convo.lastMessage;
  }
}

/**
 * The glyph a conversation list draws before that line, for a last message
 * that was a card rather than words: the gift a gift's own card wears and the
 * play mark a game's does. The catalogue's lines used to open with an emoji
 * that said this; the words are plain now and the list draws the mark.
 */
export function previewIcon(kind: ChatMessageKind | undefined): IconName | null {
  if (kind === 'gift') return 'gift';
  if (kind === 'game') return 'play';
  return null;
}
