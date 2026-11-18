import type pg from 'pg';
import { MAX_PUSH_DEVICES } from '@kurda/shared';
import type { PushPlatform } from './provider.js';

export interface DeviceToken {
  token: string;
  platform: PushPlatform;
}

/**
 * The shape of an Expo push token: `ExponentPushToken[…]`, or `ExpoPushToken[…]` from newer SDKs, around a short run
 * of base64 characters. Anything else is refused at the door rather than stored for Expo to reject.
 */
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_+/=-]{1,200}\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_PUSH_TOKEN.test(token);
}

/**
 * Device token lifecycle. Tokens are globally unique, so registering an existing one reassigns it to the current user
 * (OS restore, account switch). Invalid tokens are pruned by the delivery pipeline when the provider rejects them.
 */
export class DeviceTokenService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Registers or re-points a device token, refreshing last_seen and platform. An account gets notifications on its
   * MAX_PUSH_DEVICES most recently seen phones: one more drops the oldest rather than refusing the phone in hand, so a
   * script cannot turn one notification into thousands. One statement after the insert keeps the newest, locking dropped
   * rows in id order so registrations never deadlock (as auth/tokens.ts `endOldestSessions`). `familyId` is the
   * phone's session; the database drops the token with it (migration `push-ends-with-its-session`).
   */
  async register(userId: string, platform: PushPlatform, token: string, familyId: string | null = null): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_tokens (user_id, platform, token, family_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, family_id = EXCLUDED.family_id, last_seen_at = now()`,
      [userId, platform, token, familyId],
    );
    await this.pool.query(
      `WITH doomed AS MATERIALIZED (
         SELECT id FROM device_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC, created_at DESC, id DESC OFFSET $2
       ), locked AS MATERIALIZED (
         SELECT id FROM device_tokens WHERE id IN (SELECT id FROM doomed) ORDER BY id FOR UPDATE
       )
       DELETE FROM device_tokens WHERE id IN (SELECT id FROM locked) AND user_id = $1`,
      [userId, MAX_PUSH_DEVICES],
    );
  }

  /** Heartbeat: mark the token seen, only if it still belongs to this user. */
  async touch(userId: string, token: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE device_tokens SET last_seen_at = now() WHERE user_id = $1 AND token = $2`,
      [userId, token],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Explicit removal (logout on this device). */
  async remove(userId: string, token: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * The devices a notification for this user goes to: phones whose session is still live. Revoked sessions drop their
   * tokens in the database, but a session can also simply expire, so the session is checked on every send. Tokens with
   * no session are never sent to.
   */
  async forUser(userId: string): Promise<DeviceToken[]> {
    const res = await this.pool.query<{ token: string; platform: PushPlatform }>(
      `SELECT d.token, d.platform FROM device_tokens d
        WHERE d.user_id = $1
          AND EXISTS (SELECT 1 FROM refresh_tokens rt
                       WHERE rt.family_id = d.family_id AND rt.user_id = d.user_id AND rt.revoked_at IS NULL AND rt.expires_at > now())
        ORDER BY d.last_seen_at DESC`,
      [userId],
    );
    return res.rows;
  }

  /** Delete rejected tokens (invalid-token pruning). Returns rows removed. */
  async prune(tokens: readonly string[]): Promise<number> {
    if (tokens.length === 0) return 0;
    const res = await this.pool.query(
      `DELETE FROM device_tokens WHERE token = ANY($1::text[])`,
      [tokens],
    );
    return res.rowCount ?? 0;
  }
}
