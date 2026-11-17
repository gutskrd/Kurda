import { describe, expect, it } from 'vitest';
import { holdLink, launchLinkKeeper, linkHolding, pathOf, takeHeldLink } from './heldLink';

const PREFIXES = ['exp://127.0.0.1:8081/--/', 'hevalo://', 'https://hevalo.app'];

describe('a link opened before signing in', () => {
  it('reads the path from any of the app’s addresses', () => {
    expect(pathOf('https://hevalo.app/app/users/u1', PREFIXES)).toBe('/app/users/u1');
    expect(pathOf('hevalo://app/library/p1', PREFIXES)).toBe('/app/library/p1');
    expect(pathOf('exp://127.0.0.1:8081/--/lesson/l1', PREFIXES)).toBe('/lesson/l1');
  });

  it('ignores somebody else’s address, and a bare prefix that names no screen', () => {
    expect(pathOf('https://example.com/app/users/u1', PREFIXES)).toBeNull();
    expect(pathOf('hevalo://', PREFIXES)).toBeNull();
    expect(pathOf('https://hevalo.app/', PREFIXES)).toBeNull();
  });

  it('keeps the latest link and gives it up once', () => {
    holdLink('hevalo://app/users/u1', PREFIXES);
    holdLink('https://hevalo.app/app/dimen/m1', PREFIXES);
    holdLink('https://example.com/elsewhere', PREFIXES);
    expect(takeHeldLink()).toBe('/app/dimen/m1');
    expect(takeHeldLink()).toBeNull();
  });
});

describe('which links wait', () => {
  const verified = { emailVerified: true };

  it('are every one while signed out, the one that started the app among them', () => {
    expect(linkHolding('signedOut', null)).toBe('launch');
  });

  it('are the ones tapped while an email code or a birth month is still asked for', () => {
    expect(linkHolding('signedIn', { emailVerified: false })).toBe('later');
    expect(linkHolding('signedIn', { ...verified, birthDateRequired: true })).toBe('later');
  });

  it('are none once the signed-in screens are there, or while the session is still read', () => {
    expect(linkHolding('signedIn', verified)).toBe('none');
    expect(linkHolding('signedIn', { ...verified, birthDateRequired: false })).toBe('none');
    expect(linkHolding('restoring', null)).toBe('none');
  });
});

describe('the link that started the app', () => {
  it('is kept by signed-out first screens, and not again at the next sign-out', () => {
    const keep = launchLinkKeeper();
    expect(keep('launch')).toBe(true);
    expect(keep('none')).toBe(false);
    expect(keep('launch')).toBe(false);
  });

  it('is not kept at a sign-out when the app started signed in, where it was opened already', () => {
    const keep = launchLinkKeeper();
    expect(keep('none')).toBe(false);
    expect(keep('launch')).toBe(false);
  });

  it('is left to the navigation’s own start while an email code is asked for', () => {
    const keep = launchLinkKeeper();
    expect(keep('later')).toBe(false);
    expect(keep('launch')).toBe(false);
  });
});
