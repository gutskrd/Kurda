import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_TEENS_PER_PARENT, formatParentCode } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { CheckIcon, CopyIcon, ShareIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import type { ApiError } from '../lib/types';
import { SettingsFrame } from '../settings/SettingsList';
import { PARENTAL_PATH, personName, type ParentCode, type ParentalOverview, type PersonRef } from './api';
import { PARENTAL_HOME, PageSkeleton, type ParentalPageProps } from './ParentalSettings';

/** How often the page asks whether the teen has entered the code yet. */
const WATCH_MS = 5_000;
/** How long "connected" shows before the teen's page opens. */
const CELEBRATE_MS = 1_400;

/**
 * A parent adding a teen: a fresh code, large and spaced for reading out or typing from another screen, which works
 * once within a day; copying and sharing it; and a new one when wanted, which voids the last. While the page is open it
 * watches for the teen to enter it, says so, and opens their page.
 */
export function AddTeen({ overview, heading, focus }: ParentalPageProps): React.JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const { client } = useAuth();
  const [code, setCode] = useState<ParentCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [arrived, setArrived] = useState<PersonRef | null>(null);
  // Only the newest request's code is shown, since each voids the one before.
  const asked = useRef(0);
  // The teens already here when the page opened, so a new one is noticed.
  const known = useRef<Set<string> | null>(null);
  known.current ??= overview.data?.teens ? new Set(overview.data.teens.map((x) => x.teen.userId)) : null;

  async function make(): Promise<void> {
    const n = ++asked.current;
    setMaking(true);
    setError(null);
    const res = await client.post<ParentCode>(`${PARENTAL_PATH}/code`);
    if (n !== asked.current) return;
    setMaking(false);
    if (res.ok) setCode(res.data);
    else setError(refusalText(res.error));
  }

  /** A parent's own refusals, said to the parent: already looking after five teens, or why this account may not yet. */
  function refusalText(error: ApiError): string {
    if (error.code === 'PARENTAL_PARENT_FULL') return t('parental.teensFull', { count: MAX_TEENS_PER_PARENT });
    const reason = (error.details as { reason?: unknown } | undefined)?.reason;
    if (error.code === 'PARENTAL_NOT_PARENT' && reason === 'email') return t('parental.none.email');
    if (error.code === 'PARENTAL_NOT_PARENT' && reason === 'standing') return t('parental.none.standing');
    if (error.code === 'PARENTAL_NOT_PARENT' && reason === 'birth_month') return t('parental.none.birthMonth');
    return describeError(error, t);
  }

  // One code for each visit to the page, made as it opens.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void make();
  }, []);

  const reload = overview.reload;
  useEffect(() => {
    if (arrived) return;
    let gone = false;
    const stop = pollWhileVisible(() => {
      void client.get<ParentalOverview>(PARENTAL_PATH).then((res) => {
        if (gone || !res.ok) return;
        const teens = res.data.teens ?? [];
        // Opened before the list had answered: this answer is what was already here.
        if (!known.current) {
          known.current = new Set(teens.map((x) => x.teen.userId));
          return;
        }
        const fresh = teens.find((x) => !known.current!.has(x.teen.userId));
        if (!fresh) return;
        setArrived(fresh.teen);
        reload();
      });
    }, WATCH_MS);
    return () => {
      gone = true;
      stop();
    };
  }, [arrived, client, reload]);

  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => navigate(`${PARENTAL_HOME}/teen/${encodeURIComponent(arrived.userId)}`, { replace: true }), CELEBRATE_MS);
    return () => window.clearTimeout(timer);
  }, [arrived, navigate]);

  const shown = code ? formatParentCode(code.code) : '';
  const shareText = t('parental.code.shareText', { code: shown });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('parental.code.copyFailed'));
    }
  }

  return (
    <SettingsFrame title={t('parental.addTeen')} heading={heading} back={{ to: PARENTAL_HOME, label: t('parental.title') }} focus={focus}>
      <div className="settings-page-body parental-add">
        {arrived ? (
          <div className="parental-arrived" role="status">
            <span className="parental-arrived-tick" aria-hidden="true">
              <CheckIcon size={28} />
            </span>
            <p className="parental-arrived-name">{t('parental.code.done', { name: personName(arrived) })}</p>
          </div>
        ) : (
          <>
            <p className="settings-page-intro">{t('parental.code.lead')}</p>
            {code ? (
              <p className={`parental-code${making ? ' is-making' : ''}`} dir="ltr" aria-label={[...code.code].join(' ')}>
                {shown}
              </p>
            ) : error ? null : (
              <PageSkeleton />
            )}
            {code && <p className="settings-page-note parental-code-works">{t('parental.code.works')}</p>}
            {error && (
              <div className="msg msg-error" role="alert">
                {error}
              </div>
            )}
            {code && (
              <div className="parental-code-actions">
                <Button variant="secondary" onClick={() => void copy()}>
                  <CopyIcon size={18} /> {copied ? t('chat.copied') : t('chat.copy')}
                </Button>
                {canShare && (
                  <Button variant="secondary" onClick={() => void navigator.share({ text: shareText }).catch(() => undefined)}>
                    <ShareIcon size={18} /> {t('parental.code.share')}
                  </Button>
                )}
              </div>
            )}
            <button type="button" className="link-button parental-code-new" disabled={making} onClick={() => void make()}>
              {making && code ? t('parental.code.making') : t('parental.code.new')}
            </button>
            {code && (
              <p className="parental-code-waiting" aria-live="polite">
                <span className="spinner parental-code-spinner" aria-hidden="true" />
                {t('parental.code.waiting')}
              </p>
            )}
          </>
        )}
      </div>
    </SettingsFrame>
  );
}
