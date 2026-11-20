import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ModerationSummary, PictureCaseList } from '@kurda/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { NAV_GROUPS, ROLE_NAME, activeEntry, href, searchNav, visibleNav, type NavEntry, type Route } from '../navigation';
import { useSession } from '../session';
import { Drawer, Icon } from '../ui';
import { HevaloMark } from '../brand/HevaloMark';

/**
 * The console's frame: the nav and the page. The nav is a sidebar on a wide screen and a drawer behind a top bar's
 * menu button on a phone or tablet; either way it is grouped, shows only what this login can open, and has a box to
 * find a page by name.
 */
export function Shell({ route, children, onSignOut }: { route: Route; children: ReactNode; onSignOut: () => void }): React.JSX.Element {
  const session = useSession();
  const entries = useMemo(() => visibleNav(session), [session]);
  const active = activeEntry(route);
  const title = active ? (active.title ?? active.label) : 'Hevalo Admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const counts = useNavCounts(session.capabilities.includes('moderation.act'));
  const routeKey = `${route.page}/${route.rest.join('/')}`;

  // A new page: the menu closes, the tab says where you are, and a screen
  // reader starts at the new page's heading rather than where the click was.
  const first = useRef(true);
  useEffect(() => {
    setMenuOpen(false);
    document.title = active ? `${title} · Hevalo Admin` : 'Hevalo Admin';
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
  }, [routeKey, active, title]);

  const account = <Account onSignOut={onSignOut} />;

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // The address is the router's: move focus without touching it.
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
          title="Open the menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? 'nav-drawer' : undefined}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
        <HevaloMark size={30} className="brand-mark" />
        <span className="topbar-title">{title}</span>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>

      <Drawer id="nav-drawer" open={menuOpen} onClose={() => setMenuOpen(false)} side="start" title={<Brand />} className="nav-drawer">
        <NavPanel entries={entries} active={active} counts={counts} onPick={() => setMenuOpen(false)} />
        {account}
      </Drawer>
    </div>
  );
}

function Brand(): React.JSX.Element {
  return (
    <span className="brand">
      <HevaloMark size={30} className="brand-mark" />
      <span>
        Hevalo Admin
        <span className="brand-sub">Kurdish for everyone</span>
      </span>
    </span>
  );
}

interface NavCount {
  count: number;
  urgent: boolean;
  /** What the number counts, for a screen reader: "open", "waiting". */
  what: string;
}

/** The numbers beside nav links, by the link's id: open cases, pictures waiting for a person. */
type NavCounts = Partial<Record<'moderation' | 'picture-checks', NavCount>>;

/**
 * The queue's size beside its link, and the pictures waiting beside theirs, so a waiting report or a held picture is
 * seen from every page. Asked again every two minutes; a failure only means no number.
 */
function useNavCounts(moderator: boolean): NavCounts {
  const [counts, setCounts] = useState<NavCounts>({});
  useEffect(() => {
    if (!moderator) return;
    let alive = true;
    const set = (key: keyof NavCounts, value: NavCount): void => {
      if (alive) setCounts((c) => ({ ...c, [key]: value }));
    };
    const load = (): void => {
      void api<ModerationSummary>('/admin/moderation/summary')
        .then((s) => set('moderation', { count: s.open, urgent: s.slaBreaches > 0 || s.byPriority[0] > 0, what: 'open' }))
        .catch(() => undefined);
      // A child-safety hit among them makes the number urgent, as an urgent case does the queue's.
      void api<PictureCaseList>('/admin/pictures?view=waiting')
        .then((p) => set('picture-checks', { count: p.counts.waiting, urgent: p.items.some((i) => i.sensitive), what: 'waiting' }))
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
  /** "/" jumps to the search box — only for the sidebar, which is always on screen. */
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
                      <NavCountBadge count={counts[n.id as keyof NavCounts]} />
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

function NavCountBadge({ count }: { count: NavCount | undefined }): React.JSX.Element | null {
  if (!count || count.count <= 0) return null;
  return (
    <span className={`nav-count${count.urgent ? ' is-urgent' : ''}`}>
      <span aria-hidden="true">{count.count}</span>
      <span className="sr-only">
        , {count.count} {count.what}
        {count.urgent ? ', urgent' : ''}
      </span>
    </span>
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
