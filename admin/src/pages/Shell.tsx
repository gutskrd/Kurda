import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ModerationSummary } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { NAV_GROUPS, ROLE_NAME, activeEntry, href, searchNav, visibleNav, type NavEntry, type Route } from '../navigation';
import { useSession } from '../session';
import { Drawer, Icon } from '../ui';

/**
 * The admin's frame: the nav and the page (KUR-099).
 *
 * On a wide screen the nav is a sidebar; on a phone or a tablet it is a menu
 * button in a slim top bar that opens the same nav as a drawer. Either way the
 * nav is grouped (Overview · Record audio · People · Moderation · Content ·
 * Games · Economy · Settings), shows only what this login can open, and has a
 * box to find a page by name — there are two dozen of them.
 */
export function Shell({ route, children, onSignOut }: { route: Route; children: ReactNode; onSignOut: () => void }): React.JSX.Element {
  const session = useSession();
  const entries = useMemo(() => visibleNav(session), [session]);
  const active = activeEntry(route);
  const [menuOpen, setMenuOpen] = useState(false);
  const counts = useNavCounts(session.capabilities.includes('moderation.act'));
  const routeKey = `${route.page}/${route.rest.join('/')}`;

  // a new page: the menu closes, the tab says where you are, and a screen
  // reader starts at the new page's heading rather than where the click was
  const first = useRef(true);
  useEffect(() => {
    setMenuOpen(false);
    document.title = active ? `${active.label} · Hevalo Admin` : 'Hevalo Admin';
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById('page-title') ?? document.getElementById('main');
      target?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [routeKey, active]);

  const account = <Account onSignOut={onSignOut} />;

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // the address is the router's: move focus without touching it
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>

      <aside className="sidebar">
        <Brand />
        <NavPanel entries={entries} active={active} counts={counts} shortcut />
        {account}
      </aside>

      <header className="topbar">
        <button
          type="button"
          className="icon-button ghost"
          aria-label="Open the menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
        <span className="brand-mark" aria-hidden="true">
          H
        </span>
        <span className="topbar-title">{active?.label ?? 'Hevalo Admin'}</span>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="start" title={<Brand />} className="nav-drawer">
        <NavPanel entries={entries} active={active} counts={counts} onPick={() => setMenuOpen(false)} />
        {account}
      </Drawer>
    </div>
  );
}

function Brand(): React.JSX.Element {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        H
      </span>
      <span>
        Hevalo Admin
        <span className="brand-sub">Kurdish for everyone</span>
      </span>
    </span>
  );
}

interface NavCounts {
  /** open moderation cases, and whether any is urgent or overdue */
  moderation?: { open: number; urgent: boolean };
}

/**
 * The queue's size beside its link, so a waiting report is seen from every
 * page. Asked again every two minutes; a failure only means no number.
 */
function useNavCounts(moderator: boolean): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});
  useEffect(() => {
    if (!moderator) return;
    let alive = true;
    const load = (): void => {
      void api<ModerationSummary>('/admin/moderation/summary')
        .then((s) => {
          if (alive) setCounts({ moderation: { open: s.open, urgent: s.slaBreaches > 0 || s.byPriority[0] > 0 } });
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [moderator]);
  return counts;
}

function NavPanel({
  entries,
  active,
  counts,
  onPick,
  shortcut = false,
}: {
  entries: NavEntry[];
  active: NavEntry | undefined;
  counts: NavCounts;
  onPick?: () => void;
  /** "/" jumps to the search box — only for the sidebar, which is always on screen */
  shortcut?: boolean;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const shown = searchNav(entries, query);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const open = (entry: NavEntry): void => {
    location.hash = linkTo(entry).slice(1);
    setQuery('');
    onPick?.();
  };

  return (
    <nav className="nav" aria-label="Admin pages">
      <div className="nav-search" role="search">
        <Icon name="search" size={16} />
        <label htmlFor={`${id}-q`} className="sr-only">
          Find a page
        </label>
        <input
          ref={search}
          id={`${id}-q`}
          type="search"
          value={query}
          placeholder={shortcut ? 'Find a page  /' : 'Find a page'}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) {
              e.preventDefault();
              open(shown[0]);
            } else if (e.key === 'Escape' && query) {
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
      </div>
      <div className="nav-groups">
        {shown.length === 0 && <p className="nav-empty">No page is called that.</p>}
        {NAV_GROUPS.map((group) => {
          const items = shown.filter((n) => n.group === group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="nav-group">
              <h2 className="nav-group-label" id={`${id}-${group.key}`}>
                {group.label}
              </h2>
              <ul aria-labelledby={`${id}-${group.key}`}>
                {items.map((n) => (
                  <li key={n.id}>
                    <a className="navlink" href={linkTo(n)} aria-current={n.id === active?.id ? 'page' : undefined} onClick={() => onPick?.()}>
                      <Icon name={n.icon} />
                      <span className="navlink-label">{n.label}</span>
                      {n.id === 'moderation' && counts.moderation && counts.moderation.open > 0 && (
                        <span className={`nav-count${counts.moderation.urgent ? ' is-urgent' : ''}`}>
                          <span aria-hidden="true">{counts.moderation.open}</span>
                          <span className="sr-only">, {counts.moderation.open} open{counts.moderation.urgent ? ', urgent' : ''}</span>
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function linkTo(entry: NavEntry): string {
  return entry.sub ? href(entry.page, entry.sub) : href(entry.page);
}

function Account({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const { me, logout } = useAuth();
  const session = useSession();
  const roles = (session.staffRoles.length ? session.staffRoles : session.roles).map((r) => ROLE_NAME[r] ?? r);
  return (
    <div className="account">
      <div className="account-who">
        <div className="account-name">{me ? `@${me.username}` : 'Signed in'}</div>
        <div className="account-role">{roles.join(' · ') || 'Staff'}</div>
      </div>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          logout();
          onSignOut();
        }}
      >
        <Icon name="logout" />
        Sign out
      </button>
    </div>
  );
}
