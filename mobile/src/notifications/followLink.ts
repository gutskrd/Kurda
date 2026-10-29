import type { ApiClient } from '../api/client';
import type { Translate } from '../api/errors';
import type { RootNavigation } from '../navigation/rootStack';
import { acceptInvite } from '../play/api';
import { GAME_NAME_KEY } from '../play/labels';
import { lobbyRoute } from '../play/routes';
import { badgeDef, isPlayGame } from '@kurda/shared';
import { badgeName, isKnownBadge } from '../badges/format';
import { knownTier, leagueName } from '../leagues/format';
import { formatDay } from '../reports/sendErrors';
import { isGroupNotice, type DeepLink, type InboxItem } from './inbox';

/**
 * Where a notification goes when it is tapped — one place, for the inbox tab
 * and the notification centre, which used to map the links each on its own.
 * The centre sent "Profile" to the tab of that name — your own profile — with
 * the other person's id thrown away (rootStack.ts says why that route is
 * called UserProfile); the same mapping now serves both.
 *
 * An invite is accepted on the way, and lands in the game's lobby; one that
 * can no longer be accepted still opens the game, which says why it cannot be
 * joined. A gift opens the chat it was sent in, with the gift to unwrap
 * (reports/deepLinks.ts). A caring message has no screen of its own: the
 * caller shows it where it was tapped.
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
    case 'League':
      navigation.navigate('League');
      return;
    case 'PlayInvite': {
      const res = await acceptInvite(client, link.params.inviteId);
      const route = res.ok ? lobbyRoute(res.data.game, res.data.lobbyId) : lobbyRoute(link.params.game, link.params.lobbyId);
      navigation.navigate(route.name, route.params as never);
      return;
    }
    default: {
      // a screen another part of the app adds to DeepLink (a group thread,
      // My reports, Account standing) opens by its own name, with its own params
      const other = link as { screen: string; params?: object };
      (navigation.navigate as (screen: string, params?: object) => void)(other.screen, other.params);
    }
  }
}

/**
 * A notification's title and body. The server stores finished English text;
 * for an invite, a gift, progress or a group's news the app writes its own line
 * from the kind, in the reader's language. (English readers keep the server's line, which can name
 * the friend; the data the app gets does not.)
 */
export function notificationText(item: Pick<InboxItem, 'title' | 'body' | 'data'>, t: Translate, locale: string): { title: string; body: string } {
  if (locale === 'en') return { title: item.title, body: item.body };
  if (item.data.kind === 'play_invite' && isPlayGame(item.data.game)) {
    return { title: t('play.notification.inviteTitle'), body: t('play.notification.inviteBody', { game: t(GAME_NAME_KEY[item.data.game]) }) };
  }
  if (item.data.kind === 'gift') return { title: t('play.notification.giftTitle'), body: t('play.notification.giftBody') };
  const progress = progressText(item.data, t) ?? groupText(item.data, t, locale);
  if (progress) return progress;
  return { title: item.title, body: item.body };
}

/**
 * A group's news about one's place in it, in the reader's language, from what
 * the server puts in `data` beside its English line: the group's name and
 * whether it is open, how long a ban is and why, how many ask to come back,
 * whether the person is back in, and when they may ask again. Without the
 * group's name there is nothing to say it with, and the server's line stays.
 */
function groupText(data: Record<string, unknown>, t: Translate, locale: string): { title: string; body: string } | null {
  const group = typeof data.groupName === 'string' && data.groupName ? data.groupName : null;
  if (!group || !isGroupNotice(data)) return null;
  const invite = data.privacy === 'invite';
  switch (data.kind) {
    case 'group_removed':
      return { title: t('notifications.group.removedTitle'), body: t(invite ? 'notifications.group.removedInvite' : 'notifications.group.removedOpen', { group }) };
    case 'group_banned': {
      const span = data.duration === '1d' ? 'notifications.group.bannedDay' : data.duration === '7d' ? 'notifications.group.bannedWeek' : data.duration === 'perm' ? 'notifications.group.bannedForGood' : null;
      if (!span) return null;
      // the reason is theirs as they typed it: ended, so the next sentence does not run on from it
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
      const back = data.rejoined === 'true' || data.rejoined === true;
      const body = back ? 'notifications.group.approvedBack' : invite ? 'notifications.group.approvedAdd' : 'notifications.group.approvedJoin';
      return { title: t('notifications.group.approvedTitle'), body: t(body, { group }) };
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
 * A badge or league notification in the reader's language, from its kind and
 * ids alone — the server's stored line is English and names the badge in
 * Kurmancî. Calm words: what happened, never what you might lose.
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
