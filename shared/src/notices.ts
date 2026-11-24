/**
 * How the apps sort and picture a notification, alike on both: its filter (`noticeFilterOf`: people, games, progress, or
 * news and care from Hevalo) and the picture at the end of its row (`noticePicture`: a badge, a league emblem, a game, a
 * letter, a gift or the streak's fire; none when nothing can be drawn). Both read only the category and data the server
 * writes, so older notifications and kinds added later still land somewhere sensible.
 */
import { isBadgeKey } from './art/keys.js';
import { isGameEmblem, type GameEmblem } from './art/games.js';
import { toLeagueTier, type LeagueTier } from './leagues.js';

/** The filters the list offers, in the order it offers them; `all` shows everything. */
export const NOTICE_FILTERS = ['all', 'people', 'games', 'progress', 'hevalo'] as const;
export type NoticeFilter = (typeof NOTICE_FILTERS)[number];

/** A notification as the apps hold it: what it was filed under and what it is about. */
export interface NoticeLike {
  category: string;
  data?: Record<string, unknown> | null;
}

const kindOf = (n: NoticeLike): string | null => (n.data && typeof n.data.kind === 'string' ? n.data.kind : null);

const BY_KIND: Readonly<Record<string, Exclude<NoticeFilter, 'all'>>> = {
  play_invite: 'games',
  friend_request: 'people',
  gift: 'people',
  letter: 'people',
  group_request: 'people',
  group_request_approved: 'people',
  group_request_declined: 'people',
  group_removed: 'people',
  group_banned: 'people',
  // A parent and a teen connecting, parting, a second parent joining, a parent changing the limits, the teen's time zone
  // moving, the teen asking to leave or staying after all, or the first parent correcting the teen's birth month.
  parental_connected: 'people',
  parental_ended: 'people',
  parental_changed: 'people',
  parental_parent_added: 'people',
  parental_zone: 'people',
  parental_leave: 'people',
  parental_birth: 'people',
  badge: 'progress',
  league_safe: 'progress',
  league_promotion: 'progress',
  league_trophy: 'progress',
  // What Hevalo's moderators and care say to you is from Hevalo, whoever it is about.
  report_outcome: 'hevalo',
  sanction: 'hevalo',
  sanction_lifted: 'hevalo',
  appeal_decided: 'hevalo',
  caring_message: 'hevalo',
};

const BY_CATEGORY: Readonly<Record<string, Exclude<NoticeFilter, 'all'>>> = {
  friends: 'people',
  letters: 'people',
  games: 'games',
  progress: 'progress',
  streak: 'progress',
};

/** The filter a notification falls under: by its kind, else its category, else news from Hevalo. */
export function noticeFilterOf(n: NoticeLike): Exclude<NoticeFilter, 'all'> {
  const kind = kindOf(n);
  return (kind ? BY_KIND[kind] : undefined) ?? BY_CATEGORY[n.category] ?? 'hevalo';
}

/** Whether a notification shows under a filter. */
export function noticeShows(n: NoticeLike, filter: NoticeFilter): boolean {
  return filter === 'all' || noticeFilterOf(n) === filter;
}

/** The filters worth offering for a list: `all`, and each other one with something under it. */
export function noticeFiltersFor(items: readonly NoticeLike[]): NoticeFilter[] {
  const present = new Set(items.map(noticeFilterOf));
  return NOTICE_FILTERS.filter((f) => f === 'all' || present.has(f));
}

/** The picture at the end of a notification's row: what it is about, drawn. */
export type NoticePicture =
  | { kind: 'badge'; key: string; tier: 1 | 2 | 3 | 4 }
  | { kind: 'league'; tier: LeagueTier }
  | { kind: 'game'; game: GameEmblem }
  | { kind: 'letter' }
  | { kind: 'gift' }
  | { kind: 'streak' };

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** The picture for a notification, or null where nothing can be drawn (several badges in one, a group, a notice). */
export function noticePicture(n: NoticeLike): NoticePicture | null {
  const data = n.data ?? {};
  switch (kindOf(n)) {
    case 'badge': {
      const key = str(data.key);
      if (!key || !isBadgeKey(key)) return null;
      const tier = Number(data.tier);
      return { kind: 'badge', key, tier: tier === 2 || tier === 3 || tier === 4 ? tier : 1 };
    }
    case 'league_safe':
    case 'league_promotion':
    case 'league_trophy': {
      const tier = toLeagueTier(str(data.tier));
      return tier ? { kind: 'league', tier } : null;
    }
    case 'play_invite':
      return isGameEmblem(data.game) ? { kind: 'game', game: data.game } : null;
    case 'letter':
      return { kind: 'letter' };
    case 'gift':
      return { kind: 'gift' };
    default:
      return n.category === 'streak' ? { kind: 'streak' } : null;
  }
}
