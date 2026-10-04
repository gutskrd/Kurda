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
import { useLocale, useT } from '../i18n/I18nProvider';
import type { AppLocale } from '@kurda/shared';
import type { NavItem } from '../components/TopNav';

/**
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
 *
 * The published pages exist in two languages, at sibling paths, so a
 * reader is sent to their own rather than into an all-Kurmancî page.
 * Kurmancî for somebody who chose Kurmancî, English for everyone
 * else — the same rule `emailLocaleFor` uses on the API, and for the
 * same reason: English is what every other locale falls back to.
 */
export function dictionaryLink(signedIn: boolean, locale: AppLocale, label: string, icon?: React.ReactNode): NavItem {
  return signedIn
    ? { label, to: '/app/dictionary', icon }
    : { label, to: publishedDictionary(locale), icon, external: true };
}

/** Where the published dictionary is, in this reader's language. */
export function publishedDictionary(locale: AppLocale): string {
  return locale === 'ku' ? '/ferheng/' : '/dictionary/';
}

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
  const locale = useLocale();
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
    // which dictionary depends on whether there is an account — see `dictionaryLink`
    dictionaryLink(signedIn, locale, t('nav.dictionary'), <DictionaryIcon size={18} />),
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

/**
 * The front door's bar: what Hevalo is, rather than where in the app to go.
 *
 * The landing page, About, Privacy and Terms used to carry the app's own bar,
 * glyph by glyph, which told a first-time visitor where the rooms were before
 * telling them what the building was. These are the words somebody deciding
 * whether to try Hevalo is looking for: how you learn, what you play, who else
 * is here, the dictionary they can use today, and who is behind it.
 *
 * Words only, no glyphs. The dictionary is still here, for the reason it was
 * put in everyone's bar in the first place — it is the biggest thing open to
 * read without an account — and it goes to the same place `useNavLinks` sends
 * it. Learn points at the lessons section of the front page itself, because
 * the lessons are not in the browser yet and that section says so.
 */
export function useMarketingLinks(): NavItem[] {
  const { status } = useAuth();
  const t = useT();
  const locale = useLocale();
  return [
    { label: t('nav.learn'), to: '/#learn', section: true },
    { label: t('nav.games'), to: '/app/games' },
    { label: t('nav.community'), to: '/app' },
    dictionaryLink(status === 'signedIn', locale, t('nav.dictionary')),
    { label: t('nav.about'), to: '/about' },
  ];
}
