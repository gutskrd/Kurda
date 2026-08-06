import { useState, type ReactNode } from 'react';
import { AuthProvider, hasSession } from './auth';
import { useHashRoute } from './nav';
import { Login } from './pages/Login';
import { Shell, type NavItem } from './pages/Shell';
import { Moderation } from './pages/Moderation';
import { Config } from './pages/Config';
import { Analytics } from './pages/Analytics';
import { Tags } from './pages/Tags';
import { Users } from './pages/Users';
import { Audit } from './pages/Audit';
import { Security } from './pages/Security';

const PAGES: Array<NavItem & { render: () => ReactNode }> = [
  { key: 'moderation', label: 'Moderation', render: () => <Moderation /> },
  { key: 'users', label: 'Users', render: () => <Users /> },
  { key: 'config', label: 'Config', render: () => <Config /> },
  { key: 'analytics', label: 'Analytics', render: () => <Analytics /> },
  { key: 'tags', label: 'Tags', render: () => <Tags /> },
  { key: 'audit', label: 'Audit', render: () => <Audit /> },
  { key: 'security', label: 'Security', render: () => <Security /> },
];

function Workspace(): React.JSX.Element {
  const [page, navigate] = useHashRoute(PAGES[0]!.key);
  const [, setTick] = useState(0);
  const active = PAGES.find((p) => p.key === page) ?? PAGES[0]!;
  return (
    <Shell nav={PAGES} page={active.key} onNav={navigate} onLogout={() => setTick((t) => t + 1)}>
      {active.render()}
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
