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
 * The app shell. Content pages set their own container + header.
 *
 * One list of places (`useNavLinks`, shared with the landing page), so a
 * place is in the same position on every screen. On a wide screen they are
 * in the top bar (`TopNav`) with the search field and the bell; the bar stays
 * at the top while the page scrolls, and the social column stays at the side.
 *
 * On a phone the shell wears the phone app's chrome. The places are a bar
 * floating over the bottom of the window (`PlacesBar`), on the root of each
 * place and nowhere else: a page you went into has the way back at its top
 * and its bottom edge to itself (`isPlaceRoot`). Which of the two is drawn is
 * decided here, by the window's width, and not left to the styles to hide
 * one: two lists of the same links in the page would be read out twice.
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
