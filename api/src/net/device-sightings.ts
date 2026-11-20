import { deviceHashOf } from '../moderation/identity-hash.js';
import type { Executor } from '../moderation/tx.js';
import { networkHashOf } from './network-key.js';

/** The UTC day of a moment, as the `day` column stores it. */
const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

/**
 * Which install ids an account used, by day: the evidence a returning device is recognised by, however the person
 * signed in (sign-up, sign-in, a session refreshed, a provider sign-in, a guest claimed). Kept
 * {@link DEVICE_SIGHTING_RETENTION_DAYS} days, as the privacy policy says. The id is stored as the SHA-256 risk scoring
 * uses (identity-hash.ts `deviceHashOf`), never as sent.
 *
 * A banned person's refused sign-ins are recorded too, under their own account, with the network they came from, so
 * an account made later on that device or network is recognised as possibly theirs.
 */

export const DEVICE_SIGHTING_RETENTION_DAYS = 180;

/** One statement: the day's row, made or widened. */
export async function writeDeviceSighting(db: Executor, userId: string, deviceId: string, at: Date = new Date()): Promise<void> {
  await db.query(
    `INSERT INTO device_sightings (user_id, device_hash, day, first_at, last_at)
     VALUES ($1, $2, $3::date, $4, $4)
     ON CONFLICT (user_id, device_hash, day) DO UPDATE SET
       first_at = LEAST(device_sightings.first_at, EXCLUDED.first_at),
       last_at = GREATEST(device_sightings.last_at, EXCLUDED.last_at)`,
    [userId, deviceHashOf(deviceId), utcDay(at), at],
  );
}

/**
 * A banned or suspended person's sign-in was refused: their device and network, hashed, under their account. Never
 * fails the refusal it records.
 */
export async function recordRefusedSignIn(db: Executor, userId: string, from: { deviceId?: string | null; ip?: string | null }): Promise<void> {
  const at = new Date();
  const netHash = networkHashOf(from.ip ?? null);
  await db
    .query(
      `WITH device AS (
         INSERT INTO device_sightings (user_id, device_hash, day, first_at, last_at)
         SELECT $1, $2::text, $4::date, $5, $5 WHERE $2::text IS NOT NULL
         ON CONFLICT (user_id, device_hash, day) DO UPDATE SET last_at = GREATEST(device_sightings.last_at, EXCLUDED.last_at)
       )
       INSERT INTO network_sightings (user_id, net_hash, day, first_at, last_at)
       SELECT $1, $3::text, $4::date, $5, $5 WHERE $3::text IS NOT NULL
       ON CONFLICT (user_id, net_hash, day) DO UPDATE SET
         first_at = LEAST(network_sightings.first_at, EXCLUDED.first_at),
         last_at = GREATEST(network_sightings.last_at, EXCLUDED.last_at)`,
      [userId, from.deviceId ? deviceHashOf(from.deviceId) : null, netHash, utcDay(at), at],
    )
    .catch(() => undefined);
}
