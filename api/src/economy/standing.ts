import type pg from 'pg';
import { AppError } from '../plugins/errors.js';

/**
 * Who may be paid Zêr or Gewher, and who may move value to someone else.
 *
 * The services that decide this already exist — bans (moderation), the bot
 * scorer (antibot), the anti-cheat shadow flag (game), and the payment-fraud
 * hold (fraud) — but each payout used to ask a different subset of them, or
 * none. This module is the one place the economy asks.
 *
 * Two questions, because they are answered to different people:
 *
 * - `economyBlockedSql`: may the system pay this account at all? Asked by the
 *   payouts nobody requests — league promotions, achievements, season
 *   rewards, tournament prizes — which skip a blocked account silently, and
 *   by the Zêr and Gewher boards, which leave one off. A closed or banned
 *   account, a confirmed bot, a shadow-flagged cheater and an account held
 *   for payment fraud are all blocked. Silence matters for the shadow flag:
 *   a cheater must not learn they were flagged from a refusal.
 *
 * - `economyHeldSql`: is this account paused from moving value, where the
 *   person asked and so must be told? A confirmed bot, or an account on a
 *   payment-fraud hold — both already known to their owner. Asked when a
 *   reward is claimed and when a gift is sent, so a farm of throwaway
 *   accounts, once caught, stops feeding the account it was feeding.
 *
 * Both are SQL fragments over a `users` alias, so a query can filter many
 * people at once; the helpers below ask about one.
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

/**
 * Refuse a claim or a gift from an account paused from moving value
 * (`economyHeldSql`), saying which: `REWARDS_PAUSED` or `GIFTS_PAUSED`, 403.
 */
export async function assertEconomyNotHeld(db: Executor, userId: string, what: 'rewards' | 'gifts'): Promise<void> {
  if (!(await isEconomyHeld(db, userId))) return;
  if (what === 'gifts') throw new AppError('GIFTS_PAUSED', 403, 'gifts are paused on this account while it is reviewed');
  throw new AppError('REWARDS_PAUSED', 403, 'rewards are paused on this account while it is reviewed');
}
