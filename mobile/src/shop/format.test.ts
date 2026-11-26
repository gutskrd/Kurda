import { describe, expect, it } from 'vitest';
import { groupByCategory } from '@kurda/shared';
import {
  canAfford,
  canGift,
  itemsText,
  kindWithCount,
  CONFIRM_THRESHOLD_ZER,
  needsConfirmation,
  withinBalance,
  type ShopItem,
} from './format';

const item = (over: Partial<ShopItem>): ShopItem => ({
  sku: 's',
  name: 'n',
  description: null,
  category: 'background',
  currency: 'zer',
  price: 100,
  isUnique: true,
  inStock: true,
  assetUrl: null,
  premiumOnly: false,
  ...over,
});

// A translator that shows which key it was asked for, with its values.
const t = (key: string, vars?: Record<string, string | number>): string =>
  `translated:${key}${vars ? `(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : ''}`;

describe('the shop’s sections', () => {
  it('are the shared kinds, in the order every screen shows them', () => {
    // GET /shop orders by category name; the sections do not follow it.
    const sections = groupByCategory([
      item({ sku: 'tag', category: 'tag' }),
      item({ sku: 'i1', category: 'icon' }),
      item({ sku: 'b1', category: 'background' }),
      item({ sku: 'm1', category: 'misc' }),
      item({ sku: 'i2', category: 'icon' }),
    ]);
    expect(sections.map((s) => s.category)).toEqual(['background', 'icon', 'tag', 'other']);
    expect(sections[1]!.items.map((i) => i.sku)).toEqual(['i1', 'i2']);
  });
});

describe('counting', () => {
  it('says one item and many items', () => {
    expect(itemsText(t as never, 1)).toBe('translated:shop.items.one');
    expect(itemsText(t as never, 27)).toBe('translated:shop.items.many(count=27)');
  });

  it('reads a kind with its count', () => {
    expect(kindWithCount(t as never, 'icon', 14)).toBe(
      'translated:shop.kind.a11y(kind=translated:shop.kind.icon,items=translated:shop.items.many(count=14))',
    );
  });
});

describe('canAfford', () => {
  it('checks the price against the Zêr', () => {
    expect(canAfford(item({ price: 100 }), { zer: 150 })).toBe(true);
    expect(canAfford(item({ price: 100 }), { zer: 100 })).toBe(true);
    expect(canAfford(item({ price: 100 }), { zer: 50 })).toBe(false);
  });

  it('counts each friend a gift goes to', () => {
    expect(withinBalance({ price: 300 }, { zer: 600 }, 2)).toBe(true);
    expect(withinBalance({ price: 300 }, { zer: 600 }, 3)).toBe(false);
  });
});

describe('canGift', () => {
  it('offers a gift only for something that costs something', () => {
    expect(canGift(item({ price: 0 }))).toBe(false);
    expect(canGift(item({ price: 500 }))).toBe(true);
  });
});

describe('needsConfirmation', () => {
  it('asks for purchases above the threshold only', () => {
    expect(needsConfirmation(item({ price: CONFIRM_THRESHOLD_ZER + 1 }))).toBe(true);
    expect(needsConfirmation(item({ price: CONFIRM_THRESHOLD_ZER }))).toBe(false);
    // Nothing is spent on a free item, so there is nothing to be sure about.
    expect(needsConfirmation(item({ price: 0 }))).toBe(false);
  });
});
