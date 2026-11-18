import type { RailNotification } from '../social/useSocialRail';
import type { Translate } from '../i18n/I18nProvider';

/**
 * What a notification is about, as one of a few kinds, each with its own glyph. Invitations wear the ticket colours
 * (ui/Ticket.tsx). The data's `kind` decides first, then the category, and anything else is a plain notice.
 */
export type NoteKind = 'invite' | 'friendRequest' | 'game' | 'gift' | 'badge' | 'league' | 'streak' | 'safety' | 'care' | 'friends' | 'group' | 'groupOut' | 'groupBan' | 'groupAsk' | 'notice';

const BY_DATA: Record<string, NoteKind> = {
  play_invite: 'invite',
  friend_request: 'friendRequest',
  gift: 'gift',
  badge: 'badge',
  league_safe: 'league',
  league_promotion: 'league',
  league_trophy: 'league',
  report_outcome: 'safety',
  sanction: 'safety',
  sanction_lifted: 'safety',
  appeal_decided: 'safety',
  caring_message: 'care',
  group_removed: 'groupOut',
  group_banned: 'groupBan',
  group_request: 'groupAsk',
  group_request_approved: 'group',
  group_request_declined: 'group',
};

const BY_CATEGORY: Record<string, NoteKind> = {
  games: 'game',
  friends: 'friends',
  streak: 'streak',
  progress: 'badge',
  safety: 'safety',
};

export function noteKind(n: Pick<RailNotification, 'category' | 'data'>): NoteKind {
  const kind = n.data && typeof n.data.kind === 'string' ? BY_DATA[n.data.kind] : undefined;
  return kind ?? BY_CATEGORY[n.category] ?? 'notice';
}

export type NoteGroupKey = 'today' | 'week' | 'earlier';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Groups notifications into today (the reader's calendar day, not the last 24 hours), the last seven days and earlier.
 * Each group keeps the server's newest-first order, and empty groups are left out.
 */
export function groupByTime<T extends Pick<RailNotification, 'createdAt'>>(
  items: readonly T[],
  now: number = Date.now(),
): Array<{ key: NoteGroupKey; items: T[] }> {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const groups: Record<NoteGroupKey, T[]> = { today: [], week: [], earlier: [] };
  for (const item of items) {
    const at = Date.parse(item.createdAt);
    // An unreadable date is still a notification; it goes with the oldest.
    if (Number.isNaN(at)) groups.earlier.push(item);
    else if (at >= startOfToday) groups.today.push(item);
    else if (now - at < WEEK_MS) groups.week.push(item);
    else groups.earlier.push(item);
  }
  return (['today', 'week', 'earlier'] as const).filter((key) => groups[key].length > 0).map((key) => ({ key, items: groups[key] }));
}

/** A sentence split around the first occurrence of a name, so it can be bold in any language; null when absent. */
export function splitAtName(text: string, name: string | null | undefined): [string, string, string] | null {
  if (!name) return null;
  const at = text.indexOf(name);
  if (at < 0) return null;
  return [text.slice(0, at), name, text.slice(at + name.length)];
}

/** When a notification came, briefly: "just now", "6m" or "20h" today, a day count this week, the date before that. */
export function noteWhen(createdAt: string, group: NoteGroupKey, t: Translate, date: Intl.DateTimeFormat, now: number = Date.now()): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return t('time.aWhileAgo');
  if (group === 'earlier') return date.format(new Date(at));
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}
