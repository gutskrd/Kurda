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

  /** Every built-in avatar is free, so a manifest entry turning premium again fails here instead of locking a picture. */
  it('gives away every built-in avatar', () => {
    const reg = avatarRegistry();
    expect(reg.length).toBeGreaterThan(1);
    expect(reg.filter((a) => a.requiresPremium)).toEqual([]);
  });

  // The former default (the deer in the hat) is an avatar of its own; a migration moved everyone who chose it there.
  it('keeps the old default picture selectable as default-17', () => {
    expect(isValidAvatarKey('default-17')).toBe(true);
    expect(avatarRequiresPremium('default-17')).toBe(false);
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
     * No avatar is premium now, but the gate stays for a future premium avatar, and because it makes a lapsed
     * entitlement fall back to a valid picture.
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
