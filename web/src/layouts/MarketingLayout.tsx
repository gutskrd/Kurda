import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { Footer } from '../components/Footer';
import { useAuth } from '../auth/AuthProvider';
import { RailProvider } from '../social/RailProvider';
import { SocialRail } from '../social/SocialRail';
import { useNavLinks } from './navLinks';
import { useT } from '../i18n/I18nProvider';

/**
 * The public pages' shell: nav + page + footer.
 *
 * The front page, About, the FAQ, Privacy and Terms, and the not-found page.
 * The bar is the app's own — the same links in the same places, and for
 * somebody signed in the same purse, face and social column — so moving from
 * here into the app and back does not rearrange the buttons under the cursor.
 * See `useNavLinks`.
 */
export function MarketingLayout(): React.JSX.Element {
  const t = useT();
  const links = useNavLinks();
  const { status } = useAuth();
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
    <RailProvider>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} />
      {/* signed in, the social strip is on the right here as it is in the app, and the page makes the same room for it */}
      <main id="main" className={`site-main${status === 'signedIn' ? ' has-rail' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <SocialRail />
    </RailProvider>
  );
}
