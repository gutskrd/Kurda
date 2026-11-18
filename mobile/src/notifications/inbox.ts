/** Pure notification-inbox helpers, with no React Native. */
import { isPlayGame, letterNoticeOf, type IncomingInvite, type PlayGame } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { IconName } from '../theme/icon-paths';
import { socialDeepLink, str, type SocialDeepLink } from '../reports/deepLinks';

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
  /** An invite to play: accepted on the way, into the game's lobby. */
  | { screen: 'PlayInvite'; params: { inviteId: string; game: PlayGame; lobbyId: string } }
  /** A badge earned (one, or the day's bundle): the badges page. */
  | { screen: 'Badges' }
  /** Safe this week, moved up a league, a Pêla week: the league. */
  | { screen: 'League' }
  /** Someone asked to come back to a group you run: the requests themselves, waiting on an answer. */
  | { screen: 'GroupRequests'; params: { groupId: string } }
  /**
   * A bird came to your window, or yours came home with an answer: the window, naming the correspondence (`bird`) so
   * its bird lands there before the letter is read; the window opens the correspondence itself when there is nothing to
   * land. Without a correspondence, just the window.
   */
  | { screen: 'Letters'; params?: { bird: string } }
  // Gifts, report outcomes and decisions on your account (reports/deepLinks.ts).
  | SocialDeepLink;

/**
 * What a group tells someone about their place in it: removed, banned, someone asking to come back (to its owner and
 * admins), and the answer to asking. A group is private, so a notice opens it only for a member or someone banned; the
 * removed, or the let back but not re-added, would only see "no such group", so those two open nothing.
 */
const GROUP_NOTICES = ['group_removed', 'group_banned', 'group_request', 'group_request_approved', 'group_request_declined'] as const;

export function isGroupNotice(data: Record<string, unknown>): boolean {
  return (GROUP_NOTICES as readonly unknown[]).includes(data.kind);
}

/**
 * A notification's `data` as a navigation target, or null when there is no valid one; the caller then just marks it
 * read rather than opening a dead screen.
 */
export function resolveDeepLink(data: Record<string, unknown>): DeepLink | null {
  // Gifts, report outcomes and decisions on your account first (reports/deepLinks.ts).
  const social = socialDeepLink(data);
  if (social) return social;
  /*
   * The server writes a `kind` with the ids it needs rather than a screen name, so the app decides where each thing
   * lives.
   */
  if (data.kind === 'play_invite') {
    const inviteId = str(data.inviteId);
    const lobbyId = str(data.lobbyId);
    return inviteId && lobbyId && isPlayGame(data.game) ? { screen: 'PlayInvite', params: { inviteId, game: data.game, lobbyId } } : null;
  }
  // A group, about one's place in it: the requests waiting on an answer, or the group itself while it is still shown to
  // them.
  if (isGroupNotice(data)) {
    const groupId = str(data.groupId);
    if (!groupId) return null;
    if (data.kind === 'group_request') return { screen: 'GroupRequests', params: { groupId } };
    const letBackOnly = data.kind === 'group_request_approved' && (data.rejoined === false || data.rejoined === 'false');
    if (data.kind === 'group_removed' || letBackOnly) return null;
    return { screen: 'GroupThread', params: { groupId, name: str(data.groupName) ?? '' } };
  }
  // A letter goes to the window with its bird named, rather than straight into the correspondence, so the bird still
  // lands; an invalid id is never followed.
  const letter = letterNoticeOf(data);
  if (letter) return letter.threadId ? { screen: 'Letters', params: { bird: letter.threadId } } : { screen: 'Letters' };
  // Progress: badges and the weekly league.
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
 * Which stretch a notification falls in: today by the reader's calendar (not the last 24 hours, which would put last
 * night under "Today"), this week for the six days before, and earlier for the rest.
 */
export function noticeGroup(iso: string, now: number = Date.now()): NoticeGroup {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'earlier';
  if (new Date(at).toDateString() === new Date(now).toDateString()) return 'today';
  return now - at < 7 * DAY_MS ? 'week' : 'earlier';
}

