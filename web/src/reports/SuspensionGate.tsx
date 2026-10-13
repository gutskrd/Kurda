import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AccountStanding, AppealView, StandingSanction, SuspendedErrorDetails } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { Loading } from '../components/states';
import { LockIcon } from '../components/icons';
import { useLocale, useT } from '../i18n/I18nProvider';
import { CATEGORY_LABEL } from './labels';
import { formatUntil } from './restriction';
import { SanctionCard } from './SanctionCard';

/** Pages a suspended person can still read: the rules they are told they broke, among them. */
const OPEN_PATHS: ReadonlySet<string> = new Set(['/terms', '/privacy', '/faq', '/about']);

/**
 * In place of the app while the account is suspended.
 *
 * A suspended account used to sign in, get tokens, and meet a bare "This
 * account is disabled" on the next screen — no reason, no end date, no way to
 * object. Sign-in now answers ACCOUNT_SUSPENDED with all three (and so does
 * the refresh, for a ban that lands mid-session), and this shows them until
 * the person closes it.
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
 * The suspension screen: calm, and complete. What happened and until when;
 * then each decision with its reasons, read with the appeal token (which can
 * read the standing and file the one appeal, and nothing else), and "Ask for
 * a review" on any that can still be reviewed.
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
      return res.ok ? res.data : describeError(res.error, t);
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
          {/* the reasons, here when the decisions below could not be read */}
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
