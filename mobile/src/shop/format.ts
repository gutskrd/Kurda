/** Pure shop view helpers (KUR-070) — no React Native, so unit-testable. */

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
}

export interface Balances {
  zer: number;
  gems: number;
}

/** Purchases above this many Zêr ask for explicit confirmation (KUR-070). */
export const CONFIRM_THRESHOLD_ZER = 500;

/** A key per category; an unknown one falls back to the server's own word. */
export const CATEGORY_LABELS: Record<string, TranslationKey> = {
  cosmetic: 'shop.category.cosmetic',
  powerup: 'shop.category.powerup',
  freeze: 'shop.category.freeze',
  misc: 'shop.category.misc',
};

export function categoryLabel(category: string): TranslationKey | string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * The words for a section heading.
 *
 *  hands back a key, and a key is a string, so it rendered
 * straight to screen as SHOP.CATEGORY.MISC for months. This takes the
 * translator so the call site cannot forget it, and passes a category the
 * server invented through as it came.
 */
export function sectionTitle(category: string, t: (key: TranslationKey) => string): string {
  const key = CATEGORY_LABELS[category];
  return key ? t(key) : category;
}

export function currencyLabel(currency: Currency): string {
  return currency === 'zer' ? 'Zêr' : 'Gems';
}

/** Group catalog items into stable category sections for a SectionList. */
export function groupByCategory(items: ShopItem[]): Array<{ category: string; title: string; data: ShopItem[] }> {
  const order = ['cosmetic', 'powerup', 'freeze', 'misc'];
  const byCat = new Map<string, ShopItem[]>();
  for (const item of items) {
    const list = byCat.get(item.category) ?? [];
    list.push(item);
    byCat.set(item.category, list);
  }
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b);
  });
  return cats.map((category) => ({
    category,
    title: categoryLabel(category),
    data: byCat.get(category)!,
  }));
}

/** Can the user afford this item with their current balances? */
export function canAfford(item: ShopItem, balances: Balances): boolean {
  return balances[item.currency] >= item.price;
}

/** High-value Zêr purchases require a confirmation step. */
export function needsConfirmation(item: ShopItem): boolean {
  return item.currency === 'zer' && item.price > CONFIRM_THRESHOLD_ZER;
}
