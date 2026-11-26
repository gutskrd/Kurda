import type pg from 'pg';
import { AppError } from '../plugins/errors.js';

/** Zêr is the only currency; the ledger keeps the retired Gewher's history (migration 1751000830000), nothing writes it. */
export type Currency = 'zer';

export class InsufficientFundsError extends AppError {
  constructor() {
    super('INSUFFICIENT_FUNDS', 402, 'not enough Zêr');
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
}

/** The most one ledger row may move, the dearest shop price; the database holds the same bound (migration 1751000214000). */
export const MAX_LEDGER_AMOUNT = 10_000_000;
/** The most a balance may reach — far past anything earned by playing; the database holds it too. */
export const MAX_BALANCE = 1_000_000_000;

function assertValidOperation(op: WalletOperation): void {
  if (!Number.isInteger(op.amount) || op.amount <= 0) {
    throw new Error(`wallet amounts must be positive integers, got ${op.amount}`);
  }
  if (op.amount > MAX_LEDGER_AMOUNT) {
    throw new Error(`a wallet amount may be at most ${MAX_LEDGER_AMOUNT}, got ${op.amount}`);
  }
  if (op.reason.length === 0 || op.reason.length > 100) {
    throw new Error('a wallet change needs a reason code of 1 to 100 characters');
  }
}

/**
 * The only writer of wallet state. Every change is one transaction with exactly one append-only ledger row and the
 * balance update; debits take a row lock, so concurrent spends serialize and never go negative.
 */
export class WalletService {
  constructor(private readonly pool: pg.Pool) {}

  async credit(op: WalletOperation): Promise<OperationResult> {
    assertValidOperation(op);
    return this.apply(op, op.amount);
  }

  async debit(op: WalletOperation): Promise<OperationResult> {
    assertValidOperation(op);
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
   * Debits inside the caller's transaction, so the debit and what it pays for commit or roll back together. Throws
   * InsufficientFundsError on overdraw; `duplicate: true` when the idempotency key was already used.
   */
  async debitWithin(client: pg.PoolClient, op: WalletOperation): Promise<{ balance: number; duplicate: boolean }> {
    assertValidOperation(op);
    return this.step(client, op, -op.amount);
  }

  /** Credits inside the caller's transaction, so a grant and its receipt commit together; `duplicate: true` when the key was already used. */
  async creditWithin(client: pg.PoolClient, op: WalletOperation): Promise<{ balance: number; duplicate: boolean }> {
    assertValidOperation(op);
    return this.step(client, op, op.amount);
  }

  /** The lock, ledger and balance step on the caller's client, inside an open transaction; it never commits or rolls back. */
  private async step(
    client: pg.PoolClient,
    op: WalletOperation,
    signedAmount: number,
  ): Promise<{ balance: number; duplicate: boolean }> {
    // Lock the balance row, serializing operations per user and currency; it almost always exists, so it is created and
    // locked again only when missing.
    const lock = () =>
      client.query<{ balance: number }>(
        `SELECT balance FROM wallet_balances
         WHERE user_id = $1 AND currency = $2 FOR UPDATE`,
        [op.userId, op.currency],
      );
    let locked = await lock();
    if (locked.rows.length === 0) {
      await client.query(
        `INSERT INTO wallet_balances (user_id, currency) VALUES ($1, $2)
         ON CONFLICT (user_id, currency) DO NOTHING`,
        [op.userId, op.currency],
      );
      locked = await lock();
    }
    const current = (locked.rows[0] as { balance: number }).balance;

    const next = current + signedAmount;
    if (next > MAX_BALANCE) {
      throw new AppError('BALANCE_LIMIT', 409, `a balance may hold at most ${MAX_BALANCE.toLocaleString('en')}`);
    }
    if (next < 0) {
      // Refused, unless the key was already used, which answers as a duplicate: the ledger is checked before the balance.
      if (op.idempotencyKey) {
        const seen = await client.query(`SELECT 1 FROM wallet_ledger WHERE idempotency_key = $1`, [op.idempotencyKey]);
        if ((seen.rowCount ?? 0) > 0) return { balance: current, duplicate: true };
      }
      throw new InsufficientFundsError();
    }
    // The ledger row and balance in one statement: the balance moves only when the row was inserted (a used key inserts
    // nothing; no key never conflicts).
    const wrote = await client.query(
      `WITH ins AS (
         INSERT INTO wallet_ledger (user_id, currency, amount, reason, ref_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING 1
       )
       UPDATE wallet_balances SET balance = $7, updated_at = now()
        WHERE user_id = $1 AND currency = $2 AND EXISTS (SELECT 1 FROM ins)`,
      [op.userId, op.currency, signedAmount, op.reason, op.refId ?? null, op.idempotencyKey ?? null, next],
    );
    if ((wrote.rowCount ?? 0) === 0) {
      return { balance: current, duplicate: true };
    }
    return { balance: next, duplicate: false };
  }

  async balances(userId: string): Promise<Balances> {
    const rows = await this.pool.query<{ balance: number }>(
      `SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'zer'`,
      [userId],
    );
    return { zer: rows.rows[0]?.balance ?? 0 };
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
       FROM wallet_ledger WHERE user_id = $1 AND currency = 'zer'
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
