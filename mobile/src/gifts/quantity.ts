/**
 * Several of one gift at once, in words: "3 × Çay" from the one pattern each language words its own way, and how many a
 * gift's notice says came. One gift is its name alone, as before several could be sent.
 */
import type { Translate } from '../api/errors';
import { formatNumber } from '../i18n/format';
import type { Locale } from '../i18n/translations';

/** A gift's name with how many of it, "3 × Çay"; one is the name alone. */
export function countedName(name: string, quantity: number, t: Translate, locale: Locale): string {
  return quantity > 1 ? t('gift.count', { count: formatNumber(quantity, locale), name }) : name;
}

/** "3 × Çay" in the words round the name, so the name itself can keep its own language. */
export function countedAround(name: string, quantity: number, t: Translate, locale: Locale): { before: string; after: string } {
  const text = countedName(name, quantity, t, locale);
  const at = text.indexOf(name);
  return at < 0 ? { before: '', after: '' } : { before: text.slice(0, at), after: text.slice(at + name.length) };
}

/**
 * How many came, written for the reader, when a gift's notice was for several ("3"); null for one. The notice never
 * names the gift, which stays a surprise until it is unwrapped.
 */
export function noticeGiftCount(data: Record<string, unknown>, locale: Locale): string | null {
  const quantity = typeof data.quantity === 'string' ? Number(data.quantity) : NaN;
  return Number.isInteger(quantity) && quantity > 1 ? formatNumber(quantity, locale) : null;
}
