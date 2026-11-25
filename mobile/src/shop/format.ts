/** Pure shop view helpers, with no React Native so they are unit-testable. */

import type { ItemCategory, ItemSort } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/** Zêr is the only currency; items still say so, for servers and builds that sent another. */
export type Currency = 'zer';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  inStock: boolean;
  /** The item's art as a site path (`/cosmetics/icons/made-08-caydan.png`); `assetUrl()` makes it a whole address. */
  assetUrl: string | null;
  /** Worn free while Premium is active, and still for sale to keep. */
  premiumOnly: boolean;
}

export interface Balances {
  zer: number;
}

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Purchases above this many Zêr ask for explicit confirmation. */
export const CONFIRM_THRESHOLD_ZER = 500;

/**
 * The words for each kind of item, plural, as a tab and a section say them. The kinds, their order and what falls under
 * "More" are @kurda/shared's (shop-items.ts).
 */
export const KIND_LABEL: Record<ItemCategory | 'all', TranslationKey> = {
  all: 'shop.kind.all',
  background: 'shop.kind.background',
  icon: 'shop.kind.icon',
  frame: 'shop.kind.frame',
  tag: 'shop.kind.tag',
  sticker: 'shop.kind.sticker',
  other: 'shop.kind.other',
};

/** The orders a list can be put in, as the sort menu names them. */
export const SORT_LABEL: Record<ItemSort, TranslationKey> = {
  featured: 'shop.sort.featured',
  'price-asc': 'shop.sort.priceAsc',
  'price-desc': 'shop.sort.priceDesc',
  name: 'shop.sort.name',
};

/** "1 item", "27 items". */
export function itemsText(t: Translate, count: number): string {
  return count === 1 ? t('shop.items.one') : t('shop.items.many', { count });
}

/** A kind with its count, as a screen reader hears a tab or a heading: "Backgrounds, 27 items". */
export function kindWithCount(t: Translate, kind: ItemCategory | 'all', count: number): string {
  return t('shop.kind.a11y', { kind: t(KIND_LABEL[kind]), items: itemsText(t, count) });
}

/** The currency's name inside a sentence: Zêr is a name and never translated. */
export const ZER = 'Zêr';

/** Whether a balance covers an item. `times` is how many are paid for (a gift to several friends). */
export function withinBalance(item: { price: number }, balances: Balances, times = 1): boolean {
  return balances.zer >= item.price * times;
}

/** Whether the current balances cover this item. */
export function canAfford(item: ShopItem, balances: Balances): boolean {
  return withinBalance(item, balances);
}

/** Purchases that ask once more: dear ones. Every purchase is final, so the question repeats that. */
export function needsConfirmation(item: ShopItem): boolean {
  return item.price > CONFIRM_THRESHOLD_ZER;
}

/** Whether an item can be sent as a gift from the shop. A free one cannot (the API refuses it with NOT_GIFTABLE). */
export function canGift(item: ShopItem): boolean {
  return item.price > 0;
}
