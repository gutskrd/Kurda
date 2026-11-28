/**
 * The day's gift caps (shared `GIFT_DAY_CAPS`) as the gift sheet shows them before anything is sent: for each recipient,
 * how many more gifts may reach them from this sender now, and when the next frees up if none. The send itself counts
 * again under its locks (service.ts); this is only so nobody picks a gift that would be turned away.
 */
import type pg from 'pg';
import { giftsPerFriendCap, giftsReceivedCap, giftsSentCap, type GiftDayLeft } from '@kurda/shared';
import { notAdults } from './safety.js';

type Executor = Pick<pg.Pool, 'query'>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The time a full cap frees one place: when the gift that keeps it full turns a day old. `times` are the window's gifts
 * oldest first; with more than the cap (a cap that narrowed), it is the one that brings the count back under it.
 */
function freesAt(times: readonly Date[], cap: number): number | null {
  if (times.length < cap) return null;
  return times[times.length - cap]!.getTime() + DAY_MS;
}

export async function giftsLeftToday(db: Executor, fromId: string, toIds: readonly string[]): Promise<GiftDayLeft[]> {
  if (toIds.length === 0) return [];
  const young = await notAdults(db, [fromId, ...toIds]);
  const senderAdult = !young.has(fromId);
  // Read side by side: the sender's own gifts of the last day, and what each recipient was given by anyone.
  const [mine, theirs] = await Promise.all([
    db.query<{ to_user_id: string; created_at: Date; quantity: number }>(
      `SELECT to_user_id, created_at, quantity FROM gifts
        WHERE from_user_id = $1 AND created_at > now() - interval '24 hours'
        ORDER BY created_at`,
      [fromId],
    ),
    db.query<{ to_user_id: string; n: number }>(
      `SELECT to_user_id, sum(quantity)::int AS n FROM gifts
        WHERE to_user_id = ANY($1::uuid[]) AND created_at > now() - interval '24 hours'
        GROUP BY to_user_id`,
      [toIds],
    ),
  ]);
  // several of one gift at once are that many gifts, each holding its place until the send turns a day old
  const times = (rows: typeof mine.rows): Date[] => rows.flatMap((r) => Array.from({ length: r.quantity }, () => r.created_at));
  const sent = times(mine.rows);
  const received = new Map(theirs.rows.map((r) => [r.to_user_id, r.n]));
  const sentCap = giftsSentCap(senderAdult);
  return toIds.map((to) => {
    const toThem = times(mine.rows.filter((r) => r.to_user_id === to));
    const pairCap = giftsPerFriendCap(senderAdult, !young.has(to));
    const receivedCap = giftsReceivedCap(!young.has(to));
    const left = Math.max(0, Math.min(sentCap - sent.length, pairCap - toThem.length, receivedCap - (received.get(to) ?? 0)));
    if (left > 0) return { userId: to, left, moreAt: null };
    // Only the sender's own gifts say when: what others gave this person, and when, is theirs alone.
    if ((received.get(to) ?? 0) >= receivedCap) return { userId: to, left, moreAt: null };
    const at = Math.max(freesAt(sent, sentCap) ?? 0, freesAt(toThem, pairCap) ?? 0);
    return { userId: to, left, moreAt: at > 0 ? new Date(at).toISOString() : null };
  });
}
