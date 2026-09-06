import { Outlet } from 'react-router-dom';
import { TopNav, type NavItem } from '../components/TopNav';
import { Footer } from '../components/Footer';

/**
 * One way in.
 *
 * This used to list Stories, Poems and Games as separate public pages. They are
 * not separate any more — Civak is one wall — and the app itself is now open to
 * read, so the landing page points at it rather than keeping a second, thinner
 * copy of the same content behind its own nav.
 */
const LINKS: NavItem[] = [{ label: 'Civak', to: '/app/civak' }];

/** The landing page's shell: nav + page + footer. */
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
