import { Outlet } from 'react-router-dom';
import { Brand } from '../components/Brand';

/** Minimal shell for sign-in / sign-up / reset — brand + centered glass form. */
export function AuthLayout(): React.JSX.Element {
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
