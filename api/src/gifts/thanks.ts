/**
 * A one-tap thanks for a gift. The recipient's gift row is marked thanked in the same transaction as the message that
 * says so, which keeps it to one thanks per gift, and only for a gift posted in the chat the thanks goes to.
 */
import type pg from 'pg';
import type { ChatThanksRef } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

/** The chat a thanks is said in: the two people of a direct message, or a group. */
export type ThanksChat = { kind: 'dm'; userLo: string; userHi: string } | { kind: 'group'; groupId: string };

/**
 * Marks the thanker's gift in `batchId` thanked and returns what the message points at. A gift that is not theirs,
 * or not in this chat, is 404 GIFT_NOT_FOUND; one already thanked is 409 ALREADY_THANKED.
 */
export async function claimThanks(client: pg.PoolClient, batchId: string, thankerId: string, chat: ThanksChat): Promise<ChatThanksRef> {
  const posted =
    chat.kind === 'dm'
      ? `EXISTS (SELECT 1 FROM dm_messages m WHERE m.gift_batch_id = g.batch_id AND m.kind = 'gift' AND m.user_lo = $3 AND m.user_hi = $4)`
      : `EXISTS (SELECT 1 FROM group_messages m WHERE m.gift_batch_id = g.batch_id AND m.kind = 'gift' AND m.group_id = $3)`;
  const params = chat.kind === 'dm' ? [batchId, thankerId, chat.userLo, chat.userHi] : [batchId, thankerId, chat.groupId];
  const claimed = await client.query<{ name: string }>(
    `UPDATE gifts g SET thanked_at = now() FROM shop_items i
      WHERE i.sku = g.sku AND g.batch_id = $1 AND g.to_user_id = $2 AND g.thanked_at IS NULL AND ${posted}
      RETURNING i.name`,
    params,
  );
  if (claimed.rows[0]) return { batchId, name: claimed.rows[0].name };
  const theirs = await client.query(`SELECT 1 FROM gifts g WHERE g.batch_id = $1 AND g.to_user_id = $2 AND ${posted}`, params);
  throw theirs.rows[0]
    ? new AppError('ALREADY_THANKED', 409, 'you already said thanks for this gift')
    : new AppError('GIFT_NOT_FOUND', 404, 'no such gift');
}

/** The gift each thanks message on a page answers, by batch, from one read. */
export async function thanksRefs(executor: Pick<pg.Pool, 'query'>, batchIds: readonly string[]): Promise<Map<string, ChatThanksRef>> {
  if (batchIds.length === 0) return new Map();
  const rows = await executor.query<{ batch_id: string; name: string }>(
    `SELECT DISTINCT ON (g.batch_id) g.batch_id, i.name
       FROM gifts g JOIN shop_items i ON i.sku = g.sku
      WHERE g.batch_id = ANY($1::uuid[])
      ORDER BY g.batch_id`,
    [[...new Set(batchIds)]],
  );
  return new Map(rows.rows.map((r) => [r.batch_id, { batchId: r.batch_id, name: r.name }]));
}
