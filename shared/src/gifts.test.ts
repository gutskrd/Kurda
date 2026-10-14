import { describe, expect, it } from 'vitest';
import { GIFT_TIERS, GIFT_UNWRAP_MS, GIFTS_PER_DAY, GIFTS_PER_FRIEND_PER_DAY, MAX_GIFT_RECIPIENTS, giftTierFor } from './gifts.js';

describe('gift tiers', () => {
  it('makes a limited item legendary whatever it costs', () => {
    expect(giftTierFor({ currency: 'zer', price: 100, limited: true })).toBe('legendary');
  });

  it('makes gem items and dear Zêr items rare', () => {
    expect(giftTierFor({ currency: 'gems', price: 20, limited: false })).toBe('rare');
    expect(giftTierFor({ currency: 'zer', price: 1500, limited: false })).toBe('rare');
  });

  it('leaves the rest common', () => {
    expect(giftTierFor({ currency: 'zer', price: 500, limited: false })).toBe('common');
  });

  it('plays a bigger moment for a bigger gift, and never long', () => {
    const times = GIFT_TIERS.map((t) => GIFT_UNWRAP_MS[t]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Math.max(...times)).toBeLessThanOrEqual(2500);
  });

  it('caps a day’s gifts above what one send can use', () => {
    expect(GIFTS_PER_DAY).toBeGreaterThanOrEqual(MAX_GIFT_RECIPIENTS);
    expect(GIFTS_PER_FRIEND_PER_DAY).toBeLessThan(GIFTS_PER_DAY);
  });
});
