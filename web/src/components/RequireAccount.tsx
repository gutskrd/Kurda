import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Loading } from './states';
import { VERIFY_PATH } from './ProtectedRoute';

/**
 * A page that needs an account.
 *
 * Most of the app is open to read — the community's wall, its posts, its
 * rankings, the games you play alone. This wraps the parts that are about *you*
 * or about reaching other people: your messages, your saved posts, your
 * settings, and playing against someone.
 *
 * A signed-out visitor is asked rather than bounced. Being redirected to a login
 * form, with no explanation and no way back, is how you lose someone who was
 * only curious.
 */
export function RequireAccount({
  children,
  what,
}: {
  children: React.ReactNode;
  /** what this page is, for the sign-in prompt — e.g. "play against other people" */
  what: string;
}): React.JSX.Element {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label="Restoring your session…" />;

  // signed in but unverified: the app stays closed until the emailed code is in
  if (status === 'signedIn' && user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }

  if (status === 'signedIn') return <>{children}</>;

  return (
    <div className="container container-narrow">
      <div className="gate">
        <h1 className="page-title" style={{ marginTop: 0 }}>You need an account for this</h1>
        <p className="page-sub">You can read everything here without one — but to {what} you have to sign in.</p>
        <div className="gate-actions">
          <Link to="/register" className="btn btn-primary" state={{ from: location.pathname }}>
            Create an account
          </Link>
          <Link to="/login" className="btn btn-secondary" state={{ from: location.pathname }}>
            Log in
          </Link>
        </div>
        <p className="muted">
          <Link to="/app/civak" className="link">Back to Civak</Link>
        </p>
      </div>
    </div>
  );
}
