import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BirthDatePrompt } from '../auth/BirthDatePrompt';
import { Loading } from './states';
import { VERIFY_PATH } from './ProtectedRoute';
import { useT } from '../i18n/I18nProvider';

/**
 * The door to the app, which is open to read; pages that need an account wrap themselves in `RequireAccount`. This still
 * holds an unverified account at the verify screen, then asks once for a birth month where none is on record, since what
 * the account may do depends on it.
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
