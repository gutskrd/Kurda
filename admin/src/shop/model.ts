/** The shop's catalogue as the console sees it: an item, its state and the price rule, for pages/Shop.tsx and this folder. */
import type { Tone } from '../ui';

/** Zêr, the one currency everything is priced in. */
export type Currency = 'zer';

export interface ShopItem {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  currency: Currency;
  price: number;
  isUnique: boolean;
  active: boolean;
  inStock: boolean;
  availableFrom: string | null;
  availableTo: string | null;
  assetKey: string | null;
  premiumOnly: boolean;
  displayOrder: number;
  /** Deleted while people owned it: kept for them, gone from the shop. */
  retiredAt?: string | null;
  /** How many people own it. */
  owners?: number;
  /** Where its art is served from: a CDN URL, or a path on the site for the art that ships with it. */
  assetUrl?: string | null;
}

/** The kinds of item that are a picture, with a view of their own. */
export type ArtKind = 'background' | 'icon';
export const isArtKind = (category: string): category is ArtKind => category === 'background' || category === 'icon';

/** The categories POST /shop/items accepts, in words. */
export const CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'background', label: 'Background' },
  { value: 'icon', label: 'Profile icon' },
  { value: 'cosmetic', label: 'Cosmetic' },
  { value: 'tag', label: 'Tag' },
  { value: 'powerup', label: 'Power-up' },
  { value: 'freeze', label: 'Streak freeze' },
  { value: 'gift', label: 'Gift' },
  { value: 'misc', label: 'Other' },
];

export const categoryName = (c: string): string => CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** The price at which a change waits for a second admin (SENSITIVE_PRICE on the server). */
export const APPROVAL_PRICE = 500;

export function priceText(price: number, currency: Currency): string {
  return price === 0 ? 'Free' : `${price.toLocaleString()} ${currency === 'zer' ? 'Zêr' : currency}`;
}

export type SaleState = 'on' | 'off' | 'scheduled' | 'ended' | 'hidden' | 'retired';

/**
 * Whether someone can buy it now, and if not why: retired, hidden, off sale, or outside its sale window. The badge
 * says which, as each is undone in a different place.
 */
export function saleState(
  item: Pick<ShopItem, 'active' | 'inStock' | 'availableFrom' | 'availableTo' | 'retiredAt'>,
  now = Date.now(),
): SaleState {
  if (item.retiredAt) return 'retired';
  if (!item.active) return 'hidden';
  if (!item.inStock) return 'off';
  if (item.availableFrom && Date.parse(item.availableFrom) > now) return 'scheduled';
  if (item.availableTo && Date.parse(item.availableTo) < now) return 'ended';
  return 'on';
}

export const STATE: Record<SaleState, { text: string; tone: Tone }> = {
  on: { text: 'On sale', tone: 'ok' },
  off: { text: 'Off sale', tone: 'warn' },
  scheduled: { text: 'Starts later', tone: 'info' },
  ended: { text: 'Sale ended', tone: 'neutral' },
  hidden: { text: 'Hidden', tone: 'neutral' },
  retired: { text: 'Retired', tone: 'neutral' },
};

/** Whether saving goes to a second admin: a new price or currency at or over the line; the rest saves at once. */
export function needsApproval(before: Pick<ShopItem, 'price' | 'currency'> | null, price: number, currency: Currency): boolean {
  if (price < APPROVAL_PRICE) return false;
  return !before || before.price !== price || before.currency !== currency;
}

/** "3 people own it", for a card and the delete question. */
export function ownersText(n: number): string {
  if (n === 0) return 'Nobody owns it';
  return `${n.toLocaleString()} ${n === 1 ? 'person owns' : 'people own'} it`;
}
