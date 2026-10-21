import { describe, expect, it } from 'vitest';
import { groupByCategory } from '@kurda/shared';
import {
  canAfford,
  canGift,
  itemsText,
  kindWithCount,
  sectionTitle,
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

// a translator that shows which key it was asked for, with its values
const t = (key: string, vars?: Record<string, string | number>): string =>
  `translated:${key}${vars ? `(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : ''}`;

describe('the shop’s sections', () => {
  it('are the shared kinds, in the order every screen shows them', () => {
    // GET /shop orders by category name; the sections do not follow it
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

describe('sectionTitle', () => {
  it('translates each kind', () => {
    expect(sectionTitle('background', t as never)).toBe('translated:shop.kind.background');
    expect(sectionTitle('icon', t as never)).toBe('translated:shop.kind.icon');
    expect(sectionTitle('tag', t as never)).toBe('translated:shop.kind.tag');
  });

  it('files a category nobody has a kind for under "More", rather than showing the server’s word', () => {
    // the old shop headed sections BACKGROUND, ICON, TAG and once SHOP.CATEGORY.MISC
    for (const category of ['misc', 'cosmetic', 'powerup', 'brand-new-thing']) {
      expect(sectionTitle(category, t as never)).toBe('translated:shop.kind.other');
    }
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
  it('checks the item currency against the matching balance', () => {
    expect(canAfford(item({ price: 100, currency: 'zer' }), { zer: 150, gems: 0 })).toBe(true);
    expect(canAfford(item({ price: 100, currency: 'zer' }), { zer: 50, gems: 999 })).toBe(false);
    expect(canAfford(item({ price: 10, currency: 'gems' }), { zer: 0, gems: 10 })).toBe(true);
    expect(canAfford(item({ price: 10, currency: 'gems' }), { zer: 5000, gems: 9 })).toBe(false);
  });

  it('counts each friend a gift goes to', () => {
    expect(withinBalance({ price: 300, currency: 'zer' }, { zer: 600, gems: 0 }, 2)).toBe(true);
    expect(withinBalance({ price: 300, currency: 'zer' }, { zer: 600, gems: 0 }, 3)).toBe(false);
  });
});

describe('canGift', () => {
  it('offers a gift only for something that costs something', () => {
    expect(canGift(item({ price: 0 }))).toBe(false);
    expect(canGift(item({ price: 500 }))).toBe(true);
  });
});

describe('needsConfirmation', () => {
  it('asks only for Zêr purchases above the threshold', () => {
    expect(needsConfirmation(item({ currency: 'zer', price: CONFIRM_THRESHOLD_ZER + 1 }))).toBe(true);
    expect(needsConfirmation(item({ currency: 'zer', price: CONFIRM_THRESHOLD_ZER }))).toBe(false);
    expect(needsConfirmation(item({ currency: 'gems', price: 100_000 }))).toBe(false);
  });
});
