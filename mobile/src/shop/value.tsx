/**
 * What Zêr is worth in money, beside every price on the phone ("300 Zêr · ≈ €3"): 100 Zêr to the euro until the phone
 * has the store's own price for the smallest pack, which `setStoreRate` hands in so the value is said in the reader's
 * store currency.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { ZER_BASE_RATE, formatZerValue, type ZerRate } from '@kurda/shared';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

let storeRate: ZerRate | null = null;
const listeners = new Set<() => void>();

/** The store's price for the smallest pack, once the phone has it; null goes back to euros. */
export function setStoreRate(rate: ZerRate | null): void {
  storeRate = rate;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** "≈ €3" or "≈ €2.50" for an amount of Zêr, in the reader's language; empty for nothing. */
export function useZerValue(): (zer: number) => string {
  const { locale } = useI18n();
  const rate = useSyncExternalStore(subscribe, () => storeRate);
  return useCallback((zer: number) => formatZerValue(zer, locale, rate ?? ZER_BASE_RATE), [locale, rate]);
}

/** A price's money value as quiet text, to sit beside the price; nothing for a price of nothing. */
export function ZerValue({ zer, style }: { zer: number; style?: StyleProp<TextStyle> }): React.JSX.Element | null {
  const value = useZerValue()(zer);
  const { colors } = useTheme();
  if (!value) return null;
  return <Text style={[{ fontSize: typography.sizes.text, color: colors.textSecondary, fontVariant: ['tabular-nums'] }, style]}>{value}</Text>;
}
