import { lazy } from 'react';
import { AuthProvider } from './auth';
import { DialogProvider, ToastProvider } from './ui';
import { SignIn } from './pages/SignIn';

/** The console's code: fetched while the sign-in is still being filled in, and the same fetch when it opens. */
const loadConsole = (): Promise<typeof import('./Console')> => import('./Console');
const Console = lazy(loadConsole);

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <ToastProvider>
        <DialogProvider>
          {/* the API refuses every /admin route without 2FA, so the console opens only once the sign-in has cleared it */}
          <SignIn warm={loadConsole}>{(signOut) => <Console onSignOut={signOut} />}</SignIn>
        </DialogProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
