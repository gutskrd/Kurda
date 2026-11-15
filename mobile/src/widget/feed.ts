import { WIDGET_FEED_PATH, isWidgetFeed, widgetAuthorization, type WidgetFeed } from './contract';

/**
 * Asking the server for the widget's letter, with the widget's own token.
 *
 * Not through the app's ApiClient: that one carries the account's session,
 * renews it and signs the phone out when it is refused, and none of that is
 * the widget's business. The widget has one token that can read one thing,
 * and what it needs to know about an answer is only which of four it was.
 */

export type FeedAnswer =
  | { kind: 'feed'; feed: WidgetFeed }
  /** 401 or 403: the token was taken away (signed out on this phone, or every widget removed from settings) */
  | { kind: 'rejected' }
  /** 429: asked too often this hour; try again after this many seconds */
  | { kind: 'later'; retryAfter: number }
  /** no network, a timeout, the server down or answering something that is not a feed */
  | { kind: 'offline' };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Long enough for a server that was asleep to wake (the API's host can take half a minute), no longer. */
export const WIDGET_TIMEOUT_MS = 25_000;

/** fetch, given up on after `ms`. */
export async function timedFetch(fetchFn: FetchLike, url: string, init: RequestInit, ms = WIDGET_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWidgetFeed(apiBase: string, token: string, fetchFn: FetchLike = fetch): Promise<FeedAnswer> {
  let res: Response;
  try {
    res = await timedFetch(fetchFn, `${apiBase}${WIDGET_FEED_PATH}`, { method: 'GET', headers: { authorization: widgetAuthorization(token), accept: 'application/json' } });
  } catch {
    return { kind: 'offline' };
  }
  if (res.status === 401 || res.status === 403) return { kind: 'rejected' };
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after'));
    return { kind: 'later', retryAfter: Number.isFinite(wait) && wait > 0 ? wait : 15 * 60 };
  }
  if (!res.ok) return { kind: 'offline' };
  try {
    const body: unknown = await res.json();
    return isWidgetFeed(body) ? { kind: 'feed', feed: body } : { kind: 'offline' };
  } catch {
    return { kind: 'offline' };
  }
}
