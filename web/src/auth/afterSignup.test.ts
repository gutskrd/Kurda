import { describe, it, expect, afterEach, vi } from 'vitest';
import { rememberAfterSignup, safeFrom, takeAfterSignup } from './afterSignup';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('safeFrom', () => {
  it('keeps an address in the app, query and all', () => {
    expect(safeFrom('/app/games/peyvok-battle?id=8f3c')).toBe('/app/games/peyvok-battle?id=8f3c');
    expect(safeFrom('/app')).toBe('/app');
  });

  it('refuses anywhere else: another site, another origin in disguise, the app’s own doors', () => {
    expect(safeFrom('https://evil.example/app')).toBeNull();
    expect(safeFrom('//evil.example/app')).toBeNull();
    expect(safeFrom('/login')).toBeNull();
    expect(safeFrom('/app\\..\\x')).toBeNull();
    expect(safeFrom('/app x')).toBeNull();
    expect(safeFrom(undefined)).toBeNull();
    expect(safeFrom({ pathname: '/app' })).toBeNull();
  });
});

describe('remembering where a new account was going', () => {
  it('gives the address back once, then forgets it', () => {
    rememberAfterSignup('/app/games/stories?id=s1');
    expect(takeAfterSignup()).toBe('/app/games/stories?id=s1');
    expect(takeAfterSignup()).toBeNull();
  });

  it('forgets an address that is not the app’s, and an earlier one with it', () => {
    rememberAfterSignup('/app/friends');
    rememberAfterSignup('https://evil.example');
    expect(takeAfterSignup()).toBeNull();
  });

  it('lets a day-old address go: whatever it was is over', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    rememberAfterSignup('/app/games/rhyme-match?id=r1');
    vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);
    expect(takeAfterSignup()).toBeNull();
  });

  it('is fine on a device that will not remember', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberAfterSignup('/app')).not.toThrow();
  });
});
