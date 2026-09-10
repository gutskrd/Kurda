import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { TopNav, type NavItem } from '../components/TopNav';
import { BookIcon, ChatsIcon, GameIcon, TrophyIcon, UsersIcon, WallIcon } from '../components/icons';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';

/**
 * What anyone can reach, signed in or not.
 *
 * One entry for the wall, not two. Home and Civak were separate links to the
 * same room: Home was a page of tiles, one of which said "Civak", above a
 * preview of Civak. The wall is the front page now, so this is the front page.
 */
const OPEN_LINKS: NavItem[] = [
  { label: 'Civak', to: '/app', icon: <WallIcon size={18} /> },
  { label: 'Games', to: '/app/games', icon: <GameIcon size={18} /> },
  { label: 'Rankings', to: '/app/rankings', icon: <TrophyIcon size={18} /> },
];

/** What only an account can. */
const MEMBER_LINKS: NavItem[] = [
  { label: 'Learn', to: '/app/learn', icon: <BookIcon size={18} /> },
  { label: 'Friends', to: '/app/friends', icon: <UsersIcon size={18} /> },
  { label: 'Messages', to: '/app/messages', icon: <ChatsIcon size={18} /> },
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
  const links = status === 'signedIn' ? [...OPEN_LINKS, ...MEMBER_LINKS] : OPEN_LINKS;

  return (
    <RailProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopNav links={links} />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      {/* after main, so a screen reader reaches the page before the sidebar */}
      <SocialRail />
    </RailProvider>
  );
}
