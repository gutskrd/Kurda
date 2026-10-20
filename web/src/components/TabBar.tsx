import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useT } from '../i18n/I18nProvider';
import { UserIcon } from './icons';
import type { NavItem } from './TopNav';

/** A count as a badge shows it: the number up to nine, then "9+". */
export function countLabel(n: number): string {
  return n > 9 ? '9+' : String(n);
}

/**
 * Whether the page on screen is a task that wants the whole screen.
 *
 * A conversation, a lesson, a review and a game in progress each have their
 * own way out (a back arrow, an exit button) and every pixel of a phone in
 * them is the task's: a keyboard and a composer, a word to listen to, a
 * board. The bar comes back the moment you leave.
 */
export function isFullScreenTask(pathname: string, search: string): boolean {
  if (pathname.startsWith('/app/messages')) {
    const q = new URLSearchParams(search);
    return q.has('to') || q.has('group');
  }
  if (/^\/app\/learn\/(lesson|review|next)(\/|$)/.test(pathname)) return true;
  // a game being played; the Stories shelf and a story being read are pages to browse
  return /^\/app\/games\/(wordle|rhyme|race|wordle-battle|rhyme-match|stories\/play)(\/|$)/.test(pathname);
}

/**
 * The tab bar along the bottom of a phone: the five places, always in reach
 * of a thumb.
 *
 * A floating island rather than a strip welded to the edge, so it reads as
 * something laid over the page rather than a part of it. Each
 * place keeps its word under its icon — somebody new reads labels, not icons —
 * and the place you are on sits on a soft pill at full strength while the rest
 * step back. The pill slides between places rather than jumping, which is the
 * one animation here and goes entirely when reduced motion is asked for.
 *
 * Pressing the place you are already on takes you back to the top of it, the
 * way it does everywhere else a tab bar exists.
 *
 * Only below 769px (CSS). Wider, the same places are the top bar's links.
 */
export function TabBar({ links }: { links: NavItem[] }): React.JSX.Element | null {
  const t = useT();
  const { status } = useAuth();
  const { pathname, search } = useLocation();
  const hidden = isFullScreenTask(pathname, search);

  /*
   * The page leaves room at its bottom only while the bar is there, so a
   * conversation or a lesson gets the full height back. A class on <body>
   * rather than a spacer element, because the bottom-anchored things that are
   * not the page — the toasts, the rating box — need to rise above it too.
   */
  useEffect(() => {
    if (hidden) return;
    document.body.classList.add('has-tabbar');
    return () => document.body.classList.remove('has-tabbar');
  }, [hidden]);

  if (hidden) return null;

  /*
   * A visitor without an account gets Home, Learn and Search, and a way to
   * sign in where Profile will be once there is somebody to show — the same
   * slot, so nothing moves under a thumb when they join.
   */
  const tabs: NavItem[] =
    status === 'signedIn'
      ? links
      : [...links, { key: 'login', label: t('nav.login'), to: '/login', icon: <UserIcon size={22} />, owns: (p) => p === '/login' }];

  const active = tabs.findIndex((tab) => tab.owns?.(pathname));

  return (
    <nav className="tabbar" aria-label={t('nav.tabs')}>
      {/* the soft pill behind the place you are on is the list's ::before; it
          slides between places, it does not jump */}
      <ul
        className={`tabbar-list${active >= 0 ? ' has-active' : ''}`}
        style={{ '--tab-count': tabs.length, '--tab-index': Math.max(active, 0) } as React.CSSProperties}
      >
        {tabs.map((tab, i) => {
          const on = i === active;
          const badge = tab.badge ?? 0;
          const name =
            badge > 0
              ? t('nav.tabUnread', { place: tab.label, count: badge })
              : tab.dot
                ? t('nav.tabWaiting', { place: tab.label })
                : tab.label;
          return (
            <li key={tab.key ?? tab.to} className="tabbar-item">
              <Link
                to={tab.to}
                className={`tabbar-tab${on ? ' is-active' : ''}`}
                aria-current={on ? 'page' : undefined}
                aria-label={name}
                onClick={(e) => {
                  // already here: back to the top, rather than reloading the same screen
                  if (on && pathname === new URL(tab.to, 'http://x').pathname) {
                    e.preventDefault();
                    const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' });
                  }
                }}
              >
                <span className="tabbar-icon" aria-hidden="true">
                  {on && tab.activeIcon ? tab.activeIcon : tab.icon}
                  {badge > 0 ? (
                    <span className="tabbar-badge">{countLabel(badge)}</span>
                  ) : (
                    tab.dot && <span className="tabbar-dot" />
                  )}
                </span>
                <span className="tabbar-label" dir="auto" aria-hidden="true">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
