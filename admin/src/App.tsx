import { useState, type ReactNode } from 'react';
import { AuthProvider, hasSession, useAuth } from './auth';
import { useHashRoute } from './nav';
import { ErrorBoundary } from './ErrorBoundary';
import { Login } from './pages/Login';
import { Shell, type NavItem } from './pages/Shell';
import { Moderation } from './pages/Moderation';
import { Config } from './pages/Config';
import { Analytics } from './pages/Analytics';
import { Tags } from './pages/Tags';
import { Users } from './pages/Users';
import { Economy } from './pages/Economy';
import { Antibot } from './pages/Antibot';
import { Fraud } from './pages/Fraud';
import { AiModeration } from './pages/AiModeration';
import { Content } from './pages/Content';
import { Experiments } from './pages/Experiments';
import { Events } from './pages/Events';
import { Ops } from './pages/Ops';
import { Audit } from './pages/Audit';
import { Security } from './pages/Security';
import { Games } from './pages/Games';
import { Shop } from './pages/Shop';

// `roles` gates the nav link (cosmetic only — the API re-authorizes every
// action). It's set for the three pages whose server guard is a single clean
// RBAC-role check (requireAdmin(totp, ...roles)); every other page uses the
// legacy `admin` role and is always shown.
type Page = NavItem & { render: () => ReactNode; roles?: string[] };

const PAGES: Page[] = [
  { key: 'moderation', label: 'Moderation', render: () => <Moderation /> },
  { key: 'antibot', label: 'Antibot', render: () => <Antibot /> },
  { key: 'aimod', label: 'AI Mod', render: () => <AiModeration /> },
  { key: 'users', label: 'Users', roles: ['superadmin', 'moderator', 'support'], render: () => <Users /> },
  { key: 'content', label: 'Content', roles: ['superadmin', 'content_editor'], render: () => <Content /> },
  { key: 'config', label: 'Config', render: () => <Config /> },
  { key: 'analytics', label: 'Analytics', render: () => <Analytics /> },
  { key: 'experiments', label: 'Experiments', render: () => <Experiments /> },
  { key: 'events', label: 'Events', render: () => <Events /> },
  { key: 'economy', label: 'Economy', render: () => <Economy /> },
  { key: 'ops', label: 'Ops', render: () => <Ops /> },
  { key: 'fraud', label: 'Fraud', render: () => <Fraud /> },
  { key: 'games', label: 'Games', roles: ['superadmin', 'content_editor'], render: () => <Games /> },
  { key: 'shop', label: 'Shop', roles: ['superadmin'], render: () => <Shop /> },
  { key: 'tags', label: 'Tags', render: () => <Tags /> },
  { key: 'audit', label: 'Audit', roles: ['superadmin'], render: () => <Audit /> },
  { key: 'security', label: 'Security', render: () => <Security /> },
];

function Workspace(): React.JSX.Element {
  const { me } = useAuth();
  const roles = me?.roles ?? [];
  // until roles are known (empty), show everything — never wrongly hide a link
  const known = roles.length > 0;
  const visible = PAGES.filter((p) => !p.roles || !known || roles.some((r) => p.roles!.includes(r)));

  const [page, navigate] = useHashRoute(visible[0]!.key);
  const [, setTick] = useState(0);
  // render the routed page even if its nav link is hidden — it enforces its own
  // access (a role-gated page shows its own "insufficient permissions" notice)
  const active = PAGES.find((p) => p.key === page) ?? visible[0]!;
  return (
    <Shell nav={visible} page={active.key} onNav={navigate} onLogout={() => setTick((t) => t + 1)}>
      <ErrorBoundary resetKey={active.key}>{active.render()}</ErrorBoundary>
    </Shell>
  );
}

export function App(): React.JSX.Element {
  const [, setTick] = useState(0);
  return (
    <AuthProvider>
      {hasSession() ? <Workspace /> : <Login onDone={() => setTick((t) => t + 1)} />}
    </AuthProvider>
  );
}
