import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useRail } from '../social/RailProvider';
import { Brand } from './Brand';
import { LinkButton } from './Button';
import { Skeleton } from './Skeleton';
import { CoinIcon, GemIcon, GearIcon, MenuIcon, CloseIcon, ShopIcon, UserIcon, UsersIcon } from './icons';
import { RailToggle } from '../social/RailToggle';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { NavSearch } from '../search/NavSearch';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { BackButton } from '../layouts/BackButton';
import { PHONE_CHROME, isPlaceRoot } from '../layouts/roots';

export interface NavItem {
  /** which place this is — tests and the menu find a place by it */
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

/** A count as a badge shows it: the number up to nine, then "9+". */
export function countLabel(n: number): string {
  return n > 9 ? '9+' : String(n);
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
 * The top bar: the same bar on every screen, made smaller rather than made
 * into something else.
 *
 * On a wide screen it holds the brand, the places, the search field and what
 * is yours — the purse and the bell (and, until the social column has room to
 * stand beside the page, the way into it). It stays at the top of the window
 * while the page scrolls under it, on a solid ground with a hairline, so no
 * line of the page ever shows through a label.
 *
 * On a phone the bar keeps the brand, a search button and the bell. On the
 * public pages the places fold into a menu under a button at its end: one
 * press opens it, a second goes anywhere. The menu is a list down the screen
 * with each place's word beside its glyph, and it has room for what the wide
 * bar shows elsewhere — your Zêr and gems with the shop, your friends,
 * Settings, or for a visitor, the way in. Something waiting in it (an unread
 * message, a gift) shows on the button, so it is not hidden by being folded
 * away. Inside the app a phone has the places along the bottom of the window
 * instead, and no menu (`placesBelow`).
 *
 * In Arabic and Soranî the bar runs right to left with the page: the brand at
 * the right, the bell and the menu at the left, as a reader of those scripts
 * expects to find them.
 *
 * Signing out is not here. It belongs in Settings, with the other things you
 * do to your account rather than in the app.
 *
 * `joinOnPhone` keeps "Get started" on a phone's bar for a visitor. Inside the
 * app it is the only invitation on most pages; the front page has its own, a
 * screen tall, and a second one in the bar would only compete with it.
 *
 * `placesBelow` is the app's shell saying that on a phone the places are in a
 * bar of their own along the bottom of the window (layouts/PlacesBar.tsx).
 * There this bar folds nothing away: it is drawn as the phone app's top is
 * (`PhoneBar`, below). The public pages have no bar of places, and keep the
 * menu.
 */
export function TopNav({
  links,
  joinOnPhone = false,
  placesBelow = false,
}: {
  links: NavItem[];
  joinOnPhone?: boolean;
  placesBelow?: boolean;
}): React.JSX.Element {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  const t = useT();
  const { pathname } = useLocation();
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const signedIn = status === 'signedIn';
  const phone = useMediaQuery(PHONE_CHROME);

  const close = (): void => setOpen(false);

  // moving to another page puts the menu away
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    // the first place takes the focus, so a keyboard is already inside what it opened; the bar and
    // what hangs from it are always in sight, so a focus here never scrolls the page under them
    listRef.current?.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    // Escape closes the open menu, as it closes every other thing that opens
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /*
   * A keyboard that Tabs on past the end of the open menu has left it, so the
   * menu goes away, rather than leaving the focus to walk through a page that
   * is covered by its scrim. Only a move to somewhere else counts: a press on
   * an empty part of the menu sends the focus nowhere, and keeps it open.
   */
  const onBlur = (e: React.FocusEvent<HTMLElement>): void => {
    const next = e.relatedTarget;
    if (open && next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  // what is waiting behind the folded menu, so the button can say so
  const unread = links.reduce((n, l) => n + (l.badge ?? 0), 0);
  const waiting = links.some((l) => l.dot);
  const menuName = open
    ? t('nav.close')
    : unread > 0
      ? t('nav.tabUnread', { place: t('nav.menu'), count: unread })
      : waiting
        ? t('nav.tabWaiting', { place: t('nav.menu') })
        : t('nav.menu');

  if (placesBelow && phone) return <PhoneBar links={links} />;

  return (
    <header className={`nav${open ? ' is-menu-open' : ''}`} onBlur={onBlur}>
      <div className="container nav-inner">
        {/* signed-in users stay inside the app shell instead of
            landing on the marketing site (which has its own nav) */}
        <Brand to={signedIn ? '/app' : '/'} />

        <nav aria-label={t('nav.primary')} className="nav-primary">
          <ul id={menuId} ref={listRef} className={`nav-links${open ? ' open' : ''}`}>
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

            {/* the rest of the menu, which only a phone has: what the wide bar keeps elsewhere */}
            <li className="nav-mobile-actions">
              {signedIn ? (
                <>
                  <NavLink to="/app/friends" className="nav-link" onClick={close}>
                    <span className="nav-link-icon" aria-hidden>
                      <UsersIcon size={22} />
                    </span>
                    <span className="nav-link-label" dir="auto">{t('nav.friends')}</span>
                  </NavLink>
                  <NavLink to={SHOP} className="nav-link" onClick={close}>
                    <span className="nav-link-icon" aria-hidden>
                      <ShopIcon size={22} />
                    </span>
                    <span className="nav-link-label" dir="auto">{t('nav.shop')}</span>
                    <PurseAmounts />
                  </NavLink>
                  <NavLink to="/app/settings" className="nav-link" onClick={close}>
                    <span className="nav-link-icon" aria-hidden>
                      <GearIcon size={22} />
                    </span>
                    <span className="nav-link-label" dir="auto">{t('nav.settings')}</span>
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="nav-link" onClick={close}>
                    <span className="nav-link-icon" aria-hidden>
                      <UserIcon size={22} />
                    </span>
                    <span className="nav-link-label" dir="auto">{t('nav.login')}</span>
                  </NavLink>
                  <NavLink to="/register" className="nav-link nav-cta" onClick={close}>{t('nav.register')}</NavLink>
                </>
              )}
            </li>
          </ul>
        </nav>

        <NavSearch />

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
              <LinkButton to="/register" variant="primary" size="sm" className={joinOnPhone ? 'nav-register' : 'nav-desktop-only'}>
                {t('nav.register')}
              </LinkButton>
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            className="nav-toggle"
            aria-label={menuName}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            {!open && (unread > 0 || waiting) && <span className="nav-toggle-dot" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* the page under an open menu steps back, and a press on it closes the menu */}
      {open && <div className="nav-scrim" onClick={close} aria-hidden="true" />}
    </header>
  );
}

/**
 * The top of a phone's screen, inside the app: what the phone app has there
 * (mobile/src/navigation/TopBar.tsx and ScreenHeader.tsx).
 *
 * At the reading edge, where you are: the brand on the root of a place, and
 * on a page you went into, the way back in its place (`BackButton`). At the
 * far end, the two things done from anywhere, looking for something and
 * seeing what is new: search and the bell in one pill. One shape with two
 * glyphs in it is read as one thing in the corner, where two discs side by
 * side are two things to choose between, and it is in the same corner of
 * every page, so neither has to be found twice.
 *
 * Nothing else. The places are in their own bar along the bottom
 * (layouts/PlacesBar.tsx), and what the folded menu held besides them is in
 * the place it belongs to: your friends, the shop and Settings in your
 * profile's own menu (profile/ProfileMenu.tsx), and the requests waiting on
 * you above your conversations. A visitor keeps "Get started" here on every
 * page, and has Sign in beside the places.
 *
 * The shapes are solid, in the fill of what floats, and the bar behind them
 * is the page's own ground with no line under it, so they read as shapes
 * resting on the page and not as a strip across it (shell.css). In Arabic
 * and Soranî the bar runs with the page: the way back on the right, the pill
 * on the left.
 */
function PhoneBar({ links }: { links: NavItem[] }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const { pathname, search } = useLocation();
  const signedIn = status === 'signedIn';
  return (
    <header className="nav nav-phone">
      <div className="container nav-inner">
        {isPlaceRoot(pathname, search) ? <Brand to={signedIn ? '/app' : '/'} /> : <BackButton links={links} />}
        <div className="nav-pill">
          <NavSearch />
          {/* nothing for a visitor, whose pill is then the search alone */}
          <NotificationsBell />
        </div>
        {!signedIn && (
          <LinkButton to="/register" variant="primary" size="sm" className="nav-register">
            {t('nav.register')}
          </LinkButton>
        )}
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
 * request of their own. No number is shown until they arrive; a zero that
 * later turns into 13,880 is worse than a moment of nothing. Until then the
 * purse is two grey bars of its own size, so the bar does not open up a gap
 * for it when the numbers land.
 */
function Purse(): React.JSX.Element | null {
  const t = useT();
  const { data, loading } = useRail();
  const you = data.you;
  if (!you) {
    if (!loading) return null;
    return (
      <span className="purse nav-desktop-only skeleton-late" aria-hidden="true">
        <span className="purse-row">
          <CoinIcon size={15} />
          <Skeleton line w={34} />
        </span>
        <span className="purse-row purse-gems">
          <GemIcon size={15} />
          <Skeleton line w={20} />
        </span>
      </span>
    );
  }

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
        <span className="sr-only">{t('shop.gems')}</span>
      </span>
    </Link>
  );
}

/** The purse on one line, at the end of the menu's Shop row on a phone. */
function PurseAmounts(): React.JSX.Element | null {
  const t = useT();
  const { data } = useRail();
  const you = data.you;
  if (!you) return null;
  return (
    <span className="nav-menu-purse">
      <span className="purse-row">
        <CoinIcon size={15} />
        <span className="purse-amount">{you.balances.zer.toLocaleString()}</span>
        <span className="sr-only">Zêr</span>
      </span>
      <span className="purse-row purse-gems">
        <GemIcon size={15} />
        <span className="purse-amount">{you.balances.gems.toLocaleString()}</span>
        <span className="sr-only">{t('shop.gems')}</span>
      </span>
    </span>
  );
}
