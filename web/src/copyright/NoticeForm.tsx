import { useMemo, useRef, useEffect, useState } from 'react';
import {
  COPYRIGHT_ADDRESS_MAX,
  COPYRIGHT_EXPLANATION_MAX,
  COPYRIGHT_NAME_MAX,
  COPYRIGHT_PHONE_MAX,
  COPYRIGHT_URL_MAX,
  COPYRIGHT_WORK_MAX,
  cleanCopyrightText,
  copyrightNoticeProblems,
  type CopyrightNoticeReceipt,
  type CopyrightNoticeRequest,
  type CopyrightNotifierRole,
} from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Button } from '../components/Button';
import { useI18n, useT } from '../i18n/I18nProvider';
import { Confirm, TextField, useFormProblems, useProblemText } from './fields';

interface Draft {
  name: string;
  email: string;
  address: string;
  phone: string;
  role: CopyrightNotifierRole | '';
  rightsHolder: string;
  work: string;
  workUrl: string;
  contentUrl: string;
  explanation: string;
  goodFaith: boolean;
  accurate: boolean;
  signature: string;
}

const EMPTY: Draft = {
  name: '',
  email: '',
  address: '',
  phone: '',
  role: '',
  rightsHolder: '',
  work: '',
  workUrl: '',
  contentUrl: '',
  explanation: '',
  goodFaith: false,
  accurate: false,
  signature: '',
};

/** Room past each limit before the box stops taking text, so the counter can say "too long" instead. */
const slack = (max: number) => max + 200;

/**
 * The copyright notice: everything the EU's Digital Services Act (Art. 16)
 * and the US DMCA (§512(c)(3)) ask a notice to hold, in the order somebody
 * thinks of them — who you are, what was yours, where it is on Hevalo, why,
 * and the two statements and the signature that make it a notice.
 *
 * No sign-in: a rights holder is usually not a member. The answer is the same
 * receipt whatever the link leads to, so the form never says whether a post
 * exists.
 */
