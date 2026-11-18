import type pg from 'pg';
import type { SessionCheck } from './gateway.js';

/**
 * Which sessions behind live sockets have ended, for `checkSessions`: the auth hook's question (plugins/auth.ts), so a
 * socket stops when the same session's access token would. A session ends when its account is gone, closed or banned,
 * or its sign-in has no unrevoked refresh token left. A session known only by its account (from an older token) is
 * checked on the account alone. One statement for all of them.
 */
export function endedSessions(db: Pick<pg.Pool, 'query'>): SessionCheck {
  return async (sessions) => {
    if (sessions.length === 0) return [];
    const res = await db.query<{ user_id: string; family_id: string | null }>(
      `SELECT s.user_id, s.family_id
         FROM unnest($1::uuid[], $2::uuid[]) AS s(user_id, family_id)
         LEFT JOIN users u ON u.id = s.user_id
        WHERE u.id IS NULL OR u.deleted_at IS NOT NULL
           OR (u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now()))
           OR (s.family_id IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM refresh_tokens rt
                  WHERE rt.family_id = s.family_id AND rt.user_id = s.user_id AND rt.revoked_at IS NULL))`,
      [sessions.map((s) => s.userId), sessions.map((s) => s.familyId)],
    );
    return res.rows.map((r) => ({ userId: r.user_id, familyId: r.family_id }));
  };
}
