import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { acceptInvite } from '../play/api';
import { GAME_NAME_KEY } from '../play/labels';
import { lobbyRoute } from '../play/routes';
import { badgeDef, isPlayGame, letterNoticeOf } from '@kurda/shared';
import { badgeName, isKnownBadge } from '../badges/format';
import { knownTier, leagueName } from '../leagues/format';
import { formatDay } from '../reports/sendErrors';
import { isGroupNotice, type DeepLink, type InboxItem } from './inbox';
import { pictureReviewOf, pictureReviewText } from '../pictures/review';

/**
 * Where a tapped notification goes, for both the inbox and the notification centre. An invite is accepted on the way
 * and lands in the game's lobby; one that can no longer be accepted still opens the game, which says why. A gift opens
 * its chat with the gift to unwrap (reports/deepLinks.ts). A caring message has no screen: the caller shows it where
 * tapped.
 */
export async function followDeepLink(link: DeepLink, navigation: RootNavigation, client: ApiClient): Promise<void> {
  switch (link.screen) {
    case 'Chat':
      navigation.navigate('Chat', link.params);
      return;
    case 'Profile':
      navigation.navigate('UserProfile', { userId: link.params.userId });
      return;
    case 'EventQuests':
      navigation.navigate('EventQuests');
      return;
    case 'Notifications':
      navigation.navigate('Notifications');
      return;
    case 'Badges':
      navigation.navigate('Badges');
      return;
    case 'Rankings':
      navigation.navigate('Rankings', { board: 'xp', span: 'week' });
      return;
    case 'PlayInvite': {
      const res = await acceptInvite(client, link.params.inviteId);
      const route = res.ok ? lobbyRoute(res.data.game, res.data.lobbyId) : lobbyRoute(link.params.game, link.params.lobbyId);
      navigation.navigate(route.name, route.params as never);
      return;
    }
    default: {
      // A screen another part of the app adds to DeepLink (a group thread, My reports, Account standing) opens by its
      // own name and params.
      const other = link as { screen: string; params?: object };
      (navigation.navigate as (screen: string, params?: object) => void)(other.screen, other.params);
    }
  }
}

/**
 * A notification's title and body. The server stores finished English text; for an invite, gift, progress or group news
 * the app writes its own line from the kind, in the reader's language. English readers keep the server's line, which
 * can name the friend where the data cannot.
 */
export function notificationText(item: Pick<InboxItem, 'title' | 'body' | 'data'>, t: Translate, locale: string): { title: string; body: string } {
  // A person's decision on a picture is the app's own words in every language, the same as the screens that said it
  // was being checked.
  const picture = pictureReviewOf(item.data);
  if (picture) return pictureReviewText(picture, t);
  if (locale === 'en') return { title: item.title, body: item.body };
  if (item.data.kind === 'play_invite' && isPlayGame(item.data.game)) {
    return { title: t('play.notification.inviteTitle'), body: t('play.notification.inviteBody', { game: t(GAME_NAME_KEY[item.data.game]) }) };
  }
  if (item.data.kind === 'gift') return { title: t('play.notification.giftTitle'), body: t('play.notification.giftBody') };
  // Your own bird home with an answer is said as that, so the tap promises what the window then shows.
  const letter = letterNoticeOf(item.data);
  if (letter) {
    return letter.how === 'home'
      ? { title: t('letters.notify.homeTitle'), body: t('letters.notify.homeBody') }
      : { title: t('letters.notify.title'), body: t('letters.notify.body') };
  }
  const progress = progressText(item.data, t) ?? groupText(item.data, t, locale);
  if (progress) return progress;
  return { title: item.title, body: item.body };
}

/**
 * A group's news about one's place in it, in the reader's language, from `data`: the group's name, a ban's length and
 * reason, how many ask to come back, whether the person is back in, and when they may ask again. Without the group's
 * name the server's line stays.
 */
function groupText(data: Record<string, unknown>, t: Translate, locale: string): { title: string; body: string } | null {
  const group = typeof data.groupName === 'string' && data.groupName ? data.groupName : null;
  if (!group || !isGroupNotice(data)) return null;
  switch (data.kind) {
    case 'group_removed':
      return { title: t('notifications.group.removedTitle'), body: t('notifications.group.removed', { group }) };
    case 'group_banned': {
      const span = data.duration === '1d' ? 'notifications.group.bannedDay' : data.duration === '7d' ? 'notifications.group.bannedWeek' : data.duration === 'perm' ? 'notifications.group.bannedForGood' : null;
      if (!span) return null;
      // The reason is theirs as typed: ended, so the next sentence does not run on from it.
      const said = typeof data.reason === 'string' ? data.reason.trim() : '';
      const reason = said ? t('groups.standing.reason', { reason: /[.!?…؟]$/.test(said) ? said : `${said}.` }) : null;
      return { title: t('notifications.group.bannedTitle'), body: [t(span, { group }), reason, t('notifications.group.askBack')].filter(Boolean).join(' ') };
    }
    case 'group_request': {
      const count = Number(data.count);
      return {
        title: t('groups.requests.title'),
        body: count > 1 ? t('notifications.group.requestMany', { group, count }) : t('notifications.group.requestOne', { group }),
      };
    }
    case 'group_request_approved': {
      // Let back but not put back in: nobody joins a group by themselves, so an admin has to add them.
      const back = data.rejoined === 'true' || data.rejoined === true;
      return { title: t('notifications.group.approvedTitle'), body: t(back ? 'notifications.group.approvedBack' : 'notifications.group.approvedAdd', { group }) };
    }
    default: {
      const until = typeof data.until === 'string' ? data.until : null;
      return {
        title: t('notifications.group.declinedTitle'),
        body: until ? t('notifications.group.declinedWait', { group, date: formatDay(until, locale) }) : t('notifications.group.declinedClosed', { group }),
      };
    }
  }
}

/**
 * A badge or league notification in the reader's language, from its kind and ids alone (the server's line is English
 * and names the badge in Kurmancî). Calm words: what happened, never what you might lose.
 */
function progressText(data: Record<string, unknown>, t: Translate): { title: string; body: string } | null {
  switch (data.kind) {
    case 'badge': {
      const key = isKnownBadge(data.key) ? data.key : null;
      if (!key) return { title: t('notifications.badge.title'), body: t('notifications.badge.dayBody') };
      return badgeDef(key)?.secret
        ? { title: t('notifications.badge.title'), body: t('notifications.badge.secretBody') }
        : { title: t('notifications.badge.title'), body: t('notifications.badge.body', { name: badgeName(t, key) }) };
    }
    case 'league_safe':
      return { title: t('notifications.leagueSafe.title'), body: t('notifications.leagueSafe.body') };
    case 'league_promotion': {
      const tier = knownTier(data.tier);
      return {
        title: t('notifications.leagueUp.title'),
        body: tier ? t('notifications.leagueUp.body', { tier: leagueName(t, tier) }) : t('notifications.leagueUp.bodyPlain'),
      };
    }
    case 'league_trophy':
      return { title: t('notifications.leagueTrophy.title'), body: t('notifications.leagueTrophy.body') };
    default:
      return null;
  }
}
