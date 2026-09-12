import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { TopNav, type NavItem } from '../components/TopNav';
import { Footer } from '../components/Footer';
import { useT } from '../i18n/I18nProvider';

/**
 * One way in.
 *
 * This used to list Stories, Poems and Games as separate public pages. They are
 * not separate any more — Civak is one wall — and the app itself is now open to
 * read, so the landing page points at it rather than keeping a second, thinner
 * copy of the same content behind its own nav.
 */
/** The landing page's shell: nav + page + footer. */
export function MarketingLayout(): React.JSX.Element {
  const t = useT();
  // built here rather than at module scope: the label is a word, and a word
  // chosen once at import time cannot follow the language the reader picks
  const links: NavItem[] = [{ label: t('nav.civak'), to: '/app/civak' }];
  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} />
      <main id="main">
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
