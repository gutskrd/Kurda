import { Outlet } from 'react-router-dom';
import { TopNav, type NavItem } from '../components/TopNav';
import { Footer } from '../components/Footer';

const LINKS: NavItem[] = [
  { label: 'Stories', to: '/stories' },
  { label: 'Poems', to: '/poems' },
  { label: 'Games', to: '/games' },
];

/** Public marketing shell: nav + page + footer. */
export function MarketingLayout(): React.JSX.Element {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopNav links={LINKS} />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
