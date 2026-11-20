import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AccountStanding, AppealView, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { pollWhileVisible } from '../lib/pollWhileVisible';
import type { ApiError } from '../lib/types';
import { appealError } from './appealError';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { Loading } from '../components/states';
import { LockIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { CATEGORY_LABEL } from './labels';
import { formatDay, formatUntil } from './restriction';
import { SanctionCard } from './SanctionCard';

/** Pages a suspended person can still read, including the rules. */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/terms', '/privacy', '/faq', '/about']);

/**
 * Replaces the app while the account is suspended. Sign-in, or a refresh mid-session, answers ACCOUNT_SUSPENDED with
 * the reasons, end date and appeal token, which this shows until closed.
 */
export function SuspensionGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { suspension, dismissSuspension } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!suspension || OPEN_PATHS.has(location.pathname)) return <>{children}</>;
  return (
    <SuspensionScreen
      details={suspension}
      onClose={() => {
        dismissSuspension();
        navigate('/', { replace: true });
      }}
    />
  );
}

/**
 * The suspension screen: what happened and until when, then each decision with its reasons, read with the appeal token,
 * "Ask for a review" where still possible, and a copy of one's data or deleting the account, which a ban does not take
 * away. The token reaches only the standing, appeals, the export and deletion (shared APPEAL_TOKEN_EXTRA_PATHS).
 */
