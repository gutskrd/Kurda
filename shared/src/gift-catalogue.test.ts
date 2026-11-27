import { describe, expect, it } from 'vitest';
import { giftArtKey, isGiftArtId } from './art/gift-art.js';
import {
  BAG_GIFTS_PER_DAY,
  BAG_MAX_EACH,
  BAG_SOURCES,
  GIFTS,
  GIFT_GROUPS,
  bagGiftFor,
  drawnGiftArtKey,
  drawnGifts,
  giftForAdultsOnly,
  giftInSeason,
  giftMeaning,
  giftMeaningLocales,
  giftOfSku,
  giftShelves,
  giftSku,
  isLimitedItem,
} from './gift-catalogue.js';
import { APP_LOCALE_CODES } from './locales.js';
import { MINOR_GIFT_MAX_PRICE } from './gift-safety.js';

describe('the gift catalogue', () => {
  it('holds the thirty-four gifts, cheapest first, from a cent to a thousand euros', () => {
    expect(GIFTS).toHaveLength(34);
    const prices = GIFTS.map((g) => g.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(prices[0]).toBe(1);
    expect(prices.at(-1)).toBe(100_000);
    expect(new Set(GIFTS.map((g) => g.id)).size).toBe(34);
  });

  it('keeps the prices and groups of the spec', () => {
    const at = (id: string) => GIFTS.find((g) => g.id === id)!;
    expect([at('cay').price, at('qehwe').price, at('gul').price, at('pisik').price]).toEqual([1, 2, 25, 150]);
    expect([at('belem').price, at('mal').price, at('heyv').price, at('kadiz').price]).toEqual([2_000, 5_000, 20_000, 100_000]);
    expect(at('pet')).toMatchObject({ group: 'sky', limited: true, price: 2_000 });
    expect(at('kawa')).toMatchObject({ name: 'Çakûçê Kawa', group: 'legends', price: 5_000 });
    expect(at('sahmaran')).toMatchObject({ name: 'Wêneyê Şahmaranê', group: 'legends', price: 7_500 });
    expect(GIFT_GROUPS.at(-1)).toBe('legends');
    expect(GIFTS.filter((g) => g.limited).map((g) => g.id)).toEqual(['pet']);
    for (const g of GIFTS) expect(GIFT_GROUPS).toContain(g.group);
  });

  it('keeps the clove apple, a token of courtship, beside the apple and between adults only', () => {
    expect(GIFTS.filter((g) => g.adultsOnly).map((g) => g.id)).toEqual(['sev-mexek']);
    expect(giftOfSku('gift-sev-mexek')).toMatchObject({ name: 'Sêva mêxekî', group: 'warm', price: 100, earnedFree: false });
    expect(giftForAdultsOnly('gift-sev-mexek')).toBe(true);
    expect(giftForAdultsOnly('gift-sev')).toBe(false);
    expect(giftForAdultsOnly('bg-made-bihar')).toBe(false);
    const warm = giftShelves(GIFTS.map((g) => ({ sku: giftSku(g.id), price: g.price }))).find((s) => s.group === 'warm')!;
    expect(warm.items.map((i) => i.sku)).toEqual(['gift-cay', 'gift-qehwe', 'gift-sev', 'gift-sev-mexek', 'gift-semawer']);
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

  it('offers each gift once its picture is painted, with the picture it is drawn as', () => {
    for (const g of GIFTS) expect(drawnGiftArtKey(giftSku(g.id)), g.id).toBe(isGiftArtId(g.id) ? giftArtKey(g.id) : null);
    expect(drawnGifts().map((g) => g.id)).toEqual(GIFTS.filter((g) => isGiftArtId(g.id)).map((g) => g.id));
    // all thirty-four are painted
    expect(drawnGifts()).toHaveLength(GIFTS.length);
    expect(drawnGiftArtKey('sticker-lale')).toBeNull();
    expect(drawnGiftArtKey('gift-unknown')).toBeNull();
  });

  it('sells the Newroz fire in March only, every year, by the UTC calendar', () => {
    expect(giftInSeason('gift-pet', new Date('2027-03-01T00:00:00Z'))).toBe(true);
    expect(giftInSeason('gift-pet', new Date('2040-03-31T23:59:59Z'))).toBe(true);
    expect(giftInSeason('gift-pet', new Date('2027-04-01T00:00:00Z'))).toBe(false);
    expect(giftInSeason('gift-cay', new Date('2027-04-01T00:00:00Z'))).toBe(true);
    expect(isLimitedItem('gift-pet', null)).toBe(true);
    expect(isLimitedItem('gift-cay', null)).toBe(false);
    expect(isLimitedItem('bg-newroz', '2027-03-22T00:00:00Z')).toBe(true);
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

  it('gives each moment its own first choice', () => {
    expect(bagGiftFor('daily')?.id).toBe('cay');
    expect(bagGiftFor('streak')?.id).toBe('qehwe');
    expect(bagGiftFor('harvest')?.id).toBe('sev');
    expect(bagGiftFor('podium')?.id).toBe('beybun');
  });

  it('brings another kind once one is full, and nothing once every kind is', () => {
    expect(bagGiftFor('daily', (id) => (id === 'cay' ? BAG_MAX_EACH : 0))?.id).toBe('qehwe');
    expect(bagGiftFor('daily', () => BAG_MAX_EACH)).toBeNull();
  });
});
