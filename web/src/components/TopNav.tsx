import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../chat/MessagesProvider';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { useRail } from '../social/RailProvider';
import { Brand } from './Brand';
import { LinkButton } from './Button';
import { CoinIcon, GemIcon, MenuIcon, CloseIcon, ShopIcon } from './icons';
import { RailToggle } from '../social/RailToggle';

export interface NavItem {
  label: string;
  to: string;
  /** shown before the label; the nav reads faster as glyph + word than as words */
  icon?: React.ReactNode;
}

/** Where the shop lives — kept out of `links` so it can sit on its own. */
const SHOP = '/app/shop';

/**
 * Desktop-first top navigation. Collapses to a menu under 860px.
 *
 * Three groups, left to right: the brand, where you can go, and what you have.
 * Shop is deliberately not in the middle group — it is a place you spend rather
 * than a place you read, so it sits with the currencies it spends, as an icon
 * with no word beside it.
 *
 * Signing out is not here. It used to sit between the settings gear and your
 * face, one slip away from ending your session; it belongs in Settings, with the
 * other things you do to your account rather than in the app. Saved moved to
 * your profile for the same reason — it is yours, not a place.
 */
export function TopNav({ links }: { links: NavItem[] }): React.JSX.Element {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const { unreadTotal } = useMessages();
  const unopenedGifts = useUnseenGifts();
  const signedIn = status === 'signedIn';

  const close = (): void => setOpen(false);

  return (
    <header className="nav">
      <div className="container nav-inner">
        {/* signed-in users stay inside the app shell instead of
            landing on the marketing site (which has its own nav) */}
        <Brand to={signedIn ? '/app' : '/'} />

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
                  {l.icon && <span className="nav-link-icon" aria-hidden>{l.icon}</span>}
                  {l.label}
                  {/* a link carries its own waiting count, so something arriving is
                      visible from anywhere without opening the page to check */}
                  {l.to === '/app/messages' && unreadTotal > 0 && (
                    <span className="nav-badge" aria-label={`${unreadTotal} unread`}>
                      {unreadTotal > 99 ? '99+' : unreadTotal}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}

            {/* actions inside the mobile dropdown only */}
            <li className="nav-mobile-actions">
              {signedIn ? (
                <>
                  <NavLink to={SHOP} className="nav-link" onClick={close}>Shop</NavLink>
                  <NavLink to="/app/settings" className="nav-link" onClick={close}>Settings</NavLink>
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
              <Purse />
              <Link
                to={SHOP}
                className="nav-shop nav-desktop-only"
                aria-label={unopenedGifts > 0 ? `Shop — ${unopenedGifts} gift${unopenedGifts === 1 ? '' : 's'} waiting` : 'Shop'}
                title="Shop"
              >
                <ShopIcon size={20} />
                {unopenedGifts > 0 && <span className="nav-badge">{unopenedGifts > 99 ? '99+' : unopenedGifts}</span>}
              </Link>
              <RailToggle />
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

/**
 * What you have to spend, stacked.
 *
 * Two currencies one above the other rather than side by side: they are read as
 * a pair — "can I afford this" — and stacking keeps both under one glance
 * without stealing the width the nav links need.
 *
 * The numbers ride on the rail's poll, so they are already fresh and cost no
 * request of their own. Nothing is shown until they arrive; a zero that later
 * turns into 13,880 is worse than a moment of nothing.
 */
function Purse(): React.JSX.Element | null {
  const { data } = useRail();
  const you = data.you;
  if (!you) return null;

  return (
    <Link to={SHOP} className="purse nav-desktop-only" title="Your Zêr and gems">
      <span className="purse-row">
        <CoinIcon size={15} />
        <span className="purse-amount">{you.balances.zer.toLocaleString()}</span>
        <span className="sr-only">Zêr</span>
      </span>
      <span className="purse-row purse-gems">
        <GemIcon size={15} />
        <span className="purse-amount">{you.balances.gems.toLocaleString()}</span>
        <span className="sr-only">gems</span>
      </span>
    </Link>
  );
}
