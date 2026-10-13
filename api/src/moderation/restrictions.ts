import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RestrictionScope } from '@kurda/shared';
import { activeRestriction, mutedError } from './sanctions-service.js';
import type { Executor } from './tx.js';

/**
 * preHandler: the signed-in user is not muted for `scope`.
 *
 * Mutes were written (by admins, the queue and the spam engine) and never read,
 * so a muted person kept messaging and posting. Every route that creates text or
 * media now asks first, and a restricted call answers 403 MUTED with when it
 * ends: `chat` on direct and group messages, `post` on library posts and
 * comments and image posts and comments, `media` on picture and voice uploads.
 * Gift and game cards in a chat are not text and are never held back.
 *
 * Text that is shown to others outside a post counts too: a new group's name
 * and description (`post`), and a changed display name, bio or username (the
 * check is in PATCH /me, which only asks when one of those changes).
 *
 * Put it after the guard that signs the user in (`requireBirthMonth` or
 * `requireAuth`); without a user it does nothing and leaves the answer to them.
 */
export function requireUnrestricted(scope: Exclude<RestrictionScope, 'account'>) {
  return async function unrestricted(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!req.user) return;
    await assertUnrestricted(req.server.db, req.user.id, scope);
  };
}

/** The same check where only part of a request needs it: throws 403 MUTED when `userId` may not. */
export async function assertUnrestricted(db: Executor, userId: string, scope: Exclude<RestrictionScope, 'account'>): Promise<void> {
  const restriction = await activeRestriction(db, userId, scope);
  if (restriction) throw mutedError(scope, restriction.until);
}

/**
 * Whether a voice file may be attached to a post or comment by this person:
 * a confirmed audio upload that moderation has not taken down, from someone
 * who is not barred from media (403 MUTED, thrown). A feature limit used to
 * stop the upload routes only, so a key uploaded some other way — or before
 * the limit — could still be published by attaching it. And a picture is not
 * a voice note: a posted picture is a confirmed upload too, and its key is in
 * its public address.
 */
export async function voiceAttachable(db: Executor, userId: string, key: string): Promise<boolean> {
  await assertUnrestricted(db, userId, 'media');
  const r = await db.query(
    `SELECT 1 FROM media_uploads
      WHERE key = $1 AND confirmed_at IS NOT NULL AND content_type LIKE 'audio/%'
        AND scan_status <> 'blocked' AND quarantine_state IS NULL`,
    [key],
  );
  return (r.rowCount ?? 0) > 0;
}
