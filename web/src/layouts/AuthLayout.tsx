import { Outlet } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/ThemeToggle';

/** Minimal shell for sign-in / sign-up / reset — brand + centered form. */
export function AuthLayout(): React.JSX.Element {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Brand />
          <span className="nav-spacer" />
          <ThemeToggle />
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}
