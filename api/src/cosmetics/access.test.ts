import { describe, expect, it } from 'vitest';
import { resolveCosmetics, levelInfo, isPremiumActive, hasAccess, cosmeticAssetUrl, type EquippedItem } from './access.js';

const url = (key: string): string => `https://cdn.test/${key}`;
const NOW = new Date('2026-08-25T12:00:00Z');
const FUTURE = new Date('2026-12-31T00:00:00Z');
const PAST = new Date('2026-01-01T00:00:00Z');

const bg = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  sku: 'bg-x',
  assetKey: 'backgrounds/x.png',
  category: 'background',
  active: true,
  premiumOnly: false,
  owned: true,
  ...over,
});
const icon = (over: Partial<EquippedItem> = {}): EquippedItem => ({
  sku: 'icon-x',
  assetKey: 'icons/x.png',
  category: 'icon',
  active: true,
  premiumOnly: false,
  owned: true,
  ...over,
});

describe('isPremiumActive / hasAccess', () => {
  it('premium is active only with a future expiry', () => {
    expect(isPremiumActive(FUTURE, NOW)).toBe(true);
    expect(isPremiumActive(PAST, NOW)).toBe(false);
    expect(isPremiumActive(null, NOW)).toBe(false);
  });
  it('access = owned OR (premium_only && premium active); inactive never', () => {
    expect(hasAccess(bg({ owned: true, premiumOnly: false }), false)).toBe(true);
    expect(hasAccess(bg({ owned: false, premiumOnly: true }), true)).toBe(true);
    expect(hasAccess(bg({ owned: false, premiumOnly: true }), false)).toBe(false);
    expect(hasAccess(bg({ owned: false, premiumOnly: false }), true)).toBe(false);
    expect(hasAccess(bg({ owned: true, active: false }), true)).toBe(false);
  });
});

describe('resolveCosmetics — avatar priority', () => {
  it('uploaded photo wins over a selected default avatar', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: 'profile-photo/abc.webp', selectedAvatarKey: 'default-05', premiumUntil: null, background: null, icon: null },
      url,
      NOW,
    );
    expect(r.avatarUrl).toBe('https://cdn.test/profile-photo/abc.webp');
  });
  it('falls back to the selected default avatar (web-static path)', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: 'default-05', premiumUntil: null, background: null, icon: null },
      url,
      NOW,
    );
    expect(r.avatarUrl).toBe('/cosmetics/avatars/default-05.png');
  });
  it('is null when neither is set (web shows silhouette)', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: null, background: null, icon: null },
      url,
      NOW,
    );
    expect(r.avatarUrl).toBeNull();
  });
});

describe('resolveCosmetics — background access + fallback', () => {
  it('owned background resolves (and survives premium expiry)', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: PAST, background: bg({ owned: true, premiumOnly: true }), icon: null },
      url,
      NOW,
    );
    expect(r.background).toEqual({ sku: 'bg-x', assetKey: 'backgrounds/x.png', type: 'image', url: 'https://cdn.test/backgrounds/x.png' });
  });
  it('premium-only background: usable with active premium, gone when expired/none', () => {
    const raw = (premiumUntil: Date | null) => ({
      profilePhotoKey: null, selectedAvatarKey: null, premiumUntil,
      background: bg({ owned: false, premiumOnly: true }), icon: null,
    });
    expect(resolveCosmetics(raw(FUTURE), url, NOW).background).not.toBeNull();
    expect(resolveCosmetics(raw(PAST), url, NOW).background).toBeNull();
    expect(resolveCosmetics(raw(null), url, NOW).background).toBeNull();
  });
  it('inactive background resolves to default (null)', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: FUTURE, background: bg({ active: false, premiumOnly: true }), icon: null },
      url,
      NOW,
    );
    expect(r.background).toBeNull();
  });
  it('detects gif and video types', () => {
    const t = (assetKey: string) =>
      resolveCosmetics({ profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: null, background: bg({ assetKey }), icon: null }, url, NOW)
        .background?.type;
    expect(t('backgrounds/a.gif')).toBe('gif');
    expect(t('backgrounds/a.mp4')).toBe('video');
    expect(t('backgrounds/a.webp')).toBe('image');
  });
});

describe('resolveCosmetics — icon', () => {
  it('owned icon resolves to a web-static url', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: null, background: null, icon: icon({ owned: true }) },
      url,
      NOW,
    );
    expect(r.icon).toEqual({ sku: 'icon-x', assetKey: 'icons/x.png', url: '/cosmetics/icons/x.png' });
  });
  it('premium-only icon disappears when premium is not active', () => {
    const r = resolveCosmetics(
      { profilePhotoKey: null, selectedAvatarKey: null, premiumUntil: PAST, background: null, icon: icon({ owned: false, premiumOnly: true }) },
      url,
      NOW,
    );
    expect(r.icon).toBeNull();
  });
});

describe('cosmeticAssetUrl (shop/inventory browsing)', () => {
  const pub = (key: string): string => `https://cdn.test/${key}`;
  it('resolves backgrounds via R2 publicUrl and icons via the web-static base', () => {
    expect(cosmeticAssetUrl('background', 'backgrounds/a.mp4', pub)).toBe('https://cdn.test/backgrounds/a.mp4');
    expect(cosmeticAssetUrl('icon', 'icons/i.png', pub)).toBe('/cosmetics/icons/i.png');
  });
  it('is null for non-cosmetic categories, missing keys, or no storage', () => {
    expect(cosmeticAssetUrl('powerup', 'x', pub)).toBeNull();
    expect(cosmeticAssetUrl('background', null, pub)).toBeNull();
    expect(cosmeticAssetUrl('background', 'backgrounds/a.mp4', () => null)).toBeNull();
  });
});

describe('levelInfo', () => {
  it('derives level + bounded progress from xp (shared formula)', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    const mid = levelInfo(250);
    expect(mid.level).toBe(2);
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThan(1);
    expect(levelInfo(-5).xp).toBe(0);
  });
});
