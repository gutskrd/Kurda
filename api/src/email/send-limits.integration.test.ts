/** The email ceilings against a real Redis: the day's reserve, the ceiling, and security mail per address. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { EmailNotQueued, EmailSendLimits, SECURITY_MAILS_PER_DAY } from './send-limits.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('email ceilings (integration)', () => {
  let redis: Redis;
  // a day of its own, so nothing else counted today is in the way
  const day = new Date('2031-03-04T10:00:00Z');
  const logged: string[] = [];
  const log = { warn: (_: unknown, msg?: string) => void logged.push(`warn:${msg}`), error: (_: unknown, msg?: string) => void logged.push(`error:${msg}`) };

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string);
  });

  afterAll(async () => {
    const keys = await redis.keys('email:*2031-03-04*');
    if (keys.length > 0) await redis.del(...keys);
    redis.disconnect();
  });

  const refusal = (p: Promise<void>) => p.then(() => null, (err: unknown) => (err instanceof EmailNotQueued ? err.reason : String(err)));

  it('keeps the last fifth of the day for confirmation codes and resets, then stops everything', async () => {
    const limits = new EmailSendLimits(async () => redis, 10, log);
    for (let i = 0; i < 8; i++) expect(await refusal(limits.admit('copyright-received', `n${i}@example.com`, day))).toBeNull();
    expect(logged.filter((l) => l.includes('80%'))).toHaveLength(1);
    expect(await refusal(limits.admit('copyright-received', 'late@example.com', day))).toBe('reserved');
    expect(await refusal(limits.admit('verify-email-code', 'new@example.com', day))).toBeNull();
    expect(await refusal(limits.admit('password-reset', 'old@example.com', day))).toBeNull();
    expect(logged.some((l) => l.startsWith('error:'))).toBe(true);
    expect(await refusal(limits.admit('verify-email-code', 'another@example.com', day))).toBe('daily-ceiling');
    // a refusal counts nothing
    expect(Number(await redis.get('email:day:2031-03-04'))).toBe(10);
  });

  it('sends one address a handful of security mails a day, and drops the rest', async () => {
    const limits = new EmailSendLimits(async () => redis, 1000);
    const other = new Date('2031-03-05T10:00:00Z');
    const kinds = ['new-sign-in', 'password-changed', 'deletion-notice', 'new-sign-in', 'sign-in-attempts'];
    for (const kind of kinds) expect(await refusal(limits.admit(kind, 'rojda@example.com', other))).toBeNull();
    expect(kinds).toHaveLength(SECURITY_MAILS_PER_DAY);
    expect(await refusal(limits.admit('new-sign-in', 'rojda@example.com', other))).toBe('security-mails');
    // someone else, and a confirmation code to the same address, are not held back by it
    expect(await refusal(limits.admit('new-sign-in', 'baran@example.com', other))).toBeNull();
    expect(await refusal(limits.admit('verify-email-code', 'rojda@example.com', other))).toBeNull();
    const keys = await redis.keys('email:*2031-03-05*');
    await redis.del(...keys);
  });

  it('queues the email when the counter cannot be reached, since the queue would refuse it anyway', async () => {
    const limits = new EmailSendLimits(async () => {
      throw new Error('connection refused');
    }, 10);
    expect(await refusal(limits.admit('copyright-received', 'a@example.com', day))).toBeNull();
  });
});
