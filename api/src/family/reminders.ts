/**
 * The one thing a child's phone is told: a learning reminder, while their parent allows reminders. Kept apart from
 * the child profiles' service so the push path reads it without the rest.
 */
import type { Executor } from '../moderation/tx.js';

/** Whether a child's parent allows learning reminders on the child's phones; false for anyone who is not a child. */
export async function childRemindersAllowed(db: Executor, childId: string): Promise<boolean> {
  const r = await db.query<{ reminders_allowed: boolean }>(`SELECT reminders_allowed FROM child_profiles WHERE user_id = $1`, [childId]);
  return r.rows[0]?.reminders_allowed === true;
}

/**
 * Whether a push is kept from a child's phone: everything but a learning reminder, and a reminder too unless the
 * parent allows them. False for anyone who is not a child, at the cost of one indexed lookup.
 */
export async function childPushMuted(db: Executor, userId: string, notification: { category: string }): Promise<boolean> {
  const r = await db.query<{ reminders_allowed: boolean }>(`SELECT reminders_allowed FROM child_profiles WHERE user_id = $1`, [userId]);
  const child = r.rows[0];
  if (!child) return false;
  return !(child.reminders_allowed && notification.category === 'streak');
}
