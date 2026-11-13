import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';
import { PlayProvider } from '../play/PlayProvider';
import { InviteBanner } from '../play/InviteBanner';
import { useNavLinks } from './navLinks';
import { PageTop } from './usePageTop';
import { useT } from '../i18n/I18nProvider';
import { FeedbackHost } from '../feedback/FeedbackHost';

/**
 * The app shell. Content pages set their own container + header.
 *
 * One bar at every width (`TopNav`): the places, the search field and the
 * bell on a wide screen, folded into a menu on a phone — one list
 * (`useNavLinks`, shared with the landing page), so a place is in the same
 * position on every screen. The bar stays at the top while the page scrolls,
 * and on a wide screen the social column stays at the side.
 *
 * A guest is shown only what a guest can use. Offering links that bounce you to
 * a sign-in wall is worse than not offering them — it teaches you the app is
 * mostly closed, when in fact almost all of it is open to read.
 *
 * A page opened from another starts at its top, and Back returns to where the
 * reader was (`PageTop`, shared with the public pages' shell). The rail's
 * and the invites' providers here stand aside for the ones above the routes
 * (App.tsx); they are what the shell has when it is drawn alone.
 */
export function AppLayout(): React.JSX.Element {
  const t = useT();
  const links = useNavLinks();

  return (
    <RailProvider>
      {/* game invites to you, and your friends' answers to yours: read once for every screen */}
      <PlayProvider>
      {/* before the page, so the page's own place (a path opening on its current skill) is decided after it */}
      <PageTop />
      <a href="#main" className="skip-link">
        {t('nav.skipToContent')}
      </a>
      {/* a visitor keeps "Get started" in a phone's bar here, where most pages have no other way in */}
      <TopNav links={links} joinOnPhone />
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
      {/* "Rojda invited you to Peyvok Battle" — Join or Not now, wherever you are */}
      <InviteBanner />
      {/* web-race-rating: the one-time rating box after a first finished game */}
      <FeedbackHost />
      </PlayProvider>
    </RailProvider>
  );
}
