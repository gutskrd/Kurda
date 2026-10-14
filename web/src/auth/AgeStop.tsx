import { Link } from 'react-router-dom';
import { useT } from '../i18n/I18nProvider';

const STOP_KEY = 'hevalo.ageStop';

/**
 * Remember, for this browser session, that sign-up stopped on age.
 *
 * So the explanation stays when the page is reloaded or the back button is
 * pressed, instead of handing back an empty form that invites a different year
 * — the age screen is only neutral if it is not a quiz you can retake. Session
 * storage, so a different person on the same computer tomorrow is asked
 * afresh. Storage can be missing or refuse a write; the stop still shows for as
 * long as this page is open.
 */
export type AgeStopKind = 'refused' | 'closed';

export function rememberAgeStop(kind: AgeStopKind): void {
  try {
    sessionStorage.setItem(STOP_KEY, kind);
  } catch {
    // private mode or storage disabled: the in-page state is enough
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
 * What somebody under 13 sees instead of an account.
 *
 * Polite and plain, and never a reason to try again: it says what Hevalo is
 * for, that nothing was kept (or, for an account that existed, that it has
 * been closed), and points at the one part of the app that needs no account at
 * all.
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
