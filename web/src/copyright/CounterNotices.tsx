import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  COPYRIGHT_ADDRESS_MAX,
  COPYRIGHT_EXPLANATION_MAX,
  COPYRIGHT_NAME_MAX,
  COPYRIGHT_PHONE_MAX,
  cleanCopyrightText,
  counterNoticeProblems,
  type CounterNoticeReceipt,
  type CounterNoticeRequest,
  type MyCopyrightNotice,
  type MyCopyrightNoticesPage,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { useApiGet } from '../lib/useApi';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { useI18n, useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';
import { Confirm, TextField, useFormProblems, useProblemText } from './fields';

/**
 * The other side of a notice: somebody whose post was taken down after a
 * copyright notice, and who made it, or may use it, can say so — the DMCA's
 * counter-notice (§512(g)). The statement of reasons they were sent points
 * here (api/src/moderation/notices.ts).
 *
 * Only the notices that took something of theirs down are listed, and only
 * while the six months to answer last can one be answered.
 */
export function CounterNotices(): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  if (status === 'restoring') return <p className="muted">{t('copyright.counter.loading')}</p>;
  if (status !== 'signedIn') {
    return (
      <p>
        {t('copyright.counter.signIn')}{' '}
        <Link className="doc-link" to="/login" state={{ from: '/copyright#counter' }}>
          {t('copyright.counter.signInLink')}
        </Link>
      </p>
    );
  }
  return <MyNotices />;
}

const STATUS_COPY: Record<MyCopyrightNotice['status'], MessageKey> = {
  received: 'copyright.counter.status.received',
  actioned: 'copyright.counter.status.actioned',
  rejected: 'copyright.counter.status.rejected',
  countered: 'copyright.counter.status.countered',
};

