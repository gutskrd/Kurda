/** Pure shop view helpers (KUR-070) — no React Native, so unit-testable. */

import { itemCategory, type ItemCategory, type ItemSort } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

export type Currency = 'zer' | 'gems';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  inStock: boolean;
  /**
   * The item's art, as a site path (`/cosmetics/icons/made-08-caydan.png`) —
   * `assetUrl()` makes it a whole address. `GET /shop` has always sent it;
   * this type had dropped it, so no row in the phone's shop had a picture.
   */
  assetUrl: string | null;
  /** worn free while Premium is active, and still for sale to keep */
  premiumOnly: boolean;
}

export interface Balances {
  zer: number;
  gems: number;
}

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Purchases above this many Zêr ask for explicit confirmation (KUR-070). */
export const CONFIRM_THRESHOLD_ZER = 500;

/**
 * The words for each kind of item, plural, as a tab and a section say them.
 *
 * The kinds themselves, their order and what falls under "More" are
 * @kurda/shared's (shop-items.ts), the same for the shop, the inventory and
 * the gift picker, on the phone and in the browser.
 */
export const KIND_LABEL: Record<ItemCategory | 'all', TranslationKey> = {
  all: 'shop.kind.all',
  background: 'shop.kind.background',
  icon: 'shop.kind.icon',
  frame: 'shop.kind.frame',
  tag: 'shop.kind.tag',
  other: 'shop.kind.other',
};

/** The orders a list can be put in, as the sort menu names them. */
export const SORT_LABEL: Record<ItemSort, TranslationKey> = {
  featured: 'shop.sort.featured',
  'price-asc': 'shop.sort.priceAsc',
  'price-desc': 'shop.sort.priceDesc',
  name: 'shop.sort.name',
};

/**
 * The words for a section heading.
 *
 * Every category the server sends is filed under one of the shared kinds, so
 * a heading is always a word — never the server's own (`BACKGROUND`) and never
 * a translation key, which is a string too and once rendered straight to
 * screen as SHOP.CATEGORY.MISC. A category nobody has a kind for is "More".
 */
export function sectionTitle(category: string, t: (key: TranslationKey) => string): string {
  return t(KIND_LABEL[itemCategory(category)]);
}

/** "1 item", "27 items". */
export function itemsText(t: Translate, count: number): string {
  return count === 1 ? t('shop.items.one') : t('shop.items.many', { count });
}

/** A kind with its count, as a screen reader hears a tab or a heading: "Backgrounds, 27 items". */
export function kindWithCount(t: Translate, kind: ItemCategory | 'all', count: number): string {
  return t('shop.kind.a11y', { kind: t(KIND_LABEL[kind]), items: itemsText(t, count) });
}

export function currencyLabel(currency: Currency): string {
  return currency === 'zer' ? 'Zêr' : 'Gems';
}

/**
 * Whether a balance covers an item, in the item's own currency: a gem item
 * against the gems, never against the Zêr. `times` is how many are being paid
 * for (a gift to several friends).
 */
export function withinBalance(item: { currency: Currency; price: number }, balances: Balances, times = 1): boolean {
  return balances[item.currency] >= item.price * times;
}

/** Can the user afford this item with their current balances? */
export function canAfford(item: ShopItem, balances: Balances): boolean {
  return withinBalance(item, balances);
}

/** High-value Zêr purchases require a confirmation step. */
export function needsConfirmation(item: ShopItem): boolean {
  return item.currency === 'zer' && item.price > CONFIRM_THRESHOLD_ZER;
}

/**
 * Whether an item can be sent as a gift from the shop. Something free cannot
 * — the API refuses it (NOT_GIFTABLE) — so it is not offered.
 */
export function canGift(item: ShopItem): boolean {
  return item.price > 0;
}
