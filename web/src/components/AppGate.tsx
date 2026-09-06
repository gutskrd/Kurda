import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';
import { VERIFY_PATH } from './ProtectedRoute';

/**
 * The door to the app, which is open.
 *
 * Anyone can walk in and read: the wall, the posts, the rankings, the games you
 * play alone. What needs an account is wrapped in `RequireAccount` page by page,
 * so the decision lives next to the thing being protected rather than in one
 * list somewhere else that drifts.
 *
 * The one thing this still enforces is email verification — an account that has
 * not confirmed its address is held at the verify screen, exactly as before.
 * Signing up and then wandering the app unverified would make the check
 * pointless.
 */
export function AppGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label="Restoring your session…" />;
  if (status === 'signedIn' && user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }
  return <>{children}</>;
}
