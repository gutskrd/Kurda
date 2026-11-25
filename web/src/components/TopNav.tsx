import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useRail } from '../social/RailProvider';
import { Brand } from './Brand';
import { LinkButton } from './Button';
import { Skeleton } from './Skeleton';
import { CoinIcon, GearIcon, MenuIcon, CloseIcon, ShopIcon, UserIcon, UsersIcon } from './icons';
import { RailToggle } from '../social/RailToggle';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { NavSearch } from '../search/NavSearch';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { BackButton } from '../layouts/BackButton';
import { useGlass } from '../glass/useGlass';
import { PHONE_CHROME, barHasSearch, isPlaceRoot } from '../layouts/roots';

export interface NavItem {
  /** Identifies the place for tests and the menu. */
  key?: string;
  label: string;
  to: string;
  /** Shown before the label. */
  icon?: React.ReactNode;
  /** The glyph on the current page: the same shape, filled. */
  activeIcon?: React.ReactNode;
  /** Whether a page belongs to this place (Rankings to Learn, Settings to your profile), beyond a prefix match on `to`. */
  owns?: (pathname: string) => boolean;
  /** A waiting count (unread messages); nothing is drawn at zero. */
  badge?: number;
  /** Something waiting without a number worth showing (a gift to open). */
  dot?: boolean;
  /** A path outside the router (the published dictionary under /ferheng/), so a plain anchor rather than a client-side 404. */
  external?: boolean;
}

/** A count as a badge shows it: up to nine, then "9+". */
export function countLabel(n: number): string {
  return n > 9 ? '9+' : String(n);
}

/** The purse opens the shop. */
const SHOP = '/app/shop';

/**
 * Whether a link lights up only on an exact match: true for any link another link is nested under (`/app` would
 * otherwise light on every page), unless the place says which pages it owns.
 */
function matchesExactly(to: string, all: readonly NavItem[]): boolean {
  return all.some((other) => other.to !== to && other.to.startsWith(`${to}/`));
}

/**
 * The top bar on every screen. On a wide screen it holds the brand, the places, search, the purse and the bell, and
 * stays at the top on a solid ground. On a phone the public pages fold the places (plus purse, friends, Settings or the
 * way in) into a menu whose button shows anything waiting; inside the app, `placesBelow` says the places are in the
 * bottom bar (layouts/PlacesBar.tsx), so `PhoneBar` is drawn instead. In Arabic and Soranî the bar runs right to left.
 * Signing out lives in Settings. `joinOnPhone` keeps "Get started" on a phone for a visitor.
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

  // Changing page closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    // Focus the first place so the keyboard is inside the menu; the bar is always in sight, so focus never scrolls.
    listRef.current?.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    // Escape closes the menu, as it closes everything else that opens.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /*
   * Tabbing past the end of the menu closes it rather than walking through the covered page. A press on an empty part
   * of the menu moves focus nowhere and keeps it open.
   */
  const onBlur = (e: React.FocusEvent<HTMLElement>): void => {
    const next = e.relatedTarget;
    if (open && next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  // What waits behind the folded menu, so its button can show it.
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
  const searches = barHasSearch(pathname);

  return (
    <header className={`nav${open ? ' is-menu-open' : ''}`} onBlur={onBlur}>
      <div className="container nav-inner">
        {/* Signed-in users stay in the app instead of the marketing site. */}
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
                  {/* Wrapped so middle widths can hide the word by clipping; display:none would drop the link's accessible name. */}
                  <span className="nav-link-label" dir="auto">{l.label}</span>
                  {/* Each link carries its waiting count, visible from anywhere. */}
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

            {/* The rest of the menu, only on a phone: what the wide bar keeps elsewhere. */}
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

        {searches && <NavSearch />}

        <span className="nav-spacer" />

        <div className="nav-actions">
          {signedIn ? (
            <>
              <Purse />
              {/* Likes, comments, gifts, game invites and notices from Hevalo. */}
              {searches && <NotificationsBell />}
              <RailToggle />
            </>
          ) : (
            <>
              <LinkButton to="/login" variant="ghost" size="sm" className="nav-desktop-only">
                {t('nav.login')}
              </LinkButton>
              <LinkButton to="/register" variant="secondary" size="sm" className={joinOnPhone ? 'nav-register' : 'nav-desktop-only'}>
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
      {/* The page under an open menu steps back, and a press on it closes the menu. */}
      {open && <div className="nav-scrim" onClick={close} aria-hidden="true" />}
    </header>
  );
}

/**
 * The top of a phone's screen inside the app, as on the phone app (mobile/src/navigation/TopBar.tsx): the brand, or
 * the way back on an inner page, and one pill with search and the bell at the far end. The places are in the bottom bar,
 * and friends, the shop and Settings are in the profile's menu (profile/ProfileMenu.tsx). A visitor keeps
 * "Get started" here.
 */
function PhoneBar({ links }: { links: NavItem[] }): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const { pathname, search } = useLocation();
  const signedIn = status === 'signedIn';
  const glass = useGlass<HTMLDivElement>();
  return (
    <header className="nav nav-phone">
      <div className="container nav-inner">
        {isPlaceRoot(pathname, search) ? <Brand to={signedIn ? '/app' : '/'} /> : <BackButton links={links} />}
        {barHasSearch(pathname) && (
          <div ref={glass} className="nav-pill glass">
            <NavSearch />
            {/* Nothing for a visitor, whose pill is then search alone. */}
            <NotificationsBell />
          </div>
        )}
        {!signedIn && (
          <LinkButton to="/register" variant="secondary" size="sm" className="nav-register">
            {t('nav.register')}
          </LinkButton>
        )}
      </div>
    </header>
  );
}

/**
 * Your Zêr, linking to the shop. The number comes from the rail's poll; until it arrives, a grey bar of the same size
 * holds the place, since a zero that turns into 13,880 is worse than a moment of nothing.
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
    </Link>
  );
}

/** The purse on one line, at the end of the menu's Shop row on a phone. */
function PurseAmounts(): React.JSX.Element | null {
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
    </span>
  );
}
