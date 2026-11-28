import type { ChatMessageKind } from '@kurda/shared';
import { GameIcon, GiftIcon, HeartIcon } from '../components/icons';

/**
 * The icon beside the one-line preview of a gift, a game card or a one-tap thanks (chat/messagePreview.ts), sized to
 * the line. Hidden from screen readers since the preview text already names it; text messages have none.
 */
export function PreviewIcon({ kind }: { kind: ChatMessageKind | undefined }): React.JSX.Element | null {
  if (kind === 'gift') return <GiftIcon size={14} className="preview-icon" />;
  if (kind === 'game') return <GameIcon size={14} className="preview-icon" />;
  if (kind === 'thanks') return <HeartIcon size={14} weight="fill" className="preview-icon" />;
  return null;
}
