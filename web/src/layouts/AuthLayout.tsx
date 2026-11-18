import { useEffect } from 'react';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Brand } from '../components/Brand';
import { warmApi } from '../lib/warmup';

/** Minimal shell for sign-in / sign-up / reset — brand + centered glass form. */
export function AuthLayout(): React.JSX.Element {
  // Wakes the API on reaching an auth screen, so a cold start does not delay the sign-in request itself.
  useEffect(() => {
    warmApi();
  }, []);

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
          <span className="nav-spacer" />
        </div>
      </header>
      <main id="main">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </>
  );
}
