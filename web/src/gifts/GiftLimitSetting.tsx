import { useEffect, useState } from 'react';
import {
  MINOR_GIFT_MAX_PRICE,
  MINOR_GIFT_MONTHLY_ZER,
  SPEND_LIMIT_MAX_ZER,
  SPEND_LIMIT_MIN_ZER,
  SPEND_LIMIT_PERIODS,
  isValidSpendLimit,
  type GiftSpendLimitChange,
  type GiftSpendLimitView,
  type SpendLimit,
  type SpendLimitPeriod,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ErrorState } from '../components/states';
import { Skeleton, SkeletonRegion } from '../components/Skeleton';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import type { ApiError } from '../lib/types';
import { SendError } from '../reports/SendError';
import { ZerValue } from '../shop/ZerValue';

const PERIOD_LABEL: Record<SpendLimitPeriod, MessageKey> = {
  day: 'settings.giftLimit.day',
  week: 'settings.giftLimit.week',
  month: 'settings.giftLimit.month',
};

const PER_PERIOD: Record<SpendLimitPeriod, MessageKey> = {
  day: 'settings.giftLimit.perDay',
  week: 'settings.giftLimit.perWeek',
  month: 'settings.giftLimit.perMonth',
};

/** "2,000 Zêr a week" for a limit, in the reader's language. */
export function limitWords(limit: SpendLimit | null, t: (key: MessageKey, vars?: Record<string, string>) => string, locale: string): string {
  return limit ? t(PER_PERIOD[limit.period], { zer: limit.zer.toLocaleString(locale) }) : t('settings.giftLimit.none');
}

/**
 * Settings → Gift spending limit: an adult's own limit on Zêr spent on gifts, for a day, a week or a month, with what is
 * spent and left. Lowering it applies at once; raising or removing it takes a day and says from when (the server
 * decides, `PUT /me/gift-limit`). Nothing is set until chosen. Under 18 the fixed limits are shown instead.
 */
export function GiftLimitSetting(): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { client } = useAuth();
  const [view, setView] = useState<GiftSpendLimitView | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [period, setPeriod] = useState<SpendLimitPeriod>('month');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fmt = (n: number): string => n.toLocaleString(locale);
  const when = (iso: string): string => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const take = (next: GiftSpendLimitView): void => {
    setView(next);
    if (next.limit) {
      setPeriod(next.limit.period);
      setAmount(String(next.limit.zer));
    }
  };

  useEffect(() => {
    let live = true;
    void client.get<GiftSpendLimitView>('/me/gift-limit').then((res) => {
      if (!live) return;
      if (res.ok) take(res.data);
      else setLoadError(res.error);
    });
    return () => {
      live = false;
    };
  }, [client]);

  async function save(limit: SpendLimit | null): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(null);
    const res = await client.put<GiftSpendLimitChange>('/me/gift-limit', { limit });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    take(res.data);
    setSaved(res.data.delayed && res.data.pending ? t('settings.giftLimit.delayed', { when: when(res.data.pending.from) }) : t('settings.giftLimit.applied'));
  }

  if (loadError) return <ErrorState message={loadError.message} onRetry={() => window.location.reload()} />;
  if (!view) {
    return (
      <SkeletonRegion label={t('common.loading')}>
        <Skeleton line w="70%" />
        <Skeleton line w="50%" />
      </SkeletonRegion>
    );
  }

  if (view.minor) {
    return (
      <section className="card gift-limit">
        <p>{t('settings.giftLimit.minor', { each: fmt(MINOR_GIFT_MAX_PRICE), month: fmt(MINOR_GIFT_MONTHLY_ZER) })}</p>
        <p className="muted">{t('settings.giftLimit.minorSpent', { zer: fmt(view.spent), month: fmt(MINOR_GIFT_MONTHLY_ZER) })}</p>
      </section>
    );
  }

  const zer = Number(amount);
  const next: SpendLimit = { period, zer };
  const valid = amount.trim() !== '' && isValidSpendLimit(next);

  return (
    <section className="card gift-limit" aria-labelledby="gift-limit-now">
      <p className="muted">{t('settings.giftLimit.lead')}</p>
      <p id="gift-limit-now">
        <strong>{limitWords(view.limit, t, locale)}</strong>
        {view.limit && (
          <>
            {' '}
            <ZerValue zer={view.limit.zer} />
          </>
        )}
      </p>
      <p className="muted">
        {view.limit
          ? t('settings.giftLimit.spent', { zer: fmt(view.spent), left: fmt(view.left ?? 0) })
          : t('settings.giftLimit.spentNone', { zer: fmt(view.spent) })}
      </p>
      {view.pending && (
        <p className="gift-limit-pending" role="status">
          {view.pending.limit
            ? t('settings.giftLimit.pending', { limit: limitWords(view.pending.limit, t, locale), when: when(view.pending.from) })
            : t('settings.giftLimit.pendingRemove', { when: when(view.pending.from) })}
        </p>
      )}
      <form
        className="gift-limit-fields"
        // our own line says what is allowed, in the reader's language, rather than the browser's
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save(next);
          else setError(t('settings.giftLimit.invalid', { min: fmt(SPEND_LIMIT_MIN_ZER), max: fmt(SPEND_LIMIT_MAX_ZER) }));
        }}
      >
        <label>
          {t('settings.giftLimit.amount')}
          <input
            type="number"
            inputMode="numeric"
            min={SPEND_LIMIT_MIN_ZER}
            max={SPEND_LIMIT_MAX_ZER}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          {t('settings.giftLimit.period')}
          <select value={period} onChange={(e) => setPeriod(e.target.value as SpendLimitPeriod)}>
            {SPEND_LIMIT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(PERIOD_LABEL[p])}
              </option>
            ))}
          </select>
        </label>
        <span className="gift-limit-worth">{valid && <ZerValue zer={zer} />}</span>
        <Button type="submit" disabled={busy}>
          {t('settings.giftLimit.save')}
        </Button>
        {view.limit && !(view.pending && view.pending.limit === null) && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(null)}>
            {t('settings.giftLimit.remove')}
          </Button>
        )}
      </form>
      {saved && (
        <p className="muted" role="status">
          {saved}
        </p>
      )}
      <SendError error={error} />
    </section>
  );
}
