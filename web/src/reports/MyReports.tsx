import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MAX_APPEAL_LEN, type MyReport, type MyReportsPage, type ReportStatus } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { appealError } from './appealError';
import { useApiGet } from '../lib/useApi';
import { Button } from '../components/Button';
import { ErrorState, EmptyState } from '../components/states';
import { CardStackSkeleton } from '../components/skeletons';
import { ArrowIcon, FlagIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { CATEGORY_LABEL, TARGET_LABEL } from './labels';
import { formatDay } from './restriction';

const PILL: Record<ReportStatus, MessageKey> = {
  open: 'reports.pill.open',
  actioned: 'reports.pill.actioned',
  no_violation: 'reports.pill.noViolation',
};

const STATUS: Record<ReportStatus, MessageKey> = {
  open: 'reports.status.open',
  actioned: 'reports.status.actioned',
  no_violation: 'reports.status.noViolation',
};

/**
 * My reports (/app/settings/reports): what you reported, and what became of it.
 *
 * A report used to vanish the moment it was sent — no receipt, no outcome —
 * which teaches people that reporting does nothing. Each one now has its
 * state in plain words. "We took action" never says what the action was: the
 * other person's sanction is theirs to know, not the reporter's. A "doesn't
 * break our rules" answer can be questioned once, for six months.
 */
export function MyReports(): React.JSX.Element {
  const t = useT();
  const { data, loading, error, reload } = useApiGet<MyReportsPage>('/me/reports');

  return (
    <div className="container container-narrow">
      <div className="page-header">
        <Link to="/app/settings" className="standing-back">
          <ArrowIcon size={16} className="standing-back-icon" /> {t('standing.backToSettings')}
        </Link>
        <h1 className="page-title">{t('reports.mine.title')}</h1>
        <p className="page-sub">{t('reports.mine.intro')}</p>
      </div>

      {loading ? (
        <CardStackSkeleton count={2} label="reports.mine.title" />
      ) : error || !data ? (
        <ErrorState message={error ?? t('common.somethingWentWrong')} onRetry={reload} />
      ) : (data.reports ?? []).length === 0 ? (
        <EmptyState title={t('reports.mine.emptyTitle')} message={t('reports.mine.empty')} />
      ) : (
        <ul className="myreports">
          {data.reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportRow({ report }: { report: MyReport }): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  async function appeal(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!report.caseId || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await client.post('/me/appeals', { caseId: report.caseId, text: text.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(appealError(res.error, t));
      return;
    }
    setAsked(true);
    setAsking(false);
  }

  const what = t(TARGET_LABEL[report.targetType]);
  return (
    <li className="card myreport">
      <div className="myreport-head">
        <span className="myreport-icon" aria-hidden>
          <FlagIcon size={18} />
        </span>
        <span className="myreport-title">
          <strong>{t(CATEGORY_LABEL[report.category])}</strong>
          <span className="myreport-what">
            {/* a name or a title as the reporter could already see it, written in its own direction */}
            {report.targetLabel ? (
              <>
                {what} · <bdi>{report.targetLabel}</bdi>
              </>
            ) : (
              what
            )}
          </span>
        </span>
        <span className={`myreport-pill is-${report.status}`}>{t(PILL[report.status])}</span>
      </div>
      <p className="myreport-status">{t(STATUS[report.status])}</p>
      <p className="myreport-dates">
        <time dateTime={report.createdAt}>{t('reports.sent', { date: formatDay(report.createdAt, locale) })}</time>
        {report.closedAt && (
          <>
            {' · '}
            <time dateTime={report.closedAt}>{t('reports.decided', { date: formatDay(report.closedAt, locale) })}</time>
          </>
        )}
      </p>

      {asked ? (
        <p className="msg msg-success" role="status">
          {t('reports.appeal.sent')}
        </p>
      ) : (
        report.canAppeal &&
        report.caseId &&
        (asking ? (
          <form className="appeal-form" onSubmit={(e) => void appeal(e)}>
            <label className="field-label" htmlFor={`appeal-${report.id}`}>
              {t('reports.appeal.label')}
            </label>
            <textarea
              id={`appeal-${report.id}`}
              className="input"
              rows={3}
              maxLength={MAX_APPEAL_LEN}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )}
            <div className="appeal-actions">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={busy || !text.trim()}>
                {busy ? t('report.sending') : t('reports.appeal.send')}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
            {t('reports.appeal.ask')}
          </Button>
        ))
      )}
    </li>
  );
}
