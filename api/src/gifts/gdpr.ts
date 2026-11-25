/**
 * The gifts in a person's data export: what they gave and what they were given, each with the other person named as the
 * export names people elsewhere (username and display name), or null for an account since closed. A gift received
 * carries no price, as a present shows none; a gift given carries what was paid and how.
 */
import type pg from 'pg';

type Executor = Pick<pg.Pool, 'query'>;

interface Person {
  username: string;
  displayName: string | null;
}

const person = (username: string | null, displayName: string | null): Person | null => (username ? { username, displayName } : null);

interface GiftRow {
  sku: string;
  item: string;
  at: Date;
  opened_at: Date | null;
  on_post: boolean;
  username: string | null;
  display_name: string | null;
}

export async function exportGifts(db: Executor, userId: string): Promise<{ given: unknown[]; received: unknown[] }> {
  const given = await db.query<GiftRow & { price: number; paid_with: string }>(
    `SELECT g.sku, i.name AS item, g.price, g.paid_with, g.created_at AS at, g.opened_at, g.post_id IS NOT NULL AS on_post,
            CASE WHEN u.deleted_at IS NULL THEN u.username END AS username, CASE WHEN u.deleted_at IS NULL THEN u.display_name END AS display_name
       FROM gifts g JOIN shop_items i ON i.sku = g.sku JOIN users u ON u.id = g.to_user_id
      WHERE g.from_user_id = $1 ORDER BY g.created_at`,
    [userId],
  );
  const received = await db.query<GiftRow>(
    `SELECT g.sku, i.name AS item, g.created_at AS at, g.opened_at, g.post_id IS NOT NULL AS on_post,
            CASE WHEN s.deleted_at IS NULL THEN s.username END AS username, CASE WHEN s.deleted_at IS NULL THEN s.display_name END AS display_name
       FROM gifts g JOIN shop_items i ON i.sku = g.sku LEFT JOIN users s ON s.id = g.from_user_id
      WHERE g.to_user_id = $1 ORDER BY g.created_at`,
    [userId],
  );
  return {
    given: given.rows.map((r) => ({
      sku: r.sku,
      item: r.item,
      zer: r.price,
      paidWith: r.paid_with,
      to: person(r.username, r.display_name),
      onPost: r.on_post,
      givenAt: r.at,
      openedAt: r.opened_at,
    })),
    received: received.rows.map((r) => ({
      sku: r.sku,
      item: r.item,
      from: person(r.username, r.display_name),
      onPost: r.on_post,
      receivedAt: r.at,
      openedAt: r.opened_at,
    })),
  };
}
