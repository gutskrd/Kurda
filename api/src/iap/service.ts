import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { WalletService } from '../wallet/service.js';
import type { AppConfig } from '../config/env.js';
import type { FraudService } from '../fraud/service.js';
import type { IapPlatform, ReceiptVerifier } from './verifier.js';

export interface RedeemResult {
  granted: boolean;
  /** true when this receipt was already processed (restore / retry). */
  duplicate: boolean;
  /** true when fraud rules held the purchase for review (KUR-073). */
  held: boolean;
  gems: number;
  balance: number;
}

export interface GemPackInput {
  platform: IapPlatform;
  productId: string;
  gems: number;
  active?: boolean;
}

interface ReceiptRow {
  id: string;
  user_id: string;
  gems: number;
  status: string;
}

/**
 * In-app purchase redemption (KUR-072). A receipt is validated server-to-server,
 * stored (unique per store transaction), and the Gems granted atomically with
 * the receipt record. Duplicate transactions are rejected/ignored idempotently
 * so restore-purchases and dropped responses reconcile safely; refund webhooks
 * claw back the Gems still available.
 */
export class IapService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly wallet: WalletService,
    private readonly verifier: ReceiptVerifier,
    private readonly config: AppConfig,
    private readonly fraud: FraudService,
  ) {}

  /** Admin: upsert a gem pack (store product → Gem amount). */
  async createPack(input: GemPackInput): Promise<void> {
    if (input.gems <= 0) throw new AppError('BAD_PACK', 400, 'gems must be > 0');
    await this.pool.query(
      `INSERT INTO gem_packs (platform, product_id, gems, active)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (platform, product_id)
       DO UPDATE SET gems = EXCLUDED.gems, active = EXCLUDED.active`,
      [input.platform, input.productId, input.gems, input.active ?? true],
    );
  }

  async redeem(
    userId: string,
    platform: IapPlatform,
    token: string,
    productId: string,
  ): Promise<RedeemResult> {
    const verified = await this.verifier.verify(platform, token, productId);
    if (!verified.valid || !verified.transactionId) {
      throw new AppError('INVALID_RECEIPT', 400, 'receipt failed validation');
    }
    // never accept sandbox receipts on the live store
    if (this.config.NODE_ENV === 'production' && verified.environment !== 'production') {
      throw new AppError('WRONG_ENVIRONMENT', 400, 'sandbox receipt rejected in production');
    }

    const pack = await this.pool.query<{ gems: number }>(
      `SELECT gems FROM gem_packs WHERE platform = $1 AND product_id = $2 AND active = true`,
      [platform, verified.productId],
    );
    const gems = pack.rows[0]?.gems;
    if (!gems) throw new AppError('UNKNOWN_PRODUCT', 400, 'no active pack for that product');

    const familyShared = verified.ownershipType === 'family_shared';
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // one grant per store transaction, ever
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO iap_receipts (user_id, platform, transaction_id, product_id, environment, gems)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (platform, transaction_id) DO NOTHING
         RETURNING id`,
        [userId, platform, verified.transactionId, verified.productId, verified.environment, gems],
      );

      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<{ user_id: string; status: string; gems: number }>(
          `SELECT user_id, status, gems FROM iap_receipts WHERE platform = $1 AND transaction_id = $2`,
          [platform, verified.transactionId],
        );
        const prior = existing.rows[0];
        const otherAccount = prior != null && prior.user_id !== userId;

        // a DIFFERENT account submitting this same transaction is receipt reuse
        if (otherAccount && !familyShared) {
          const { verdict, signals } = await this.fraud.assess(client, userId, {
            receiptReusedAcrossAccounts: true,
            familyShared,
          });
          await this.fraud.hold(client, {
            userId,
            receiptId: null,
            flags: verdict.flags,
            evidence: { ...signals, transactionId: verified.transactionId, reusedFrom: prior!.user_id },
          });
          await client.query('COMMIT');
          return { granted: false, duplicate: true, held: true, gems, balance: (await this.wallet.balances(userId)).gems };
        }
        await client.query('COMMIT');
        // family-shared replay by another member: legitimate, but nothing is
        // granted here (the original account owns it). Same-account retry/
        // restore reconciles to whatever the receipt's real state is.
        return {
          granted: otherAccount ? false : prior?.status === 'granted',
          duplicate: true,
          held: otherAccount ? false : prior?.status === 'held',
          gems: prior?.gems ?? gems,
          balance: (await this.wallet.balances(userId)).gems,
        };
      }

      // fresh transaction: run fraud rules (and honour an existing account hold)
      const receiptId = inserted.rows[0]!.id;
      const { verdict, signals } = await this.fraud.assess(client, userId, {
        receiptReusedAcrossAccounts: false,
        familyShared,
      });
      const alreadyHeld = await this.fraud.isHeld(client, userId);
      if (verdict.hold || alreadyHeld) {
        await client.query(`UPDATE iap_receipts SET status = 'held' WHERE id = $1`, [receiptId]);
        await this.fraud.hold(client, {
          userId,
          receiptId,
          flags: verdict.flags,
          evidence: { ...signals, transactionId: verified.transactionId, priorHold: alreadyHeld },
        });
        await client.query('COMMIT');
        return { granted: false, duplicate: false, held: true, gems, balance: (await this.wallet.balances(userId)).gems };
      }

      const credit = await this.wallet.creditWithin(client, {
        userId,
        currency: 'gems',
        amount: gems,
        reason: 'iap_purchase',
        idempotencyKey: `iap:${platform}:${verified.transactionId}`,
      });
      await client.query('COMMIT');
      return { granted: true, duplicate: false, held: false, gems, balance: credit.balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Refund clawback (webhook). Marks the receipt refunded and debits the Gems
   * still in the wallet — capped at the balance, since the user may have spent
   * some (the shortfall is recorded in `clawed_back`). Idempotent per receipt.
   */
  async refund(platform: IapPlatform, transactionId: string): Promise<{ found: boolean; clawedBack: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<ReceiptRow>(
        `SELECT id, user_id, gems, status FROM iap_receipts
           WHERE platform = $1 AND transaction_id = $2 FOR UPDATE`,
        [platform, transactionId],
      );
      const receipt = res.rows[0];
      if (!receipt) {
        await client.query('COMMIT');
        return { found: false, clawedBack: 0 };
      }
      if (receipt.status === 'refunded') {
        await client.query('COMMIT');
        return { found: true, clawedBack: 0 };
      }

      // claw back what's still there (never drive the balance negative)
      await client.query(
        `INSERT INTO wallet_balances (user_id, currency) VALUES ($1, 'gems')
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [receipt.user_id],
      );
      const bal = await client.query<{ balance: number }>(
        `SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'gems' FOR UPDATE`,
        [receipt.user_id],
      );
      const available = bal.rows[0]?.balance ?? 0;
      const clawback = Math.min(available, receipt.gems);
      if (clawback > 0) {
        await this.wallet.debitWithin(client, {
          userId: receipt.user_id,
          currency: 'gems',
          amount: clawback,
          reason: 'iap_refund',
          idempotencyKey: `iap-refund:${platform}:${transactionId}`,
        });
      }
      await client.query(
        `UPDATE iap_receipts SET status = 'refunded', refunded_at = now(), clawed_back = $2 WHERE id = $1`,
        [receipt.id, clawback],
      );
      await client.query('COMMIT');
      return { found: true, clawedBack: clawback };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** The caller's receipts — the client reconciles restore-purchases against this. */
  async receipts(userId: string): Promise<
    Array<{ transactionId: string; productId: string; gems: number; status: string; createdAt: Date }>
  > {
    const rows = await this.pool.query<{
      transaction_id: string;
      product_id: string;
      gems: number;
      status: string;
      created_at: Date;
    }>(
      `SELECT transaction_id, product_id, gems, status, created_at
         FROM iap_receipts WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.rows.map((r) => ({
      transactionId: r.transaction_id,
      productId: r.product_id,
      gems: r.gems,
      status: r.status,
      createdAt: r.created_at,
    }));
  }
}