/**
 * The list in its stretches, newest first within each, skipping empty ones. Sorting again keeps one that arrives out of
 * order from landing under the wrong heading.
 */
export function groupNotices<T extends Pick<InboxItem, 'createdAt'>>(items: readonly T[], now: number = Date.now()): Array<{ key: NoticeGroup; items: T[] }> {
  const order: NoticeGroup[] = ['today', 'week', 'earlier'];
  const sorted = [...items].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  return order
    .map((key) => ({ key, items: sorted.filter((i) => noticeGroup(i.createdAt, now) === key) }))
    .filter((g) => g.items.length > 0);
}

/** When, quietly and in the reader's words: "just now", "5m ago", "3h ago", "2d ago", and the date past a week. */
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
    // A locale the runtime does not know falls back to the device's own.
    return new Date(at).toLocaleDateString();
  }
}

/**
 * When a notification came, short enough to sit after its words, as the website says it: "just now", "6m", "20h" today,
 * days this week, and the date earlier. The stretch is the list's heading, so time and heading never disagree.
 */
export function noticeWhen(iso: string, group: NoticeGroup, t: Translate, locale: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return t('time.aWhileAgo');
  if (group === 'earlier') {
    try {
      return new Date(at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    } catch {
      // A locale the runtime does not know falls back to the device's own.
      return new Date(at).toLocaleDateString();
    }
  }
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}

/**
 * What kind of thing a notification is, as its small picture says: the glyph, and whether it is a reward (in the sun's
 * gold) or not (in the text colour). Read from `data.kind`, then the linked screen, then the category, so an unknown
 * kind still gets its category's picture. An invite is a ticket in its game's colour, as everywhere else
 * (play/Ticket.tsx).
 */
export interface NoticeKind {
  icon: IconName;
  reward: boolean;
  /** An invite's game, whose colour its ticket is drawn in. */
  game?: PlayGame;
}

export function noticeKind(item: Pick<InboxItem, 'category' | 'data'>): NoticeKind {
  switch (item.data.kind) {
    case 'play_invite':
      return isPlayGame(item.data.game) ? { icon: 'ticket', reward: false, game: item.data.game } : { icon: 'ticket', reward: false };
    case 'gift':
      return { icon: 'gift', reward: true };
    case 'letter':
      return { icon: 'mail', reward: false };
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
  photoUrl: string | null;
}

/** A friend as the social panel's answer lists them (`GET /me/social`): enough to put a face and a name to a gift or a letter. */
export interface NoticeFriend {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * Who a notification is from, where the app can know it. An invite names its host while it can still be answered (from
 * `GET /play/invites`), and a message its sender; a gift or a letter names its sender only by id, almost always a
 * friend, so it is looked up among them. Everything else wears Hevalo's mark rather than a guessed face.
 */
export function noticeActor(item: Pick<InboxItem, 'data'>, invites: readonly IncomingInvite[] = [], friends: readonly NoticeFriend[] = []): NoticeActor | null {
  const { data } = item;
  if (data.kind === 'play_invite') {
    const invite = invites.find((i) => i.id === data.inviteId);
    return invite ? { name: invite.from.name, photoUrl: invite.from.avatarUrl } : null;
  }
  if ((data.kind === 'gift' || data.kind === 'letter') && typeof data.fromUserId === 'string') {
    const who = friends.find((f) => f.userId === data.fromUserId);
    return who ? { name: who.displayName || who.username, photoUrl: who.avatarUrl ?? null } : null;
  }
  if (data.screen === 'Chat' && typeof data.username === 'string' && data.username && typeof data.userId === 'string') {
    return { name: data.username, photoUrl: null };
  }
  return null;
}

/**
 * A line with one name in it, split so the name can be bold: the text before, the name, the text after. The whole line
 * is `before` when the name is not in it (a translation that declines the name).
 */
export function splitName(text: string, name: string | null | undefined): { before: string; name: string; after: string } {
  const at = name ? text.indexOf(name) : -1;
  if (!name || at < 0) return { before: text, name: '', after: '' };
  return { before: text.slice(0, at), name, after: text.slice(at + name.length) };
}
