/** Which ceilings an email is counted against, by what it is and whom it goes to. */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import { countersFor, ESSENTIAL_TEMPLATES, SECURITY_MAILS_PER_DAY, SECURITY_TEMPLATES } from './send-limits.js';

describe('the email ceilings an email meets', () => {
  it('holds the service to 1,500 a day unless configured, a month of which stays under the sending plan', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).EMAIL_DAILY_CEILING).toBe(1500);
    expect(loadConfig({ NODE_ENV: 'test' }).EMAIL_DAILY_CEILING * 31).toBeLessThanOrEqual(50_000);
  });

  it('lets confirmation codes and resets use the whole day, and everything else only the first 80%', () => {
    expect(countersFor('verify-email-code', 'a@example.com', 1500, '2026-11-22')).toEqual([
      { key: 'email:day:2026-11-22', max: 1500, reason: 'daily-ceiling' },
    ]);
    expect(countersFor('password-reset', 'a@example.com', 1500, '2026-11-22')[0]!.max).toBe(1500);
    expect(countersFor('copyright-received', 'a@example.com', 1500, '2026-11-22')).toEqual([
      { key: 'email:day:2026-11-22', max: 1200, reason: 'reserved' },
    ]);
  });

  it('counts security mail per address, however the address is written, without storing it', () => {
    const [, mine] = countersFor('new-sign-in', 'Rojda@Example.com ', 1500, '2026-11-22');
    expect(mine).toMatchObject({ max: SECURITY_MAILS_PER_DAY, reason: 'security-mails' });
    expect(mine!.key).not.toContain('rojda');
    expect(countersFor('deletion-notice', 'rojda@example.com', 1500, '2026-11-22')[1]!.key).toBe(mine!.key);
    expect(countersFor('password-changed', 'baran@example.com', 1500, '2026-11-22')[1]!.key).not.toBe(mine!.key);
  });

  it('keeps the two lists apart: nothing that lets a person in is held back as security mail', () => {
    for (const template of ESSENTIAL_TEMPLATES) expect(SECURITY_TEMPLATES.has(template)).toBe(false);
  });
});
