/**
 * How a child is signed in, on the phone alone: on the parent's own phone by a profile switch, which puts the
 * parent's session away until the family PIN brings it back; or on the child's own phone with a six-digit code the
 * parent shows, used once within minutes. Every child session is bound to the phone that opened it (auth/service.ts
 * `refresh` refuses it anywhere else) and keeps no address, network or name of the device; the parent sees each phone
 * and can sign it out.
 */
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import {
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_MINUTES,
  PIN_LOCK_MINUTES,
  PIN_TRIES,
} from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { inTransaction, type Executor } from '../moderation/tx.js';
import { moderationKeyed } from '../moderation/pseudonym.js';
import { hashPassword, toPublicUser, verifyPassword, type PublicUser } from '../auth/service.js';
import { issueTokenPair, type IssuedTokens } from '../auth/tokens.js';
import type { UserRow } from '../users/repository.js';
import { mayBeParent, parentalAccount } from '../parental/service.js';
import { notAdult, notFound } from './common.js';

/** What a child's sign-in, or a return to the parent, hands the phone: whose session it is, and its tokens. */
export interface SignedIn {
  user: PublicUser;
  tokens: IssuedTokens;
}

const pinRequired = (): AppError => new AppError('FAMILY_PIN_REQUIRED', 409, 'set a family PIN first: it brings your phone back to you');
const pinLocked = (until: Date, now: Date): AppError =>
  new AppError('FAMILY_PIN_LOCKED', 429, 'too many wrong tries: wait a little', { retryAfterSec: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) });
const pinWrong = (left: number): AppError => new AppError('FAMILY_PIN_WRONG', 403, 'that PIN isn’t right', { triesLeft: left });
const deviceRequired = (): AppError => new AppError('DEVICE_REQUIRED', 400, 'a child’s profile is signed in on a phone the app can name');
const pairingInvalid = (): AppError => new AppError('PAIRING_CODE_INVALID', 404, 'that code doesn’t work: ask your parent for a new one');

/** A pairing code as stored: keyed with the server's secret, so the table gives nobody a way to try codes against it. */
export function hashPairingCode(code: string): string {
  return moderationKeyed('child-pairing', code);
}

/** Six digits from the system's secure random source, a leading zero kept. */
export function makePairingCode(): string {
  return String(randomInt(10 ** PAIRING_CODE_LENGTH)).padStart(PAIRING_CODE_LENGTH, '0');
}

type PinCheck = { ok: true } | { ok: false; error: AppError };

export class ChildSessions {
  constructor(
    private readonly pool: pg.Pool,
    private readonly config: AppConfig,
  ) {}

  private async user(db: Executor, id: string): Promise<UserRow> {
    const r = await db.query<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
    const row = r.rows[0];
    if (!row) throw notFound();
    return row;
  }

  private async assertChildOf(db: Executor, parentId: string, childId: string): Promise<void> {
    const r = await db.query(`SELECT 1 FROM child_profiles WHERE parent_id = $1 AND user_id = $2`, [parentId, childId]);
    if (!r.rowCount) throw notFound();
  }

