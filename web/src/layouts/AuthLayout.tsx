import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { warmApi } from '../lib/warmup';

/** Minimal shell for sign-in / sign-up / reset — brand + centered glass form. */
export function AuthLayout(): React.JSX.Element {
  // wake the API as soon as the user reaches an auth screen, so cold-start
  // latency isn't paid on the login/register request itself
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
        <Outlet />
      </main>
    </>
  );
}
