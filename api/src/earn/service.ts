import type pg from 'pg';
import { DAILY_EARNED_ZER_CAP } from '@kurda/shared';
import { WalletService } from '../wallet/service.js';
import { isEconomyBlocked } from '../economy/standing.js';

/**
 * Earned Zêr: every way of earning goes through `earnWithin`, which pays nobody the economy does not pay
 * (economy/standing.ts) and holds each person to `DAILY_EARNED_ZER_CAP` a UTC day. Purchases, the members' box, refunds
 * and staff adjustments are not earned and are not counted. A few grants are tunable by staff (`earn_rules`: a league
 * promotion, a tournament win); the rest are the shared rules' numbers.
 */

/** Ledger reasons of Zêr earned before this module paid under `earn:` reasons; they count toward the day's cap too. */
export const EARNED_REASONS = ['daily_reward', 'daily_quest', 'tree_harvest', 'event_quest'] as const;

/** The ledger reason for earned Zêr from a source with no reason of its own. */
export const earnReason = (source: string): string => `earn:${source}`;

/** SQL for "this ledger row was earned", over a statement's `reason` column. */
export const EARNED_SQL = `(reason LIKE 'earn:%' OR reason = ANY('{${EARNED_REASONS.join(',')}}'::text[]))`;

export interface EarnRule {
  key: string;
  amount: number;
  /** most Zêr from this rule per person per day; null for no cap beyond the daily one */
  dailyCap: number | null;
  cooldownSeconds: number;
  active: boolean;
}

export interface GrantResult {
  granted: number;
  /** why the full amount was not granted, when it was not */
  cappedBy: 'none' | 'no_rule' | 'duplicate' | 'cooldown' | 'rule_cap' | 'daily_cap' | 'daily_count' | 'restricted';
}

export interface EarnInput {
  userId: string;
  amount: number;
  /** the ledger reason; earned reasons only (`EARNED_REASONS` or `earn:…`) */
  reason: string;
  refId?: string;
  /** ledger keys are unique across everyone, so a key names the person as well as the event */
  idempotencyKey: string;
  /** at most this many payments under `reason` in the UTC day, such as three paid wins */
  perDay?: number;
  /** at most this much under `reason` in the UTC day */
  reasonCap?: number | null;
  /** no payment under `reason` within this many seconds */
  cooldownSeconds?: number;
}

/** The UTC day's start, in SQL, as the earned cap counts days. */
const UTC_DAY = `(date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;

/**
 * Pays earned Zêr inside the caller's open transaction, under the person's Zêr row lock so the day's totals read here
 * hold until the credit. Pays less than asked, or nothing, at the caps; nothing to an account the economy does not pay.
 */
export async function earnWithin(client: pg.PoolClient, wallet: WalletService, input: EarnInput, dailyCap = DAILY_EARNED_ZER_CAP): Promise<GrantResult> {
  const { userId, reason } = input;
  if (!(input.amount > 0)) return { granted: 0, cappedBy: 'none' };
  await client.query(`INSERT INTO wallet_balances (user_id, currency) VALUES ($1, 'zer') ON CONFLICT (user_id, currency) DO NOTHING`, [userId]);
  await client.query(`SELECT 1 FROM wallet_balances WHERE user_id = $1 AND currency = 'zer' FOR UPDATE`, [userId]);
  if (await isEconomyBlocked(client, userId)) return { granted: 0, cappedBy: 'restricted' };

  const totals = await client.query<{ all_today: string; reason_today: string; reason_count: number; recent: boolean }>(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE ${EARNED_SQL}), 0) AS all_today,
            COALESCE(SUM(amount) FILTER (WHERE reason = $2), 0) AS reason_today,
            (count(*) FILTER (WHERE reason = $2))::int AS reason_count,
            COALESCE(bool_or(reason = $2 AND created_at > now() - make_interval(secs => $3)), false) AS recent
       FROM wallet_ledger
      WHERE user_id = $1 AND currency = 'zer' AND amount > 0 AND created_at >= ${UTC_DAY}`,
    [userId, reason, input.cooldownSeconds ?? 0],
  );
  const row = totals.rows[0]!;
  if ((input.cooldownSeconds ?? 0) > 0 && row.recent) return { granted: 0, cappedBy: 'cooldown' };
  if (input.perDay != null && row.reason_count >= input.perDay) return { granted: 0, cappedBy: 'daily_count' };
  const dayLeft = Math.max(0, dailyCap - Number(row.all_today));
  const reasonLeft = input.reasonCap == null ? Infinity : Math.max(0, input.reasonCap - Number(row.reason_today));
  const amount = Math.min(input.amount, dayLeft, reasonLeft);
  if (amount <= 0) return { granted: 0, cappedBy: dayLeft <= 0 ? 'daily_cap' : 'rule_cap' };

  const credit = await wallet.creditWithin(client, { userId, currency: 'zer', amount, reason, refId: input.refId, idempotencyKey: input.idempotencyKey });
  if (credit.duplicate) return { granted: 0, cappedBy: 'duplicate' };
  return { granted: amount, cappedBy: amount < input.amount ? (reasonLeft < input.amount ? 'rule_cap' : 'daily_cap') : 'none' };
}

