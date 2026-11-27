import type { ChatMessageKind } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { IconName } from '../theme/icon-paths';

/**
 * The line a conversation list shows for its last message. A gift, a game card or a one-tap thanks has no words of its
 * own; the API sends a stand-in in `lastMessage` for older builds and the kind in `lastKind`, so the phone writes its
 * own line in the reader's language. Text is shown as is.
 */
export function messagePreview(convo: { lastMessage: string; lastKind?: ChatMessageKind }, t: Translate): string {
  switch (convo.lastKind) {
    case 'gift':
      return t('chat.preview.gift');
    case 'game':
      return t('play.chat.preview');
    // a one-tap thanks says what it was, never its stored stand-in text
    case 'thanks':
      return t('chat.preview.thanks');
    default:
      return convo.lastMessage;
  }
}

/** The glyph drawn before that line when the last message was a card: the gift's glyph or the game's play mark. */
export function previewIcon(kind: ChatMessageKind | undefined): IconName | null {
  if (kind === 'gift') return 'gift';
  if (kind === 'game') return 'play';
  if (kind === 'thanks') return 'heart-fill';
  return null;
}
