import type pg from 'pg';
import {
  TREE_KINDS,
  TREE_SPECIES,
  canPlant,
  isTreeSpecies,
  plantTree,
  treeGlimpse,
  treeView,
  waterTree,
  type TreeGlimpse,
  type TreeRecord,
  type TreeSpecies,
  type TreeStage,
  type TreeView,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { isEconomyBlocked } from '../economy/standing.js';
import { localDate, safeTimeZone } from '../streaks/streak-logic.js';
import type { WalletService } from '../wallet/service.js';

/** Executor: a pool or a client, so water can be earned inside a lesson's own transaction. */
type Executor = Pick<pg.Pool, 'query'>;

/** The Zêr ledger's reasons: what a full-grown tree's harvest pays, and what a kind of tree costs. */
export const TREE_HARVEST_REASON = 'tree_harvest';
export const TREE_PURCHASE_REASON = 'tree_purchase';

/** The most water anybody holds: far more than learning earns, and what the column allows. */
const WATER_MOST = 9999;

/** A kind as the learner sees it in the nursery: what it costs, and whether it is theirs to plant. */
export interface TreeKindOffer {
  species: TreeSpecies;
  starter: boolean;
  price: number;
  owned: boolean;
}

/** What `GET /me/tree` answers. */
export interface MyTree {
  /** the tree that stands, or null before the first is planted */
  tree: TreeView | null;
  /** how many trees the learner has planted, this one included */
  planted: number;
  kinds: TreeKindOffer[];
  /** the learner's Zêr, for what the nursery's prices are set against */
  zer: number;
}

/** What watering answers: the tree after it, and what the water did. */
export interface Watered {
  tree: TreeView;
  poured: number;
  grew: TreeStage | null;
  harvests: number;
  /** Zêr the harvests paid */
  zer: number;
  revived: boolean;
}

/** What a finished lesson says about the tree: the water it earned, and what is held now. */
export interface WaterEarned {
  gained: number;
  water: number;
}

interface TreeRow {
  id: string;
  species: string;
  planted_on: string;
  last_watered_on: string;
  waterings: number;
  water: number;
  harvests: number;
  planted: number;
  timezone: string | null;
}

/** Dates as the calendar days they are, whatever the session's time zone would make of them. */
const TREE_COLUMNS = `t.id, t.species, to_char(t.planted_on, 'YYYY-MM-DD') AS planted_on, to_char(t.last_watered_on, 'YYYY-MM-DD') AS last_watered_on,
       t.waterings, t.water, t.harvests, t.planted`;

/** A stored tree as the rules know it; null for a kind this server no longer has. */
function recordOf(row: TreeRow): TreeRecord | null {
  if (!isTreeSpecies(row.species)) return null;
  return { species: row.species, plantedOn: row.planted_on, lastWateredOn: row.last_watered_on, waterings: row.waterings, water: row.water, harvests: row.harvests };
}

/**
 * Water for a lesson or a practice session worked through: one more held by
 * the learner's tree, if they have planted one. Called inside the
 * completion's own transaction, once per completion, so a session never
 * earns twice. Nothing is earned before a tree is planted: the first tree
 * comes with the water to bring its seed up.
 */
export async function earnWater(db: Executor, userId: string, amount = 1): Promise<WaterEarned | null> {
  const res = await db.query<{ water: number; was: number }>(
    `UPDATE user_trees t SET water = LEAST($3::int, t.water + $2::int), updated_at = now()
       FROM (SELECT water FROM user_trees WHERE user_id = $1 FOR UPDATE) old
      WHERE t.user_id = $1
      RETURNING t.water, old.water AS was`,
    [userId, amount, WATER_MOST],
  );
  const row = res.rows[0];
  return row ? { gained: row.water - row.was, water: row.water } : null;
}

/**
 * The learner's tree (shared `tree.ts`): planting one, watering it with what
 * lessons earned, buying another kind, and showing it on a profile.
 *
 * Every day here is the learner's own calendar day, in the time zone their
 * account holds, as the streak's days are: a tree watered before their
 * midnight was watered that day wherever the server is.
 */
export class TreeService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  private async today(db: Executor, userId: string, now: Date): Promise<string> {
    const res = await db.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    return localDate(now, safeTimeZone(res.rows[0]?.timezone ?? 'UTC'));
  }

  /** The tree, the kinds there are with which of them are the learner's, and their Zêr. */
  async mine(userId: string, now: Date = new Date()): Promise<MyTree> {
    const [tree, owned, balances] = await Promise.all([
      this.pool.query<TreeRow>(`SELECT ${TREE_COLUMNS}, u.timezone FROM user_trees t JOIN users u ON u.id = t.user_id WHERE t.user_id = $1`, [userId]),
      this.pool.query<{ species: string }>(`SELECT species FROM user_tree_kinds WHERE user_id = $1`, [userId]),
      this.wallet.balances(userId),
    ]);
    const row = tree.rows[0];
    const record = row ? recordOf(row) : null;
    const mine = owned.rows.map((r) => r.species);
    return {
      tree: row && record ? treeView(record, localDate(now, safeTimeZone(row.timezone ?? 'UTC'))) : null,
      planted: row?.planted ?? 0,
      kinds: TREE_SPECIES.map((species) => ({ ...TREE_KINDS[species], owned: canPlant(species, mine) })),
      zer: balances.zer,
    };
  }

  /**
   * Plant a kind: the first tree, or another in place of the one that
   * stands, which is gone with all it had grown. Only a kind that is free or
   * already bought (403 TREE_NOT_OWNED). The water held stays, and a tree is
   * never planted with less than brings its seed up.
   */
  async plant(userId: string, species: string, now: Date = new Date()): Promise<MyTree> {
    if (!isTreeSpecies(species)) throw new AppError('TREE_NOT_FOUND', 404, 'no such kind of tree');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const today = await this.today(client, userId, now);
      if (!TREE_KINDS[species].starter) {
        const owned = await client.query(`SELECT 1 FROM user_tree_kinds WHERE user_id = $1 AND species = $2`, [userId, species]);
        if ((owned.rowCount ?? 0) === 0) throw new AppError('TREE_NOT_OWNED', 403, 'this kind of tree has to be bought first');
      }
      const seed = plantTree(species, today);
      await client.query(
        `INSERT INTO user_trees (user_id, species, planted_on, last_watered_on, waterings, water, harvests)
         VALUES ($1, $2, $3::date, $3::date, 0, $4, 0)
         ON CONFLICT (user_id) DO UPDATE SET
           id = gen_random_uuid(), species = EXCLUDED.species, planted_on = EXCLUDED.planted_on, last_watered_on = EXCLUDED.last_watered_on,
           waterings = 0, harvests = 0, water = GREATEST(user_trees.water, EXCLUDED.water), planted = user_trees.planted + 1, updated_at = now()`,
        [userId, species, today, seed.water],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return this.mine(userId, now);
  }

  /**
   * Buy a kind with Zêr, once: it is the learner's to plant from then on.
   * Buying plants nothing, so the tree that stands is not lost by it. 409
   * TREE_OWNED for a kind already theirs or free to everybody, 402 when the
   * Zêr is short.
   */
  async buy(userId: string, species: string, now: Date = new Date()): Promise<MyTree> {
    if (!isTreeSpecies(species)) throw new AppError('TREE_NOT_FOUND', 404, 'no such kind of tree');
    const kind = TREE_KINDS[species];
    if (kind.starter) throw new AppError('TREE_OWNED', 409, 'this kind of tree is free to plant');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const bought = await client.query(`INSERT INTO user_tree_kinds (user_id, species) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, species]);
      if ((bought.rowCount ?? 0) === 0) throw new AppError('TREE_OWNED', 409, 'this kind of tree is already yours');
      await this.wallet.debitWithin(client, { userId, currency: 'zer', amount: kind.price, reason: TREE_PURCHASE_REASON, refId: species, idempotencyKey: `tree-buy:${userId}:${species}` });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return this.mine(userId, now);
  }

  /**
   * Pour water held onto the tree: `count` of it, or as much as there is.
   * The tree grows by it, is fresh again whatever state it was in, and a
   * full-grown one may bear, which pays Zêr through the wallet in the same
   * transaction (keyed on the tree and the harvest, so a retry pays once; an
   * account the economy does not pay still waters and bears, unpaid). 404
   * TREE_NOT_PLANTED before a tree is planted, 409 TREE_NO_WATER with none held.
   */
  async water(userId: string, count: number, now: Date = new Date()): Promise<Watered> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<TreeRow>(`SELECT ${TREE_COLUMNS}, u.timezone FROM user_trees t JOIN users u ON u.id = t.user_id WHERE t.user_id = $1 FOR UPDATE OF t`, [userId]);
      const row = found.rows[0];
      const record = row ? recordOf(row) : null;
      if (!row || !record) throw new AppError('TREE_NOT_PLANTED', 404, 'no tree is planted yet');
      const today = localDate(now, safeTimeZone(row.timezone ?? 'UTC'));
      const watering = waterTree(record, count, today);
      if (watering.poured === 0) throw new AppError('TREE_NO_WATER', 409, 'there is no water to pour: a lesson earns some');
      await client.query(`UPDATE user_trees SET waterings = $2, water = $3, harvests = $4, last_watered_on = $5::date, updated_at = now() WHERE user_id = $1`, [
        userId,
        watering.tree.waterings,
        watering.tree.water,
        watering.tree.harvests,
        today,
      ]);
      let zer = 0;
      if (watering.zer > 0 && !(await isEconomyBlocked(client, userId))) {
        // one ledger row for this pour's harvests, named by the last of them
        await this.wallet.creditWithin(client, {
          userId,
          currency: 'zer',
          amount: watering.zer,
          reason: TREE_HARVEST_REASON,
          refId: row.id,
          idempotencyKey: `tree-harvest:${row.id}:${watering.tree.harvests}`,
        });
        zer = watering.zer;
      }
      await client.query('COMMIT');
      return { tree: treeView(watering.tree, today), poured: watering.poured, grew: watering.grew, harvests: watering.harvests, zer, revived: watering.revived };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Somebody's tree as their profile shows it, on their own today; null when they have planted none. */
  async glimpse(userId: string, now: Date = new Date()): Promise<TreeGlimpse | null> {
    const res = await this.pool.query<TreeRow>(`SELECT ${TREE_COLUMNS}, u.timezone FROM user_trees t JOIN users u ON u.id = t.user_id WHERE t.user_id = $1`, [userId]);
    const row = res.rows[0];
    const record = row ? recordOf(row) : null;
    if (!row || !record) return null;
    return treeGlimpse(treeView(record, localDate(now, safeTimeZone(row.timezone ?? 'UTC'))));
  }
}
