import type pg from 'pg';
import { MEMBERS_BOX_FREE_GIFTS, MEMBERS_BOX_ZER, membersBoxItem, membersBoxMonth, type MembersBox, type MembersBoxView } from '@kurda/shared';
import { cosmeticAssetUrl, isPremiumActive, memberZerUntilSql, type PublicUrl } from '../cosmetics/access.js';
import { lockEntitlement } from '../shop/service.js';
import { isEconomyBlocked } from '../economy/standing.js';
import { WalletService } from '../wallet/service.js';

/** The ledger reason for a box's Zêr, which is part of membership and so outside the earned cap. */
export const MEMBERS_BOX_REASON = 'members_box';

type Executor = Pick<pg.Pool, 'query'>;

interface BoxRow {
  month: string;
  zer: number;
  free_gifts: number;
  item_sku: string | null;
  item_name: string | null;
  item_category: string | null;
  item_asset: string | null;
  granted_at: Date;
  seen_at: Date | null;
}

/**
 * The members' box: once each calendar month a member is a member, 500 Zêr, three free gifts and that month's
 * members-only item (shared `MEMBERS_BOX_ITEMS`), given on their first visit of the month. One row per member and month
 * is the gate: the row, the Zêr under a key naming the month and the item commit together, so it is given exactly once
 * however many visits race. A month is a calendar month in UTC, which is what membership granted by staff can be
 * counted in until store renewals give each member a paid month of their own.
 */
export class MembersBoxService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService = new WalletService(pool),
    private readonly publicUrl: PublicUrl = () => null,
  ) {}

  /**
   * Gives this month's box to a member who has not had it; nothing for anyone else, anyone the economy does not pay, or
   * a second time. Returns whether it was given now.
   */
  async ensure(userId: string, now: Date = new Date()): Promise<boolean> {
    const member = await this.pool.query<{ premium_until: Date | null }>(
      `SELECT ${memberZerUntilSql('u')} AS premium_until FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (!isPremiumActive(member.rows[0]?.premium_until ?? null, now)) return false;
    // a member the economy pays nothing (economy/standing.ts), a bot or a fraud hold among them, gets no box either
    if (await isEconomyBlocked(this.pool, userId)) return false;
    const month = membersBoxMonth(now);
    const first = `${month}-01`;
    const had = await this.pool.query(`SELECT 1 FROM members_boxes WHERE user_id = $1 AND month = $2::date`, [userId, first]);
    if ((had.rowCount ?? 0) > 0) return false;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const made = await client.query(
        `INSERT INTO members_boxes (user_id, month, zer, free_gifts, free_gifts_left)
         VALUES ($1, $2::date, $3, $4, $4)
         ON CONFLICT (user_id, month) DO NOTHING`,
        [userId, first, MEMBERS_BOX_ZER, MEMBERS_BOX_FREE_GIFTS],
      );
      if ((made.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      await this.wallet.creditWithin(client, {
        userId,
        currency: 'zer',
        amount: MEMBERS_BOX_ZER,
        reason: MEMBERS_BOX_REASON,
        refId: month,
        idempotencyKey: `members-box:${userId}:${month}`,
      });
      // the month's item, unless the member has it already (then the box holds the rest)
      const sku = membersBoxItem(month);
      await lockEntitlement(client, userId, sku);
      const given = await client.query(
        `INSERT INTO user_entitlements (user_id, sku, source)
         SELECT $1, i.sku, 'members_box' FROM shop_items i WHERE i.sku = $2
         ON CONFLICT (user_id, sku) DO NOTHING`,
        [userId, sku],
      );
      if ((given.rowCount ?? 0) > 0) {
        await client.query(`UPDATE members_boxes SET item_sku = $3 WHERE user_id = $1 AND month = $2::date`, [userId, first, sku]);
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** This month's box for a member, given first if this is their first visit, and the free gifts left from every box. */
  async view(userId: string, now: Date = new Date()): Promise<MembersBoxView> {
    await this.ensure(userId, now);
    const first = `${membersBoxMonth(now)}-01`;
    const [box, left] = await Promise.all([
      this.pool.query<BoxRow>(
        `SELECT to_char(b.month, 'YYYY-MM') AS month, b.zer, b.free_gifts, b.item_sku, i.name AS item_name,
                i.category AS item_category, i.asset_key AS item_asset, b.granted_at, b.seen_at
           FROM members_boxes b LEFT JOIN shop_items i ON i.sku = b.item_sku
          WHERE b.user_id = $1 AND b.month = $2::date`,
        [userId, first],
      ),
      freeGiftsLeft(this.pool, userId),
    ]);
    const row = box.rows[0];
    return { box: row ? this.toBox(row) : null, freeGifts: left };
  }

  /** The member has seen this month's box. */
  async markSeen(userId: string, now: Date = new Date()): Promise<void> {
    await this.pool.query(`UPDATE members_boxes SET seen_at = COALESCE(seen_at, now()) WHERE user_id = $1 AND month = $2::date`, [
      userId,
      `${membersBoxMonth(now)}-01`,
    ]);
  }

  private toBox(r: BoxRow): MembersBox {
    return {
      month: r.month,
      zer: r.zer,
      freeGifts: r.free_gifts,
      item:
        r.item_sku && r.item_name && r.item_category
          ? { sku: r.item_sku, name: r.item_name, category: r.item_category, assetUrl: cosmeticAssetUrl(r.item_category, r.item_asset, this.publicUrl, r.item_sku) }
          : null,
      grantedAt: new Date(r.granted_at).toISOString(),
      seen: r.seen_at !== null,
    };
  }
}

/** Free gifts left from every box a member has been given; they last until used. */
export async function freeGiftsLeft(db: Executor, userId: string): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT COALESCE(SUM(free_gifts_left), 0)::int AS n FROM members_boxes WHERE user_id = $1`, [userId]);
  return res.rows[0]?.n ?? 0;
}

/**
 * Spends `count` free gifts in the caller's transaction, oldest box first, or none when there are not that many: true
 * when they were spent. The boxes are locked, so two sends cannot spend the same gift.
 */
export async function spendFreeGifts(client: pg.PoolClient, userId: string, count: number): Promise<boolean> {
  const boxes = await client.query<{ month: string; left: number }>(
    `SELECT month::text AS month, free_gifts_left AS left FROM members_boxes
      WHERE user_id = $1 AND free_gifts_left > 0 ORDER BY month FOR UPDATE`,
    [userId],
  );
  if (boxes.rows.reduce((n, b) => n + b.left, 0) < count) return false;
  let need = count;
  for (const b of boxes.rows) {
    if (need <= 0) break;
    const take = Math.min(need, b.left);
    await client.query(`UPDATE members_boxes SET free_gifts_left = free_gifts_left - $3 WHERE user_id = $1 AND month = $2::date`, [userId, b.month, take]);
    need -= take;
  }
  return true;
}
