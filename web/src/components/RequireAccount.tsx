import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';
import { VERIFY_PATH } from './ProtectedRoute';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * Wraps pages that need an account: your messages, saved posts, settings and lessons, and the games, which the server
 * scores against an account. A signed-out visitor is asked to join rather than redirected to a login form.
 */
export function RequireAccount({
  children,
  what,
}: {
  children: React.ReactNode;
  /** What this page is for, as a catalogue key, e.g. `gate.what.playOthers`. */
  what: MessageKey;
}): React.JSX.Element {
  const { status, user } = useAuth();
  const t = useT();
  const location = useLocation();

  if (status === 'restoring') return <Loading label={t('gate.restoring')} />;

  // Signed in but unverified: the app stays closed until the emailed code is in.
  if (status === 'signedIn' && user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }

  if (status === 'signedIn') return <>{children}</>;

  // The whole address, since a game invite carries its lobby in the query (`?id=…`).
  const from = location.pathname + location.search;

  return (
    <div className="container container-narrow">
      <div className="gate">
        <h1 className="page-title" style={{ marginTop: 0 }}>{t('gate.title')}</h1>
        <p className="page-sub">{t('gate.body', { what: t(what) })}</p>
        <div className="gate-actions">
          <Link to="/register" className="btn btn-primary" state={{ from }}>
            {t('auth.login.createAccount')}
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from }}>
            {t('nav.login')}
          </Link>
        </div>
        <p className="muted">
          <Link to="/app/civak" className="link">{t('gate.backToCivak')}</Link>
        </p>
      </div>
    </div>
  );
}
