import type { ChatMessageKind } from '@kurda/shared';
import { GameIcon, GiftIcon } from '../components/icons';

/**
 * The icon beside a gift or game card's one-line preview (chat/messagePreview.ts), sized to the line. Hidden from
 * screen readers since the preview text already names it; text messages have none.
 */
export function PreviewIcon({ kind }: { kind: ChatMessageKind | undefined }): React.JSX.Element | null {
  if (kind === 'gift') return <GiftIcon size={14} className="preview-icon" />;
  if (kind === 'game') return <GameIcon size={14} className="preview-icon" />;
  return null;
}
