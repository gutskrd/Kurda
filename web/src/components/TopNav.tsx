import { useState } from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../chat/MessagesProvider';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { useProfileModal } from '../profile/ProfileModal';
import { Brand } from './Brand';
import { Button, LinkButton } from './Button';
import { Avatar } from './Avatar';
import { BookmarkIcon, MenuIcon, CloseIcon, GearIcon } from './icons';
import { RailToggle } from '../social/RailToggle';

export interface NavItem {
  label: string;
  to: string;
}

/** Desktop-first top navigation. Collapses to a menu under 860px. */
export function TopNav({ links }: { links: NavItem[] }): React.JSX.Element {
  const { status, logout, user } = useAuth();
  const { openProfile } = useProfileModal();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { unreadTotal } = useMessages();
  const unopenedGifts = useUnseenGifts();
  const signedIn = status === 'signedIn';

  const close = (): void => setOpen(false);
  const signOut = (): void => {
    close();
    void logout().then(() => navigate('/'));
  };
  const showProfile = (): void => {
    close();
    openProfile({ kind: 'me' });
  };

  return (
    <header className="nav">
      <div className="container nav-inner">
        {/* signed-in users stay inside the app shell instead of
            landing on the marketing site (which has its own nav) */}
        <Brand to={signedIn ? '/app' : '/'} />

        <nav aria-label="Primary">
          <ul className={`nav-links${open ? ' open' : ''}`}>
            {links.map((l) => {
              // a link carries its own waiting count, so something arriving is
              // visible from anywhere without opening the page to check
              const badge =
                l.to === '/app/messages' ? unreadTotal : l.to === '/app/shop' ? unopenedGifts : 0;
              // "1 unread" is right for a message and wrong for a present
              const badgeLabel =
                l.to === '/app/shop'
                  ? `${badge} gift${badge === 1 ? '' : 's'} waiting`
                  : `${badge} unread`;
              return (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    end={l.to === '/'}
                    className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    onClick={close}
                  >
                    {l.label}
                    {badge > 0 && (
                      <span className="nav-badge" aria-label={badgeLabel}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}

            {/* actions inside the mobile dropdown only */}
            <li className="nav-mobile-actions">
              {signedIn ? (
                <>
                  <button type="button" className="nav-link" onClick={showProfile}>Profile</button>
                  <NavLink to="/app/saved" className="nav-link" onClick={close}>Saved</NavLink>
                  <NavLink to="/app/settings" className="nav-link" onClick={close}>Settings</NavLink>
                  <button type="button" className="nav-link" onClick={signOut}>Sign out</button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="nav-link" onClick={close}>Log in</NavLink>
                  <NavLink to="/register" className="nav-link" onClick={close}>Get started</NavLink>
                </>
              )}
            </li>
          </ul>
        </nav>

        <span className="nav-spacer" />

        <div className="nav-actions">
          {signedIn ? (
            <>
              <RailToggle />
              <Link
                to="/app/saved"
                className="btn btn-ghost btn-sm nav-icon-btn nav-desktop-only"
                aria-label="Saved posts"
                title="Saved"
              >
                <BookmarkIcon size={19} />
              </Link>
              <Link
                to="/app/settings"
                className="btn btn-ghost btn-sm nav-icon-btn nav-desktop-only"
                aria-label="Settings"
                title="Settings"
              >
                <GearIcon size={19} />
              </Link>
              <Button variant="ghost" size="sm" className="nav-desktop-only" onClick={signOut}>
                Sign out
              </Button>
              <button
                type="button"
                className="nav-avatar-btn nav-desktop-only"
                onClick={() => openProfile({ kind: 'me' })}
                aria-label="Your profile"
                title="Your profile"
              >
                <Avatar url={user?.avatarUrl} glyphSize={20} />
              </button>
            </>
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm" className="nav-desktop-only">
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
