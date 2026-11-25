/**
 * What Zêr is worth in money, beside every price on the website ("600 Zêr ≈ €1.49"), from the smallest pack's euro
 * price (shared `ZER_BASE_RATE`), in the reader's language.
 */
import { useCallback } from 'react';
import { formatZerValue } from '@kurda/shared';
import { useLocale } from '../i18n/I18nProvider';

/** "≈ €1.49" for an amount of Zêr; empty for nothing. */
export function useZerValue(): (zer: number) => string {
  const locale = useLocale();
  return useCallback((zer: number) => formatZerValue(zer, locale), [locale]);
}

/** A price's money value as quiet text beside the price; nothing for a price of nothing. */
export function ZerValue({ zer }: { zer: number }): React.JSX.Element | null {
  const value = useZerValue()(zer);
  return value ? <span className="zer-value">{value}</span> : null;
}
