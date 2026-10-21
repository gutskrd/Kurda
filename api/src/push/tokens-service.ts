import type pg from 'pg';
import type { PushPlatform } from './provider.js';

export interface DeviceToken {
  token: string;
  platform: PushPlatform;
}

/**
 * The shape of an Expo push token, the only kind the phone registers:
 * `ExponentPushToken[…]`, or `ExpoPushToken[…]` as newer SDKs may write it,
 * around a short run of letters, digits and the few marks base64 uses. Anything
 * else is refused at the door rather than stored and sent to Expo to reject.
 */
const EXPO_PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[A-Za-z0-9_+/=-]{1,200}\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_PUSH_TOKEN.test(token);
}

/**
 * Device token lifecycle (KUR-094). A token is globally unique; registering one
 * that already exists reassigns it to the current user (OS restore / account
 * switch) rather than duplicating. Invalid tokens are pruned wholesale by the
 * delivery pipeline on provider rejection.
 */
export class DeviceTokenService {
  constructor(private readonly pool: pg.Pool) {}

  /** Register or re-point a device token; refreshes last_seen + platform. */
  async register(userId: string, platform: PushPlatform, token: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO device_tokens (user_id, platform, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET
         user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
      [userId, platform, token],
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

  /** Every registered device for a user. */
  async forUser(userId: string): Promise<DeviceToken[]> {
    const res = await this.pool.query<{ token: string; platform: PushPlatform }>(
      `SELECT token, platform FROM device_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC`,
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
