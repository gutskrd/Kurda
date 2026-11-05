import type pg from 'pg';
import type { Currency } from './service.js';

/**
 * Does every balance still equal the sum of its ledger?
 *
 * WalletService writes a ledger row and the balance it moves in one statement,
 * so the two can only part if something wrote one of them another way — a hand
 * edit, a script, a bug in a migration. Nothing in the database ties them
 * together after the fact, so this checks: every (person, currency) that has a
 * balance row or ledger rows, with the two compared, in one pass over the
 * ledger. That is cheap enough to run daily (jobs/wallet-jobs.ts) and on
 * demand (`GET /admin/economy/reconcile`), and it only reads.
 *
 * A balance with no ledger rows behind it must be zero, and ledger rows with
 * no balance row must sum to zero; either one otherwise is a mismatch.
 */

export interface WalletMismatch {
  userId: string;
  currency: Currency;
  /** what `wallet_balances` says they hold (0 when there is no row) */
  balance: number;
  /** what their ledger rows add up to */
  ledgerSum: number;
}

export interface ReconcileReport {
  checkedAt: string;
  /** (person, currency) pairs compared */
  checked: number;
  /** how many pairs disagree; `mismatches` lists at most `limit` of them, largest gap first */
  mismatched: number;
  mismatches: WalletMismatch[];
}

/** The most mismatches one report lists; the count is always the whole of it. */
export const RECONCILE_LIST_MAX = 200;

export class WalletReconciler {
  constructor(private readonly pool: Pick<pg.Pool, 'query'>) {}

  /**
   * Compare every balance with its ledger, or only these people's (`userIds`,
   * which a test or an admin looking at one account passes).
   */
  async check(opts: { userIds?: string[]; limit?: number } = {}): Promise<ReconcileReport> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), RECONCILE_LIST_MAX);
    const scoped = opts.userIds !== undefined;
    if (scoped && opts.userIds!.length === 0) {
      return { checkedAt: new Date().toISOString(), checked: 0, mismatched: 0, mismatches: [] };
    }
    const res = await this.pool.query<{
      user_id: string;
      currency: Currency;
      balance: string;
      ledger_sum: string;
      checked: string;
      mismatched: string;
    }>(
      `WITH sums AS (
         SELECT user_id, currency, SUM(amount)::bigint AS ledger_sum
           FROM wallet_ledger
          WHERE ($1::uuid[] IS NULL OR user_id = ANY($1::uuid[]))
          GROUP BY user_id, currency
       ), held AS (
         SELECT user_id, currency, balance::bigint AS balance
           FROM wallet_balances
          WHERE ($1::uuid[] IS NULL OR user_id = ANY($1::uuid[]))
       ), pairs AS (
         SELECT COALESCE(h.user_id, s.user_id) AS user_id, COALESCE(h.currency, s.currency) AS currency,
                COALESCE(h.balance, 0) AS balance, COALESCE(s.ledger_sum, 0) AS ledger_sum
           FROM held h FULL JOIN sums s ON s.user_id = h.user_id AND s.currency = h.currency
       ), wrong AS (
         SELECT * FROM pairs WHERE balance <> ledger_sum
       )
       SELECT w.user_id, w.currency, w.balance::text, w.ledger_sum::text,
              (SELECT count(*) FROM pairs)::text AS checked, (SELECT count(*) FROM wrong)::text AS mismatched
         FROM (SELECT 1) one
         LEFT JOIN LATERAL (
           SELECT * FROM wrong ORDER BY abs(balance - ledger_sum) DESC, user_id, currency LIMIT $2
         ) w ON true`,
      [scoped ? opts.userIds : null, limit],
    );
    const first = res.rows[0];
    return {
      checkedAt: new Date().toISOString(),
      checked: Number(first?.checked ?? 0),
      mismatched: Number(first?.mismatched ?? 0),
      mismatches: res.rows
        .filter((r) => r.user_id !== null)
        .map((r) => ({ userId: r.user_id, currency: r.currency, balance: Number(r.balance), ledgerSum: Number(r.ledger_sum) })),
    };
  }
}
