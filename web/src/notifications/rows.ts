import type { RailNotification } from '../social/useSocialRail';

/**
 * What a notification is about, as one of a few kinds, each drawn with its own
 * glyph: on the corner of the face of whoever it is from, or on its own where
 * it is from Hevalo.
 *
 * The data's `kind` says it most exactly; a notification without one (a streak
 * reminder, news) is placed by the category it was filed under, and anything
 * else is a plain notice rather than a guess.
 */
export type NoteKind = 'game' | 'gift' | 'badge' | 'league' | 'streak' | 'safety' | 'care' | 'friends' | 'notice';

const BY_DATA: Record<string, NoteKind> = {
  play_invite: 'game',
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
 * Today, the last seven days, and before that — the way people think back
 * over what happened, rather than one long column of "3d ago".
 *
 * Today is the reader's own calendar day, not the last 24 hours: something
 * from late last night belongs to yesterday. The order inside each group is
 * the server's (newest first), and a group with nothing in it is left out.
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
    // an unreadable date is still a notification; it goes with the oldest
    if (Number.isNaN(at)) groups.earlier.push(item);
    else if (at >= startOfToday) groups.today.push(item);
    else if (now - at < WEEK_MS) groups.week.push(item);
    else groups.earlier.push(item);
  }
  return (['today', 'week', 'earlier'] as const).filter((key) => groups[key].length > 0).map((key) => ({ key, items: groups[key] }));
}

/**
 * A sentence split around the first time a name appears in it, so the name
 * can be set in bold whichever language put it where. Null when the name is
 * not in the sentence (the server's own English, say): it is shown as it is.
 */
export function splitAtName(text: string, name: string | null | undefined): [string, string, string] | null {
  if (!name) return null;
  const at = text.indexOf(name);
  if (at < 0) return null;
  return [text.slice(0, at), name, text.slice(at + name.length)];
}
