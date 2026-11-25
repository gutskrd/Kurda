/**
 * The gift bag: small gifts everyone earns from the moments that pay members Zêr (shared `BAG_SOURCES`), members and free
 * accounts alike, to give to friends and for nothing else. Nothing here sells, converts or trades what a bag holds; the
 * only way out of a bag is a gift (`takeFromBagWithin`, under the gift rules). A child's profile, or an account the
 * economy does not pay, is given nothing. Each moment gives once (`gift_bag_grants`), at most `BAG_GIFTS_PER_DAY` a UTC
 * day and `BAG_MAX_EACH` of one kind, decided under a lock on the bag so two moments at once cannot both pass the cap.
 */
import type pg from 'pg';
import {
  BAG_GIFTS_PER_DAY,
  BAG_MAX_EACH,
  bagGiftFor,
  giftSku,
  type BagArrival,
  type BagEntry,
  type BagSource,
} from '@kurda/shared';
import { cosmeticAssetUrl, type PublicUrl } from '../cosmetics/access.js';
import { isEconomyBlocked } from '../economy/standing.js';

type Executor = Pick<pg.Pool, 'query'>;

/** A gift that just landed in a bag. */
export interface BagGrant {
  id: string;
  sku: string;
  name: string;
  source: BagSource;
}

export interface BagGrantInput {
  userId: string;
  source: BagSource;
  /** the moment, so it gives once: a day, a milestone and day, a game, a tree and harvest */
  ref: string;
  /** Already shown where it was earned (the daily claim says it), so no line about it later. */
  seen?: boolean;
}

/** The UTC day, as the daily cap counts it. */
const UTC_TODAY = `(now() AT TIME ZONE 'UTC')::date`;

/**
 * Puts the moment's gift (shared `bagGiftFor`) in the bag, inside the caller's open transaction and within a savepoint,
 * so a failure here never undoes the moment itself. Null when nothing was given: a child, an account held from the
 * economy, the moment already given, the day's five reached, or every earned kind full.
 */
export async function grantBagGiftWithin(
  client: pg.PoolClient,
  input: BagGrantInput,
  log?: { warn: (obj: unknown, msg: string) => void },
): Promise<BagGrant | null> {
  await client.query('SAVEPOINT gift_bag_grant');
  try {
    const grant = await grant1(client, input);
    await client.query('RELEASE SAVEPOINT gift_bag_grant');
    return grant;
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT gift_bag_grant');
    log?.warn({ err, source: input.source }, 'a gift was not put in the bag');
    return null;
  }
}

async function grant1(client: pg.PoolClient, { userId, source, ref, seen = false }: BagGrantInput): Promise<BagGrant | null> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-bag:${userId}`]);
  const who = await client.query<{ child: boolean }>(`SELECT kind = 'child' AS child FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
  if (!who.rows[0] || who.rows[0].child) return null;
  if (await isEconomyBlocked(client, userId)) return null;

  const state = await client.query<{ given: boolean; today: number }>(
    `SELECT EXISTS (SELECT 1 FROM gift_bag_grants WHERE user_id = $1 AND source = $2 AND ref = $3) AS given,
            (SELECT count(*)::int FROM gift_bag_grants WHERE user_id = $1 AND granted_on = ${UTC_TODAY}) AS today`,
    [userId, source, ref],
  );
  const { given, today } = state.rows[0]!;
  if (given || today >= BAG_GIFTS_PER_DAY) return null;

  // Only a gift on sale can be given on, so a withdrawn one is never put in a bag.
  const held = await client.query<{ sku: string; count: number }>(`SELECT sku, count FROM gift_bag WHERE user_id = $1`, [userId]);
  const counts = new Map(held.rows.map((r) => [r.sku, r.count]));
  const live = await client.query<{ sku: string; name: string }>(
    `SELECT sku, name FROM shop_items WHERE category = 'gift' AND active AND in_stock AND retired_at IS NULL`,
  );
  const onSale = new Map(live.rows.map((r) => [r.sku, r.name]));
  const def = bagGiftFor(source, (id) => (onSale.has(giftSku(id)) ? (counts.get(giftSku(id)) ?? 0) : BAG_MAX_EACH));
  if (!def) return null;
  const sku = giftSku(def.id);

  const row = await client.query<{ id: string }>(
    `INSERT INTO gift_bag_grants (user_id, sku, source, ref, granted_on, seen_at)
     VALUES ($1, $2, $3, $4, ${UTC_TODAY}, CASE WHEN $5 THEN now() END)
     ON CONFLICT (user_id, source, ref) DO NOTHING
     RETURNING id`,
    [userId, sku, source, ref, seen],
  );
  if (!row.rows[0]) return null;
  await client.query(
    `INSERT INTO gift_bag (user_id, sku, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, sku) DO UPDATE SET count = gift_bag.count + 1, updated_at = now()`,
    [userId, sku],
  );
  return { id: row.rows[0].id, sku, name: onSale.get(sku) ?? def.name, source };
}

