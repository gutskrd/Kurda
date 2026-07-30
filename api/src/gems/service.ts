import type pg from 'pg';
import { WalletService } from '../wallet/service.js';

/** Safety guardrail: max Gems any one user can earn in a UTC day, across rules. */
export const DEFAULT_GLOBAL_DAILY_CAP = 200;

export interface GemRule {
  key: string;
  amount: number;
  dailyCap: number | null;
  cooldownSeconds: number;
  active: boolean;
}

export interface GrantResult {
  granted: number;
  /** why the full amount wasn't granted, when it wasn't. */
  cappedBy: 'none' | 'no_rule' | 'duplicate' | 'cooldown' | 'rule_cap' | 'global_cap';
}

const REASON = (key: string): string => `gem_earn:${key}`;

/**
 * Config-driven Gem grants (KUR-068). Amounts, per-rule daily caps, and
 * cooldowns all come from the `gem_rules` table (no hardcoded amounts). Every
 * grant is idempotent per `(rule, refId)` so a re-triggered achievement or data
 * backfill can't double-pay, and a per-user global daily cap bounds total
 * earning. Grants land in the append-only wallet ledger.
 */
export class GemService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly globalDailyCap = DEFAULT_GLOBAL_DAILY_CAP,
  ) {}

  async rules(): Promise<GemRule[]> {
    const rows = await this.pool.query<{
      key: string;
      amount: number;
      daily_cap: number | null;
      cooldown_seconds: number;
      active: boolean;
    }>(`SELECT key, amount, daily_cap, cooldown_seconds, active FROM gem_rules ORDER BY key`);
    return rows.rows.map((r) => ({
      key: r.key,
      amount: r.amount,
      dailyCap: r.daily_cap,
      cooldownSeconds: r.cooldown_seconds,
      active: r.active,
    }));
  }

  /** Admin: create/update a rule. */
  async upsertRule(rule: GemRule): Promise<void> {
    await this.pool.query(
      `INSERT INTO gem_rules (key, amount, daily_cap, cooldown_seconds, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (key) DO UPDATE SET
         amount = EXCLUDED.amount, daily_cap = EXCLUDED.daily_cap,
         cooldown_seconds = EXCLUDED.cooldown_seconds, active = EXCLUDED.active, updated_at = now()`,
      [rule.key, rule.amount, rule.dailyCap, rule.cooldownSeconds, rule.active],
    );
  }

  /**
   * Grant Gems for a rule to a user, keyed on `refId` for idempotency. Returns
   * how many were actually granted (0 when capped, on cooldown, unknown rule,
   * or already granted for this refId).
   */
  async grant(userId: string, ruleKey: string, refId: string): Promise<GrantResult> {
    const ruleRow = await this.pool.query<{ amount: number; daily_cap: number | null; cooldown_seconds: number }>(
      `SELECT amount, daily_cap, cooldown_seconds FROM gem_rules WHERE key = $1 AND active = true`,
      [ruleKey],
    );
    const rule = ruleRow.rows[0];
    if (!rule) return { granted: 0, cappedBy: 'no_rule' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // serialize this user's Gem grants so cap reads are consistent
      await client.query(
        `INSERT INTO wallet_balances (user_id, currency) VALUES ($1, 'gems')
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [userId],
      );
      await client.query(
        `SELECT 1 FROM wallet_balances WHERE user_id = $1 AND currency = 'gems' FOR UPDATE`,
        [userId],
      );

      // cooldown: has this rule paid out recently?
      if (rule.cooldown_seconds > 0) {
        const recent = await client.query(
          `SELECT 1 FROM wallet_ledger
             WHERE user_id = $1 AND currency = 'gems' AND reason = $2
               AND created_at > now() - ($3 || ' seconds')::interval
             LIMIT 1`,
          [userId, REASON(ruleKey), String(rule.cooldown_seconds)],
        );
        if ((recent.rowCount ?? 0) > 0) {
          await client.query('COMMIT');
          return { granted: 0, cappedBy: 'cooldown' };
        }
      }

      // today's earned totals (UTC day) for the caps
      const totals = await client.query<{ all_today: string; rule_today: string }>(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE reason LIKE 'gem_earn:%'), 0) AS all_today,
           COALESCE(SUM(amount) FILTER (WHERE reason = $2), 0) AS rule_today
         FROM wallet_ledger
        WHERE user_id = $1 AND currency = 'gems' AND amount > 0
          AND created_at >= date_trunc('day', now())`,
        [userId, REASON(ruleKey)],
      );
      const allToday = Number(totals.rows[0]!.all_today);
      const ruleToday = Number(totals.rows[0]!.rule_today);

      const globalRemaining = Math.max(0, this.globalDailyCap - allToday);
      const ruleRemaining = rule.daily_cap == null ? Infinity : Math.max(0, rule.daily_cap - ruleToday);
      const grantAmount = Math.min(rule.amount, globalRemaining, ruleRemaining);

      if (grantAmount <= 0) {
        await client.query('COMMIT');
        return { granted: 0, cappedBy: globalRemaining <= 0 ? 'global_cap' : 'rule_cap' };
      }

      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: 'gems',
        amount: grantAmount,
        reason: REASON(ruleKey),
        idempotencyKey: `gem:${ruleKey}:${refId}`,
      });
      await client.query('COMMIT');
      if (credit.duplicate) return { granted: 0, cappedBy: 'duplicate' };
      return { granted: grantAmount, cappedBy: grantAmount < rule.amount ? (ruleRemaining < rule.amount ? 'rule_cap' : 'global_cap') : 'none' };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
