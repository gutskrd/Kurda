/**
 * Activity-feed helpers (KUR-087). Pure bits: the per-user feed cap and the
 * privacy gate for whether an actor's events broadcast. The Redis fan-out +
 * hydration live in the service.
 */

/** Max entries kept in each user's Redis feed. */
export const FEED_CAP = 100;

export type ActivityType = 'streak_milestone' | 'league_promotion' | 'achievement';

export interface ActivityEvent {
  id: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** A user hidden from everyone ('nobody' privacy) doesn't broadcast to feeds. */
export function broadcasts(visibility: string): boolean {
  return visibility !== 'nobody';
}
