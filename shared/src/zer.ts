/**
 * What Zêr is worth in money, so every price can show its real value beside it ("300 Zêr · ≈ €3"), and the packs the
 * phone stores will sell. 100 Zêr is one unit of the store's currency, a euro or a dollar, so a price reads at a glance;
 * a phone that has the store's own price for the smallest pack passes it as the rate, so the value is in the reader's
 * store currency, and everyone else sees euros.
 */

/** A rate: `amountMinor` of `currency` (ISO 4217, counted in its minor units, such as cents) buys `zer` Zêr. */
export interface ZerRate {
  amountMinor: number;
  currency: string;
  zer: number;
}

/**
 * A pack the phone stores will sell (nothing is sold yet). The bigger packs add `bonus` Zêr on top, shown apart from the
 * pack's own, so a Zêr keeps one price everywhere. `priceCents` is the store price point, the same number of cents in
 * euros and in dollars.
 */
export interface ZerPack {
  productId: string;
  zer: number;
  bonus: number;
  priceCents: number;
}

/** The packs, smallest first; a product id names the Zêr the pack lands, its bonus included. */
export const ZER_PACKS: readonly ZerPack[] = [
  { productId: 'app.hevalo.zer.100', zer: 100, bonus: 0, priceCents: 99 },
  { productId: 'app.hevalo.zer.500', zer: 500, bonus: 0, priceCents: 499 },
  { productId: 'app.hevalo.zer.1100', zer: 1000, bonus: 100, priceCents: 999 },
  { productId: 'app.hevalo.zer.2400', zer: 2000, bonus: 400, priceCents: 1999 },
  { productId: 'app.hevalo.zer.6500', zer: 5000, bonus: 1500, priceCents: 4999 },
];

/** All the Zêr a pack lands: its own and its bonus. */
export function packZer(pack: Pick<ZerPack, 'zer' | 'bonus'>): number {
  return pack.zer + pack.bonus;
}

/** What a Zêr is worth: 100 Zêr for €1.00. */
export const ZER_BASE_RATE: ZerRate = { amountMinor: 100, currency: 'EUR', zer: 100 };

/** How many decimals a currency's minor unit has (2 for euros, 0 for yen), as Intl knows it; 2 when it does not. */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Whether a rate can price anything: positive whole numbers and a three-letter currency. */
function usable(rate: ZerRate): boolean {
  return rate.amountMinor > 0 && rate.zer > 0 && /^[A-Z]{3}$/.test(rate.currency);
}

/**
 * The money value of `zer` Zêr at `rate`, in the rate's currency and minor units, rounded to the nearest one and never
 * below one for a price above nothing. An unusable rate falls back to the base rate, so a price is never shown as free.
 */
export function zerValue(zer: number, rate: ZerRate = ZER_BASE_RATE): { amountMinor: number; currency: string } {
  const r = usable(rate) ? rate : ZER_BASE_RATE;
  if (!(zer > 0)) return { amountMinor: 0, currency: r.currency };
  return { amountMinor: Math.max(1, Math.round((zer * r.amountMinor) / r.zer)), currency: r.currency };
}

/** "≈ €6" for a whole amount, "≈ €0.50" otherwise: what `zer` Zêr is worth, formatted for the reader's locale; empty for nothing. */
export function formatZerValue(zer: number, locale: string, rate: ZerRate = ZER_BASE_RATE): string {
  const value = zerValue(zer, rate);
  if (value.amountMinor <= 0) return '';
  const unit = 10 ** minorDigits(value.currency);
  // a whole amount drops its cents, as a price tag would; anything else keeps them all, never "€0.5"
  const digits = value.amountMinor % unit === 0 ? 0 : minorDigits(value.currency);
  const amount = value.amountMinor / unit;
  let text: string;
  try {
    const options = { style: 'currency', currency: value.currency, minimumFractionDigits: digits, maximumFractionDigits: digits } as const;
    text = new Intl.NumberFormat(locale, options).format(amount);
  } catch {
    text = `${amount.toFixed(digits)} ${value.currency}`;
  }
  return `≈ ${text}`;
}
