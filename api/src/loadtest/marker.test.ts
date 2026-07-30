import { describe, expect, it } from 'vitest';
import { isLoadTestUser, LOADTEST_EMAIL_DOMAIN, loadTestEmail } from './marker.js';

describe('isLoadTestUser', () => {
  it('flags reserved-domain accounts only', () => {
    expect(isLoadTestUser(`vu-1@${LOADTEST_EMAIL_DOMAIN}`)).toBe(true);
    expect(isLoadTestUser(`ROJDA@${LOADTEST_EMAIL_DOMAIN.toUpperCase()}`)).toBe(true); // case-insensitive
    expect(isLoadTestUser('rojda@gmail.com')).toBe(false);
    expect(isLoadTestUser('someone@loadtest.kurda.invalid.evil.com')).toBe(false); // not a suffix match on the domain
  });

  it('is safe on empty input', () => {
    expect(isLoadTestUser(null)).toBe(false);
    expect(isLoadTestUser(undefined)).toBe(false);
    expect(isLoadTestUser('')).toBe(false);
  });
});

describe('loadTestEmail', () => {
  it('builds a deterministic per-VU address that flags as load-test', () => {
    const email = loadTestEmail(42);
    expect(email).toBe(`vu-42@${LOADTEST_EMAIL_DOMAIN}`);
    expect(isLoadTestUser(email)).toBe(true);
  });
});
