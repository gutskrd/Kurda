import { describe, expect, it } from 'vitest';
import {
  GIFT_TIERS,
  GIFT_UNWRAP_MS,
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  GIFTS_RECEIVED_PER_DAY,
  GRAND_GIFT_PRICE,
  MAX_GIFT_RECIPIENTS,
  giftLockFor,
  giftTierFor,
  isGiftOnly,
  needsBigGiftConfirm,
} from './gifts.js';

describe('gift tiers', () => {
  it('makes a limited item legendary whatever it costs', () => {
    expect(giftTierFor({ price: 100, limited: true })).toBe('legendary');
  });

  it('makes dear items rare', () => {
    expect(giftTierFor({ price: 750, limited: false })).toBe('rare');
    expect(giftTierFor({ price: 1000, limited: false })).toBe('rare');
  });

  it('leaves the rest common', () => {
    expect(giftTierFor({ price: 700, limited: false })).toBe('common');
  });

  it('makes the moon, the sun and the galaxy grand, from two hundred euros up', () => {
    expect(GRAND_GIFT_PRICE).toBe(20_000);
    expect(giftTierFor({ price: 20_000, limited: false })).toBe('grand');
    expect(giftTierFor({ price: 100_000, limited: true })).toBe('grand');
    expect(giftTierFor({ price: 19_999, limited: false })).toBe('rare');
  });

  it('plays a bigger moment for a bigger gift, and never long', () => {
    const times = GIFT_TIERS.map((t) => GIFT_UNWRAP_MS[t]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Math.max(...times)).toBeLessThanOrEqual(3500);
  });

  it('caps a day’s gifts above what one send can use', () => {
    expect(GIFTS_PER_DAY).toBeGreaterThanOrEqual(MAX_GIFT_RECIPIENTS);
    expect(GIFTS_PER_FRIEND_PER_DAY).toBeLessThan(GIFTS_PER_DAY);
  });

  it('caps what one person can be given in a day, whoever sends it', () => {
    // more than one friend’s share, so a few friends can still all give on a birthday
    expect(GIFTS_RECEIVED_PER_DAY).toBeGreaterThan(GIFTS_PER_FRIEND_PER_DAY);
    // and no more than one sender’s whole day, so many senders cannot multiply it
    expect(GIFTS_RECEIVED_PER_DAY).toBeLessThanOrEqual(GIFTS_PER_DAY);
  });
});

describe('gifts on the shelf', () => {
  it('are told apart from what is worn by their category, the retired stickers too', () => {
    expect(isGiftOnly('gift')).toBe(true);
    expect(isGiftOnly('sticker')).toBe(true);
    expect(isGiftOnly('icon')).toBe(false);
  });

  it('locks what is dearer than the send may cost, or more than is left to spend', () => {
    const limits = { maxPrice: 500, left: 1_000, confirmFrom: 2_000 };
    expect(giftLockFor({ price: 500 }, 1, limits)).toBeNull();
    expect(giftLockFor({ price: 501 }, 1, limits)).toBe('over_limit');
    expect(giftLockFor({ price: 400 }, 3, limits)).toBe('spend_limit');
    expect(giftLockFor({ price: 100_000 }, 1, { maxPrice: null, left: null, confirmFrom: 2_000 })).toBeNull();
    expect(giftLockFor({ price: 100_000 }, 1, undefined)).toBeNull();
  });

  it('asks a second time from the confirmation amount up', () => {
    expect(needsBigGiftConfirm(1_999, { confirmFrom: 2_000 })).toBe(false);
    expect(needsBigGiftConfirm(2_000, { confirmFrom: 2_000 })).toBe(true);
    expect(needsBigGiftConfirm(5_000, null)).toBe(false);
  });
});
