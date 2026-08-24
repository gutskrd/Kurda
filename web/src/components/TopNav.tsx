import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Brand } from './Brand';
import { Button, LinkButton } from './Button';
import { ThemeToggle } from './ThemeToggle';
import { MenuIcon, CloseIcon } from './icons';

export interface NavItem {
  label: string;
  to: string;
}

/** Desktop-first top navigation. Collapses to a menu under 860px. */
export function TopNav({ links }: { links: NavItem[] }): React.JSX.Element {
  const { status, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const signedIn = status === 'signedIn';

  const close = (): void => setOpen(false);

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Brand />

        <nav aria-label="Primary">
          <ul className={`nav-links${open ? ' open' : ''}`}>
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  onClick={close}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <span className="nav-spacer" />

        <div className="nav-actions">
          <ThemeToggle />
          {signedIn ? (
            <>
              <LinkButton to="/app/profile" variant="secondary" size="sm" className="nav-desktop-only">
                Profile
              </LinkButton>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void logout().then(() => navigate('/'));
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm">
                Log in
              </LinkButton>
              <LinkButton to="/register" variant="primary" size="sm" className="nav-desktop-only">
                Get started
              </LinkButton>
            </>
          )}
          <button
            type="button"
            className="nav-toggle"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
