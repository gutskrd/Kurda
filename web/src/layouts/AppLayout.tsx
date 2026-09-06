import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { TopNav, type NavItem } from '../components/TopNav';
import { BookIcon, ChatsIcon, GameIcon, HomeIcon, TrophyIcon, UsersIcon, WallIcon } from '../components/icons';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';

/** What anyone can reach, signed in or not. */
const OPEN_LINKS: NavItem[] = [
  { label: 'Home', to: '/app', icon: <HomeIcon size={18} /> },
  // one wall replaces the three pages that were the same page three times
  { label: 'Civak', to: '/app/civak', icon: <WallIcon size={18} /> },
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
