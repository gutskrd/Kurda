/**
 * The questions a signed-in phone asks as soon as its first screen opens: the frame's (the social panel, unread
 * counts, invites, gifts, standing, events) and the home wall's. They are asked beside the session check
 * (`ApiClient.prefetch`), so the first screen does not wait for that check before asking them.
 */
export const FIRST_QUESTIONS: readonly string[] = [
  '/me/social',
  '/chat/unread',
  '/friends/requests',
  '/me/notifications/unread-count',
  '/play/invites',
  '/gifts/bag',
  '/me/gifts/unseen',
  '/me/standing',
  '/me/badges/unseen',
  '/me/inventory',
  '/events/active',
  '/feed?section=all&limit=20&offset=0',
  '/me/quests',
  '/me/league',
];

/** A token this close to running out is left to the client, which renews it before asking. */
const MARGIN_S = 60;

/** Whether an access token has more than a minute left, read without checking it (the server checks). */
export function lastsAMinute(accessToken: string, now = Date.now()): boolean {
  try {
    const part = accessToken.split('.')[1] ?? '';
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp - now / 1000 > MARGIN_S;
  } catch {
    return false;
  }
}
