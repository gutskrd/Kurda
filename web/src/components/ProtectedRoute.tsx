import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';
import { useT } from '../i18n/I18nProvider';

/** Where an unverified account is sent to prove it owns its email address. */
export const VERIFY_PATH = '/verify-email';

/**
 * Gate for signed-in-only routes: a spinner while the session is restored, else a redirect to /login that remembers the
 * destination. An unverified account is held at the verify screen; `emailVerified` comes from /me and the API treats
 * unverified accounts as low-trust anyway.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label={t('auth.restoring')} />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }
  return <>{children}</>;
}
