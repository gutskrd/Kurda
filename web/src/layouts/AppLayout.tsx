import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { useAuth } from '../auth/AuthProvider';
import { TopNav, type NavItem } from '../components/TopNav';
import { BookIcon, ChatsIcon, GameIcon, TrophyIcon, UsersIcon, WallIcon } from '../components/icons';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';
import { useT } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/en';

/**
 * A nav entry before it has words.
 *
 * The label is a key, resolved at render time rather than stored: these arrays
 * are built once when the module loads, so a label baked in here would keep the
 * language the app happened to start in even after somebody changed it.
 */
interface NavEntry {
  key: MessageKey;
  to: string;
  icon: React.ReactNode;
}

/**
 * What anyone can reach, signed in or not.
 *
 * One entry for the wall, not two. Home and Civak were separate links to the
 * same room: Home was a page of tiles, one of which said "Civak", above a
 * preview of Civak. The wall is the front page now, so this is the front page.
 */
const OPEN_LINKS: NavEntry[] = [
  { key: 'nav.civak', to: '/app', icon: <WallIcon size={18} /> },
  { key: 'nav.games', to: '/app/games', icon: <GameIcon size={18} /> },
  { key: 'nav.rankings', to: '/app/rankings', icon: <TrophyIcon size={18} /> },
];

/** What only an account can. */
const MEMBER_LINKS: NavEntry[] = [
  { key: 'nav.learn', to: '/app/learn', icon: <BookIcon size={18} /> },
  { key: 'nav.friends', to: '/app/friends', icon: <UsersIcon size={18} /> },
  { key: 'nav.messages', to: '/app/messages', icon: <ChatsIcon size={18} /> },
];

/**
 * The app shell. Content pages set their own container + header.
 *
 * A guest is shown only what a guest can use. Offering links that bounce you to
 * a sign-in wall is worse than not offering them — it teaches you the app is
 * mostly closed, when in fact almost all of it is open to read.
 */
export function AppLayout(): React.JSX.Element {
  const { status } = useAuth();
  const t = useT();
  const entries = status === 'signedIn' ? [...OPEN_LINKS, ...MEMBER_LINKS] : OPEN_LINKS;
  const links: NavItem[] = entries.map((e) => ({ label: t(e.key), to: e.to, icon: e.icon }));

  return (
    <RailProvider>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} />
      <main id="main" className="app-main">
        {/*
         * The page waits here, and nothing else does.
         *
         * Routes are loaded on demand, so React needs a boundary to hold the
         * gap. Above the route table it would take the navigation down with
         * the page and put it back a moment later, which reads as the whole
         * app blinking on a first visit to a screen. Inside `main`, the bars
         * stay where they are and only the page is missing — which is the
         * truth of what is happening.
         */}
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      {/* after main, so a screen reader reaches the page before the sidebar */}
      <SocialRail />
    </RailProvider>
  );
}