export function NoticeForm(): React.JSX.Element {
  const { client } = useAuth();
  const { locale } = useI18n();
  const t = useT();
  const problemText = useProblemText();
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<(CopyrightNoticeReceipt & { email: string }) | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const request = useMemo<Partial<CopyrightNoticeRequest> & { role?: unknown }>(
    () => ({
      name: d.name,
      email: d.email,
      address: d.address,
      phone: d.phone || null,
      role: d.role || undefined,
      rightsHolder: d.role === 'authorised' ? d.rightsHolder : null,
      work: d.work,
      workUrl: d.workUrl || null,
      contentUrl: d.contentUrl,
      explanation: d.explanation,
      goodFaith: d.goodFaith as true,
      accurate: d.accurate as true,
      signature: d.signature,
    }),
    [d],
  );
  const problems = useMemo(() => copyrightNoticeProblems(request), [request]);
  const { formRef, shown, touch, check, reset } = useFormProblems(problems, 'cn');
  const p = (field: Parameters<typeof shown>[0]) => problemText(shown(field));

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (receipt) receiptRef.current?.focus();
  }, [receipt]);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy || !check()) return;
    setBusy(true);
    setError(null);
    const body: CopyrightNoticeRequest = {
      ...(request as CopyrightNoticeRequest),
      phone: cleanCopyrightText(d.phone) || null,
      workUrl: cleanCopyrightText(d.workUrl) || null,
      locale,
    };
    const res = await client.post<CopyrightNoticeReceipt>('/copyright/notices', body);
    setBusy(false);
    if (res.ok) {
      setReceipt({ ...res.data, email: cleanCopyrightText(d.email) });
      setD(EMPTY);
      reset();
    } else {
      // the form ran the API's own check, so a 422 here means the two disagree —
      // say something useful rather than nothing
      setError(res.error.code === 'INVALID_NOTICE' ? t('copyright.notice.invalid') : describeError(res.error, t));
    }
  }

  if (receipt) {
    return (
      <div className="cr-card cr-receipt" ref={receiptRef} tabIndex={-1} role="status">
        <h3 className="cr-receipt-title">{t('copyright.notice.sentTitle')}</h3>
        <p>
          {t('copyright.notice.sentReference')} <strong className="cr-reference">{receipt.reference}</strong>
        </p>
        <p className="muted">{t('copyright.notice.sentBody', { email: receipt.email })}</p>
        <Button variant="secondary" onClick={() => setReceipt(null)}>
          {t('copyright.notice.another')}
        </Button>
      </div>
    );
  }

  return (
    <form className="cr-card cr-form" ref={formRef} onSubmit={(e) => void submit(e)} noValidate aria-labelledby="cn-title">
      <h3 className="cr-form-title" id="cn-title">
        {t('copyright.notice.formTitle')}
      </h3>

      <fieldset className="cr-group">
        <legend className="cr-legend">{t('copyright.notice.you')}</legend>
        <TextField id="cn-name" label={t('copyright.field.name')} value={d.name} onChange={set('name')} onBlur={touch('name')} problem={p('name')} autoComplete="name" maxLength={slack(COPYRIGHT_NAME_MAX)} />
        <TextField id="cn-email" label={t('copyright.field.email')} hint={t('copyright.field.emailHint')} type="email" dir="ltr" value={d.email} onChange={set('email')} onBlur={touch('email')} problem={p('email')} autoComplete="email" maxLength={slack(254)} />
        <TextField id="cn-address" label={t('copyright.field.address')} multiline rows={2} value={d.address} onChange={set('address')} onBlur={touch('address')} problem={p('address')} autoComplete="street-address" maxLength={slack(COPYRIGHT_ADDRESS_MAX)} />
        <TextField id="cn-phone" label={t('copyright.field.phone')} optional type="tel" dir="ltr" value={d.phone} onChange={set('phone')} onBlur={touch('phone')} problem={p('phone')} autoComplete="tel" maxLength={slack(COPYRIGHT_PHONE_MAX)} />

        <div className={`field cr-field${p('role') ? ' has-problem' : ''}`} role="radiogroup" aria-labelledby="cn-role-label" aria-describedby={p('role') ? 'cn-role-error' : undefined}>
          <span className="field-label" id="cn-role-label">
            {t('copyright.field.role')}
          </span>
          <label className="cr-choice">
            <input id="cn-role" type="radio" name="cn-role" checked={d.role === 'owner'} onChange={() => set('role')('owner')} onBlur={touch('role')} />
            <span>{t('copyright.field.roleOwner')}</span>
          </label>
          <label className="cr-choice">
            <input type="radio" name="cn-role" checked={d.role === 'authorised'} onChange={() => set('role')('authorised')} onBlur={touch('role')} />
            <span>{t('copyright.field.roleAuthorised')}</span>
          </label>
          {p('role') && (
            <span className="cr-problem" id="cn-role-error">
              {p('role')}
            </span>
          )}
        </div>
        {d.role === 'authorised' && (
          <TextField id="cn-rightsHolder" label={t('copyright.field.rightsHolder')} value={d.rightsHolder} onChange={set('rightsHolder')} onBlur={touch('rightsHolder')} problem={p('rightsHolder')} maxLength={slack(COPYRIGHT_NAME_MAX)} />
        )}
      </fieldset>

      <fieldset className="cr-group">
        <legend className="cr-legend">{t('copyright.notice.what')}</legend>
        <TextField id="cn-work" label={t('copyright.field.work')} hint={t('copyright.field.workHint')} multiline value={d.work} onChange={set('work')} onBlur={touch('work')} problem={p('work')} maxLength={slack(COPYRIGHT_WORK_MAX)} />
        <TextField id="cn-workUrl" label={t('copyright.field.workUrl')} optional type="url" dir="ltr" value={d.workUrl} onChange={set('workUrl')} onBlur={touch('workUrl')} problem={p('workUrl')} maxLength={slack(COPYRIGHT_URL_MAX)} />
        <TextField id="cn-contentUrl" label={t('copyright.field.contentUrl')} hint={t('copyright.field.contentUrlHint')} type="url" dir="ltr" value={d.contentUrl} onChange={set('contentUrl')} onBlur={touch('contentUrl')} problem={p('contentUrl')} maxLength={slack(COPYRIGHT_URL_MAX)} />
        <TextField id="cn-explanation" label={t('copyright.field.explanation')} hint={t('copyright.field.explanationHint')} multiline rows={5} value={d.explanation} onChange={set('explanation')} onBlur={touch('explanation')} problem={p('explanation')} maxLength={slack(COPYRIGHT_EXPLANATION_MAX)} />
      </fieldset>

      <fieldset className="cr-group">
        <legend className="cr-legend">{t('copyright.notice.statements')}</legend>
        <Confirm id="cn-goodFaith" label={t('copyright.field.goodFaith')} checked={d.goodFaith} onChange={set('goodFaith')} problem={p('goodFaith')} />
        <Confirm id="cn-accurate" label={t('copyright.field.accurate')} checked={d.accurate} onChange={set('accurate')} problem={p('accurate')} />
        <TextField id="cn-signature" label={t('copyright.field.signature')} hint={t('copyright.field.signatureHint')} value={d.signature} onChange={set('signature')} onBlur={touch('signature')} problem={p('signature')} autoComplete="name" maxLength={slack(COPYRIGHT_NAME_MAX)} />
      </fieldset>

      <p className="cr-fineprint">{t('copyright.notice.whatHappens')}</p>

      {error && (
        <div className="msg msg-error" role="alert">
          {error}
        </div>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? t('copyright.notice.sending') : t('copyright.notice.send')}
      </Button>
    </form>
  );
}
