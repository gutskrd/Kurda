import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../chat/MessagesProvider';
import { Avatar } from '../components/Avatar';
import { LevelRing } from '../profile/LevelRing';
import { BookIcon, HomeIcon, SendIcon, UserIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { learnPath } from '../learn/learnView';
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
    ? { key: 'dictionary', label, to: '/app/dictionary', icon }
    : { key: 'dictionary', label, to: publishedDictionary(locale), icon, external: true };
}

/** Where the published dictionary is, in this reader's language. */
export function publishedDictionary(locale: AppLocale): string {
  return locale === 'ku' ? '/ferheng/' : '/dictionary/';
}

/** `/app/x` and everything under it, but not `/app/xyz`. */
const under = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

/**
 * Which place a page belongs to, so the place stays lit on the pages inside
 * it.
 *
 * Written out rather than derived from the links: the Games view is part of
 * Learn although its address is /app/games, Rankings is reached from it, and
 * Settings and the Shop live behind your profile. None of that is visible in
 * a URL prefix.
 *
 * Search has no entry: it is the field in the bar, which is there on every
 * page, so there is nothing to light.
 */
export const OWNS: Record<'home' | 'learn' | 'messages' | 'profile', (pathname: string) => boolean> = {
  home: (p) => p === '/app' || p === '/app/' || under(p, '/app/library') || under(p, '/app/dimen') || under(p, '/app/civak'),
  learn: (p) =>
    ['/app/learn', '/app/games', '/app/alphabet', '/app/dictionary', '/app/rankings', '/app/leagues', '/app/season', '/app/ranks'].some(
      (base) => under(p, base),
    ),
  messages: (p) => under(p, '/app/messages') || under(p, '/app/friends'),
  profile: (p) =>
    ['/app/profile', '/app/settings', '/app/shop', '/app/saved', '/app/badges'].some((base) => under(p, base)),
};

/**
 * The places, in a fixed order: Home, Learn, Messages, Profile. The fifth,
 * Search, is the field in the bar beside them (search/NavSearch.tsx), so it is
 * not a link here.
 *
 * One list for every bar — the app's and the front page's, and on a phone the
 * menu the bar folds into — so a place is in the same position wherever you
 * meet it, and nothing moves under the cursor between pages. Dictionary,
 * Rankings, the Shop and Settings are not lost by leaving the bar: they are
 * inside the place they belong to (the tools in Learn, Rankings at the top of
 * its Games view, the rest in your profile's menu).
 *
 * A guest gets the two places a guest can use. Messages are people you know
 * and a profile is you; without an account there is neither, and a link that
 * only leads to "make an account" teaches a visitor the app is closed when
 * almost all of it is open. The bar offers Log in and Get started instead.
 *
 * Built inside a hook rather than at module scope because every label is a
 * word: a list made once at import time keeps whatever language the app
 * happened to start in, and cannot follow the reader when they change it.
 */
export function useNavLinks(): NavItem[] {
  const { status, user } = useAuth();
  const t = useT();
  const { unreadTotal } = useMessages();
  const { data } = useRail();
  // read on every render: the nav re-renders on each navigation, which is
  // exactly when the remembered Learn view may have changed
  useLocation();
  const signedIn = status === 'signedIn';

  const home: NavItem = { key: 'home', label: t('nav.home'), to: '/app', icon: <HomeIcon size={22} />, activeIcon: <HomeIcon size={22} weight="fill" />, owns: OWNS.home };
  const learn: NavItem = { key: 'learn', label: t('nav.learn'), to: learnPath(), icon: <BookIcon size={22} />, activeIcon: <BookIcon size={22} weight="fill" />, owns: OWNS.learn };
  if (!signedIn) return [home, learn];

  // something waiting that is yours to open: a gift, or somebody asking to be friends
  const waiting = (data.unread.gifts ?? 0) > 0 || data.unread.requests > 0;
  const avatar = data.you?.avatarUrl ?? user?.avatarUrl ?? null;
  // your face with your level drawn round it, as the bar has always shown you
  const face = (active: boolean): React.ReactNode =>
    avatar || data.you ? (
      <span className={`nav-avatar${active ? ' is-active' : ''}`}>
        {data.you && <LevelRing progress={data.you.level.progress} />}
        <Avatar url={avatar} glyphSize={14} />
      </span>
    ) : (
      <UserIcon size={22} weight={active ? 'fill' : 'regular'} />
    );
  return [
    home,
    learn,
    {
      key: 'messages',
      label: t('nav.messages'),
      to: '/app/messages',
      icon: <SendIcon size={22} />,
      activeIcon: <SendIcon size={22} weight="fill" />,
      owns: OWNS.messages,
      badge: unreadTotal,
    },
    {
      key: 'profile',
      label: t('nav.profile'),
      to: '/app/profile',
      // your own face, which is what "you" looks like
      icon: face(false),
      activeIcon: face(true),
      owns: OWNS.profile,
      dot: waiting,
    },
  ];
}