  /**
   * Compares a PIN with the parent's, counting the run of wrong ones: PIN_TRIES in a row lock it for PIN_LOCK_MINUTES.
   * The count is kept whatever the answer, so it is decided in its own transaction and said after.
   */
  private async checkPin(parentId: string, pin: string, now: Date): Promise<PinCheck> {
    return inTransaction(this.pool, async (client) => {
      const r = await client.query<{ pin_hash: string; failed_tries: number; locked_until: Date | null }>(
        `SELECT pin_hash, failed_tries, locked_until FROM family_pins WHERE parent_id = $1 FOR UPDATE`,
        [parentId],
      );
      const row = r.rows[0];
      if (!row) return { ok: false, error: pinRequired() };
      if (row.locked_until && row.locked_until > now) return { ok: false, error: pinLocked(row.locked_until, now) };
      if (await verifyPassword(row.pin_hash, pin)) {
        await client.query(`UPDATE family_pins SET failed_tries = 0, locked_until = NULL WHERE parent_id = $1`, [parentId]);
        return { ok: true };
      }
      const tries = row.failed_tries + 1;
      if (tries >= PIN_TRIES) {
        const until = new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000);
        await client.query(`UPDATE family_pins SET failed_tries = 0, locked_until = $2 WHERE parent_id = $1`, [parentId, until]);
        return { ok: false, error: pinLocked(until, now) };
      }
      await client.query(`UPDATE family_pins SET failed_tries = $2 WHERE parent_id = $1`, [parentId, tries]);
      return { ok: false, error: pinWrong(PIN_TRIES - tries) };
    });
  }

  /**
   * Sets the family PIN, or changes it: a PIN already set is changed with that PIN, or reset with the account's
   * password when it is forgotten. Kept hashed as a password is.
   */
  async setPin(parentId: string, pin: string, proof: { currentPin?: string; password?: string }, now: Date = new Date()): Promise<{ pinSet: true }> {
    const account = await parentalAccount(this.pool, parentId);
    if (!account || !mayBeParent(account, now)) throw notAdult(account);
    const existing = await this.pool.query(`SELECT 1 FROM family_pins WHERE parent_id = $1`, [parentId]);
    if (existing.rowCount) {
      let proven = false;
      if (proof.password) {
        const row = await this.user(this.pool, parentId);
        proven = row.password_hash ? await verifyPassword(row.password_hash, proof.password) : false;
        if (!proven) throw new AppError('INVALID_CREDENTIALS', 401, 'that password isn’t right');
      } else if (proof.currentPin) {
        const checked = await this.checkPin(parentId, proof.currentPin, now);
        if (!checked.ok) throw checked.error;
        proven = true;
      }
      if (!proven) throw new AppError('FAMILY_PIN_PROOF', 403, 'enter the PIN you have now, or your password if you forgot it');
    }
    const hash = await hashPassword(pin);
    await this.pool.query(
      `INSERT INTO family_pins (parent_id, pin_hash, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (parent_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_tries = 0, locked_until = NULL, updated_at = EXCLUDED.updated_at`,
      [parentId, hash, now],
    );
    return { pinSet: true };
  }

  /** A new code for a child's own phone, replacing any the child had out; it works once, for minutes. */
  async createPairingCode(parentId: string, childId: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
    return inTransaction(this.pool, async (client) => {
      await this.assertChildOf(client, parentId, childId);
      await client.query(`DELETE FROM child_pairing_codes WHERE child_id = $1`, [childId]);
      const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MINUTES * 60_000);
      // another child's live code with the same digits is rare; the insert then makes nothing, and a fresh draw goes in
      for (let draw = 0; draw < 8; draw++) {
        const code = makePairingCode();
        const made = await client.query(
          `INSERT INTO child_pairing_codes (child_id, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [childId, hashPairingCode(code), expiresAt, now],
        );
        if (made.rowCount) return { code, expiresAt: expiresAt.toISOString() };
      }
      throw new Error('eight pairing codes in a row were already taken');
    });
  }

  /**
   * The child's phone, with the code their parent showed: the code is used up, and a session for the child begins,
   * bound to this phone. Every code that does not work is the same 404.
   */
  async pair(input: string, deviceId: string | null, now: Date = new Date()): Promise<SignedIn> {
    if (!deviceId) throw deviceRequired();
    const code = normalizePairingCode(input);
    if (!code) throw pairingInvalid();
    return inTransaction(this.pool, async (client) => {
      const used = await client.query<{ child_id: string }>(
        `DELETE FROM child_pairing_codes WHERE code_hash = $1 AND expires_at > $2 RETURNING child_id`,
        [hashPairingCode(code), now],
      );
      const childId = used.rows[0]?.child_id;
      if (!childId) throw pairingInvalid();
      const child = await this.user(client, childId);
      const tokens = await issueTokenPair(this.config, client, child, { deviceId });
      return { user: toPublicUser(child), tokens };
    });
  }

  /**
   * The parent hands their phone to a child: the parent's session on it ends, and a child's begins in its place,
   * which remembers whom the PIN gives the phone back to. Needs the PIN set first, or the phone could not come back.
   */
  async switchTo(parentId: string, parentFamily: string | undefined, childId: string, deviceId: string | null): Promise<SignedIn> {
    if (!deviceId) throw deviceRequired();
    return inTransaction(this.pool, async (client) => {
      await this.assertChildOf(client, parentId, childId);
      const pin = await client.query(`SELECT 1 FROM family_pins WHERE parent_id = $1`, [parentId]);
      if (!pin.rowCount) throw pinRequired();
      const child = await this.user(client, childId);
      const tokens = await issueTokenPair(this.config, client, child, { deviceId });
      await client.query(`UPDATE refresh_tokens SET return_to = $2 WHERE family_id = $1`, [tokens.familyId, parentId]);
      if (parentFamily) await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND family_id::text = $2 AND revoked_at IS NULL`, [parentId, parentFamily]);
      return { user: toPublicUser(child), tokens };
    });
  }

  /**
   * The phone goes back to the parent with the family PIN: only from a child's session a switch opened, to the parent
   * it came from, while that parent is still theirs and their account is open. The child's session ends, and the
   * parent's begins again on this phone.
   */
  async returnToParent(childId: string, childFamily: string | undefined, pin: string, deviceId: string | null, deviceName: string | undefined, now: Date = new Date()): Promise<SignedIn> {
    const session = childFamily
      ? await this.pool.query<{ return_to: string | null }>(
          `SELECT return_to FROM refresh_tokens WHERE user_id = $1 AND family_id::text = $2 AND revoked_at IS NULL LIMIT 1`,
          [childId, childFamily],
        )
      : null;
    const parentId = session?.rows[0]?.return_to;
    if (!parentId) throw new AppError('FAMILY_NOT_SWITCHED', 403, 'this phone is the child’s own: a parent signs in on theirs');
    const open = await this.pool.query(
      `SELECT 1 FROM users u JOIN child_profiles cp ON cp.parent_id = u.id AND cp.user_id = $2
        WHERE u.id = $1 AND u.deleted_at IS NULL AND u.deletion_requested_at IS NULL
          AND (u.banned_at IS NULL OR (u.banned_until IS NOT NULL AND u.banned_until <= now()))`,
      [parentId, childId],
    );
    if (!open.rowCount) throw new AppError('FAMILY_PARENT_SIGN_IN', 403, 'sign in again as the parent');
    const checked = await this.checkPin(parentId, pin, now);
    if (!checked.ok) throw checked.error;
    return inTransaction(this.pool, async (client) => {
      const parent = await this.user(client, parentId);
      const tokens = await issueTokenPair(this.config, client, parent, { deviceId, deviceName });
      await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND family_id::text = $2 AND revoked_at IS NULL`, [childId, childFamily]);
      return { user: toPublicUser(parent), tokens };
    });
  }

  /** A parent signs one of a child's phones out: the session named, and every other the same phone holds. */
  async signOutDevice(parentId: string, childId: string, sessionId: string): Promise<{ revoked: true }> {
    await this.assertChildOf(this.pool, parentId, childId);
    const r = await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE user_id = $2 AND revoked_at IS NULL
          AND (family_id = $1
               OR device_hash = (SELECT device_hash FROM refresh_tokens
                                  WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL AND device_hash IS NOT NULL LIMIT 1))`,
      [sessionId, childId],
    );
    if (!r.rowCount) throw notFound();
    return { revoked: true };
  }
}
