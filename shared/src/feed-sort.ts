/**
 * How the wall can be ordered, and how far back a ranked wall looks.
 *
 * Newest is the wall as it always was. Oldest reads it from the beginning.
 * Most popular ranks by what people did with a post — its hearts, its reposts
 * and its comments, each counted once — and most discussed by its comments
 * alone. The two ranked orders look back over a time range, because "the most
 * liked post ever" is the same post every day; newest and oldest do not.
 *
 * One list, read by the server, the phone and the website, so the three never
 * offer a choice the others do not understand.
 */
export const FEED_SORTS = ['newest', 'oldest', 'popular', 'discussed'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const FEED_PERIODS = ['day', 'week', 'month', 'year', 'all'] as const;
export type FeedPeriod = (typeof FEED_PERIODS)[number];

/** The wall as it opens: the newest first. */
export const DEFAULT_FEED_SORT: FeedSort = 'newest';
/** A ranked wall looks back over everything until told otherwise. */
export const DEFAULT_FEED_PERIOD: FeedPeriod = 'all';

/** How many days each range looks back. */
export const FEED_PERIOD_DAYS: Record<Exclude<FeedPeriod, 'all'>, number> = { day: 1, week: 7, month: 30, year: 365 };

export function isFeedSort(v: unknown): v is FeedSort {
  return typeof v === 'string' && (FEED_SORTS as readonly string[]).includes(v);
}

export function isFeedPeriod(v: unknown): v is FeedPeriod {
  return typeof v === 'string' && (FEED_PERIODS as readonly string[]).includes(v);
}

/** Whether an order ranks posts, and so looks back over a time range. */
export function sortRanks(sort: FeedSort): boolean {
  return sort === 'popular' || sort === 'discussed';
}
