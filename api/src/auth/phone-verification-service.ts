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
import { phoneHash, phoneHashCandidates } from '../moderation/identity-hash.js';
import { availableSql } from '../moderation/availability.js';
import { isReturningIdentity } from '../moderation/returns.js';

export type SendResult =
  | { ok: true; masked: string; resent: boolean }
  | { ok: false; reason: 'invalid-number' | 'cooldown' | 'max-sends' | 'unavailable'; retryAfterMs?: number };

export type VerifyResultOut =
  | { ok: true; masked: string }
  | { ok: false; reason: 'no-session' | 'wrong-number' | 'too-many-attempts' | 'expired' | 'mismatch' | 'unavailable'; remaining?: number };

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
 * Optional SMS phone verification: the pure OTP state machine (`phone-verification.ts`) with persistence and a
 * provider-agnostic SMS sender.
 *
 * The raw number is never stored, only a keyed hash (moderation/identity-hash.ts; for the accounts-per-number rule and
 * recycle detection) and a masked display form. Numbers stored before the hash was keyed are a plain SHA-256: they are
 * matched too, and rewritten keyed when the number is verified again. Clients resend the number on each `send`, so a
 * resend to the same in-flight number is detected by hash and gated by the cooldown and send cap; a new number starts a
 * fresh session. A verified phone raises trust and is exported and deleted with the account.
 *
 * A suspended or banned person's number is never taken from them by verifying it elsewhere, nor verified on another
 * account while the ban stands (the registry keeps it after their account is deleted): `unavailable`, and no code is
 * sent for it.
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
   * Send a code to `rawPhone`. A first send starts a session; sending again to the same in-flight number is a resend
   * (cooldown and per-session cap); a different number replaces the session.
   */
  async send(userId: string, rawPhone: string): Promise<SendResult> {
    const e164 = normalizeE164(rawPhone);
    if (!e164) return { ok: false, reason: 'invalid-number' };
    if (await this.heldByBanned(userId, e164)) return { ok: false, reason: 'unavailable' };
    const keyed = phoneHash(e164);
    const candidates = phoneHashCandidates(e164);
    const masked = maskE164(e164);
    const now = this.now();

    // A number verifies at most ONE account at a time: verifying detaches it from any prior holder (recycle). That
    // exclusivity is the anti-farm lever, so no send-time cap is needed; send abuse is bounded by the per-user/IP limit.
    const existing = await this.load(userId);
    const code = genCode();
    let state: VerificationState;
    let resent = false;

    if (existing && candidates.includes(existing.phone_hash) && existing.expires_at.getTime() > now) {
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

    await this.upsert(userId, keyed, masked, state);
    await this.sms.send(e164, smsBody(code));
    return { ok: true, masked, resent };
  }

  /** Verify a code for `rawPhone`. On success the phone is marked verified and detached from any previous account. */
  async verify(userId: string, rawPhone: string, code: string): Promise<VerifyResultOut> {
    const row = await this.load(userId);
    if (!row) return { ok: false, reason: 'no-session' };
    const e164 = normalizeE164(rawPhone);
    if (!e164 || !phoneHashCandidates(e164).includes(row.phone_hash)) return { ok: false, reason: 'wrong-number' };
    // checked again here: a ban may have come in since the code was sent
    if (await this.heldByBanned(userId, e164)) return { ok: false, reason: 'unavailable' };

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
      // number recycling: reclaiming a recycled number detaches it from any prior account that still holds it, in any
      // stored form, except a suspended or banned one's (refused above)
      await client.query(
        `UPDATE users SET phone_verified_at = NULL, phone_hash = NULL, phone_masked = NULL
         WHERE phone_hash = ANY($1::text[]) AND id <> $2 AND ${availableSql('users')}`,
        [phoneHashCandidates(e164), userId],
      );
      await client.query(
        `UPDATE users SET phone_verified_at = now(), phone_hash = $2, phone_masked = $3 WHERE id = $1`,
        [userId, phoneHash(e164), row.phone_masked],
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

  /**
   * Whether the number belongs to someone suspended or banned now: on their account (in any stored form), or on the ban
   * registry, which outlives a deleted account.
   */
  private async heldByBanned(userId: string, e164: string): Promise<boolean> {
    const holder = await this.pool.query(
      `SELECT 1 FROM users u WHERE u.phone_hash = ANY($1::text[]) AND u.id <> $2 AND NOT ${availableSql('u')} LIMIT 1`,
      [phoneHashCandidates(e164), userId],
    );
    if (holder.rowCount) return true;
    return isReturningIdentity(this.pool, { phone: e164 }, userId);
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
  return `Your Hevalo verification code is ${code}. It expires in 10 minutes.`;
}
