import type { ChatMessageKind } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { IconName } from '../theme/icon-paths';

/**
 * The line a conversation list shows for its last message. A gift or game card has no words; the API sends an
 * English stand-in in `lastMessage` for older builds and the kind in `lastKind`, so the phone writes its own line
 * in the reader's language. Text is shown as is.
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

/** The glyph drawn before that line when the last message was a card: the gift's glyph or the game's play mark. */
export function previewIcon(kind: ChatMessageKind | undefined): IconName | null {
  if (kind === 'gift') return 'gift';
  if (kind === 'game') return 'play';
  return null;
}
