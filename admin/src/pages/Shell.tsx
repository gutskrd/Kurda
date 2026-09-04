import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';

export interface NavItem {
  key: string;
  label: string;
}

/**
 * Admin app shell: sidebar nav + the active page (KUR-099).
 *
 * On a phone the sidebar collapses to a single bar with a Menu button: there are
 * too many sections to wrap into a readable row, so they open as a dropdown and
 * the panel closes as soon as one is chosen.
 */
export function Shell({
  nav,
  page,
  onNav,
  onLogout,
  children,
}: {
  nav: NavItem[];
  page: string;
  onNav: (key: string) => void;
  onLogout: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const { me, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const current = nav.find((n) => n.key === page);

  // Escape closes the section list, as it does for any menu. Bound only while
  // open so the admin's other keyboard handling is untouched the rest of the time.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Following a link the panel is already showing leaves it open otherwise —
  // the click handler misses hash changes from the back button or a bookmark.
  useEffect(() => setOpen(false), [page]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">MyKurda Admin</div>

        {/* mobile only — shows where you are, and opens the section list */}
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{current?.label ?? 'Menu'}</span>
          <span aria-hidden>{open ? '▲' : '▼'}</span>
        </button>

        {/* tap-anywhere-off to dismiss; hidden from assistive tech since
            Escape and the toggle already close the panel */}
        {open && <button type="button" className="nav-scrim" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />}

        <nav id="admin-nav" className={`navlinks${open ? ' open' : ''}`} aria-label="Sections">
          {nav.map((n) => (
            <a
              key={n.key}
              href={`#/${n.key}`}
              className={`navlink${page === n.key ? ' active' : ''}`}
              onClick={() => {
                onNav(n.key);
                setOpen(false);
              }}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="spacer" />
        {me && (
          <div className="subtle" style={{ padding: '0 10px 8px' }}>
            @{me.username}
          </div>
        )}
        <button
          onClick={() => {
            logout();
            onLogout();
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
