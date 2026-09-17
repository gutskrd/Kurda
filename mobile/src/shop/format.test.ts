import { describe, expect, it } from 'vitest';
import {
  canAfford,
  categoryLabel,
  sectionTitle,
  CONFIRM_THRESHOLD_ZER,
  groupByCategory,
  needsConfirmation,
  type ShopItem,
} from './format';

const item = (over: Partial<ShopItem>): ShopItem => ({
  sku: 's',
  name: 'n',
  description: null,
  category: 'cosmetic',
  currency: 'zer',
  price: 100,
  isUnique: true,
  inStock: true,
  ...over,
});

describe('groupByCategory', () => {
  it('groups and orders sections cosmetic → powerup → freeze → misc', () => {
    const sections = groupByCategory([
      item({ sku: 'a', category: 'freeze' }),
      item({ sku: 'b', category: 'cosmetic' }),
      item({ sku: 'c', category: 'misc' }),
      item({ sku: 'd', category: 'powerup' }),
    ]);
    expect(sections.map((s) => s.category)).toEqual(['cosmetic', 'powerup', 'freeze', 'misc']);
    expect(sections[0]!.data.map((i) => i.sku)).toEqual(['b']);
  });
});

describe('categoryLabel', () => {
  it('maps known categories and passes through unknown ones', () => {
    expect(categoryLabel('freeze')).toBe('shop.category.freeze');
    expect(categoryLabel('weird')).toBe('weird');
  });
});

describe('canAfford', () => {
  it('checks the item currency against the matching balance', () => {
    expect(canAfford(item({ price: 100, currency: 'zer' }), { zer: 150, gems: 0 })).toBe(true);
    expect(canAfford(item({ price: 100, currency: 'zer' }), { zer: 50, gems: 999 })).toBe(false);
    expect(canAfford(item({ price: 10, currency: 'gems' }), { zer: 0, gems: 10 })).toBe(true);
  });
});

describe('needsConfirmation', () => {
  it('asks only for Zêr purchases above the threshold', () => {
    expect(needsConfirmation(item({ currency: 'zer', price: CONFIRM_THRESHOLD_ZER + 1 }))).toBe(true);
    expect(needsConfirmation(item({ currency: 'zer', price: CONFIRM_THRESHOLD_ZER }))).toBe(false);
    expect(needsConfirmation(item({ currency: 'gems', price: 100_000 }))).toBe(false);
  });
});

describe('sectionTitle', () => {
  const t = (key: string): string => `translated:${key}`;

  it('translates a known category', () => {
    // the bug this exists for: categoryLabel returns a key, a key is a string,
    // and the shop rendered SHOP.CATEGORY.MISC as a heading
    expect(sectionTitle('misc', t as never)).toBe('translated:shop.category.misc');
    expect(sectionTitle('cosmetic', t as never)).toBe('translated:shop.category.cosmetic');
  });

  it('passes a category the server invented through untranslated', () => {
    expect(sectionTitle('brand-new-thing', t as never)).toBe('brand-new-thing');
  });

  it('never returns something that looks like a key', () => {
    for (const category of ['cosmetic', 'powerup', 'freeze', 'misc']) {
      expect(sectionTitle(category, t as never)).not.toMatch(/^shop\./);
    }
  });
});
