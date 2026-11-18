import { createHmac } from 'node:crypto';
import type pg from 'pg';

/** How long a device or network stays known after it last signed in. */
export const KNOWN_DEVICE_DAYS = 180;

/**
 * What an account has signed in from before:
 * - 'device'  — the app's `X-Device-Id` (a random id the app keeps per install);
 * - 'network' — the network it signed in from (the keyed hash net/network-key.ts
 *               gives an address), for apps that send no device id.
 */
export type KnownKind = 'device' | 'network';

/**
 * What a device or network is stored as for one account: a keyed hash,
 * unlinkable across accounts. Sessions keep their device the same way
 * (refresh_tokens.device_hash), so one hash names the device in both places.
 */
export function knownHash(secret: string, userId: string, kind: KnownKind, value: string): string {
  const label = kind === 'device' ? 'hevalo-known-device-v1' : 'hevalo-known-network-v1';
  return createHmac('sha256', secret).update(`${label}:${userId}:${value}`).digest('hex');
}

/**
 * Devices and networks that have signed in to an account before, stored per account as keyed hashes, never raw ids or
 * addresses.
 *
 * Each known device or network has its own failure budget, so someone guessing the owner's password elsewhere cannot
 * lock out the owner's phone or home network. Networks are weaker (a carrier address is shared) and serve apps that
 * send no device id. A sign-in from a new device emails the owner; a new network does not.
 *
 * A device id is chosen by the app and proves nothing alone; it only stops a stranger, who lacks it, spending the
 * owner's budget.
 */
export class KnownDevices {
  constructor(
    private readonly pool: Pick<pg.Pool, 'query'>,
    private readonly secret: string,
  ) {}

  /** What a device or network is stored as for one account (`knownHash`). */
  hash(userId: string, kind: KnownKind, value: string): string {
    return knownHash(this.secret, userId, kind, value);
  }

  /** Whether this device or network has signed in to this account and not expired since. */
  async isKnown(userId: string, kind: KnownKind, value: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM known_devices WHERE user_id = $1 AND device_hash = $2 AND expires_at > now()`,
      [userId, this.hash(userId, kind, value)],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Note a successful sign-in (or sign-up) from this device or network. `isNew` when the account had not seen it (or it
   * expired); `firstForAccount` when the account had nothing of this kind, such as the sign-in right after a sign-up
   * without one, which needs no warning.
   */
  async remember(userId: string, kind: KnownKind, value: string): Promise<{ isNew: boolean; firstForAccount: boolean }> {
    const hashed = this.hash(userId, kind, value);
    const before = await this.pool.query<{ n: number; known: boolean }>(
      `SELECT count(*)::int AS n,
              coalesce(bool_or(device_hash = $2 AND expires_at > now()), false) AS known
         FROM known_devices WHERE user_id = $1 AND kind = $3`,
      [userId, hashed, kind],
    );
    const row = before.rows[0] ?? { n: 0, known: false };
    await this.pool.query(
      `INSERT INTO known_devices (user_id, device_hash, kind, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)
       ON CONFLICT (user_id, device_hash) DO UPDATE
         SET last_seen_at = now(), expires_at = EXCLUDED.expires_at`,
      [userId, hashed, kind, String(KNOWN_DEVICE_DAYS)],
    );
    // the account's devices and networks that have lapsed go with this sign-in
    await this.pool.query(`DELETE FROM known_devices WHERE user_id = $1 AND expires_at < now()`, [userId]);
    return { isNew: !row.known, firstForAccount: row.n === 0 };
  }
}
