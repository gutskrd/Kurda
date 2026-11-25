import { describe, expect, it } from 'vitest';
import {
  GIFT_TIERS,
  GIFT_UNWRAP_MS,
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  GIFTS_RECEIVED_PER_DAY,
  GIFT_STICKERS,
  MAX_GIFT_RECIPIENTS,
  giftTierFor,
  isGiftSticker,
} from './gifts.js';
import { FREE_GIFT_MAX_PRICE } from './plus.js';

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

  it('plays a bigger moment for a bigger gift, and never long', () => {
    const times = GIFT_TIERS.map((t) => GIFT_UNWRAP_MS[t]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Math.max(...times)).toBeLessThanOrEqual(2500);
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

describe('gift stickers', () => {
  it('come at three sizes, three of each, and any one can be a member’s free gift', () => {
    const prices = [...new Set(GIFT_STICKERS.map((s) => s.price))];
    expect(prices).toEqual([20, 50, 150]);
    for (const price of prices) expect(GIFT_STICKERS.filter((s) => s.price === price)).toHaveLength(3);
    expect(Math.max(...prices)).toBeLessThanOrEqual(FREE_GIFT_MAX_PRICE);
  });

  it('use the app icons’ own pictures, each sticker once', () => {
    for (const s of GIFT_STICKERS) expect(s.assetKey).toMatch(/^icons\/made-\d\d-[a-z-]+\.png$/);
    expect(new Set(GIFT_STICKERS.map((s) => s.sku)).size).toBe(GIFT_STICKERS.length);
    expect(new Set(GIFT_STICKERS.map((s) => s.assetKey)).size).toBe(GIFT_STICKERS.length);
  });

  it('are told apart by their category', () => {
    expect(isGiftSticker('sticker')).toBe(true);
    expect(isGiftSticker('icon')).toBe(false);
  });
});
