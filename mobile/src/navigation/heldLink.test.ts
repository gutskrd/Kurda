import { describe, expect, it } from 'vitest';
import { holdLink, pathOf, takeHeldLink } from './heldLink';

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