function MyNotices(): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const { data, error, loading, reload } = useApiGet<MyCopyrightNoticesPage>('/me/copyright/notices');
  const [open, setOpen] = useState<string | null>(null);

  if (loading && !data) return <p className="muted">{t('copyright.counter.loading')}</p>;
  if (error) {
    return (
      <div className="msg msg-error" role="alert">
        {error}{' '}
        <button type="button" className="link-btn" onClick={reload}>
          {t('copyright.counter.retry')}
        </button>
      </div>
    );
  }
  const notices = data?.notices ?? [];
  if (notices.length === 0) return <p className="muted">{t('copyright.counter.none')}</p>;

  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' }) : '');

  return (
    <ul className="cr-notices">
      {notices.map((n) => (
        <li className="cr-card cr-notice" key={n.id}>
          <div className="cr-notice-head">
            <span className="cr-reference" dir="ltr">
              {n.reference}
            </span>
            <span className={`cr-status cr-status-${n.status}`}>{t(STATUS_COPY[n.status])}</span>
          </div>
          <dl className="cr-notice-facts">
            <dt>{t('copyright.counter.claimant')}</dt>
            <dd>{n.claimant}</dd>
            <dt>{t('copyright.counter.work')}</dt>
            <dd>{n.work}</dd>
            {n.target?.type === 'library_post' && (
              <>
                <dt>{t('copyright.counter.post')}</dt>
                <dd>
                  <Link className="doc-link" to={`/app/library/${n.target.id}`}>
                    {t('copyright.counter.openPost')}
                  </Link>
                </dd>
              </>
            )}
            {n.decidedAt && (
              <>
                <dt>{t('copyright.counter.decided')}</dt>
                <dd>{day(n.decidedAt)}</dd>
              </>
            )}
          </dl>
          {n.counterNotice ? (
            <p className="muted cr-notice-note">{t('copyright.counter.sentOn', { date: day(n.counterNotice.createdAt) })}</p>
          ) : n.canCounter ? (
            open === n.id ? (
              <CounterForm
                notice={n}
                onCancel={() => setOpen(null)}
                onSent={() => {
                  setOpen(null);
                  reload();
                }}
              />
            ) : (
              <div className="cr-notice-actions">
                <Button variant="secondary" onClick={() => setOpen(n.id)}>
                  {t('copyright.counter.start')}
                </Button>
                {n.counterDeadline && (
                  <span className="muted cr-notice-note">{t('copyright.counter.until', { date: day(n.counterDeadline) })}</span>
                )}
              </div>
            )
          ) : (
            <p className="muted cr-notice-note">{t('copyright.counter.closed')}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

interface CounterDraft {
  name: string;
  address: string;
  phone: string;
  email: string;
  statement: string;
  goodFaith: boolean;
  consent: boolean;
  signature: string;
}

const slack = (max: number) => max + 200;

function CounterForm({
  notice,
  onCancel,
  onSent,
}: {
  notice: MyCopyrightNotice;
  onCancel: () => void;
  onSent: (receipt: CounterNoticeReceipt) => void;
}): React.JSX.Element {
  const { client, user } = useAuth();
  const { locale } = useI18n();
  const t = useT();
  const problemText = useProblemText();
  const [d, setD] = useState<CounterDraft>(() => ({
    name: '',
    address: '',
    phone: '',
    email: user?.email ?? '',
    statement: '',
    goodFaith: false,
    consent: false,
    signature: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CounterNoticeReceipt | null>(null);
  const firstRef = useRef<HTMLDivElement>(null);

  const problems = useMemo(() => counterNoticeProblems({ ...d, goodFaith: d.goodFaith, consent: d.consent }), [d]);
  const prefix = `cc-${notice.id.slice(0, 8)}`;
  const { formRef, shown, touch, check } = useFormProblems(problems, prefix);
  const p = (field: Parameters<typeof shown>[0]) => problemText(shown(field));
  const set = <K extends keyof CounterDraft>(key: K) => (value: CounterDraft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, [formRef]);
  useEffect(() => {
    if (receipt) firstRef.current?.focus();
  }, [receipt]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy || !check()) return;
    setBusy(true);
    setError(null);
    const body: CounterNoticeRequest = {
      name: d.name,
      address: d.address,
      phone: cleanCopyrightText(d.phone) || null,
      email: d.email,
      statement: d.statement,
      goodFaith: true,
      consent: true,
      signature: d.signature,
    };
    const res = await client.post<CounterNoticeReceipt>(`/me/copyright/notices/${notice.id}/counter`, body);
    setBusy(false);
    if (res.ok) setReceipt(res.data);
    else setError(counterError(res.error.code) ?? describeError(res.error, t));
  }

  function counterError(code: string | undefined): string | null {
    if (code === 'ALREADY_COUNTERED') return t('copyright.counter.error.already');
    if (code === 'COUNTER_WINDOW_CLOSED') return t('copyright.counter.error.closed');
    if (code === 'INVALID_COUNTER_NOTICE') return t('copyright.notice.invalid');
    return null;
  }

  if (receipt) {
    return (
      <div className="cr-receipt cr-receipt-inline" ref={firstRef} tabIndex={-1} role="status">
        <p className="cr-receipt-title">{t('copyright.counter.sentTitle')}</p>
        <p className="muted">
          {t('copyright.counter.sentBody', {
            date: new Date(receipt.restoreNotBefore).toLocaleDateString(locale, { dateStyle: 'long' }),
          })}
        </p>
        <Button variant="secondary" onClick={() => onSent(receipt)}>
          {t('copyright.counter.done')}
        </Button>
      </div>
    );
  }

  return (
    <form className="cr-form cr-form-inline" ref={formRef} onSubmit={(e) => void submit(e)} noValidate aria-label={t('copyright.counter.formTitle', { reference: notice.reference })}>
      <p className="cr-fineprint">{t('copyright.counter.shared')}</p>
      <TextField id={`${prefix}-name`} label={t('copyright.field.name')} value={d.name} onChange={set('name')} onBlur={touch('name')} problem={p('name')} autoComplete="name" maxLength={slack(COPYRIGHT_NAME_MAX)} />
      <TextField id={`${prefix}-address`} label={t('copyright.field.address')} multiline rows={2} value={d.address} onChange={set('address')} onBlur={touch('address')} problem={p('address')} autoComplete="street-address" maxLength={slack(COPYRIGHT_ADDRESS_MAX)} />
      <TextField id={`${prefix}-phone`} label={t('copyright.field.phone')} optional type="tel" dir="ltr" value={d.phone} onChange={set('phone')} onBlur={touch('phone')} problem={p('phone')} autoComplete="tel" maxLength={slack(COPYRIGHT_PHONE_MAX)} />
      <TextField id={`${prefix}-email`} label={t('copyright.field.email')} type="email" dir="ltr" value={d.email} onChange={set('email')} onBlur={touch('email')} problem={p('email')} autoComplete="email" maxLength={slack(254)} />
      <TextField id={`${prefix}-statement`} label={t('copyright.counter.statement')} hint={t('copyright.counter.statementHint')} multiline rows={5} value={d.statement} onChange={set('statement')} onBlur={touch('statement')} problem={p('statement')} maxLength={slack(COPYRIGHT_EXPLANATION_MAX)} />
      <Confirm id={`${prefix}-goodFaith`} label={t('copyright.counter.goodFaith')} checked={d.goodFaith} onChange={set('goodFaith')} problem={p('goodFaith')} />
      <Confirm id={`${prefix}-consent`} label={t('copyright.counter.consent')} checked={d.consent} onChange={set('consent')} problem={p('consent')} />
      <TextField id={`${prefix}-signature`} label={t('copyright.field.signature')} hint={t('copyright.field.signatureHint')} value={d.signature} onChange={set('signature')} onBlur={touch('signature')} problem={p('signature')} autoComplete="name" maxLength={slack(COPYRIGHT_NAME_MAX)} />
      {error && (
        <div className="msg msg-error" role="alert">
          {error}
        </div>
      )}
      <div className="cr-actions">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={busy}>
          {t('copyright.counter.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t('copyright.notice.sending') : t('copyright.counter.send')}
        </Button>
      </div>
    </form>
  );
}
