import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RestrictionScope } from '@kurda/shared';
import { activeRestriction, mutedError } from './sanctions-service.js';

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
 * Put it after the guard that signs the user in (`requireBirthMonth` or
 * `requireAuth`); without a user it does nothing and leaves the answer to them.
 */
export function requireUnrestricted(scope: Exclude<RestrictionScope, 'account'>) {
  return async function unrestricted(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!req.user) return;
    const restriction = await activeRestriction(req.server.db, req.user.id, scope);
    if (restriction) throw mutedError(scope, restriction.until);
  };
}
