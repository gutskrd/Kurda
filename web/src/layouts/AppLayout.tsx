import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RouteFallback } from '../components/RouteFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { TopNav } from '../components/TopNav';
import { SocialRail } from '../social/SocialRail';
import { RailProvider } from '../social/RailProvider';
import { PlayProvider } from '../play/PlayProvider';
import { InviteBanner } from '../play/InviteBanner';
import { useNavLinks } from './navLinks';
import { PageTop } from './usePageTop';
import { PlacesBar } from './PlacesBar';
import { PHONE_CHROME, isPlaceRoot } from './roots';
import { useTrail } from './trail';
import { useT } from '../i18n/I18nProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { FeedbackHost } from '../feedback/FeedbackHost';

/**
 * The app shell; pages set their own container and header. One list of places (`useNavLinks`, shared with the landing
 * page) sits in the sticky top bar on wide screens, beside the social column. On a phone, place roots get the floating
 * `PlacesBar` and deeper pages a back button instead (`isPlaceRoot`); the choice is made here by width rather than by
 * hiding one in CSS, so the links are not read out twice. Guests see only what guests can use. `PageTop` handles
 * scrolling. The rail and invite providers here defer to those above the routes (App.tsx) and serve the shell alone.
 */
export function AppLayout(): React.JSX.Element {
  const t = useT();
  const links = useNavLinks();
  const { pathname, search } = useLocation();
  const phone = useMediaQuery(PHONE_CHROME);
  // each page drawn here is noted, so the way back knows what is behind the next one
  useTrail();

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
      <TopNav links={links} joinOnPhone placesBelow />
      <main id="main" className="app-main">
        {/* Lazy routes suspend inside `main`, so the bars stay put while only the page loads. */}
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* a phone's bar of places, after main as the sidebar is, so the page is reached before either */}
      {phone && isPlaceRoot(pathname, search) && <PlacesBar links={links} />}
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
