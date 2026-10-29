/** Pure notification-inbox helpers (KUR-097) — no React Native. */
import { isPlayGame, type IncomingInvite, type PlayGame } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { IconName } from '../theme/icon-paths';
import { socialDeepLink, type SocialDeepLink } from '../reports/deepLinks';

export interface InboxItem {
  id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

/** Deep-link targets the inbox knows how to open. */
export type DeepLink =
  | { screen: 'EventQuests' }
  | { screen: 'Notifications' }
  | { screen: 'Profile'; params: { userId: string } }
  | { screen: 'Chat'; params: { userId: string; username: string } }
  /** an invite to play: accepted on the way, into the game's lobby */
  | { screen: 'PlayInvite'; params: { inviteId: string; game: PlayGame; lobbyId: string } }
  /** a badge earned (one, or the day's bundle): the badges page */
  | { screen: 'Badges' }
  /** safe this week, moved up a league, a Pêla week: the league */
  | { screen: 'League' }
  /** someone asked to come back to a group you run: its page, where the requests are */
  | { screen: 'GroupMembers'; params: { groupId: string } }
  // gifts, report outcomes and decisions on your account (reports/deepLinks.ts)
  | SocialDeepLink;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * What a group tells someone about their place in it (api groups): removed,
 * banned, someone asking to come back (to its owner and admins), and the
 * answer to asking. Each carries the group's id, and opens the group.
 */
const GROUP_NOTICES = ['group_removed', 'group_banned', 'group_request', 'group_request_approved', 'group_request_declined'] as const;

export function isGroupNotice(data: Record<string, unknown>): boolean {
  return (GROUP_NOTICES as readonly unknown[]).includes(data.kind);
}

/**
 * Resolve a notification's `data` to a navigation target, or null when there's
 * no valid target — the caller then just marks it read (the friendly fallback
 * for an expired/removed deep-link, rather than navigating into a dead screen).
 */
export function resolveDeepLink(data: Record<string, unknown>): DeepLink | null {
  // gifts, report outcomes and decisions on your account first (reports/deepLinks.ts)
  const social = socialDeepLink(data);
  if (social) return social;
  /*
   * What the server writes today is a `kind` with the ids it needs, rather
   * than a screen name: the app decides where each kind of thing lives.
   */
  if (data.kind === 'play_invite') {
    const inviteId = str(data.inviteId);
    const lobbyId = str(data.lobbyId);
    return inviteId && lobbyId && isPlayGame(data.game) ? { screen: 'PlayInvite', params: { inviteId, game: data.game, lobbyId } } : null;
  }
  // a group, about one's place in it: the requests on the group's page, anything else in the group itself
  if (isGroupNotice(data)) {
    const groupId = str(data.groupId);
    if (!groupId) return null;
    return data.kind === 'group_request' ? { screen: 'GroupMembers', params: { groupId } } : { screen: 'GroupThread', params: { groupId, name: str(data.groupName) ?? '' } };
  }
  // progress (contract 4): badges and the weekly league
  if (data.kind === 'badge') return { screen: 'Badges' };
  if (data.kind === 'league_safe' || data.kind === 'league_promotion' || data.kind === 'league_trophy') return { screen: 'League' };
  switch (data.screen) {
    case 'EventQuests':
      return { screen: 'EventQuests' };
    case 'Profile': {
      const userId = str(data.userId);
      return userId ? { screen: 'Profile', params: { userId } } : null;
    }
    case 'Chat': {
      const userId = str(data.userId);
      const username = str(data.username);
      return userId && username ? { screen: 'Chat', params: { userId, username } } : null;
    }
    default:
      return null;
  }
}

/** Badge text for an unread count: null when zero, "9+" when capped. */
export function unreadBadge(count: number, cap = 9): string | null {
  if (count <= 0) return null;
  return count > cap ? `${cap}+` : String(count);
}

/** The three stretches of time the list is cut into. */
export type NoticeGroup = 'today' | 'week' | 'earlier';

const DAY_MS = 86_400_000;

/**
 * Which stretch a notification falls in: today by the reader's own calendar
 * (not the last 24 hours, which would put last night's under "Today"), this
 * week for the six days before that, and earlier for the rest.
 */
export function noticeGroup(iso: string, now: number = Date.now()): NoticeGroup {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'earlier';
  if (new Date(at).toDateString() === new Date(now).toDateString()) return 'today';
  return now - at < 7 * DAY_MS ? 'week' : 'earlier';
}

/**
 * The list in its stretches, newest first within each, skipping a stretch
 * with nothing in it. The server already sends them newest first; sorting
 * again keeps one that arrives out of order from landing under the wrong
 * heading.
 */
export function groupNotices<T extends Pick<InboxItem, 'createdAt'>>(items: readonly T[], now: number = Date.now()): Array<{ key: NoticeGroup; items: T[] }> {
  const order: NoticeGroup[] = ['today', 'week', 'earlier'];
  const sorted = [...items].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  return order
    .map((key) => ({ key, items: sorted.filter((i) => noticeGroup(i.createdAt, now) === key) }))
    .filter((g) => g.items.length > 0);
}

/**
 * When, quietly and in the reader's words: "just now", "5m ago", "3h ago",
 * "2d ago", and past a week the date itself, which by then says more than a
 * count of days.
 */
export function noticeTime(iso: string, t: Translate, locale: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  try {
    return new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    // a locale the runtime does not know falls back to the device's own
    return new Date(at).toLocaleDateString();
  }
}

/**
 * What kind of thing a notification is, as the small picture beside it says:
 * the glyph, and whether it is a reward (drawn in the sun's gold, the one
 * warm colour the app has) or anything else (drawn in the text colour).
 *
 * From what the server writes — `data.kind` first, then the screen a link
 * names, then the category the reader can switch off in settings — so a kind
 * the app has not met yet still gets the picture of its category rather than
 * a blank.
 */
export function noticeKind(item: Pick<InboxItem, 'category' | 'data'>): { icon: IconName; reward: boolean } {
  switch (item.data.kind) {
    case 'play_invite':
      return { icon: 'play', reward: false };
    case 'gift':
      return { icon: 'gift', reward: true };
    case 'badge':
      return { icon: 'medal', reward: true };
    case 'league_safe':
      return { icon: 'shield-fill', reward: true };
    case 'league_promotion':
      return { icon: 'move-up', reward: true };
    case 'league_trophy':
      return { icon: 'trophy', reward: true };
    case 'report_outcome':
      return { icon: 'flag', reward: false };
    case 'sanction':
    case 'sanction_lifted':
    case 'appeal_decided':
      return { icon: 'shield', reward: false };
    case 'caring_message':
      return { icon: 'lifebuoy', reward: false };
    case 'group_removed':
      return { icon: 'sign-out', reward: false };
    case 'group_banned':
      return { icon: 'block', reward: false };
    case 'group_request':
      return { icon: 'user-plus', reward: false };
    case 'group_request_approved':
      return { icon: 'people', reward: false };
    case 'group_request_declined':
      return { icon: 'clock', reward: false };
  }
  switch (item.data.screen) {
    case 'Chat':
      return { icon: 'chat', reward: false };
    case 'Profile':
      return { icon: 'person', reward: false };
    case 'EventQuests':
      return { icon: 'sparkle', reward: true };
  }
  switch (item.category) {
    case 'streak':
      return { icon: 'flame', reward: true };
    case 'friends':
      return { icon: 'people', reward: false };
    case 'games':
      return { icon: 'play', reward: false };
    case 'events':
      return { icon: 'calendar', reward: true };
    case 'progress':
      return { icon: 'trophy', reward: true };
    case 'moderation':
      return { icon: 'shield', reward: false };
    default:
      return { icon: 'bell', reward: false };
  }
}

/** Somebody a notification is about: whose picture it wears, and whose name is set in bold. */
export interface NoticeActor {
  name: string;
  /** what the monogram's colour is keyed on */
  id: string;
  photoUrl: string | null;
}

/**
 * Who a notification is from, where the app can know it without asking the
 * server anything new.
 *
 * An invite names its host while it can still be answered — the same list the
 * invite banner holds (`GET /play/invites`) — and a message names its sender.
 * Everything else is from Hevalo, or from somebody the stored data does not
 * name, and wears the picture of its kind instead of a guessed face.
 */
export function noticeActor(item: Pick<InboxItem, 'data'>, invites: readonly IncomingInvite[] = []): NoticeActor | null {
  const { data } = item;
  if (data.kind === 'play_invite') {
    const invite = invites.find((i) => i.id === data.inviteId);
    return invite ? { name: invite.from.name, id: invite.from.name, photoUrl: invite.from.avatarUrl } : null;
  }
  if (data.screen === 'Chat' && typeof data.username === 'string' && data.username && typeof data.userId === 'string') {
    return { name: data.username, id: data.userId, photoUrl: null };
  }
  return null;
}

/**
 * A line with one name in it, cut so the name can be set in bold: the text
 * before it, the name, and the text after. The whole line as `before` when
 * the name is not in it — a translation that declines the name, or a line
 * that never had it.
 */
export function splitName(text: string, name: string | null | undefined): { before: string; name: string; after: string } {
  const at = name ? text.indexOf(name) : -1;
  if (!name || at < 0) return { before: text, name: '', after: '' };
  return { before: text.slice(0, at), name, after: text.slice(at + name.length) };
}