/**
 * Takes `count` of a gift out of the bag inside a gift's transaction, or refuses with false when the bag holds fewer;
 * one statement, so two sends at once cannot both take the last one.
 */
export async function takeFromBagWithin(client: pg.PoolClient, userId: string, sku: string, count: number): Promise<boolean> {
  const taken = await client.query(
    `UPDATE gift_bag SET count = count - $3, updated_at = now() WHERE user_id = $1 AND sku = $2 AND count >= $3`,
    [userId, sku, count],
  );
  if ((taken.rowCount ?? 0) === 0) return false;
  await client.query(`DELETE FROM gift_bag WHERE user_id = $1 AND sku = $2 AND count = 0`, [userId, sku]);
  return true;
}

/** What the bag holds, cheapest first, each with its picture. */
export async function bagEntries(db: Executor, userId: string, publicUrl: PublicUrl): Promise<BagEntry[]> {
  const rows = await db.query<{ sku: string; name: string; category: string; asset_key: string | null; count: number }>(
    `SELECT b.sku, i.name, i.category, i.asset_key, b.count
       FROM gift_bag b JOIN shop_items i ON i.sku = b.sku
      WHERE b.user_id = $1 AND b.count > 0
      ORDER BY i.price, b.sku`,
    [userId],
  );
  return rows.rows.map((r) => ({ sku: r.sku, name: r.name, assetUrl: cosmeticAssetUrl(r.category, r.asset_key, publicUrl, r.sku), count: r.count }));
}

/** How long a gift that landed unseen is still worth a line. */
const ARRIVAL_DAYS = 14;

/** What landed in the bag and has not been told of yet, newest first. */
export async function bagArrivals(db: Executor, userId: string, publicUrl: PublicUrl): Promise<BagArrival[]> {
  const rows = await db.query<{ id: string; sku: string; name: string; category: string; asset_key: string | null; source: BagSource; created_at: Date }>(
    `SELECT g.id, g.sku, i.name, i.category, i.asset_key, g.source, g.created_at
       FROM gift_bag_grants g JOIN shop_items i ON i.sku = g.sku
      WHERE g.user_id = $1 AND g.seen_at IS NULL AND g.created_at > now() - make_interval(days => ${ARRIVAL_DAYS})
      ORDER BY g.created_at DESC
      LIMIT 10`,
    [userId],
  );
  return rows.rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    assetUrl: cosmeticAssetUrl(r.category, r.asset_key, publicUrl, r.sku),
    source: r.source,
    at: new Date(r.created_at).toISOString(),
  }));
}

/** The arrivals have been told of; returns how many. */
export async function markArrivalsSeen(db: Executor, userId: string): Promise<number> {
  const res = await db.query(`UPDATE gift_bag_grants SET seen_at = now() WHERE user_id = $1 AND seen_at IS NULL`, [userId]);
  return res.rowCount ?? 0;
}
