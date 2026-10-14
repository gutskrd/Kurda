import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider, hasSession } from './auth';
import { useRoute } from './nav';
import { ErrorBoundary } from './ErrorBoundary';
import { isKnownPage, landingRoute, mayOpenPage, type Route } from './navigation';
import { useSession } from './session';
import { DialogProvider, EmptyState, ToastProvider } from './ui';
import { TwoFactorGate } from './pages/TwoFactorGate';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { Moderation } from './pages/Moderation';
import { Appeals } from './pages/Appeals';
import { BanApprovals } from './pages/BanApprovals';
import { Approvals } from './pages/Approvals';
import { Analytics } from './pages/Analytics';
import { Tags } from './pages/Tags';
import { Users } from './pages/Users';
import { Economy } from './pages/Economy';
import { Antibot } from './pages/Antibot';
import { Fraud } from './pages/Fraud';
import { AiModeration } from './pages/AiModeration';
import { Lessons } from './pages/Lessons';
import { Experiments } from './pages/Experiments';
import { Events } from './pages/Events';
import { GemRules } from './pages/GemRules';
import { System } from './pages/System';
import { Audit } from './pages/Audit';
import { Security } from './pages/Security';
import { Games } from './pages/Games';
import { AudioStudio } from './pages/AudioStudio';
import { Shop } from './pages/Shop';
import { Stories } from './pages/Stories';
import { Dashboard } from './pages/Dashboard';

/**
 * Each page by its key (navigation.ts has who may open it and where it sits
 * in the nav). A page gets the route, for the parts of the address below it:
 * #/users/<id>, #/moderation/<caseId>, #/audio/lessons?show=missing.
 */
const PAGES: Record<string, (route: Route) => ReactNode> = {
  dashboard: () => <Dashboard />,
  analytics: () => <Analytics />,
  audio: () => <AudioStudio />,
  users: () => <Users />,
  moderation: () => <Moderation />,
  appeals: () => <Appeals />,
  'ban-approvals': () => <BanApprovals />,
  aimod: () => <AiModeration />,
  antibot: () => <Antibot />,
  lessons: () => <Lessons />,
  stories: () => <Stories />,
  tags: () => <Tags />,
  events: () => <Events />,
  words: () => <Games section="words" />,
  wordle: () => <Games section="wordle" />,
  rhyme: () => <Games section="rhyme" />,
  race: () => <Games section="race" />,
  economy: () => <Economy />,
  shop: () => <Shop />,
  'gem-rules': () => <GemRules />,
  fraud: () => <Fraud />,
  approvals: () => <Approvals />,
  flags: () => <Experiments />,
  audit: () => <Audit />,
  security: () => <Security />,
  system: () => <System />,
};

function Workspace({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const session = useSession();
  const route = useRoute();
  const landing = landingRoute(session);

  // no address, or the bare #/: start on the first page this role can open
  useEffect(() => {
    if (!route.page) location.replace(`#/${landing}`);
  }, [route.page, landing]);

  let content: ReactNode;
  if (!route.page) content = null;
  else if (!isKnownPage(route.page) || !PAGES[route.page]) {
    content = (
      <EmptyState title="There is no page here" icon="search" action={<a href={`#/${landing}`}>Go to the start page</a>}>
        The address may be mistyped, or the page has moved. Every page is in the menu.
      </EmptyState>
    );
  } else if (!mayOpenPage(route.page, session)) {
    content = (
      <EmptyState title="Your role can’t open this page" icon="lock" action={<a href={`#/${landing}`}>Go to the start page</a>}>
        Your account is signed in, but this page is for other roles. Roles are given on the server, by whoever runs Hevalo.
      </EmptyState>
    );
  } else {
    content = PAGES[route.page]!(route);
  }

  return (
    <Shell route={route} onSignOut={onSignOut}>
      <ErrorBoundary resetKey={route.page}>{content}</ErrorBoundary>
    </Shell>
  );
}

export function App(): React.JSX.Element {
  const [, setTick] = useState(0);
  const refresh = (): void => setTick((t) => t + 1);
  return (
    <AuthProvider>
      <ToastProvider>
        <DialogProvider>
          {hasSession() ? (
            // the API refuses every /admin route without 2FA, so the workspace must
            // not render before this session has cleared it
            <TwoFactorGate>
              <Workspace onSignOut={refresh} />
            </TwoFactorGate>
          ) : (
            <Login onDone={refresh} />
          )}
        </DialogProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
