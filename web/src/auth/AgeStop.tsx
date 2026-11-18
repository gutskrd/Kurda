import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';

const STOP_KEY = 'hevalo.ageStop';

/**
 * Remembers for this browser session that sign-up stopped on age, so a reload or Back keeps the explanation rather
 * than offering an empty form to retry with another year. Session storage, so a different person tomorrow is asked
 * afresh; without storage the stop lasts as long as the page.
 */
export type AgeStopKind = 'refused' | 'closed';

export function rememberAgeStop(kind: AgeStopKind): void {
  try {
    sessionStorage.setItem(STOP_KEY, kind);
  } catch {
    // Private mode or storage disabled: the in-page state is enough.
  }
}

export function ageStopRemembered(): AgeStopKind | null {
  try {
    const kind = sessionStorage.getItem(STOP_KEY);
    return kind === 'refused' || kind === 'closed' ? kind : null;
  } catch {
    return null;
  }
}

/**
 * What somebody under 13 sees instead of an account: what Hevalo is for, that nothing was kept (or that the account
 * was closed), and the part of the app that needs no account. It gives no reason to try again.
 */
export function AgeStop({ accountClosed = false }: { accountClosed?: boolean }): React.JSX.Element {
  const t = useT();
  return (
    <div className="auth-wrap">
      <div className="auth-card age-stop" role="status">
        <h1>{t('age.stop.title')}</h1>
        <p>{accountClosed ? t('age.stop.closed') : t('age.stop.body')}</p>
        <p>{t('age.stop.welcome')}</p>
        <Link to="/app/alphabet" className="btn btn-secondary">
          {t('age.stop.alphabet')}
        </Link>
      </div>
    </div>
  );
}
