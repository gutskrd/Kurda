import { useAuth } from '../auth/AuthProvider';
import {
  BookIcon,
  ChatsIcon,
  DictionaryIcon,
  GameIcon,
  HomeIcon,
  TrophyIcon,
  UsersIcon,
} from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import type { NavItem } from '../components/TopNav';

/**
 * One definition of where you can go, used by both shells.
 *
 * The landing page and the app used to keep separate lists, and the landing
 * page's held a single entry — Civak. So somebody arriving at hevalo.app was
 * shown one link into a product with a dictionary, games and rankings in it,
 * all of them open to read without an account. The bar was advertising a
 * fraction of what was there.
 *
 * Built inside a hook rather than at module scope because every label is a
 * word: a list made once at import time keeps whatever language the app
 * happened to start in, and cannot follow the reader when they change it.
 */
export function useNavLinks(): NavItem[] {
  const { status } = useAuth();
  const t = useT();
  const signedIn = status === 'signedIn';

  return [
    /*
     * Home, with a house on it — the same name and the same glyph the phone's
     * first tab has.
     *
     * It said Civak here and Home there, for one screen. mobile/src/navigation/
     * tabs.ts settled that already: "Civak is Home. Same screen, a house on it,
     * because it is the first thing you land on and that is what a house
     * means." A newspaper is what the wall is; a house is where you are.
     */
    { label: t('nav.home'), to: '/app', icon: <HomeIcon size={18} /> },
    /*
     * The dictionary everyone gets — but not the same dictionary.
     *
     * A reader with an account gets the one inside the app, which searches and
     * is backed by the API. A reader without one gets /ferheng/, the published
     * static pages: every word, no account, and no request that reaches a
     * server anybody pays for. Pointing a guest at /app/dictionary would put
     * them straight into a sign-in wall, which teaches them the app is closed
     * when almost all of it is open.
     *
     * `external` matters here. /ferheng/ is a real file on the edge and not a
     * route in this app, so a client-side navigation to it would hand the SPA
     * a path it has no route for and render a 404 over a page that exists.
     */
    signedIn
      ? { label: t('nav.dictionary'), to: '/app/dictionary', icon: <DictionaryIcon size={18} /> }
      : { label: t('nav.dictionary'), to: '/ferheng/', icon: <DictionaryIcon size={18} />, external: true },
    { label: t('nav.games'), to: '/app/games', icon: <GameIcon size={18} /> },
    { label: t('nav.rankings'), to: '/app/rankings', icon: <TrophyIcon size={18} /> },
    ...(signedIn
      ? [
          { label: t('nav.learn'), to: '/app/learn', icon: <BookIcon size={18} /> },
          { label: t('nav.friends'), to: '/app/friends', icon: <UsersIcon size={18} /> },
          { label: t('nav.messages'), to: '/app/messages', icon: <ChatsIcon size={18} /> },
        ]
      : []),
  ];
}
