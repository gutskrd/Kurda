import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useMessages } from '../chat/MessagesProvider';
import { Avatar } from '../components/Avatar';
import { LevelRing } from '../profile/LevelRing';
import { BookIcon, HomeIcon, SendIcon, UserIcon } from '../components/icons';
import { useT } from '../i18n/I18nProvider';
import { useRail } from '../social/RailProvider';
import { useUnseenGifts } from '../shop/useUnseenGifts';
import { learnPath } from '../learn/learnView';
import { under } from './roots';
import type { AppLocale } from '@kurda/shared';
import type { NavItem } from '../components/TopNav';

/**
 * The published static dictionary, in Kurmancî for Kurmancî readers and English for everyone else. These are real
 * files outside the app's routes, so link to them with a plain anchor.
 */
export function publishedDictionary(locale: AppLocale): string {
  return locale === 'ku' ? '/ferheng/' : '/dictionary/';
}

/**
 * Which place owns a page, so it stays lit inside it and a cold back press leads to its root (BackButton.tsx).
 * Written out because addresses do not say it: Games and Rankings belong to Learn, Settings, the Shop and the tree to
 * Profile, and letters to Messages. Search and other people's profiles belong to no place.
 */
export const OWNS: Record<'home' | 'learn' | 'messages' | 'profile', (pathname: string) => boolean> = {
  home: (p) => p === '/app' || p === '/app/' || under(p, '/app/library') || under(p, '/app/dimen') || under(p, '/app/civak'),
  learn: (p) =>
    ['/app/learn', '/app/games', '/app/alphabet', '/app/dictionary', '/app/rankings', '/app/leagues', '/app/season', '/app/ranks'].some(
      (base) => under(p, base),
    ),
  messages: (p) => ['/app/messages', '/app/friends', '/app/letters'].some((base) => under(p, base)),
  profile: (p) =>
    ['/app/profile', '/app/settings', '/app/shop', '/app/saved', '/app/badges', '/app/tree'].some((base) => under(p, base)),
};

/**
 * The places in a fixed order (Home, Learn, Messages, Profile), with Search as the bar's field (search/NavSearch.tsx).
 * One list for every bar and the phone's PlacesBar, so places never move between pages. Guests get only Home and
 * Learn. Built in a hook so the labels follow a language change.
 */
export function useNavLinks(): NavItem[] {
  const { status, user } = useAuth();
  const t = useT();
  const { unreadTotal } = useMessages();
  const { data } = useRail();
  const gifts = useUnseenGifts();
  // Read on every render, since the nav re-renders on each navigation, when the remembered Learn view may change.
  useLocation();
  const signedIn = status === 'signedIn';

  const home: NavItem = { key: 'home', label: t('nav.home'), to: '/app', icon: <HomeIcon size={22} />, activeIcon: <HomeIcon size={22} weight="fill" />, owns: OWNS.home };
  const learn: NavItem = { key: 'learn', label: t('nav.learn'), to: learnPath(), icon: <BookIcon size={22} />, activeIcon: <BookIcon size={22} weight="fill" />, owns: OWNS.learn };
  if (!signedIn) return [home, learn];

  // something waiting that is yours to open: a gift, or somebody asking to be friends
  const waiting = gifts > 0 || data.unread.requests > 0;
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
