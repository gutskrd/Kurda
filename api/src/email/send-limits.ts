/**
 * The ceilings on outgoing email, checked as each one is queued (jobs/queue.ts), so no route, sweep or script can send
 * past them:
 * - the service's day: once 80% of EMAIL_DAILY_CEILING has gone, only confirmation codes and password resets are sent,
 *   and at the ceiling nothing more is queued until midnight UTC;
 * - security mail to an account's own address (a new sign-in, failed attempts, a changed password, a deletion notice):
 *   `SECURITY_MAILS_PER_DAY` for one address; the action each tells of still happens.
 * Counted in Redis by UTC day, atomically. A refused email throws `EmailNotQueued`, which every sender already treats as
 * a mail that could not go.
 */
import { createHash } from 'node:crypto';
import type { CounterRedis } from '../limits/counters.js';
import { DAILY_KEY_TTL_SEC, utcDay } from '../limits/counters.js';

/** The mail that lets someone into their own account: still sent once the day's reserve begins. */
export const ESSENTIAL_TEMPLATES: ReadonlySet<string> = new Set(['verify-email', 'verify-email-code', 'password-reset', 'oauth-no-password']);

/** Mail to an account's own address about its security, counted together per address. */
export const SECURITY_TEMPLATES: ReadonlySet<string> = new Set(['new-sign-in', 'sign-in-attempts', 'password-changed', 'deletion-notice']);

/** Security mails one address is sent in a day (UTC). */
export const SECURITY_MAILS_PER_DAY = 5;

/** The share of the day's ceiling after which only essential mail goes. */
export const RESERVE_FROM = 0.8;

/** Why an email was not queued. */
export type NotQueuedReason = 'daily-ceiling' | 'reserved' | 'security-mails';

export class EmailNotQueued extends Error {
  constructor(readonly reason: NotQueuedReason) {
    super(`email not queued: ${reason}`);
  }
}

/**
 * Takes one from every counter unless any is at its limit, in which case nothing is counted. KEYS and the first ARGVs
 * pair up (counter, limit); the last ARGV is the keys' lifetime. Returns {refused counter or 0, the first counter's count}.
 */
const ADMIT_SCRIPT = `
local ttl = tonumber(ARGV[#ARGV])
for i = 1, #KEYS do
  local n = tonumber(redis.call('GET', KEYS[i]) or '0')
  if n >= tonumber(ARGV[i]) then return {i, n} end
end
local first = 0
for i = 1, #KEYS do
  local n = redis.call('INCR', KEYS[i])
  if redis.call('TTL', KEYS[i]) < 0 then redis.call('EXPIRE', KEYS[i], ttl) end
  if i == 1 then first = n end
end
return {0, first}
`;

interface Log {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** The counters one email is checked against, with their limits and the reason each refuses for (pure, for the tests). */
export function countersFor(template: string, to: string, ceiling: number, day: string): Array<{ key: string; max: number; reason: NotQueuedReason }> {
  const reserveAt = Math.floor(ceiling * RESERVE_FROM);
  const essential = ESSENTIAL_TEMPLATES.has(template);
  const counters: Array<{ key: string; max: number; reason: NotQueuedReason }> = [
    { key: `email:day:${day}`, max: essential ? ceiling : reserveAt, reason: essential ? 'daily-ceiling' : 'reserved' },
  ];
  if (SECURITY_TEMPLATES.has(template)) {
    // the address as a hash, so the count is not another copy of it
    const address = createHash('sha256').update(to.trim().toLowerCase()).digest('hex');
    counters.push({ key: `email:security:${day}:${address}`, max: SECURITY_MAILS_PER_DAY, reason: 'security-mails' });
  }
  return counters;
}

export class EmailSendLimits {
  constructor(
    private readonly redis: () => Promise<CounterRedis>,
    private readonly ceiling: number,
    private readonly log?: Log,
  ) {}

  /** Counts one email of `template` to `to`, or throws `EmailNotQueued`. A counter that cannot be reached allows it. */
  async admit(template: string, to: string, now = new Date()): Promise<void> {
    const counters = countersFor(template, to, this.ceiling, utcDay(now));
    let answer: [number, number];
    try {
      const redis = await this.redis();
      answer = (await redis.eval(
        ADMIT_SCRIPT,
        counters.length,
        ...counters.map((c) => c.key),
        ...counters.map((c) => c.max),
        DAILY_KEY_TTL_SEC,
      )) as [number, number];
    } catch (err) {
      // the queue shares this connection, so an email that cannot be counted cannot be queued either
      this.log?.warn({ err: err instanceof Error ? err.message : String(err) }, 'email counter unavailable; not counted');
      return;
    }
    const [refused, count] = answer;
    if (refused > 0) throw new EmailNotQueued(counters[refused - 1]!.reason);
    const reserveAt = Math.floor(this.ceiling * RESERVE_FROM);
    if (count === reserveAt) {
      this.log?.warn({ sent: count, ceiling: this.ceiling }, 'emails today reached 80% of EMAIL_DAILY_CEILING: only confirmation codes and password resets go until midnight UTC');
    } else if (count === this.ceiling) {
      this.log?.error({ sent: count, ceiling: this.ceiling }, 'emails today reached EMAIL_DAILY_CEILING: no more email is queued until midnight UTC');
    }
  }
}
