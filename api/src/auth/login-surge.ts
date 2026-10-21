import type { Redis } from 'ioredis';

/** Failed sign-ins per minute, across every account, that mean a stuffing run. */
export const SURGE_FAILURES_PER_MINUTE = 50;
/** How long every sign-in needs the CAPTCHA once a surge is seen, refreshed while it lasts. */
export const SURGE_HOLD_SECONDS = 5 * 60;

export const SURGE_FLAG_KEY = 'auth:login-surge';
const minuteKey = (minute: number) => `auth:login-failures:${minute}`;

/**
 * The circuit breaker for credential stuffing: lists of leaked addresses and
 * passwords tried against many accounts at once, a few attempts each, from
 * many addresses — which no per-account or per-network count ever sees.
 *
 * Every failed sign-in is counted in a per-minute bucket. Past
 * SURGE_FAILURES_PER_MINUTE the flag goes up, and while it is up every sign-in
 * from a device the account does not know needs the CAPTCHA; it comes down
 * SURGE_HOLD_SECONDS after the last minute over the line. A warning is logged
 * once per surge, when the flag first goes up.
 *
 * Without Redis there is nothing shared to count in, and this does nothing.
 */
export class LoginSurge {
  constructor(
    private readonly redis: Redis | undefined,
    private readonly log?: { warn: (obj: unknown, msg: string) => void },
  ) {}

  async active(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      return (await this.redis.exists(SURGE_FLAG_KEY)) === 1;
    } catch {
      return false;
    }
  }

  async recordFailure(now: Date = new Date()): Promise<void> {
    if (!this.redis) return;
    try {
      const key = minuteKey(Math.floor(now.getTime() / 60_000));
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 120);
      if (count <= SURGE_FAILURES_PER_MINUTE) return;
      const raised = await this.redis.set(SURGE_FLAG_KEY, String(now.getTime()), 'EX', SURGE_HOLD_SECONDS, 'NX');
      if (raised === 'OK') {
        this.log?.warn({ failuresThisMinute: count }, 'sign-in failures are surging: every new-device sign-in now needs the CAPTCHA');
      } else {
        await this.redis.expire(SURGE_FLAG_KEY, SURGE_HOLD_SECONDS);
      }
    } catch {
      // a counter that cannot be reached must not stop anyone signing in
    }
  }
}
