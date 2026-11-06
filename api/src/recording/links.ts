/**
 * Which accounts record which voices (`recording_voices`): read for the
 * console's session and the "Record by person" page, and changed by a
 * superadmin from a person's page (PUT /admin/users/:id/voices).
 *
 * A link says whose script opens first when the person opens the page, and,
 * for an account that holds only the voice actor role, the one set of lines
 * it may record at all (recording/access.ts). It grants nothing by itself:
 * the account still needs a role that opens the recording page.
 */
import type pg from 'pg';
import { isVoiceId, type VoiceId } from './script.js';

type Executor = Pick<pg.Pool, 'query'>;

/** How many voices one account may be linked to: every character and both narrators, with room for a part or two. */
export const VOICES_PER_ACCOUNT_MAX = 10;

/** The voices linked to an account, in the order they were linked. */
export async function voicesOf(db: Executor, userId: string): Promise<VoiceId[]> {
  const { rows } = await db.query<{ voice: string }>(`SELECT voice FROM recording_voices WHERE user_id = $1 ORDER BY linked_at, voice`, [userId]);
  return rows.map((r) => r.voice);
}

export interface LinkedAccount {
  id: string;
  username: string;
}

/** Who records each voice, for the people page's cards: accounts that are still there, oldest link first. */
export async function voiceLinks(db: Executor): Promise<Map<VoiceId, LinkedAccount[]>> {
  const { rows } = await db.query<{ voice: string; id: string; username: string }>(
    `SELECT v.voice, u.id, u.username
       FROM recording_voices v JOIN users u ON u.id = v.user_id
      WHERE u.deleted_at IS NULL
      ORDER BY v.linked_at, u.username`,
  );
  const out = new Map<VoiceId, LinkedAccount[]>();
  for (const r of rows) out.set(r.voice, [...(out.get(r.voice) ?? []), { id: r.id, username: r.username }]);
  return out;
}

export type SetVoicesResult =
  | { ok: true; before: VoiceId[]; after: VoiceId[]; changed: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'USER_BANNED' | 'UNKNOWN_VOICE' };

/**
 * Make an account's voices exactly `voices`: links that are not asked for go,
 * new ones are added with who made them, and the ones kept keep their date.
 * The account row is locked first, so two superadmins changing one account's
 * voices at once end with one of their lists, not a mix. A banned account is
 * given no new voice; its old ones can still be taken away.
 */
export async function setVoices(pool: pg.Pool, adminId: string, userId: string, voices: readonly string[]): Promise<SetVoicesResult> {
  const wanted = [...new Set(voices)];
  if (!wanted.every(isVoiceId)) return { ok: false, code: 'UNKNOWN_VOICE' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<{ deleted: boolean; banned: boolean }>(
      `SELECT deleted_at IS NOT NULL AS deleted, banned_at IS NOT NULL AS banned FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const user = found.rows[0];
    if (!user || user.deleted) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'NOT_FOUND' };
    }
    const before = await voicesOf(client, userId);
    const added = wanted.filter((v) => !before.includes(v));
    const removed = before.filter((v) => !wanted.includes(v));
    if (added.length > 0 && user.banned) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'USER_BANNED' };
    }
    if (removed.length > 0) await client.query(`DELETE FROM recording_voices WHERE user_id = $1 AND voice = ANY($2::text[])`, [userId, removed]);
    if (added.length > 0) {
      await client.query(
        `INSERT INTO recording_voices (user_id, voice, linked_by)
         SELECT $1, v, $2 FROM unnest($3::text[]) AS v
         ON CONFLICT (user_id, voice) DO NOTHING`,
        [userId, adminId, added],
      );
    }
    const after = await voicesOf(client, userId);
    await client.query('COMMIT');
    return { ok: true, before, after, changed: added.length > 0 || removed.length > 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
