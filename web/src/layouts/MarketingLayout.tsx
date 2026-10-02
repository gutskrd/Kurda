import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { Footer } from '../components/Footer';
import { useNavLinks } from './navLinks';
import { useT } from '../i18n/I18nProvider';

/**
 * The landing page's shell: nav + page + footer.
 *
 * This used to list Stories, Poems and Games as separate public pages. They are
 * not separate any more — Civak is one wall — and the app itself is now open to
 * read, so the landing page points at it rather than keeping a second, thinner
 * copy of the same content behind its own nav.
 *
 * It then kept its own one-entry list for a while, which meant a first-time
 * visitor saw a single link labelled Civak and no sign that there was a
 * dictionary of 378,000 words behind it. The bar is the same bar as the app's
 * now — see `useNavLinks` — so what is open to read is visible from the door.
 */
export function MarketingLayout(): React.JSX.Element {
  const t = useT();
  const links = useNavLinks();
  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} />
      <main id="main">
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