export function SuspensionScreen({
  details,
  onClose,
}: {
  details: SuspendedErrorDetails;
  onClose: () => void;
}): React.JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { client } = useAuth();
  const [standing, setStanding] = useState<AccountStanding | null | 'failed'>(null);

  useEffect(() => {
    let alive = true;
    void client.get<AccountStanding>('/me/standing', { headers: { authorization: `Bearer ${details.appealToken}` } }).then((res) => {
      if (alive) setStanding(res.ok ? res.data : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [client, details.appealToken]);

  const appeal = useCallback(
    async (sanctionId: string, text: string): Promise<AppealView | string> => {
      const res = await client.post<AppealView>(
        '/me/appeals',
        { sanctionId, text },
        { headers: { authorization: `Bearer ${details.appealToken}` } },
      );
      return res.ok ? res.data : appealError(res.error, t, { ownToken: true });
    },
    [client, t, details.appealToken],
  );

  const permanent = details.until === null;
  const decisions: StandingSanction[] =
    standing && standing !== 'failed'
      ? standing.active.filter((s) => s.kind === 'suspension' || s.kind === 'permanent_ban')
      : [];

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
          <span className="nav-spacer" />
        </div>
      </header>
      <main id="main" className="container container-narrow suspension">
        <section className="card suspension-card" aria-labelledby="suspension-title">
          <span className="suspension-icon" aria-hidden>
            <LockIcon size={26} />
          </span>
          <h1 id="suspension-title" className="suspension-title">
            {permanent ? t('suspension.titlePermanent') : t('suspension.title')}
          </h1>
          <p className="suspension-until">
            {permanent ? t('suspension.noEnd') : t('suspension.until', { time: formatUntil(details.until!, locale) })}
          </p>
          {/* The reasons, shown here when the decisions below could not be read. */}
          {(standing === 'failed' || (standing !== null && decisions.length === 0)) && (
            <>
              {details.policy && (
                <p className="sanction-rule">{t('standing.rule', { rule: t(CATEGORY_LABEL[details.policy]) })}</p>
              )}
              <figure className="sanction-statement">
                <figcaption>{t('standing.statement')}</figcaption>
                <blockquote dir="auto">{details.statement}</blockquote>
              </figure>
            </>
          )}
        </section>

        {standing === null ? (
          <Loading />
        ) : (
          decisions.length > 0 && (
            <section className="standing-group" aria-labelledby="suspension-decisions">
              <h2 id="suspension-decisions" className="friend-heading">
                {t('suspension.why')}
              </h2>
              {decisions.map((s) => (
                <SanctionCard key={s.id} sanction={s} appeal={appeal} />
              ))}
              <p className="muted suspension-note">{t('suspension.answerHere')}</p>
            </section>
          )
        )}

        <YourData appealToken={details.appealToken} />

        <div className="suspension-actions">
          <Link to="/terms" className="btn btn-ghost">
            {t('suspension.rules')}
          </Link>
          <Button variant="secondary" onClick={onClose}>
            {t('suspension.close')}
          </Button>
        </div>
      </main>
    </>
  );
}

/** The data export as `GET /me/export` reports it; a ready one comes with a fresh link that lasts minutes. */
interface ExportStatus {
  status: 'none' | 'pending' | 'ready';
  downloadUrl?: string;
  requestedAt?: string;
}

/** How often the export is read again while the screen is open: soon while it is prepared, and before a link runs out. */
const PREPARING_POLL_MS = 60_000;
const READY_POLL_MS = 10 * 60_000;

/**
 * A copy of one's data and deleting the account, both sent with the appeal token. The copy is prepared in the background
 * as in Settings, so this asks for one and offers the download once it is ready; deleting asks first, in the words
 * Settings uses, and says which records are kept.
 */
function YourData({ appealToken }: { appealToken: string }): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const locale = useLocale();
  const auth = useMemo(() => ({ headers: { authorization: `Bearer ${appealToken}` } }), [appealToken]);
  const [exported, setExported] = useState<ExportStatus | null>(null);
  const [asking, setAsking] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string | null>(null);

  // The token lasts a day; past that only signing in again gives a new one.
  const said = useCallback(
    (error: ApiError, otherwise: string): string => (error.kind === 'unauthorized' || error.status === 401 ? t('suspension.signInAgain') : otherwise),
    [t],
  );

  const read = useCallback(async (): Promise<void> => {
    const res = await client.get<ExportStatus>('/me/export', auth);
    if (res.ok && res.data && typeof res.data.status === 'string') setExported(res.data);
  }, [client, auth]);

  useEffect(() => {
    void read();
  }, [read]);
  useEffect(() => {
    if (deleted) return;
    return pollWhileVisible(() => void read(), exported?.status === 'pending' ? PREPARING_POLL_MS : READY_POLL_MS);
  }, [read, deleted, exported?.status]);

  async function prepare(): Promise<void> {
    setAsking(true);
    setExportError(null);
    const res = await client.post('/me/export', undefined, auth);
    setAsking(false);
    if (res.ok) setExported({ status: 'pending' });
    else setExportError(said(res.error, t('settings.data.failed')));
  }

  async function remove(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    const res = await client.delete<{ deletionScheduled?: boolean; deleted?: boolean; graceDays?: number }>('/me', auth);
    setDeleting(false);
    if (!res.ok) {
      setDeleteError(said(res.error, describeError(res.error, t, locale)));
      return;
    }
    const days = res.data?.deletionScheduled ? (res.data.graceDays ?? 0) : 0;
    setConfirming(false);
    setDeleted(days > 0 ? t('suspension.delete.scheduled', { days }) : t('suspension.delete.deleted'));
  }

  const ready = exported?.status === 'ready' && exported.downloadUrl ? exported : null;

  return (
    <section className="card suspension-data" aria-labelledby="suspension-data">
      <h2 id="suspension-data" className="friend-heading">
        {t('settings.data.title')}
      </h2>
      {deleted ? (
        <div className="msg msg-success" role="status">
          {deleted}
        </div>
      ) : (
        <>
          <p className="muted">{t('suspension.data.help')}</p>
          <div className="suspension-data-row">
            {ready ? (
              <>
                {ready.requestedAt && <p className="suspension-note">{t('suspension.data.ready', { date: formatDay(ready.requestedAt, locale) })}</p>}
                <div className="msg-actions">
                  <a className="btn btn-secondary" href={ready.downloadUrl} target="_blank" rel="noreferrer noopener">
                    {t('suspension.data.download')}
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => void prepare()} disabled={asking}>
                    {asking ? t('settings.data.requesting') : t('suspension.data.again')}
                  </Button>
                </div>
              </>
            ) : exported?.status === 'pending' ? (
              <p className="suspension-note" role="status">
                {t('suspension.data.preparing')}
              </p>
            ) : (
              <Button variant="secondary" onClick={() => void prepare()} disabled={asking}>
                {asking ? t('settings.data.requesting') : t('suspension.data.download')}
              </Button>
            )}
            {exportError && (
              <div className="msg msg-error" role="alert">
                {exportError}
              </div>
            )}
          </div>

          <div className="suspension-data-row">
            {confirming ? (
              <div className="suspension-delete" role="group" aria-labelledby="suspension-delete-warning">
                <p id="suspension-delete-warning">{t('suspension.delete.warning')}</p>
                <div className="msg-actions">
                  <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                    {t('common.cancel')}
                  </Button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove()} disabled={deleting}>
                    {deleting ? t('settings.delete.deleting') : t('settings.delete.confirm')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm btn-danger-text" onClick={() => setConfirming(true)}>
                {t('suspension.delete.button')}
              </button>
            )}
            {deleteError && (
              <div className="msg msg-error" role="alert">
                {deleteError}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
