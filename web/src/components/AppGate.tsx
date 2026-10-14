import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BirthDatePrompt } from '../auth/BirthDatePrompt';
import { Loading } from './states';
import { VERIFY_PATH } from './ProtectedRoute';
import { useT } from '../i18n/I18nProvider';

/**
 * The door to the app, which is open.
 *
 * Anyone can walk in and read: the wall, the posts, the rankings, the games you
 * play alone. What needs an account is wrapped in `RequireAccount` page by page,
 * so the decision lives next to the thing being protected rather than in one
 * list somewhere else that drifts.
 *
 * The two things this still enforces, in order: email verification — an
 * account that has not confirmed its address is held at the verify screen —
 * and then a birth month, asked once of any account that has none (Google and
 * Apple sign-ups, and accounts from before it was asked), because what the app
 * lets the account do depends on the answer.
 */
export function AppGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const t = useT();
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'restoring') return <Loading label={t('auth.restoring')} />;
  if (status === 'signedIn' && user && !user.emailVerified && location.pathname !== VERIFY_PATH) {
    return <Navigate to={VERIFY_PATH} replace />;
  }
  if (status === 'signedIn' && user?.emailVerified && user.birthDateRequired === true) {
    return <BirthDatePrompt />;
  }
  return <>{children}</>;
}
