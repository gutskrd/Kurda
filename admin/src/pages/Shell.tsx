import type { ReactNode } from 'react';
import { useAuth } from '../auth';

export interface NavItem {
  key: string;
  label: string;
}

/** Admin app shell: sidebar nav + the active page (KUR-099). */
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
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Kurda Admin 🌿</div>
        {nav.map((n) => (
          <a
            key={n.key}
            href={`#/${n.key}`}
            className={`navlink${page === n.key ? ' active' : ''}`}
            onClick={() => onNav(n.key)}
          >
            {n.label}
          </a>
        ))}
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
