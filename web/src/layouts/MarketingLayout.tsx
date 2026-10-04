import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { Footer } from '../components/Footer';
import { useMarketingLinks } from './navLinks';
import { useT } from '../i18n/I18nProvider';

/**
 * The public pages' shell: nav + page + footer.
 *
 * The front page, About, Privacy and Terms, and the not-found page. Its bar is
 * the front door's — what Hevalo is, in words — rather than the app's bar of
 * places; see `useMarketingLinks`. The dictionary is on both, so what is open
 * to read without an account is still visible from the door.
 */
export function MarketingLayout(): React.JSX.Element {
  const t = useT();
  const links = useMarketingLinks();
  const { pathname, hash } = useLocation();
  const navigation = useNavigationType();

  /*
   * A router does not scroll. Going to /about from halfway down the front page
   * left you halfway down About; following /#learn from About left you at the
   * top of the front page with the lessons nowhere in sight. A section link
   * lands on its section, and a new page starts at the top.
   *
   * Only a new page, though: Back and Forward (`POP`) are the browser's to
   * restore, and it puts you back where you were. The jump to the top is
   * instant because the site scrolls smoothly, and a page that glides up from
   * where the last one left off reads as the old page moving, not a new one.
   */
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    if (navigation !== 'POP') window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash, navigation]);

  return (
    <>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} variant="marketing" />
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
