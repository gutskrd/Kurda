import type pg from 'pg';
import { canEditGroup, isRole } from '@kurda/shared';
import { storeScannedPhoto, type ProfilePhotoDeps } from './profilePhoto.js';
import type { MediaStorage } from './storage.js';
import type { MediaUsageService } from './mediaUsage.js';

const GROUP_KIND = 'group-photo';

export type SetGroupPhotoResult =
  | { ok: true; photoUrl: string; reused: boolean }
  | { ok: false; status: number; code: string; message: string; reason: string };

const refuse = (status: number, code: string, message: string): SetGroupPhotoResult => ({ ok: false, status, code, message, reason: code.toLowerCase() });

/**
 * Put up a group's picture: every guard a profile photo goes through
 * (`storeScannedPhoto`), then a swap with the group row locked that checks
 * again that the person is still the group's owner or one of its admins, sets
 * the picture and who put it up, confirms the new object and un-confirms the
 * old one. The replaced object is deleted unless another group shows the same
 * picture or a report is holding it as evidence.
 */
export async function setGroupPhoto(deps: ProfilePhotoDeps, groupId: string, actorId: string, raw: Buffer): Promise<SetGroupPhotoResult> {
  const { pool, storage, log } = deps;
  const current = await pool.query<{ photo_key: string | null; archived_at: Date | null }>(`SELECT photo_key, archived_at FROM groups WHERE id = $1`, [groupId]);
  const group = current.rows[0];
  if (!group || group.archived_at) return refuse(404, 'GROUP_NOT_FOUND', 'no such group');
  // asked before any work is done, and again under the lock below
  if (!canEditGroup(await roleIn(pool, groupId, actorId))) return refuse(403, 'NOT_GROUP_ADMIN', 'only the owner and admins can change the group');

  const stored = await storeScannedPhoto(deps, raw, GROUP_KIND, group.photo_key);
  if (!stored.ok) return stored;
  if (stored.reused) return { ok: true, photoUrl: storage.publicUrl(stored.key), reused: true };

  const swapped = await swap(pool, groupId, actorId, stored.key);
  if (!swapped.ok) return swapped.refusal;
  await dropIfUnused(deps.pool, storage, deps.usage, log, swapped.oldKey);
  return { ok: true, photoUrl: storage.publicUrl(stored.key), reused: false };
}

/** Take the group's picture down, back to its initials. The same people may, and the same care is taken over the object. */
export async function clearGroupPhoto(
  deps: Pick<ProfilePhotoDeps, 'pool' | 'storage' | 'usage' | 'log'>,
  groupId: string,
  actorId: string,
): Promise<SetGroupPhotoResult | { ok: true; photoUrl: null }> {
  const { pool, storage, usage, log } = deps;
  const client = await pool.connect();
  let oldKey: string | null = null;
  try {
    await client.query('BEGIN');
    const g = await client.query<{ photo_key: string | null; archived_at: Date | null }>(`SELECT photo_key, archived_at FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
    const group = g.rows[0];
    if (!group || group.archived_at) {
      await client.query('ROLLBACK');
      return refuse(404, 'GROUP_NOT_FOUND', 'no such group');
    }
    if (!canEditGroup(await roleIn(client, groupId, actorId))) {
      await client.query('ROLLBACK');
      return refuse(403, 'NOT_GROUP_ADMIN', 'only the owner and admins can change the group');
    }
    oldKey = group.photo_key;
    await client.query(`UPDATE groups SET photo_key = NULL, photo_set_by = $2 WHERE id = $1`, [groupId, actorId]);
    await unconfirmIfUnused(client, oldKey);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  await dropIfUnused(pool, storage, usage, log, oldKey);
  return { ok: true, photoUrl: null };
}

async function roleIn(executor: Pick<pg.Pool, 'query'>, groupId: string, userId: string) {
  const r = await executor.query<{ role: string }>(`SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`, [groupId, userId]);
  const role = r.rows[0]?.role;
  return role && isRole(role) ? role : null;
}

/** Confirm the new picture and set it, with the group row locked and the person's right to do it asked again. */
async function swap(
  pool: pg.Pool,
  groupId: string,
  actorId: string,
  newKey: string,
): Promise<{ ok: true; oldKey: string | null } | { ok: false; refusal: SetGroupPhotoResult }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const g = await client.query<{ photo_key: string | null; archived_at: Date | null }>(`SELECT photo_key, archived_at FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
    const group = g.rows[0];
    // removed, demoted or the group archived while the picture was being checked: the new object is left to the orphan job
    if (!group || group.archived_at) {
      await client.query('ROLLBACK');
      return { ok: false, refusal: refuse(404, 'GROUP_NOT_FOUND', 'no such group') };
    }
    if (!canEditGroup(await roleIn(client, groupId, actorId))) {
      await client.query('ROLLBACK');
      return { ok: false, refusal: refuse(403, 'NOT_GROUP_ADMIN', 'only the owner and admins can change the group') };
    }
    const oldKey = group.photo_key;
    await client.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [newKey]);
    await client.query(`UPDATE groups SET photo_key = $2, photo_set_by = $3 WHERE id = $1`, [groupId, newKey, actorId]);
    if (oldKey !== newKey) await unconfirmIfUnused(client, oldKey);
    await client.query('COMMIT');
    return { ok: true, oldKey: oldKey === newKey ? null : oldKey };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Un-confirm a replaced picture so it leaves the storage total and the orphan job reclaims it — unless another group still shows it. */
export async function unconfirmIfUnused(executor: Pick<pg.Pool, 'query'>, key: string | null): Promise<void> {
  if (!key) return;
  const stillUsed = await executor.query(`SELECT 1 FROM groups WHERE photo_key = $1 LIMIT 1`, [key]);
  if ((stillUsed.rowCount ?? 0) > 0) return;
  await executor.query(`UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1`, [key]);
}

/** Delete a replaced picture now, unless a group still shows it or a report's evidence holds it; the orphan job retries a failure. */
async function dropIfUnused(
  pool: Pick<pg.Pool, 'query'>,
  storage: MediaStorage,
  usage: MediaUsageService,
  log: ProfilePhotoDeps['log'],
  key: string | null,
): Promise<void> {
  if (!key) return;
  const stillUsed = await pool.query(
    `SELECT 1 FROM groups WHERE photo_key = $1
     UNION ALL SELECT 1 FROM media_uploads WHERE key = $1 AND preserve_evidence
     LIMIT 1`,
    [key],
  );
  if ((stillUsed.rowCount ?? 0) > 0) return;
  try {
    await storage.delete(key);
    await usage.recordOps('A');
  } catch (err) {
    log.warn({ err, key }, 'failed to delete a replaced group picture; orphan job will retry');
  }
}
