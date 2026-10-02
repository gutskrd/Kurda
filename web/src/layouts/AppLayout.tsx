import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';
import { useNavLinks } from './navLinks';
import { useT } from '../i18n/I18nProvider';

/**
 * The app shell. Content pages set their own container + header.
 *
 * A guest is shown only what a guest can use. Offering links that bounce you to
 * a sign-in wall is worse than not offering them — it teaches you the app is
 * mostly closed, when in fact almost all of it is open to read. The dictionary
 * is the case that proves it: a guest gets the published pages at /ferheng/
 * rather than the gated screen, so the link works for them.
 *
 * The list itself lives in `useNavLinks`, shared with the landing page.
 */
export function AppLayout(): React.JSX.Element {
  const t = useT();
  const links = useNavLinks();

  return (
    <RailProvider>
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      <TopNav links={links} />
      <main id="main" className="app-main">
        {/*
         * The page waits here, and nothing else does.
         *
         * Routes are loaded on demand, so React needs a boundary to hold the
         * gap. Above the route table it would take the navigation down with
         * the page and put it back a moment later, which reads as the whole
         * app blinking on a first visit to a screen. Inside `main`, the bars
         * stay where they are and only the page is missing — which is the
         * truth of what is happening.
         */}
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* after main, so a screen reader reaches the page before the sidebar */}
      <SocialRail />
    </RailProvider>
  );
}
