import { weekStartsOn } from '@kurda/shared';
import { API_URL } from './config';
import { deviceId } from './deviceId';
import { resolveLocale } from '../i18n/catalogues';

/**
 * The GETs a signed-in page makes as soon as the session is confirmed, started while it is still being confirmed. The
 * API client takes one of these in place of its own request (lib/api.ts) only for the same path, sent with the same
 * token, and only once; anything else, and anything left untaken, is simply a request the page did not use.
 */

/** Asked by the app's frame on every page: the session, the social rail, unread counts, invites, gifts and standing. */
const FRAME = ['/me', '/me/social', '/chat/unread', '/me/groups', '/play/invites', '/gifts/bag', '/me/standing', '/me/badges/unseen'];

/** Asked first by the page itself, by its address. */
const PAGES: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string[]]> = [
  [/^\/app\/?$/, () => ['/feed?section=all&limit=20&offset=0', `/me/today?weekStart=${weekStartsOn(resolveLocale())}`, '/me/quests', '/me/league', '/events/active']],
  [/^\/app\/learn\/?$/, () => ['/me/daily-goal', '/courses', '/practice/due']],
  [/^\/app\/profile\/?$/, () => ['/me/wallet', '/me/inventory', '/friends?limit=1']],
  [/^\/app\/users\/([0-9a-f-]{36})\/?$/, (m) => [`/users/${m[1]}`, `/users/${m[1]}/friends?limit=12`]],
  [/^\/app\/shop\/?$/, () => ['/shop', '/me/inventory', '/me/wallet', '/me/tree', '/letters?landings=1']],
  [/^\/app\/messages\/?$/, () => ['/chat/conversations', '/friends/requests', '/me/groups/unread', '/letters?landings=1']],
  [/^\/app\/letters\/?$/, () => ['/letters?landings=1']],
];

/** An answer older than this when the page asks is not handed over; the page asks for itself. */
const STALE_MS = 5000;
/** A token this close to running out is left to the client, which refreshes it first. */
const EXPIRY_MARGIN_S = 60;
/** As long as the client itself waits for an answer. */
const TIMEOUT_MS = 30_000;

interface Early {
  token: string;
  response: Promise<Response | null>;
  /** When the answer arrived, once it has. */
  arrived: number | null;
}

const early = new Map<string, Early>();

/** Seconds since the epoch at which an access token stops working, read without checking it (the server checks). */
function expiresAt(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Starts the frame's and the page's GETs for the page at `pathname`, sent as the client would send them. */
export function startEarlyAnswers(pathname: string, accessToken: string | undefined): void {
  if (!accessToken || !pathname.startsWith('/app')) return;
  const exp = expiresAt(accessToken);
  if (exp === null || exp - Date.now() / 1000 < EXPIRY_MARGIN_S) return;
  const page = PAGES.map(([address, paths]) => {
    const match = address.exec(pathname);
    return match ? paths(match) : [];
  }).flat();
  for (const path of [...FRAME, ...page]) {
    if (early.has(path)) continue;
    const entry: Early = { token: accessToken, response: Promise.resolve(null), arrived: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    entry.response = fetch(`${API_URL}${path}`, {
      headers: { 'x-device-id': deviceId(), authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then(
        (res) => {
          entry.arrived = Date.now();
          return res;
        },
        () => null,
      )
      .finally(() => clearTimeout(timer));
    early.set(path, entry);
  }
}

/** The early answer to `path` if it was asked with `accessToken` and is still fresh, handed over once; else null. */
export function takeEarlyAnswer(path: string, accessToken: string | undefined): Promise<Response | null> | null {
  const entry = early.get(path);
  if (!entry) return null;
  early.delete(path);
  if (entry.token !== accessToken) return null;
  if (entry.arrived !== null && Date.now() - entry.arrived > STALE_MS) return null;
  return entry.response;
}