/** A grant by rule key: what leagues, tournaments, lessons and achievements are given, so they need not know the rules. */
export interface EarnGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<GrantResult>;
}

/**
 * Earned Zêr on its own transaction, and the staff-tunable rules. Rule grants are idempotent per (rule, refId) and land in
 * the ledger as `earn:{key}`.
 */
export class EarnService implements EarnGranter {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService = new WalletService(pool),
    private readonly dailyCap = DAILY_EARNED_ZER_CAP,
  ) {}

  async rules(): Promise<EarnRule[]> {
    const rows = await this.pool.query<{ key: string; amount: number; daily_cap: number | null; cooldown_seconds: number; active: boolean }>(
      `SELECT key, amount, daily_cap, cooldown_seconds, active FROM earn_rules ORDER BY key`,
    );
    return rows.rows.map((r) => ({ key: r.key, amount: r.amount, dailyCap: r.daily_cap, cooldownSeconds: r.cooldown_seconds, active: r.active }));
  }

  /** Staff: create or update a rule. */
  async upsertRule(rule: EarnRule): Promise<void> {
    await this.pool.query(
      `INSERT INTO earn_rules (key, amount, daily_cap, cooldown_seconds, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (key) DO UPDATE SET
         amount = EXCLUDED.amount, daily_cap = EXCLUDED.daily_cap,
         cooldown_seconds = EXCLUDED.cooldown_seconds, active = EXCLUDED.active, updated_at = now()`,
      [rule.key, rule.amount, rule.dailyCap, rule.cooldownSeconds, rule.active],
    );
  }

  /** Runs `work` in a transaction of its own. */
  async within<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await work(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Pays earned Zêr in the caller's transaction, under the daily cap. */
  payWithin(client: pg.PoolClient, input: EarnInput): Promise<GrantResult> {
    return earnWithin(client, this.wallet, input, this.dailyCap);
  }

  /** Pays earned Zêr in a transaction of its own. */
  pay(input: EarnInput): Promise<GrantResult> {
    return this.within((client) => this.payWithin(client, input));
  }

  /** Pays a rule's amount, keyed on `refId`: nothing for an unknown or switched-off rule, on cooldown, capped, or paid before. */
  async grant(userId: string, ruleKey: string, refId: string): Promise<GrantResult> {
    const ruleRow = await this.pool.query<{ amount: number; daily_cap: number | null; cooldown_seconds: number }>(
      `SELECT amount, daily_cap, cooldown_seconds FROM earn_rules WHERE key = $1 AND active = true`,
      [ruleKey],
    );
    const rule = ruleRow.rows[0];
    if (!rule) return { granted: 0, cappedBy: 'no_rule' };
    return this.pay({
      userId,
      amount: rule.amount,
      reason: earnReason(ruleKey),
      idempotencyKey: `earn:${ruleKey}:${refId}`,
      reasonCap: rule.daily_cap,
      cooldownSeconds: rule.cooldown_seconds,
    });
  }
}
