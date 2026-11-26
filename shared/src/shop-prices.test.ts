import { describe, expect, it } from 'vitest';
import { GIFTS } from './gift-catalogue.js';
import { PLUS_PLANS } from './plus.js';
import { PRICE_LADDER, RARITIES, itemRarity } from './shop-prices.js';
import { KURDISH_TAG_SKU, isWordTag } from './shop-tags.js';
import { shopItemDescription } from './shop-descriptions.js';

const steps = (kind: keyof typeof PRICE_LADDER): number[] => RARITIES.map((r) => PRICE_LADDER[kind][r]).filter((p): p is number => p != null);

describe('the price ladder', () => {
  it('climbs within every kind, and a background stays under an icon and an icon under a frame', () => {
    for (const kind of ['background', 'icon', 'tag', 'frame'] as const) expect([...steps(kind)].sort((a, b) => a - b)).toEqual(steps(kind));
    expect(Math.max(...steps('background'))).toBeLessThanOrEqual(Math.min(...steps('icon')) + 50);
    expect(Math.max(...steps('icon'))).toBeLessThanOrEqual(Math.min(...steps('frame')));
  });

  it('never sells a look for as little as five tulips, nor a frame for two months of Hevalo+', () => {
    const lale = GIFTS.find((g) => g.id === 'lale')!.price;
    const monthly = PLUS_PLANS.find((p) => p.id === 'monthly')!.priceCents;
    for (const kind of ['background', 'icon', 'tag', 'frame'] as const) expect(Math.min(...steps(kind))).toBeGreaterThan(lale * 5);
    expect(Math.max(...steps('frame'))).toBeLessThan(monthly * 2);
  });

  it('names a price by the highest step it reaches', () => {
    expect(itemRarity({ category: 'frame', price: 250 })).toBe('classic');
    expect(itemRarity({ category: 'frame', price: 349 })).toBe('classic');
    expect(itemRarity({ category: 'frame', price: 350 })).toBe('fine');
    expect(itemRarity({ category: 'frame', price: 450 })).toBe('rare');
    expect(itemRarity({ category: 'frame', price: 600 })).toBe('masterwork');
    expect(itemRarity({ category: 'background', price: 200 })).toBe('rare');
    expect(itemRarity({ category: 'background', price: 900 })).toBe('rare');
    expect(itemRarity({ category: 'icon', price: 150 })).toBe('classic');
    expect(itemRarity({ category: 'tag', price: 150 })).toBe('fine');
    // under the first step an admin's price is still the first
    expect(itemRarity({ category: 'icon', price: 40 })).toBe('classic');
  });

  it('names nothing free, nothing it does not price, and not the Kurdish tag', () => {
    expect(itemRarity({ category: 'background', price: 0 })).toBeNull();
    expect(itemRarity({ category: 'gift', price: 500 })).toBeNull();
    expect(itemRarity({ category: 'powerup', price: 30 })).toBeNull();
    expect(itemRarity({ sku: KURDISH_TAG_SKU, category: 'tag', price: 250 })).toBeNull();
  });
});

describe('a word tag', () => {
  it('is any tag the shop sells but the Kurdish one', () => {
    expect(isWordTag({ sku: 'tag-heval', category: 'tag' })).toBe(true);
    expect(isWordTag({ sku: KURDISH_TAG_SKU, category: 'tag' })).toBe(false);
    expect(isWordTag({ sku: 'frame-made-lale', category: 'frame' })).toBe(false);
  });

  it('means something in the reader’s language, and nothing under a Kurmancî word that says it already', () => {
    expect(shopItemDescription({ name: 'Mêvanperwer', description: 'Hospitable' }, 'tr')).toBe('Misafirperver');
    expect(shopItemDescription({ name: 'Mêvanperwer', description: 'Hospitable' }, 'ku')).toBeNull();
    expect(shopItemDescription({ name: 'Roja Nû', description: 'A new day' }, 'ku')).toBe('Wateya Newrozê');
  });
});
