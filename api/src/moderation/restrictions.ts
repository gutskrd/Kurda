import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RestrictionScope } from '@kurda/shared';
import { AUDIO_KINDS } from '../media/audioMedia.js';
import { activeRestriction, mutedError } from './sanctions-service.js';
import type { Executor } from './tx.js';

/**
 * preHandler: the signed-in user is not muted for `scope`. Every route creating text or media asks first, and a
 * restricted call answers 403 MUTED with the end time: `chat` on direct and group messages, `post` on library and image
 * posts and comments, `media` on picture and voice uploads. Gifts and game cards are posted into chats by other
 * services (gifts, play invites), which ask the same via `assertUnrestricted`, so a chat mute stops them too.
 *
 * Text shown to others outside posts counts too: a new group's name and description (`post`), and a changed display
 * name, bio or username (checked in PATCH /me only when one changes).
 *
 * Put it after the guard that signs the user in (`requireBirthMonth` or `requireAuth`); without a user it does nothing.
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
 * Whether this person may attach a voice file to a post or comment: their own confirmed recording that moderation has
 * not taken down, from someone not barred from media (403 MUTED, thrown). Checked at attach time because a key uploaded
 * before the limit could otherwise be published, and because a key is public once it is on a post: someone else's
 * recording, the course's audio, a picture upload and any other string are all refused alike.
 */
export async function voiceAttachable(db: Executor, userId: string, key: string): Promise<boolean> {
  await assertUnrestricted(db, userId, 'media');
  const r = await db.query(
    `SELECT 1 FROM media_uploads
      WHERE key = $1 AND uploader_id = $2 AND kind = ANY($3::text[]) AND confirmed_at IS NOT NULL
        AND content_type LIKE 'audio/%' AND scan_status <> 'blocked' AND quarantine_state IS NULL`,
    [key, userId, [...AUDIO_KINDS]],
  );
  return (r.rowCount ?? 0) > 0;
}
