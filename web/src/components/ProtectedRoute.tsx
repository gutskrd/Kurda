import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';

/** Where an unverified account is sent to prove it owns its email address. */
export const VERIFY_PATH = '/verify-email';

/**
 * Gate for signed-in-only routes. While the session is being restored we show a
 * spinner; if signed out we redirect to /login, preserving the intended
 * destination so the user lands back here after signing in.
 *
 * A signed-in account that hasn't confirmed its email is held at the verify
 * screen: registering creates the session, but the app stays closed until the
 * emailed code is entered. The server is the authority on `emailVerified` (it
 * comes from /me), so this can't be skipped by editing client state — and the
 * API independently treats unverified accounts as low-trust.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label="Restoring your session…" />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }
  return <>{children}</>;
}
