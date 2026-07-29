import { describe, expect, it } from 'vitest';
import {
  BASIC_MIN_AGE_MS,
  checkActionAllowed,
  ESTABLISHED_FAST_AGE_MS,
  ESTABLISHED_MIN_AGE_MS,
  getTrustLevel,
  VELOCITY_CAPS,
  type AccountFacts,
} from './levels.js';

const facts = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  accountAgeMs: 0,
  emailVerified: false,
  phoneVerified: false,
  priorViolations: 0,
  ...over,
});

describe('getTrustLevel', () => {
  it('a brand-new unverified account is `new`', () => {
    expect(getTrustLevel(facts())).toBe('new');
  });

  it('an unverified account stays `new` even when old', () => {
    expect(getTrustLevel(facts({ accountAgeMs: ESTABLISHED_MIN_AGE_MS * 2 }))).toBe('new');
  });

  it('verified + past the basic age is `basic`', () => {
    expect(getTrustLevel(facts({ emailVerified: true, accountAgeMs: BASIC_MIN_AGE_MS }))).toBe(
      'basic',
    );
  });

  it('verified + old enough is `established`', () => {
    expect(
      getTrustLevel(facts({ emailVerified: true, accountAgeMs: ESTABLISHED_MIN_AGE_MS })),
    ).toBe('established');
  });

  it('phone verification fast-tracks to `established`', () => {
    expect(
      getTrustLevel(
        facts({ emailVerified: true, phoneVerified: true, accountAgeMs: ESTABLISHED_FAST_AGE_MS }),
      ),
    ).toBe('established');
  });

  it('a confirmed violation holds the account at `new` regardless of age/verification', () => {
    expect(
      getTrustLevel(
        facts({ emailVerified: true, accountAgeMs: ESTABLISHED_MIN_AGE_MS, priorViolations: 1 }),
      ),
    ).toBe('new');
  });
});

describe('checkActionAllowed', () => {
  it('new accounts are capped tightly on messages', () => {
    const cap = VELOCITY_CAPS.new.message;
    expect(checkActionAllowed('new', 'message', cap - 1)).toEqual({
      allowed: true,
      cap,
      remaining: 1,
    });
    expect(checkActionAllowed('new', 'message', cap)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('established accounts have far higher caps than new ones', () => {
    expect(VELOCITY_CAPS.established.message).toBeGreaterThan(VELOCITY_CAPS.new.message);
    expect(VELOCITY_CAPS.established.upload).toBeGreaterThan(VELOCITY_CAPS.new.upload);
  });

  it('new accounts can create very few groups', () => {
    expect(checkActionAllowed('new', 'group_create', VELOCITY_CAPS.new.group_create)).toMatchObject(
      { allowed: false },
    );
  });

  it('caps rise monotonically new → basic → established for every action', () => {
    const actions = ['message', 'group_create', 'comment', 'upload', 'post'] as const;
    for (const a of actions) {
      expect(VELOCITY_CAPS.basic[a]).toBeGreaterThanOrEqual(VELOCITY_CAPS.new[a]);
      expect(VELOCITY_CAPS.established[a]).toBeGreaterThanOrEqual(VELOCITY_CAPS.basic[a]);
    }
  });
});
