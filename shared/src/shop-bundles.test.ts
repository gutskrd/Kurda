import { describe, expect, it } from 'vitest';
import { APP_LOCALE_CODES } from './locales.js';
import { BUNDLE_FLOOR_SHARE, WORDED_BUNDLES, bestValueBundle, bundleGlow, bundleQuote, bundleWordLocales, bundleWords, type BundlePartPrice } from './shop-bundles.js';

/** The tea house as it ships: a background, a frame, an icon and a tag, five teas, two coffees and an apple. */
const teaHouse = (owned: Partial<Record<'background' | 'frame' | 'icon' | 'tag', boolean>> = {}): BundlePartPrice[] => [
  { price: 200, quantity: 1, gift: false, owned: owned.background ?? false },
  { price: 350, quantity: 1, gift: false, owned: owned.frame ?? false },
  { price: 250, quantity: 1, gift: false, owned: owned.icon ?? false },
  { price: 150, quantity: 1, gift: false, owned: owned.tag ?? false },
  { price: 1, quantity: 5, gift: true, owned: false },
  { price: 2, quantity: 2, gift: true, owned: false },
  { price: 3, quantity: 1, gift: true, owned: false },
];

describe('a bundle’s price', () => {
  it('is its own price, and saves what its parts cost one by one less that', () => {
    expect(bundleQuote(500, teaHouse())).toEqual({ price: 500, worth: 962, saving: 462, savingPercent: 48, owned: 0, complete: false });
  });

  it('drops by the share of the parts someone owns, at the bundle’s own rate', () => {
    const q = bundleQuote(500, teaHouse({ frame: true }));
    // 500 × 612 / 962 = 318.1, rounded up to 320
    expect(q).toMatchObject({ price: 320, worth: 612, saving: 292, owned: 1, complete: false });
    expect(q.savingPercent).toBe(47);
  });

  it('never goes under its floor, and never over what the new parts cost alone', () => {
    const q = bundleQuote(500, teaHouse({ background: true, frame: true, icon: true }));
    // the tag and the gifts are 162 alone; the bundle’s rate would ask 85, under the floor of 100
    expect(q.price).toBe(500 * BUNDLE_FLOOR_SHARE);
    expect(q.worth).toBe(162);
    const cheap: BundlePartPrice[] = [
      { price: 300, quantity: 1, gift: false, owned: true },
      { price: 20, quantity: 1, gift: false, owned: false },
    ];
    expect(bundleQuote(300, cheap)).toMatchObject({ price: 20, worth: 20, saving: 0, savingPercent: 0 });
  });

  it('is not sold once every cosmetic in it is owned', () => {
    expect(bundleQuote(500, teaHouse({ background: true, frame: true, icon: true, tag: true }))).toEqual({
      price: 0,
      worth: 0,
      saving: 0,
      savingPercent: 0,
      owned: 4,
      complete: true,
    });
  });

  it('sells at its parts’ worth when an admin has made them cheaper than it', () => {
    expect(bundleQuote(1200, teaHouse())).toMatchObject({ price: 962, saving: 0, savingPercent: 0 });
  });
});

describe('the best value', () => {
  const view = (id: string, price: number, savingPercent: number, extra: { onSale?: boolean; complete?: boolean } = {}) => ({
    id,
    onSale: extra.onSale ?? true,
    quote: { price, worth: price * 2, saving: savingPercent > 0 ? price : 0, savingPercent, owned: 0, complete: extra.complete ?? false },
  });

  it('is the bundle that saves the largest share, the cheaper on a tie', () => {
    expect(bestValueBundle([view('a', 500, 44), view('b', 375, 47), view('c', 600, 43)])).toBe('b');
    expect(bestValueBundle([view('a', 500, 47), view('b', 375, 47)])).toBe('b');
  });

  it('is named only among two or more on sale that save something', () => {
    expect(bestValueBundle([view('a', 500, 44)])).toBeNull();
    expect(bestValueBundle([view('a', 500, 44), view('b', 375, 47, { onSale: false })])).toBeNull();
    expect(bestValueBundle([view('a', 500, 44), view('b', 375, 47, { complete: true })])).toBeNull();
    expect(bestValueBundle([view('a', 500, 0), view('b', 375, 0)])).toBeNull();
  });
});

describe('a bundle’s words', () => {
  it('are written in every interface language for every bundle', () => {
    for (const id of WORDED_BUNDLES) expect(bundleWordLocales(id).sort(), id).toEqual([...APP_LOCALE_CODES].sort());
  });

  it('say what the name means, and leave the title out where it would repeat the name', () => {
    expect(bundleWords('cayxane', 'Çayxane', 'en')).toEqual({ title: 'The tea house', story: expect.stringContaining('kilim') });
    expect(bundleWords('cayxane', 'Çayxane', 'ku')?.title).toBeNull();
    expect(bundleWords('cayxane', 'Çayxane', 'xx')?.title).toBe('The tea house');
    expect(bundleWords('mine', 'Mine', 'en')).toBeNull();
  });

  it('glow in their own colour', () => {
    expect(bundleGlow('newroz')).not.toBe(bundleGlow('zagros'));
    expect(bundleGlow('unknown')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
