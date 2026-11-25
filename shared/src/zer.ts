/**
 * What Zêr is worth in money, so every price can show its real value beside it ("600 Zêr · ≈ €1.49"). The smallest pack
 * sets the rate; a phone that has the store's own price for that pack passes it as the rate, so the value is in the
 * reader's store currency, and everyone else sees euros.
 */

/** A rate: `amountMinor` of `currency` (ISO 4217, counted in its minor units, such as cents) buys `zer` Zêr. */
export interface ZerRate {
  amountMinor: number;
  currency: string;
  zer: number;
}

/** The packs the phone stores will sell, smallest first, with their euro prices in cents. */
export const ZER_PACKS: ReadonlyArray<{ zer: number; eurCents: number }> = [
  { zer: 400, eurCents: 99 },
  { zer: 2200, eurCents: 499 },
  { zer: 4800, eurCents: 999 },
  { zer: 10400, eurCents: 1999 },
];

/** The smallest pack's price, which is what a Zêr is worth: 400 Zêr for €0.99. */
export const ZER_BASE_RATE: ZerRate = { amountMinor: ZER_PACKS[0]!.eurCents, currency: 'EUR', zer: ZER_PACKS[0]!.zer };

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

/** "≈ €1.49": what `zer` Zêr is worth, formatted for the reader's locale; empty for nothing. */
export function formatZerValue(zer: number, locale: string, rate: ZerRate = ZER_BASE_RATE): string {
  const value = zerValue(zer, rate);
  if (value.amountMinor <= 0) return '';
  const digits = minorDigits(value.currency);
  const amount = value.amountMinor / 10 ** digits;
  let text: string;
  try {
    const options = { style: 'currency', currency: value.currency, minimumFractionDigits: digits, maximumFractionDigits: digits } as const;
    text = new Intl.NumberFormat(locale, options).format(amount);
  } catch {
    text = `${amount.toFixed(digits)} ${value.currency}`;
  }
  return `≈ ${text}`;
}
