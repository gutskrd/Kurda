import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { Footer } from '../components/Footer';
import { useAuth } from '../auth/AuthProvider';
import { RailProvider } from '../social/RailProvider';
import { SocialRail } from '../social/SocialRail';
import { useNavLinks } from './navLinks';
import { PageTop } from './usePageTop';
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

  return (
    <RailProvider>
      {/* a new page starts at its top, a section link lands on its section, and Back keeps the browser's place */}
      <PageTop />
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
