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
 * The public pages' shell (front page, About, FAQ, Privacy, Terms, not found): the app's own bar (`useNavLinks`), the
 * page and the footer, so moving between them and the app keeps every button in place.
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
      {/* Signed in, the social strip sits at the side as in the app, and the page leaves the same room for it. */}
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
