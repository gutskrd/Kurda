import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { AccountStanding as Standing, AppealView, RestrictionScope, StandingStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useApiGet } from '../lib/useApi';
import { ErrorState } from '../components/states';
import { CardStackSkeleton } from '../components/skeletons';
import { ArrowIcon, CheckIcon, LockIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { SCOPE_LABEL } from './labels';
import { formatUntil } from './restriction';
import { AppealState, SanctionCard } from './SanctionCard';

const STATUS_TITLE: Record<StandingStatus, MessageKey> = {
  good: 'standing.status.good',
  limited: 'standing.status.limited',
  suspended: 'standing.status.suspended',
  banned: 'standing.status.banned',
};

const SCOPES: readonly RestrictionScope[] = ['chat', 'post', 'media', 'account'];

/**
 * Account standing (/app/settings/standing): every decision about your
 * account, with the reasons (DSA Art. 17's statement of reasons — what, which
 * rule, until when, how it came about, whether a person looked), what is
 * paused right now and until when, and "Ask for a review" on each.
 *
 * Every refusal the app shows for a limit links here, so this page is where
 * "why can't I send this?" is answered in full.
 */
export function AccountStanding(): React.JSX.Element {
  const t = useT();
  const { client } = useAuth();
  const { data, loading, error, reload } = useApiGet<Standing>('/me/standing');

  const appeal = useCallback(
    async (sanctionId: string, text: string): Promise<AppealView | string> => {
      const res = await client.post<AppealView>('/me/appeals', { sanctionId, text });
      return res.ok ? res.data : describeError(res.error, t);
    },
    [client, t],
  );

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <Link to="/app/settings" className="standing-back">
          <ArrowIcon size={16} className="standing-back-icon" /> {t('standing.backToSettings')}
        </Link>
        <h1 className="page-title">{t('standing.title')}</h1>
        <p className="page-sub">{t('standing.intro')}</p>
      </div>

      {loading ? (
        <CardStackSkeleton count={2} label="standing.title" />
      ) : error || !data ? (
        <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />
      ) : (
        <StandingBody standing={data} appeal={appeal} />
      )}
    </div>
  );
}

export function StandingBody({
  standing,
  appeal,
}: {
  standing: Standing;
  appeal: (sanctionId: string, text: string) => Promise<AppealView | string>;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const limits = SCOPES.filter((s) => standing.restrictions[s] !== undefined);
  const good = standing.status === 'good';

  return (
    <>
      <section className={`card standing-status is-${standing.status}`} aria-labelledby="standing-status">
        <span className="standing-status-icon" aria-hidden>
          {good ? <CheckIcon size={22} /> : <LockIcon size={22} />}
        </span>
        <div>
          <h2 id="standing-status" className="standing-status-title">
            {t(STATUS_TITLE[standing.status])}
          </h2>
          {good ? (
            <p className="muted">{t('standing.status.goodBody')}</p>
          ) : (
            limits.length > 0 && (
              <ul className="standing-limits" aria-label={t('standing.limitedNow')}>
                {limits.map((scope) => {
                  const until = standing.restrictions[scope]!.until;
                  return (
                    <li key={scope}>
                      <strong>{t(SCOPE_LABEL[scope])}</strong>
                      {' — '}
                      {until ? t('standing.until', { time: formatUntil(until, locale) }) : t('standing.noEnd')}
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      </section>

      {standing.active.length > 0 && (
        <section className="standing-group" aria-labelledby="standing-active">
          <h2 id="standing-active" className="friend-heading">
            {t('standing.active')}
          </h2>
          {standing.active.map((s) => (
            <SanctionCard key={s.id} sanction={s} appeal={appeal} />
          ))}
        </section>
      )}

      {standing.past.length > 0 && (
        <section className="standing-group" aria-labelledby="standing-past">
          <h2 id="standing-past" className="friend-heading">
            {t('standing.past')}
          </h2>
          {standing.past.map((s) => (
            <SanctionCard key={s.id} sanction={s} appeal={appeal} />
          ))}
        </section>
      )}

      {standing.active.length === 0 && standing.past.length === 0 && <p className="muted standing-none">{t('standing.none')}</p>}

      {standing.reportAppeals.length > 0 && (
        <section className="standing-group" aria-labelledby="standing-report-appeals">
          <h2 id="standing-report-appeals" className="friend-heading">
            {t('standing.reportAppeals')}
          </h2>
          {standing.reportAppeals.map((a) => (
            <div className="card sanction" key={a.id}>
              <p className="sanction-statement-text" dir="auto">
                {a.text}
              </p>
              <AppealState appeal={a} />
            </div>
          ))}
        </section>
      )}
    </>
  );
}
