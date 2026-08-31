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

  it('marks the other default avatars as premium', () => {
    expect(isValidAvatarKey('default-02')).toBe(true);
    expect(avatarRequiresPremium('default-02')).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(isValidAvatarKey('not-a-real-avatar')).toBe(false);
    expect(isValidAvatarKey('')).toBe(false);
  });

  it('builds the web-static asset url', () => {
    expect(avatarAssetUrl('default-01')).toBe('/cosmetics/avatars/default-01.png');
  });

  it('lists a registry with default-01 free', () => {
    const reg = avatarRegistry();
    expect(reg.length).toBeGreaterThan(1);
    expect(reg.find((a) => a.key === 'default-01')).toEqual({ key: 'default-01', requiresPremium: false });
    expect(reg.every((a) => (a.key === 'default-01' ? !a.requiresPremium : a.requiresPremium))).toBe(true);
  });

  describe('effectiveAvatarKey', () => {
    it('returns a free avatar regardless of premium', () => {
      expect(effectiveAvatarKey('default-01', false)).toBe('default-01');
    });
    it('returns a premium avatar only while premium is active', () => {
      expect(effectiveAvatarKey('default-05', true)).toBe('default-05');
      expect(effectiveAvatarKey('default-05', false)).toBe('default-01');
    });
    it('falls back to default-01 for null/invalid selections', () => {
      expect(effectiveAvatarKey(null, true)).toBe('default-01');
      expect(effectiveAvatarKey('bogus-key', true)).toBe('default-01');
    });
  });
});
