import type pg from 'pg';
import { AppError } from '../plugins/errors.js';

export type Currency = 'zer' | 'gems';

export class InsufficientFundsError extends AppError {
  constructor(currency: Currency) {
    super('INSUFFICIENT_FUNDS', 402, `not enough ${currency === 'zer' ? 'Zêr' : 'Gems'}`);
  }
}

export interface WalletOperation {
  userId: string;
  currency: Currency;
  /** Always positive; credit/debit picks the sign. */
  amount: number;
  /** Ledger reason code: 'daily_reward', 'shop_purchase', 'admin_adjustment', ... */
  reason: string;
  refId?: string;
  /** Callers MUST supply one for anything retryable (jobs, HTTP retries). */
  idempotencyKey?: string;
}

export interface OperationResult {
  applied: boolean;
  /** true when the idempotency key had already been processed. */
  duplicate: boolean;
  balance: number;
}

export interface Balances {
  zer: number;
  gems: number;
}

function assertValidAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`wallet amounts must be positive integers, got ${amount}`);
  }
}

/**
 * The only writer of wallet state (KUR-066). Every change is one
 * transaction containing exactly one append-only ledger row plus the
 * balance materialization; debits take a row lock so concurrent spends
 * serialize and can never drive a balance negative.
 */
export class WalletService {
  constructor(private readonly pool: pg.Pool) {}

  async credit(op: WalletOperation): Promise<OperationResult> {
    assertValidAmount(op.amount);
    return this.apply(op, op.amount);
  }

  async debit(op: WalletOperation): Promise<OperationResult> {
    assertValidAmount(op.amount);
    return this.apply(op, -op.amount);
  }

  private async apply(op: WalletOperation, signedAmount: number): Promise<OperationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.step(client, op, signedAmount);
      if (result.duplicate) {
        await client.query('ROLLBACK');
        return { applied: false, duplicate: true, balance: result.balance };
      }
      await client.query('COMMIT');
      return { applied: true, duplicate: false, balance: result.balance };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Debit inside a transaction the caller owns (KUR-071 purchase flow), so the
   * debit and whatever it pays for (e.g. an inventory grant) commit or roll
   * back together. Throws InsufficientFundsError on overdraw; returns
   * `duplicate: true` when the idempotency key was already processed.
   */
  async debitWithin(client: pg.PoolClient, op: WalletOperation): Promise<{ balance: number; duplicate: boolean }> {
    assertValidAmount(op.amount);
    return this.step(client, op, -op.amount);
  }

  /**
   * Credit inside a transaction the caller owns (KUR-072 IAP grant), so the
   * gem grant and the receipt record commit together. Returns `duplicate: true`
   * when the idempotency key was already processed.
   */
  async creditWithin(client: pg.PoolClient, op: WalletOperation): Promise<{ balance: number; duplicate: boolean }> {
    assertValidAmount(op.amount);
    return this.step(client, op, op.amount);
  }

  /**
   * The core lock → ledger → balance step, on a caller-provided client. Assumes
   * a transaction is already open; never commits or rolls back itself.
   */
  private async step(
    client: pg.PoolClient,
    op: WalletOperation,
    signedAmount: number,
  ): Promise<{ balance: number; duplicate: boolean }> {
    // lazy balance row + lock — serializes concurrent ops per (user, currency)
    await client.query(
      `INSERT INTO wallet_balances (user_id, currency) VALUES ($1, $2)
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [op.userId, op.currency],
    );
    const locked = await client.query<{ balance: number }>(
      `SELECT balance FROM wallet_balances
       WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
      [op.userId, op.currency],
    );
    const current = (locked.rows[0] as { balance: number }).balance;

    if (op.idempotencyKey) {
      const inserted = await client.query(
        `INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [op.userId, op.currency, signedAmount, op.reason, op.refId ?? null, op.idempotencyKey],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        return { balance: current, duplicate: true };
      }
    } else {
      await client.query(
        `INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [op.userId, op.currency, signedAmount, op.reason, op.refId ?? null],
      );
    }

    const next = current + signedAmount;
    if (next < 0) {
      throw new InsufficientFundsError(op.currency);
    }
    await client.query(
      `UPDATE wallet_balances SET balance = $3, updated_at = now()
       WHERE user_id = $1 AND currency = $2`,
      [op.userId, op.currency, next],
    );
    return { balance: next, duplicate: false };
  }

  async balances(userId: string): Promise<Balances> {
    const rows = await this.pool.query<{ currency: Currency; balance: number }>(
      `SELECT currency, balance FROM wallet_balances WHERE user_id = $1`,
      [userId],
    );
    const result: Balances = { zer: 0, gems: 0 };
    for (const row of rows.rows) result[row.currency] = row.balance;
    return result;
  }

  async history(userId: string, limit = 50) {
    const rows = await this.pool.query<{
      currency: Currency;
      amount: number;
      reason: string;
      ref_id: string | null;
      created_at: Date;
    }>(
      `SELECT currency, amount, reason, ref_id, created_at
       FROM wallet_ledger WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(limit, 200)],
    );
    return rows.rows.map((row) => ({
      currency: row.currency,
      amount: row.amount,
      reason: row.reason,
      refId: row.ref_id,
      at: new Date(row.created_at).toISOString(),
    }));
  }

  /** Audit invariant: the materialized balance equals the ledger sum. */
  async verifyConsistency(userId: string, currency: Currency): Promise<boolean> {
    const result = await this.pool.query<{ ledger_sum: string | null; balance: number | null }>(
      `SELECT
         (SELECT COALESCE(SUM(amount), 0) FROM wallet_ledger
          WHERE user_id = $1 AND currency = $2) AS ledger_sum,
         (SELECT balance FROM wallet_balances
          WHERE user_id = $1 AND currency = $2) AS balance`,
      [userId, currency],
    );
    const row = result.rows[0] as { ledger_sum: string | null; balance: number | null };
    return Number(row.ledger_sum ?? 0) === (row.balance ?? 0);
  }
}
