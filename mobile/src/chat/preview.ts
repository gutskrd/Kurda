import type { ChatMessageKind } from '@kurda/shared';
import type { Translate } from '../api/errors';

/**
 * The line a conversation list shows for its last message.
 *
 * A gift or a game card has no words; the API sends an English stand-in in
 * `lastMessage` for installed builds and says what it was in `lastKind`, so
 * the phone writes its own line, in the reader's language. Text is shown as
 * it is. (mobile-games owns how a game card reads once its card is merged.)
 */
export function messagePreview(convo: { lastMessage: string; lastKind?: ChatMessageKind }, t: Translate): string {
  switch (convo.lastKind) {
    case 'gift':
      return t('chat.preview.gift');
    case 'game':
      return t('chat.gameCard');
    default:
      return convo.lastMessage;
  }
}
