import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';

/** Gate for signed-in-only routes. While the session is being restored we show
 *  a spinner; if signed out we redirect to /login, preserving the intended
 *  destination so the user lands back here after signing in. */
export function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label="Restoring your session…" />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
