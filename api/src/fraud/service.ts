import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { WalletService } from '../wallet/service.js';
import { evaluate, type FraudFlag, type FraudSignals, type FraudVerdict } from './rules.js';

type Executor = Pick<pg.PoolClient, 'query'>;

export interface FraudReview {
  id: string;
  userId: string;
  receiptId: string | null;
  flags: FraudFlag[];
  evidence: Record<string, unknown>;
  status: string;
  createdAt: Date;
}

/**
 * Payment-fraud pipeline (KUR-073). Gathers per-account signals, runs the pure
 * rules, and — when a purchase trips a rule — records a review and puts the
 * account on hold so its purchases are withheld (never auto-banned). Admins
 * clear a hold (releasing any held Gems) or confirm it from the review queue.
 */
export class FraudService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
  ) {}

  /** DB-derived signals for an account, read inside the caller's transaction. */
  async gatherSignals(
    client: Executor,
    userId: string,
  ): Promise<Pick<FraudSignals, 'purchasesLastHour' | 'refundsAfterSpend'>> {
    const velocity = await client.query<{ n: number }>(
      `SELECT count(*)::int n FROM iap_receipts
        WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
      [userId],
    );
    const refunds = await client.query<{ n: number }>(
      `SELECT count(*)::int n FROM iap_receipts
        WHERE user_id = $1 AND status = 'refunded' AND clawed_back < gems`,
      [userId],
    );
    return { purchasesLastHour: velocity.rows[0]!.n, refundsAfterSpend: refunds.rows[0]!.n };
  }

  /** Combine DB signals with per-receipt facts and run the rules. */
  async assess(
    client: Executor,
    userId: string,
    facts: { receiptReusedAcrossAccounts: boolean; familyShared: boolean },
  ): Promise<{ verdict: FraudVerdict; signals: FraudSignals }> {
    const base = await this.gatherSignals(client, userId);
    const signals: FraudSignals = { ...base, ...facts };
    return { verdict: evaluate(signals), signals };
  }

  async isHeld(client: Executor, userId: string): Promise<boolean> {
    const r = await client.query(`SELECT 1 FROM account_holds WHERE user_id = $1`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }

  /** Put the account on hold and open a review (inside the caller's txn). */
  async hold(
    client: Executor,
    input: { userId: string; receiptId: string | null; flags: FraudFlag[]; evidence: Record<string, unknown> },
  ): Promise<void> {
    await client.query(
      `INSERT INTO account_holds (user_id, reason) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [input.userId, input.flags.join(',') || 'manual'],
    );
    await client.query(
      `INSERT INTO fraud_reviews (user_id, receipt_id, flags, evidence)
       VALUES ($1, $2, $3, $4)`,
      [input.userId, input.receiptId, JSON.stringify(input.flags), JSON.stringify(input.evidence)],
    );
  }

  /** Open reviews, oldest first — the admin queue (KUR-073). */
  async pendingReviews(): Promise<FraudReview[]> {
    const rows = await this.pool.query<{
      id: string;
      user_id: string;
      receipt_id: string | null;
      flags: FraudFlag[];
      evidence: Record<string, unknown>;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, user_id, receipt_id, flags, evidence, status, created_at
         FROM fraud_reviews WHERE status = 'open' ORDER BY created_at`,
    );
    return rows.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      receiptId: r.receipt_id,
      flags: r.flags,
      evidence: r.evidence,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  /**
   * Resolve a review. 'clear' releases the hold and grants any Gems that were
   * held for it; 'confirm' keeps the hold and leaves the purchase ungranted.
   */
  async resolve(
    reviewId: string,
    decision: 'clear' | 'confirm',
    adminId: string,
  ): Promise<{ status: string; grantedGems: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<{ user_id: string; receipt_id: string | null; status: string }>(
        `SELECT user_id, receipt_id, status FROM fraud_reviews WHERE id = $1 FOR UPDATE`,
        [reviewId],
      );
      const review = res.rows[0];
      if (!review) throw new AppError('REVIEW_NOT_FOUND', 404, 'no such review');
      if (review.status !== 'open') throw new AppError('REVIEW_RESOLVED', 409, 'review already resolved');

      let grantedGems = 0;
      if (decision === 'clear') {
        grantedGems = await this.grantHeldReceipt(client, review.receipt_id);
        // release the hold only if this account has no other open reviews
        await client.query(
          `DELETE FROM account_holds a WHERE a.user_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM fraud_reviews r
                WHERE r.user_id = $1 AND r.status = 'open' AND r.id <> $2
             )`,
          [review.user_id, reviewId],
        );
      }

      await client.query(
        `UPDATE fraud_reviews
            SET status = $2, resolved_at = now(), resolved_by = $3 WHERE id = $1`,
        [reviewId, decision === 'clear' ? 'cleared' : 'confirmed', adminId],
      );
      await client.query('COMMIT');
      return { status: decision === 'clear' ? 'cleared' : 'confirmed', grantedGems };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Grant a previously-held IAP receipt's Gems, idempotently. */
  private async grantHeldReceipt(client: pg.PoolClient, receiptId: string | null): Promise<number> {
    if (!receiptId) return 0;
    const res = await client.query<{
      user_id: string;
      platform: string;
      transaction_id: string;
      gems: number;
      status: string;
    }>(`SELECT user_id, platform, transaction_id, gems, status FROM iap_receipts WHERE id = $1 FOR UPDATE`, [
      receiptId,
    ]);
    const receipt = res.rows[0];
    if (!receipt || receipt.status !== 'held') return 0;
    await this.wallet.creditWithin(client, {
      userId: receipt.user_id,
      currency: 'gems',
      amount: receipt.gems,
      reason: 'iap_purchase',
      idempotencyKey: `iap:${receipt.platform}:${receipt.transaction_id}`,
    });
    await client.query(`UPDATE iap_receipts SET status = 'granted' WHERE id = $1`, [receiptId]);
    return receipt.gems;
  }
}
