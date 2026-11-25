import { describe, expect, it } from 'vitest';
import { GIFT_ART_IDS, giftArtKey } from './art/gift-art.js';
import {
  BAG_GIFTS_PER_DAY,
  BAG_MAX_EACH,
  BAG_SOURCES,
  GIFTS,
  GIFT_GROUPS,
  bagGiftFor,
  drawnGiftArtKey,
  drawnGifts,
  giftMeaning,
  giftMeaningLocales,
  giftOfSku,
  giftShelves,
  giftSku,
} from './gift-catalogue.js';
import { APP_LOCALE_CODES } from './locales.js';
import { MINOR_GIFT_MAX_PRICE } from './gift-safety.js';

describe('the gift catalogue', () => {
  it('holds the thirty-one gifts, cheapest first, from a cent to a thousand euros', () => {
    expect(GIFTS).toHaveLength(31);
    const prices = GIFTS.map((g) => g.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(prices[0]).toBe(1);
    expect(prices.at(-1)).toBe(100_000);
    expect(new Set(GIFTS.map((g) => g.id)).size).toBe(31);
  });

  it('keeps the prices and groups of the spec', () => {
    const at = (id: string) => GIFTS.find((g) => g.id === id)!;
    expect([at('cay').price, at('qehwe').price, at('gul').price, at('pisik').price]).toEqual([1, 2, 25, 150]);
    expect([at('belem').price, at('mal').price, at('heyv').price, at('kadiz').price]).toEqual([2_000, 5_000, 20_000, 100_000]);
    expect(at('pet')).toMatchObject({ group: 'sky', limited: true, price: 2_000 });
    expect(GIFTS.filter((g) => g.limited).map((g) => g.id)).toEqual(['pet']);
    for (const g of GIFTS) expect(GIFT_GROUPS).toContain(g.group);
  });

  it('earns only the four smallest gifts free, each small enough for anyone under 18 to give', () => {
    expect(GIFTS.filter((g) => g.earnedFree).map((g) => g.id)).toEqual(['cay', 'qehwe', 'beybun', 'sev']);
    for (const g of GIFTS.filter((x) => x.earnedFree)) expect(g.price).toBeLessThanOrEqual(MINOR_GIFT_MAX_PRICE);
  });

  it('finds a gift by its shop sku and nothing else', () => {
    expect(giftSku('heyv')).toBe('gift-heyv');
    expect(giftOfSku('gift-heyv')?.name).toBe('Heyv');
    expect(giftOfSku('gift-nothing')).toBeNull();
    expect(giftOfSku('sticker-heyv')).toBeNull();
    expect(giftOfSku('bg-made-bihar')).toBeNull();
  });

  it('offers only the drawn gifts, with the picture each is drawn as', () => {
    expect(drawnGifts().map((g) => g.id).sort()).toEqual([...GIFT_ART_IDS].sort());
    expect(drawnGiftArtKey('gift-cay')).toBe(giftArtKey('cay'));
    expect(drawnGiftArtKey('gift-lale')).toBeNull();
    expect(drawnGiftArtKey('sticker-lale')).toBeNull();
  });

  it('says what every gift means in every interface language', () => {
    for (const g of GIFTS) {
      expect(giftMeaningLocales(g.id).sort()).toEqual([...APP_LOCALE_CODES].sort());
      for (const locale of APP_LOCALE_CODES) expect(giftMeaning(giftSku(g.id), locale)?.trim()).toBeTruthy();
    }
    expect(giftMeaning('gift-cay', 'de')).toBe('Ein Glas Tee');
    expect(giftMeaning('gift-cay', 'xx')).toBe('A glass of tea');
    expect(giftMeaning('bg-made-bihar', 'en')).toBeNull();
  });

  it('never says the Kurmancî name again as its meaning to a Kurmancî reader', () => {
    for (const g of GIFTS) expect(giftMeaning(giftSku(g.id), 'ku')).not.toBe(g.name);
  });

  it('puts the shelves in their order, each cheapest first', () => {
    const shelves = giftShelves([
      { sku: 'gift-heyv', price: 20_000 },
      { sku: 'gift-qehwe', price: 2 },
      { sku: 'gift-cay', price: 1 },
      { sku: 'gift-gul', price: 25 },
      { sku: 'bg-other', price: 5 },
    ]);
    expect(shelves.map((s) => s.group)).toEqual(['warm', 'flowers', 'sky']);
    expect(shelves[0]!.items.map((i) => i.sku)).toEqual(['gift-cay', 'gift-qehwe']);
  });
});

describe('the gift bag', () => {
  it('fills from the moments that pay members, five a day and at most ninety-nine of each', () => {
    expect(BAG_SOURCES).toEqual(['daily', 'streak', 'win', 'podium', 'harvest']);
    expect(BAG_GIFTS_PER_DAY).toBe(5);
    expect(BAG_MAX_EACH).toBe(99);
  });

  it('gives each moment its own first choice once drawn, and a drawn one until then', () => {
    expect(bagGiftFor('daily')?.id).toBe('cay');
    expect(bagGiftFor('streak')?.id).toBe('qehwe');
    // an apple and a chamomile sprig are not drawn yet
    expect(bagGiftFor('harvest')?.id).toBe('cay');
    expect(bagGiftFor('podium')?.id).toBe('qehwe');
  });

  it('brings another kind once one is full, and nothing once every kind is', () => {
    expect(bagGiftFor('daily', (id) => (id === 'cay' ? BAG_MAX_EACH : 0))?.id).toBe('qehwe');
    expect(bagGiftFor('daily', () => BAG_MAX_EACH)).toBeNull();
  });
});
