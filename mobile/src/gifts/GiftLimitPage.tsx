import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  MINOR_GIFT_MAX_PRICE,
  MINOR_GIFT_MONTHLY_ZER,
  SPEND_LIMIT_MAX_ZER,
  SPEND_LIMIT_MIN_ZER,
  SPEND_LIMIT_PERIODS,
  isValidSpendLimit,
  type GiftSpendLimitView,
  type SpendLimit,
  type SpendLimitPeriod,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { useI18n } from '../i18n/I18nContext';
import { formatNumber } from '../i18n/format';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';
import { SettingsChoice, SettingsNote, SettingsSection } from '../settings/list';
import { ZerValue } from '../shop/value';
import { ClayButton } from '../theme/glass';
import { Loading } from '../theme/Loading';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { giftLimit, setGiftLimit } from './api';

const PERIOD_LABEL: Record<SpendLimitPeriod, TranslationKey> = {
  day: 'settings.giftLimit.day',
  week: 'settings.giftLimit.week',
  month: 'settings.giftLimit.month',
};

const PER_PERIOD: Record<SpendLimitPeriod, TranslationKey> = {
  day: 'settings.giftLimit.perDay',
  week: 'settings.giftLimit.perWeek',
  month: 'settings.giftLimit.perMonth',
};

/**
 * Settings → Social → Gift spending limit: an adult's own limit on Zêr spent on gifts, for a day, a week or a month,
 * with what is spent and left. Lowering it applies at once; raising or removing it takes a day and says from when (the
 * server decides). Nothing is set until chosen. Under 18 the fixed limits are shown instead.
 */
export function GiftLimitPage(): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const [view, setView] = useState<GiftSpendLimitView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [period, setPeriod] = useState<SpendLimitPeriod>('month');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const n = (v: number): string => formatNumber(v, locale);
  const when = (iso: string): string => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const words = (limit: SpendLimit | null): string => (limit ? t(PER_PERIOD[limit.period], { zer: n(limit.zer) }) : t('settings.giftLimit.none'));

  const take = (next: GiftSpendLimitView): void => {
    setView(next);
    if (next.limit) {
      setPeriod(next.limit.period);
      setAmount(String(next.limit.zer));
    }
  };

  useEffect(() => {
    let live = true;
    void giftLimit(client).then((res) => {
      if (!live) return;
      if (res.ok) take(res.data);
      else setFailed(describeError(res.error, t));
    });
    return () => {
      live = false;
    };
  }, [client, t]);

  const save = (limit: SpendLimit | null): void => {
    setBusy(true);
    setSaid(null);
    void setGiftLimit(client, limit).then((res) => {
      setBusy(false);
      if (!res.ok) {
        setSaid(describeError(res.error, t));
        return;
      }
      take(res.data);
      setSaid(res.data.delayed && res.data.pending ? t('settings.giftLimit.delayed', { when: when(res.data.pending.from) }) : t('settings.giftLimit.applied'));
    });
  };

  if (failed) return <SettingsSection first footer={failed}><View /></SettingsSection>;
  if (!view) return <Loading style={styles.loading} />;

  if (view.minor) {
    return (
      <SettingsSection first footer={t('settings.giftLimit.minorSpent', { zer: n(view.spent), month: n(MINOR_GIFT_MONTHLY_ZER) })}>
        <Text style={[styles.text, dir.text, { color: colors.textPrimary }]} testID="gift-limit-minor">
          {t('settings.giftLimit.minor', { each: n(MINOR_GIFT_MAX_PRICE), month: n(MINOR_GIFT_MONTHLY_ZER) })}
        </Text>
      </SettingsSection>
    );
  }

  const zer = Number(amount);
  const next: SpendLimit = { period, zer };
  const valid = amount.trim() !== '' && isValidSpendLimit(next);
  const spent = view.limit ? t('settings.giftLimit.spent', { zer: n(view.spent), left: n(view.left ?? 0) }) : t('settings.giftLimit.spentNone', { zer: n(view.spent) });

  return (
    <>
      <SettingsSection first footer={t('settings.giftLimit.lead')}>
        <View style={styles.now}>
          <Text style={[styles.strong, dir.text, { color: colors.textPrimary }]} testID="gift-limit-now">
            {words(view.limit)}
          </Text>
          {view.limit ? <ZerValue zer={view.limit.zer} style={dir.text} /> : null}
          <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>{spent}</Text>
          {view.pending ? (
            <Text style={[styles.text, dir.text, { color: colors.textPrimary }]} accessibilityLiveRegion="polite" testID="gift-limit-pending">
              {view.pending.limit
                ? t('settings.giftLimit.pending', { limit: words(view.pending.limit), when: when(view.pending.from) })
                : t('settings.giftLimit.pendingRemove', { when: when(view.pending.from) })}
            </Text>
          ) : null}
        </View>
      </SettingsSection>
      <SettingsSection title={t('settings.giftLimit.period')}>
        <SettingsChoice label={t('settings.giftLimit.period')} options={SPEND_LIMIT_PERIODS} value={period} labelOf={(p) => t(PERIOD_LABEL[p])} onChange={setPeriod} />
      </SettingsSection>
      <SettingsSection title={t('settings.giftLimit.amount')}>
        <View style={styles.now}>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={7}
            accessibilityLabel={t('settings.giftLimit.amount')}
            testID="gift-limit-amount"
            style={[styles.input, dir.text, { color: colors.textPrimary, backgroundColor: colors.controlTrack }]}
          />
          {valid ? <ZerValue zer={zer} style={dir.text} /> : null}
          {!valid && amount.trim() !== '' ? (
            <Text style={[styles.text, dir.text, { color: colors.textSecondary }]}>
              {t('settings.giftLimit.invalid', { min: n(SPEND_LIMIT_MIN_ZER), max: n(SPEND_LIMIT_MAX_ZER) })}
            </Text>
          ) : null}
        </View>
      </SettingsSection>
      <View style={styles.actions}>
        <ClayButton label={t('settings.giftLimit.save')} tone="primary" size="large" busy={busy} disabled={!valid} onPress={() => save(next)} testID="gift-limit-save" />
        {view.limit && !(view.pending && view.pending.limit === null) ? (
          <ClayButton label={t('settings.giftLimit.remove')} variant="outline" size="large" disabled={busy} onPress={() => save(null)} />
        ) : null}
        {said ? (
          <SettingsNote>
            <Text accessibilityLiveRegion="polite">{said}</Text>
          </SettingsNote>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing.xl },
  now: { padding: spacing.md, gap: spacing.xs },
  strong: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  text: { fontSize: typography.sizes.text, lineHeight: 21 },
  input: { minHeight: 48, borderRadius: radii.md, paddingHorizontal: spacing.md, fontSize: typography.sizes.text },
  actions: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.sm },
});
