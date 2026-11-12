import { createHmac, randomInt } from 'node:crypto';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';
import { validateUsername } from '../users/username.js';
import type { UserRow } from '../users/repository.js';
import { issueTokenPair, type IssuedTokens } from './tokens.js';
import { toPublicUser, type PublicUser } from './service.js';

/**
 * Guest accounts: "Try Hevalo without an account".
 *
 * A guest is a real user row with everything a learner has — XP, streak,
 * lessons, practice, badges, daily goal — and none of what an account has: no
 * email, no password, no birth month, no consent record. The flag `users.guest`
 * is what tells the two apart, and it is read with the account on every request
 * (plugins/auth.ts), where `requireAccount` refuses a guest anything social,
 * public or purchasable, and the public listings leave guests out.
 *
 * The row is the same one the person keeps when they claim the account (POST
 * /auth/claim, or a Google or Apple sign-in while a guest: auth/service.ts
 * `claim`, auth/oauth.ts), so the progress made as a guest is never copied or
 * lost: the row simply gains an address and stops being a guest.
 *
 * Two things keep guests from piling up. A phone that asks again within a day
 * — the app crashed, or was reopened before anything was saved — is handed its
 * own guest back, found by a keyed hash of its device id, rather than a new
 * row each time. And a guest nobody has touched for GUEST_IDLE_DAYS is closed
 * by the housekeeping job (gdpr/service.ts `purgeIdleGuests`): there is no
 * address to warn, and nothing of a person's in the row to keep.
 *
 * The address is verified in the sense the activation gate asks about: there
 * is no email to confirm, and a guest's lessons must save, so `email_verified_at`
 * is set at creation. Claiming clears it, and the claimed account confirms its
 * new address as a sign-up does.
 */

/** How long a device is handed the same guest back instead of a new one. */
export const GUEST_REUSE_HOURS = 24;

/** A guest untouched for this long is closed by the housekeeping job. */
export const GUEST_IDLE_DAYS = 60;

/** The generated name's stem: a friend, as the app calls its learners. */
const USERNAME_STEM = 'heval';
/** Digits after the stem: ten million names, so a clash is rare and retried, never a wall. */
const USERNAME_DIGITS = 7;
/** How many clashes in a row are tried before giving up, which would take a very full table. */
const USERNAME_TRIES = 5;

const PG_UNIQUE_VIOLATION = '23505';

/**
 * A fresh guest username: the stem and USERNAME_DIGITS random digits, checked
 * against the full username policy (users/username.ts) so a generated name is
 * never one a person could not have chosen — reserved names included, since
 * the reserved check folds digits to the letters they resemble, and a suffix
 * that happened to fold to a reserved word would otherwise slip through.
 * `random` is a seam for the tests; production draws from the system's CSPRNG.
 */
export function generateGuestUsername(random: (max: number) => number = (max) => randomInt(max)): string {
  for (;;) {
    let digits = '';
    for (let i = 0; i < USERNAME_DIGITS; i++) digits += String(random(10));
    const candidate = `${USERNAME_STEM}${digits}`;
    const check = validateUsername(candidate);
    if (check.ok) return check.value;
  }
}

/**
 * What a guest's device id is stored as: a keyed hash, so the table never
 * holds the id itself and the hash is unlinkable to anything else kept about
 * the device (known_devices and refresh_tokens hash it per account, with a
 * different label). One label for all guests, because the lookup is by
 * device alone, before there is an account to key it to.
 */
export function guestDeviceHash(secret: string, deviceId: string): string {
  return createHmac('sha256', secret).update(`hevalo-guest-device-v1:${deviceId}`).digest('hex');
}

export interface GuestStartInput {
  deviceName?: string;
  /** the app's `x-device-id`, hashed and kept so the same device gets this guest back for a day */
  deviceId?: string | null;
  locale?: string;
  timezone?: string;
}

export interface GuestStarted {
  user: PublicUser;
  tokens: IssuedTokens;
  /** false when the device was handed the guest it made within the last day */
  created: boolean;
}

export class GuestService {
  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
  ) {}

  /**
   * The guest this device made within GUEST_REUSE_HOURS, if it is still a
   * guest, signed in again with fresh tokens; null when there is none. Asked
   * before the anti-abuse checks a new account goes through, since nothing is
   * created: a phone reopening the app is not a sign-up.
   */
  async resume(deviceId: string | null | undefined, deviceName?: string): Promise<GuestStarted | null> {
    if (!deviceId) return null;
    const found = await this.pool.query<UserRow>(
      `SELECT * FROM users
        WHERE guest AND deleted_at IS NULL AND guest_device_hash = $1
          AND created_at > now() - make_interval(hours => $2::int)
        ORDER BY created_at DESC
        LIMIT 1`,
      [guestDeviceHash(this.config.JWT_SECRET, deviceId), GUEST_REUSE_HOURS],
    );
    const user = found.rows[0];
    if (!user) return null;
    const tokens = await issueTokenPair(this.config, this.pool, user, { deviceName, deviceId });
    return { user: toPublicUser(user), tokens, created: false };
  }

  /**
   * A new guest, signed in. The username is generated and retried on a clash
   * (the unique index is the authority, as at sign-up); the locale and time
   * zone are the app's, as a sign-up's would be, so the streak day and the
   * interface language are right from the first lesson.
   */
  async start(input: GuestStartInput): Promise<GuestStarted> {
    const deviceHash = input.deviceId ? guestDeviceHash(this.config.JWT_SECRET, input.deviceId) : null;
    let user: UserRow | undefined;
    for (let attempt = 0; attempt < USERNAME_TRIES && !user; attempt++) {
      try {
        const inserted = await this.pool.query<UserRow>(
          `INSERT INTO users (email, username, email_verified_at, locale, timezone, guest, guest_device_hash)
           VALUES (NULL, $1, now(), COALESCE($2, 'en'), COALESCE($3, 'UTC'), true, $4)
           RETURNING *`,
          [generateGuestUsername(), input.locale ?? null, input.timezone ?? null, deviceHash],
        );
        user = inserted.rows[0];
      } catch (err) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === PG_UNIQUE_VIOLATION && (pgErr.constraint === 'users_username_active_uniq' || pgErr.constraint === 'users_username_held')) continue;
        throw err;
      }
    }
    if (!user) throw new Error('could not find a free guest username');
    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
      deviceId: input.deviceId,
    });
    return { user: toPublicUser(user), tokens, created: true };
  }
}
