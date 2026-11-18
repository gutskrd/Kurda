import { WIDGET_FEED_PATH, isWidgetFeed, widgetAuthorization, type WidgetFeed } from './contract';

/**
 * Fetch the widget's letter with the widget's own token. Not through the app's ApiClient, which carries the
 * account session, refreshes it and signs out on refusal, none of which concerns the widget: its token reads one
 * thing, and it only needs to know which of four answers it got.
 */

export type FeedAnswer =
  | { kind: 'feed'; feed: WidgetFeed }
  /** 401 or 403: the token was revoked (signed out on this device, or every widget removed in settings). */
  | { kind: 'rejected' }
  /** 429: asked too often this hour; try again after this many seconds. */
  | { kind: 'later'; retryAfter: number }
  /** No network, a timeout, the server down or answering something that is not a feed. */
  | { kind: 'offline' };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Long enough for a sleeping server to wake (the API's host can take half a minute), no longer. */
export const WIDGET_TIMEOUT_MS = 25_000;

/** Fetch, given up on after `ms`. */
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
