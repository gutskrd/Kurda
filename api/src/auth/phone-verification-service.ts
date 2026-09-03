import { createHash, randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  canResend,
  startVerification,
  verifyCode,
  remainingAttempts,
  CODE_TTL_MS,
  type VerificationState,
} from './phone-verification.js';
import { maskE164, normalizeE164 } from './phone-number.js';
import type { SmsSender } from './sms.js';

export type SendResult =
  | { ok: true; masked: string; resent: boolean }
  | { ok: false; reason: 'invalid-number' | 'cooldown' | 'max-sends'; retryAfterMs?: number };

export type VerifyResultOut =
  | { ok: true; masked: string }
  | { ok: false; reason: 'no-session' | 'wrong-number' | 'too-many-attempts' | 'expired' | 'mismatch'; remaining?: number };

interface Row {
  phone_hash: string;
  phone_masked: string;
  code_hash: string;
  attempts: number;
  sends: number;
  last_sent_at: Date;
  expires_at: Date;
}

/**
 * Optional SMS phone verification (KUR-297). Wraps the pure OTP state machine
 * (`phone-verification.ts`) with persistence + a provider-agnostic SMS sender.
 *
 * Privacy-minimized: the raw number is **never stored** — only a hash (for the
 * accounts-per-number cap + recycle detection) and a masked display form. The
 * client re-supplies the number on each `send`, so a resend (same in-flight
 * number) is detected by hash and gated by the pure cooldown / send-cap; a new
 * number starts a fresh session. A verified phone raises trust (#295) and is
 * exported/deleted with the account (#024).
 */
export class PhoneVerificationService {
  private readonly pool: pg.Pool;
  private readonly sms: SmsSender;
  private readonly now: () => number;

  constructor(pool: pg.Pool, deps: { sms: SmsSender; now?: () => number }) {
    this.pool = pool;
    this.sms = deps.sms;
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Send a code to `rawPhone`. First send for a number starts a session; sending
   * again to the same in-flight number is a resend (cooldown + per-session cap
   * from the pure core). Switching numbers replaces the session.
   */
  async send(userId: string, rawPhone: string): Promise<SendResult> {
    const e164 = normalizeE164(rawPhone);
    if (!e164) return { ok: false, reason: 'invalid-number' };
    const phoneHash = hash(e164);
    const masked = maskE164(e164);
    const now = this.now();

    // A number verifies at most ONE account at a time: verifying detaches it
    // from any prior holder (recycle). That exclusivity is the anti-farm lever —
    // a number can't keep many accounts verified — so no separate send-time cap
    // is needed; SMS-send abuse is bounded by the per-user/IP rate limit (#010).
    const existing = await this.load(userId);
    const code = genCode();
    let state: VerificationState;
    let resent = false;

    if (existing && existing.phone_hash === phoneHash && existing.expires_at.getTime() > now) {
      // resend to the same number — enforce cooldown + send cap
      const check = canResend(toState(existing), now);
      if (!check.allowed) {
        return check.reason === 'cooldown'
          ? { ok: false, reason: 'cooldown', retryAfterMs: check.retryAfterMs }
          : { ok: false, reason: 'max-sends' };
      }
      state = {
        codeHash: hash(code),
        expiresAt: now + CODE_TTL_MS,
        attempts: 0,
        sends: existing.sends + 1,
        lastSentAt: now,
      };
      resent = true;
    } else {
      state = startVerification(hash(code), now);
    }

    await this.upsert(userId, phoneHash, masked, state);
    await this.sms.send(e164, smsBody(code));
    return { ok: true, masked, resent };
  }

  /**
   * Verify a code for `rawPhone`. On success the account's phone is marked
   * verified (and the number is detached from any prior account — recycling).
   */
  async verify(userId: string, rawPhone: string, code: string): Promise<VerifyResultOut> {
    const row = await this.load(userId);
    if (!row) return { ok: false, reason: 'no-session' };
    const e164 = normalizeE164(rawPhone);
    if (!e164 || hash(e164) !== row.phone_hash) return { ok: false, reason: 'wrong-number' };

    const result = verifyCode(toState(row), hash(code), this.now());
    if (!result.ok) {
      await this.pool.query(`UPDATE phone_verifications SET attempts = $2 WHERE user_id = $1`, [
        userId,
        result.state.attempts,
      ]);
      return { ok: false, reason: result.reason, remaining: remainingAttempts(result.state) };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // number recycling: reclaiming a recycled number detaches it from any
      // prior account that still holds it.
      await client.query(
        `UPDATE users SET phone_verified_at = NULL, phone_hash = NULL, phone_masked = NULL
         WHERE phone_hash = $1 AND id <> $2`,
        [row.phone_hash, userId],
      );
      await client.query(
        `UPDATE users SET phone_verified_at = now(), phone_hash = $2, phone_masked = $3 WHERE id = $1`,
        [userId, row.phone_hash, row.phone_masked],
      );
      await client.query(`DELETE FROM phone_verifications WHERE user_id = $1`, [userId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { ok: true, masked: row.phone_masked };
  }

  /** Remove a verified phone from the account (user-initiated). */
  async remove(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET phone_verified_at = NULL, phone_hash = NULL, phone_masked = NULL WHERE id = $1`,
      [userId],
    );
    await this.pool.query(`DELETE FROM phone_verifications WHERE user_id = $1`, [userId]);
  }

  /** Current verification status for display. */
  async status(userId: string): Promise<{ verified: boolean; masked: string | null }> {
    const res = await this.pool.query<{ phone_verified_at: Date | null; phone_masked: string | null }>(
      `SELECT phone_verified_at, phone_masked FROM users WHERE id = $1`,
      [userId],
    );
    const row = res.rows[0];
    return { verified: !!row?.phone_verified_at, masked: row?.phone_masked ?? null };
  }

  private async upsert(userId: string, phoneHash: string, masked: string, state: VerificationState): Promise<void> {
    await this.pool.query(
      `INSERT INTO phone_verifications (user_id, phone_hash, phone_masked, code_hash, attempts, sends, last_sent_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0),to_timestamp($8/1000.0))
       ON CONFLICT (user_id) DO UPDATE SET
         phone_hash = EXCLUDED.phone_hash, phone_masked = EXCLUDED.phone_masked,
         code_hash = EXCLUDED.code_hash, attempts = EXCLUDED.attempts, sends = EXCLUDED.sends,
         last_sent_at = EXCLUDED.last_sent_at, expires_at = EXCLUDED.expires_at`,
      [userId, phoneHash, masked, state.codeHash, state.attempts, state.sends, state.lastSentAt, state.expiresAt],
    );
  }

  private async load(userId: string): Promise<Row | null> {
    const res = await this.pool.query<Row>(
      `SELECT phone_hash, phone_masked, code_hash, attempts, sends, last_sent_at, expires_at
       FROM phone_verifications WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0] ?? null;
  }
}

function toState(row: Row): VerificationState {
  return {
    codeHash: row.code_hash,
    expiresAt: row.expires_at.getTime(),
    attempts: row.attempts,
    sends: row.sends,
    lastSentAt: row.last_sent_at.getTime(),
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** A 6-digit numeric code (cryptographically random, zero-padded). */
function genCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function smsBody(code: string): string {
  return `Your MyKurda verification code is ${code}. It expires in 10 minutes.`;
}
