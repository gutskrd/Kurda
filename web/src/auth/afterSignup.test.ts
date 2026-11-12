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

  it('keeps a game’s invite link, rebuilt from what it says', () => {
    expect(safeFrom('/join/impostor/KVXV5E?from=0B1E2D3C-4a5f-4c6d-8e7f-9a0b1c2d3e4f')).toBe('/join/impostor/KVXV5E?from=0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f');
    expect(safeFrom('/join/peyvok-battle/kvxv5e?from=someone&next=https://evil.example')).toBe('/join/peyvok-battle/KVXV5E');
    expect(safeFrom('/join/chess/KVXV5E')).toBeNull();
    expect(safeFrom('/join/impostor/KVXV5E/extra')).toBeNull();
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
