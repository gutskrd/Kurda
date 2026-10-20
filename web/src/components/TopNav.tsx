import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useRail } from '../social/RailProvider';
import { Brand } from './Brand';
import { LinkButton } from './Button';
import { CoinIcon, GemIcon, MenuIcon, CloseIcon } from './icons';
import { RailToggle } from '../social/RailToggle';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { useT } from '../i18n/I18nProvider';
import { countLabel } from './TabBar';

export interface NavItem {
  /** which place this is — the tab bar and tests find a place by it */
  key?: string;
  label: string;
  to: string;
  /** shown before the label; the nav reads faster as glyph + word than as words */
  icon?: React.ReactNode;
  /** the glyph while this is the page you are on: the same shape, filled in */
  activeIcon?: React.ReactNode;
  /**
   * Whether a page belongs to this place. A place stays lit on the pages
   * inside it — Rankings is part of Learn, Settings part of your profile —
   * which a plain prefix match on `to` cannot say.
   */
  owns?: (pathname: string) => boolean;
  /** a count waiting here (unread messages); nothing is drawn at zero */
  badge?: number;
  /** something waiting that has no number worth saying (a gift to open) */
  dot?: boolean;
  /**
   * A path this app does not route — the published dictionary under /ferheng/,
   * which is files on the edge rather than a screen in here.
   *
   * It has to be a plain anchor. A client-side navigation would hand the
   * router a path it has no route for and draw a 404 over a page that exists.
   */
  external?: boolean;
}

/** Where the shop lives: the purse opens it. */
const SHOP = '/app/shop';

/**
 * Whether a link should only light up on an exact match.
 *
 * `/app` is the parent of every other route, so without this Home stayed lit on
 * every page. The rule is derived rather than hardcoded: a link that another
 * link is nested under has to match exactly, which stays true as links are
 * added. A place that says which pages it owns does not need it.
 */
function matchesExactly(to: string, all: readonly NavItem[]): boolean {
  return all.some((other) => other.to !== to && other.to.startsWith(`${to}/`));
}

/**
 * The top bar.
 *
 * Three groups, left to right: the brand, the five places, and what is yours —
 * the purse, the bell, and on a mid-width screen the way into the social
 * column. On a phone the places move to the tab bar along the bottom
 * (components/TabBar.tsx), and this keeps only the brand and the bell: the
 * top of a phone screen is the hardest place to reach with a thumb, so it
 * holds what is glanced at rather than what is pressed.
 *
 * The menu button is left only where there is no tab bar — a visitor without
 * an account on the front page and the pages about Hevalo — because there the
 * places have nowhere else to be.
 *
 * Signing out is not here. It belongs in Settings, with the other things you
 * do to your account rather than in the app.
 */
export function TopNav({ links, withTabBar = false }: { links: NavItem[]; withTabBar?: boolean }): React.JSX.Element {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const t = useT();
  const { pathname } = useLocation();
  const signedIn = status === 'signedIn';

  const close = (): void => setOpen(false);

  // Escape closes the open menu, as it closes every other thing that opens
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    /*
     * Left to right in every language. In Arabic or Soranî the page mirrors —
     * reading order is right to left — but the bar does not: brand on the
     * left, places in the middle, what you have on the right, the same in all
     * nine languages, as on any product's bar. Only its words change, and each
     * label is `dir="auto"` so an Arabic word still reads right to left inside
     * its own button.
     */
    <header className={`nav${withTabBar ? ' has-tabbar' : ''}`} dir="ltr">
      <div className="container nav-inner">
        {/* signed-in users stay inside the app shell instead of
            landing on the marketing site (which has its own nav) */}
        <Brand to={signedIn ? '/app' : '/'} />

        <nav aria-label={t('nav.primary')} className="nav-primary">
          <ul className={`nav-links${open ? ' open' : ''}`}>
            {links.map((l) => {
              const owned = l.owns?.(pathname);
              const inner = (active: boolean) => (
                <>
                  {l.icon && (
                    <span className="nav-link-icon" aria-hidden>
                      {active && l.activeIcon ? l.activeIcon : l.icon}
                      {l.dot && !l.badge && <span className="nav-dot" />}
                    </span>
                  )}
                  {/* wrapped so the middle widths can hide the word and keep the
                      glyph — hidden by clipping, never display:none, or the link
                      would lose its accessible name along with its label */}
                  <span className="nav-link-label" dir="auto">{l.label}</span>
                  {/* a link carries its own waiting count, so something arriving is
                      visible from anywhere without opening the page to check */}
                  {(l.badge ?? 0) > 0 && (
                    <span className="nav-badge" aria-label={t('nav.unreadCount', { count: l.badge! })}>
                      {countLabel(l.badge!)}
                    </span>
                  )}
                </>
              );
              return (
                <li key={l.key ?? l.to}>
                  {l.external ? (
                    <a href={l.to} className="nav-link" onClick={close}>
                      {inner(false)}
                    </a>
                  ) : l.owns ? (
                    <Link
                      to={l.to}
                      className={`nav-link${owned ? ' active' : ''}`}
                      aria-current={owned ? 'page' : undefined}
                      onClick={close}
                    >
                      {inner(Boolean(owned))}
                    </Link>
                  ) : (
                    <NavLink
                      to={l.to}
                      end={l.to === '/' || matchesExactly(l.to, links)}
                      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                      onClick={close}
                    >
                      {({ isActive }) => inner(isActive)}
                    </NavLink>
                  )}
                </li>
              );
            })}

            {/* a visitor's way in, inside the menu that only exists without a tab bar */}
            {!signedIn && (
              <li className="nav-mobile-actions">
                <NavLink to="/login" className="nav-link" onClick={close}>{t('nav.login')}</NavLink>
                <NavLink to="/register" className="nav-link nav-cta" onClick={close}>{t('nav.register')}</NavLink>
              </li>
            )}
          </ul>
        </nav>

        <span className="nav-spacer" />

        <div className="nav-actions">
          {signedIn ? (
            <>
              <Purse />
              {/* likes, comments, gifts, game invites and notices from Hevalo */}
              <NotificationsBell />
              <RailToggle />
            </>
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm" className="nav-desktop-only">
                {t('nav.login')}
              </LinkButton>
              {/* inside the app on a phone the tab bar has Log in; this is the other half */}
              <LinkButton to="/register" variant="primary" size="sm" className={withTabBar ? 'nav-register' : 'nav-desktop-only'}>
                {t('nav.register')}
              </LinkButton>
            </>
          )}
          {!signedIn && !withTabBar && (
            <button
              type="button"
              className="nav-toggle"
              aria-label={open ? t('nav.close') : t('nav.menu')}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * What you have to spend, stacked — and the way into the shop.
 *
 * Two currencies one above the other rather than side by side: they are read as
 * a pair — "can I afford this" — and stacking keeps both under one glance
 * without stealing the width the places need.
 *
 * The numbers ride on the rail's poll, so they are already fresh and cost no
 * request of their own. Nothing is shown until they arrive; a zero that later
 * turns into 13,880 is worse than a moment of nothing.
 */
function Purse(): React.JSX.Element | null {
  const t = useT();
  const { data } = useRail();
  const you = data.you;
  if (!you) return null;

  return (
    <Link to={SHOP} className="purse nav-desktop-only" title={t('nav.yourPurse')}>
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
