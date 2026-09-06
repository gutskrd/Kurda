import { Outlet } from 'react-router-dom';
import { TopNav, type NavItem } from '../components/TopNav';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';

const LINKS: NavItem[] = [
  { label: 'Home', to: '/app' },
  { label: 'Learn', to: '/app/learn' },
  // one wall replaces the three pages that were the same page three times
  { label: 'Civak', to: '/app/civak' },
  { label: 'Games', to: '/app/games' },
  { label: 'Rankings', to: '/app/rankings' },
  { label: 'Friends', to: '/app/friends' },
  { label: 'Messages', to: '/app/messages' },
  { label: 'Shop', to: '/app/shop' },
];

/** Signed-in app shell. Content pages set their own container + header. */
export function AppLayout(): React.JSX.Element {
  return (
    <RailProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopNav links={LINKS} />
      <main id="main" className="app-main">
        <Outlet />
      </main>
      {/* after main, so a screen reader reaches the page before the sidebar */}
      <SocialRail />
    </RailProvider>
  );
}
