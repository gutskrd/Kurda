import type pg from 'pg';
import { canEditGroup, isRole, type PendingPicture, type PictureRejectReason, type PictureReviewState } from '@kurda/shared';
import { storeScannedPhoto, type ProfilePhotoDeps } from './profilePhoto.js';
import type { MediaStorage } from './storage.js';
import type { MediaUsageService } from './mediaUsage.js';

const GROUP_KIND = 'group-photo';

export type SetGroupPhotoResult =
  | {
      ok: true;
      /** what the members see now: the new picture when clear, the previous one (or none) while the new one is checked */
      photoUrl: string | null;
      reused: boolean;
      review: PictureReviewState;
      /** the new picture, for whoever put it up and the group's admins, while a person checks it */
      photoPending?: PendingPicture;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      reason: string;
      refusal?: { reason: PictureRejectReason; reviewId: string | null };
    };

const refuse = (status: number, code: string, message: string): SetGroupPhotoResult => ({ ok: false, status, code, message, reason: code.toLowerCase() });
const noSuchGroup = (): SetGroupPhotoResult => refuse(404, 'GROUP_NOT_FOUND', 'no such group');
/** Why this person may not change the picture: a non-member gets "no such group", a member that they are not owner or admin. */
const notAllowed = (role: string | null): SetGroupPhotoResult =>
  role === null ? noSuchGroup() : refuse(403, 'NOT_GROUP_ADMIN', 'only the owner and admins can change the group');

/**
 * Puts up a group's picture: every profile-photo guard (`storeScannedPhoto`, the picture check included), then a swap
 * with the group row locked that rechecks the person is owner or admin, sets the picture and who put it up, and
 * confirms the new object while unconfirming the old. The replaced object is deleted unless another group shows it or a
 * report holds it as evidence. A picture a person must check first waits beside the live one
 * (`groups.pending_photo_key`): members keep seeing the old one until it is approved.
 */
export async function setGroupPhoto(deps: ProfilePhotoDeps, groupId: string, actorId: string, raw: Buffer): Promise<SetGroupPhotoResult> {
  const { pool, storage, log } = deps;
  const current = await pool.query<{ photo_key: string | null; archived_at: Date | null; name: string }>(
    `SELECT photo_key, archived_at, name FROM groups WHERE id = $1`,
    [groupId],
  );
  const group = current.rows[0];
  if (!group || group.archived_at) return noSuchGroup();
  // asked before any work is done, and again under the lock below
  const role = await roleIn(pool, groupId, actorId);
  if (!canEditGroup(role)) return notAllowed(role);

  const stored = await storeScannedPhoto(deps, raw, GROUP_KIND, group.photo_key, actorId, { groupName: group.name, groupId });
  if (!stored.ok) return stored;
  if (stored.reused) return { ok: true, photoUrl: storage.publicUrl(stored.key), reused: true, review: 'clear' };

  const swapped = await swap(pool, groupId, actorId, stored.key, stored.review === 'held');
  if (!swapped.ok) return swapped.refusal;
  if (stored.review === 'held') {
    const pending = await deps.pictures.ownerLink(stored.key);
    return {
      ok: true,
      photoUrl: swapped.liveKey ? storage.publicUrl(swapped.liveKey) : null,
      reused: false,
      review: 'held',
      ...(pending ? { photoPending: pending } : {}),
    };
  }
  await dropIfUnused(deps.pool, storage, deps.usage, log, swapped.oldKey);
  return { ok: true, photoUrl: storage.publicUrl(stored.key), reused: false, review: 'clear' };
}

/** Takes the group's picture down, back to its initials, with the same permissions and the same care over the object. */
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
      return noSuchGroup();
    }
    const role = await roleIn(client, groupId, actorId);
    if (!canEditGroup(role)) {
      await client.query('ROLLBACK');
      return notAllowed(role);
    }
    oldKey = group.photo_key;
    // a picture still waiting for a person goes too: taken down is taken down
    await client.query(`UPDATE groups SET photo_key = NULL, photo_set_by = $2, pending_photo_key = NULL, pending_photo_set_by = NULL WHERE id = $1`, [
      groupId,
      actorId,
    ]);
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

/**
 * Confirms and sets the new picture with the group row locked, rechecking the person's right to do it. A picture a
 * person checks first (`waiting`) is put in the waiting place instead, and the live one stays.
 */
async function swap(
  pool: pg.Pool,
  groupId: string,
  actorId: string,
  newKey: string,
  waiting = false,
): Promise<{ ok: true; oldKey: string | null; liveKey: string | null } | { ok: false; refusal: SetGroupPhotoResult }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const g = await client.query<{ photo_key: string | null; archived_at: Date | null }>(`SELECT photo_key, archived_at FROM groups WHERE id = $1 FOR UPDATE`, [groupId]);
    const group = g.rows[0];
    // Removed, demoted or archived meanwhile: the new object is left to the orphan job.
    if (!group || group.archived_at) {
      await client.query('ROLLBACK');
      return { ok: false, refusal: noSuchGroup() };
    }
    const role = await roleIn(client, groupId, actorId);
    if (!canEditGroup(role)) {
      await client.query('ROLLBACK');
      return { ok: false, refusal: notAllowed(role) };
    }
    const oldKey = group.photo_key;
    if (waiting) {
      await client.query(`UPDATE groups SET pending_photo_key = $2, pending_photo_set_by = $3 WHERE id = $1`, [groupId, newKey, actorId]);
      await client.query('COMMIT');
      return { ok: true, oldKey: null, liveKey: oldKey };
    }
    await client.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1 AND confirmed_at IS NULL`, [newKey]);
    // a newer picture replaces one still waiting for a person too: approving that one later must not undo this
    await client.query(
      `UPDATE groups SET photo_key = $2, photo_set_by = $3, pending_photo_key = NULL, pending_photo_set_by = NULL WHERE id = $1`,
      [groupId, newKey, actorId],
    );
    if (oldKey !== newKey) await unconfirmIfUnused(client, oldKey);
    await client.query('COMMIT');
    return { ok: true, oldKey: oldKey === newKey ? null : oldKey, liveKey: newKey };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Unconfirms a replaced picture so it leaves the storage total and the orphan job reclaims it, unless another group shows it. */
export async function unconfirmIfUnused(executor: Pick<pg.Pool, 'query'>, key: string | null): Promise<void> {
  if (!key) return;
  const stillUsed = await executor.query(`SELECT 1 FROM groups WHERE photo_key = $1 OR pending_photo_key = $1 LIMIT 1`, [key]);
  if ((stillUsed.rowCount ?? 0) > 0) return;
  await executor.query(`UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1`, [key]);
}

/** Deletes a replaced picture now unless a group shows it or a report holds it; the orphan job retries a failure. */
async function dropIfUnused(
  pool: Pick<pg.Pool, 'query'>,
  storage: MediaStorage,
  usage: MediaUsageService,
  log: ProfilePhotoDeps['log'],
  key: string | null,
): Promise<void> {
  if (!key) return;
  const stillUsed = await pool.query(
    `SELECT 1 FROM groups WHERE photo_key = $1 OR pending_photo_key = $1
     UNION ALL SELECT 1 FROM media_uploads WHERE key = $1 AND (preserve_evidence OR scan_status <> 'cleared')
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
