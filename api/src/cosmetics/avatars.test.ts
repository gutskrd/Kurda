import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_KEY,
  avatarAssetUrl,
  avatarRegistry,
  avatarRequiresPremium,
  effectiveAvatarKey,
  isValidAvatarKey,
} from './avatars.js';

describe('avatar registry', () => {
  it('exposes default-01 as the free universal fallback', () => {
    expect(DEFAULT_AVATAR_KEY).toBe('default-01');
    expect(isValidAvatarKey('default-01')).toBe(true);
    expect(avatarRequiresPremium('default-01')).toBe(false);
  });

  /**
   * The built-in avatars used to be a paid range with one free fallback. They
   * are all free now, and this is the assertion that says so: a manifest entry
   * that quietly goes back to `requiresPremium: true` fails here rather than
   * silently locking a picture someone was already using.
   */
  it('gives away every built-in avatar', () => {
    const reg = avatarRegistry();
    expect(reg.length).toBeGreaterThan(1);
    expect(reg.filter((a) => a.requiresPremium)).toEqual([]);
  });

  it('rejects unknown keys', () => {
    expect(isValidAvatarKey('not-a-real-avatar')).toBe(false);
    expect(isValidAvatarKey('')).toBe(false);
  });

  it('builds the web-static asset url', () => {
    expect(avatarAssetUrl('default-01')).toBe('/cosmetics/avatars/default-01.png');
  });

  describe('effectiveAvatarKey', () => {
    /**
     * Nothing in the catalog is premium any more, so premium is no longer
     * an input to which picture you get. The gate stays in the function
     * because it is what a future premium avatar would need, and because it
     * is the reason a lapsed entitlement degrades to a valid picture rather
     * than a broken one.
     */
    it('resolves a chosen avatar whether or not premium is active', () => {
      expect(effectiveAvatarKey('default-01', false)).toBe('default-01');
      expect(effectiveAvatarKey('default-05', false)).toBe('default-05');
      expect(effectiveAvatarKey('default-05', true)).toBe('default-05');
    });

    it('falls back to default-01 for null/invalid selections', () => {
      expect(effectiveAvatarKey(null, true)).toBe('default-01');
      expect(effectiveAvatarKey('bogus-key', true)).toBe('default-01');
    });
  });
});
