import { Outlet } from 'react-router-dom';
import { TopNav, type NavItem } from '../components/TopNav';

const LINKS: NavItem[] = [
  { label: 'Home', to: '/app' },
  { label: 'Learn', to: '/app/learn' },
  { label: 'Stories', to: '/app/stories' },
  { label: 'Poems', to: '/app/poems' },
  { label: 'Dîmen', to: '/app/dimen' },
  { label: 'Games', to: '/app/games' },
  { label: 'Rankings', to: '/app/rankings' },
  { label: 'Friends', to: '/app/friends' },
  { label: 'Messages', to: '/app/messages' },
  { label: 'Shop', to: '/app/shop' },
];

/** Signed-in app shell. Content pages set their own container + header. */
export function AppLayout(): React.JSX.Element {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopNav links={LINKS} />
      <main id="main" className="app-main">
        <Outlet />
      </main>
    </>
  );
}
