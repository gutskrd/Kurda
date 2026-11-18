import type { DmMessage } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/**
 * Whether the reader's message was delivered and read (from the server's dm_delivered and dm_read events). Shown only
 * on the newest message of the reader's run, since a receipt covers everything before it.
 */
export function ReadReceipt({ message }: { message: DmMessage }): React.JSX.Element {
  const t = useT();
  const state = message.readAt ? 'read' : message.deliveredAt ? 'delivered' : 'sent';
  const label =
    state === 'read' ? t('chat.receipt.read') : state === 'delivered' ? t('chat.receipt.delivered') : t('chat.receipt.sent');
  return (
    <span className={`chat-receipt chat-receipt-${state}`} title={label} aria-label={label}>
      {state === 'sent' ? '✓' : '✓✓'}
    </span>
  );
}
