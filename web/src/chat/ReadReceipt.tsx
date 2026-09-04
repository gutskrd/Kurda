import type { DmMessage } from '../lib/types';

/**
 * Whether your last message got there, and whether it was read.
 *
 * The server has tracked delivered_at and read_at all along and publishes
 * dm_delivered / dm_read events, but nothing on the client ever showed any of
 * it — so a message you sent looked identical whether it had been read or had
 * failed to arrive.
 *
 * Shown only on the newest message of your own run: repeating it against every
 * bubble is noise, since a read receipt implies everything before it.
 */
export function ReadReceipt({ message }: { message: DmMessage }): React.JSX.Element {
  const state = message.readAt ? 'read' : message.deliveredAt ? 'delivered' : 'sent';
  const label = state === 'read' ? 'Read' : state === 'delivered' ? 'Delivered' : 'Sent';
  return (
    <span className={`chat-receipt chat-receipt-${state}`} title={label} aria-label={label}>
      {state === 'sent' ? '✓' : '✓✓'}
    </span>
  );
}
