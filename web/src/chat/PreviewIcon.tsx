import type { ChatMessageKind } from '@kurda/shared';
import { GameIcon, GiftIcon } from '../components/icons';

/**
 * The picture beside a message's one-line preview (chat/messagePreview.ts)
 * when the message is a gift or a game card: the app's own drawn icon, the
 * size of the line it sits in. A message that is words has none.
 *
 * It is decoration: the preview's words already say "Gift" or name the game,
 * so the icon is hidden from a screen reader (as every icon here is) rather
 * than said twice.
 */
export function PreviewIcon({ kind }: { kind: ChatMessageKind | undefined }): React.JSX.Element | null {
  if (kind === 'gift') return <GiftIcon size={14} className="preview-icon" />;
  if (kind === 'game') return <GameIcon size={14} className="preview-icon" />;
  return null;
}
