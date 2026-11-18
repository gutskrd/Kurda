import type pg from 'pg';
import { AppError } from '../plugins/errors.js';

/**
 * Who may be paid Zêr or Gewher, and who may move value to someone else: the one place the economy asks bans, the
 * bot scorer, the anti-cheat shadow flag and the payment-fraud hold.
 *
 * - `economyBlockedSql`: may the system pay this account at all? Asked by unrequested payouts (league promotions,
 *   achievements, tournament prizes), which skip a blocked account silently, and by the Zêr and
 *   Gewher boards. Closed or banned accounts, confirmed bots, shadow-flagged cheaters and fraud-held accounts are
 *   blocked. Silence matters: a cheater must not learn of the shadow flag from a refusal.
 * - `economyHeldSql`: is the account paused from moving value, where the person asked and must be told? A
 *   confirmed bot or a fraud hold, both already known to the owner. Asked on reward claims and gifts, so a caught
 *   farm of throwaway accounts stops feeding its target.
 *
 * Both are SQL fragments over a `users` alias, so a query can filter many people at once.
 */

/** A `users` row alias, always a literal from this codebase. */
type Alias = string;

/** Confirmed bot or payment-fraud hold: told to the owner, and refused when they ask. */
export function economyHeldSql(u: Alias): string {
  return `(EXISTS (SELECT 1 FROM bot_scores eb WHERE eb.user_id = ${u}.id AND eb.status = 'confirmed')
    OR EXISTS (SELECT 1 FROM account_holds eh WHERE eh.user_id = ${u}.id))`;
}

/** Everything `economyHeldSql` covers, and the accounts that are never paid: closed, banned now, or shadow-flagged. */
export function economyBlockedSql(u: Alias): string {
  return `(${u}.deleted_at IS NOT NULL
    OR (${u}.banned_at IS NOT NULL AND (${u}.banned_until IS NULL OR ${u}.banned_until > now()))
    OR EXISTS (SELECT 1 FROM cheat_reviews ec WHERE ec.user_id = ${u}.id AND ec.shadow_flagged)
    OR ${economyHeldSql(u)})`;
}

type Executor = Pick<pg.Pool, 'query'>;

/** May the system pay this account? False also for an account that does not exist. */
export async function isEconomyBlocked(db: Executor, userId: string): Promise<boolean> {
  const res = await db.query<{ blocked: boolean }>(
    `SELECT ${economyBlockedSql('u')} AS blocked FROM users u WHERE u.id = $1`,
    [userId],
  );
  return res.rows[0]?.blocked ?? true;
}

/** Is this account paused from claiming rewards and sending gifts? */
export async function isEconomyHeld(db: Executor, userId: string): Promise<boolean> {
  const res = await db.query<{ held: boolean }>(`SELECT ${economyHeldSql('u')} AS held FROM users u WHERE u.id = $1`, [userId]);
  return res.rows[0]?.held ?? false;
}

/** Refuses a claim or gift from an account paused from moving value, with 403 `REWARDS_PAUSED` or `GIFTS_PAUSED`. */
export async function assertEconomyNotHeld(db: Executor, userId: string, what: 'rewards' | 'gifts'): Promise<void> {
  if (!(await isEconomyHeld(db, userId))) return;
  if (what === 'gifts') throw new AppError('GIFTS_PAUSED', 403, 'gifts are paused on this account while it is reviewed');
  throw new AppError('REWARDS_PAUSED', 403, 'rewards are paused on this account while it is reviewed');
}
