import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LETTER_MAX } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import type { LetterService } from './service.js';

const threadParam = z.object({ threadId: z.uuid() });
const birdBody = z.object({ bird: z.number().int().min(0).max(99) });
// a little room over the letter's own limit: the service counts it after trimming and says which rule it broke
const letterBody = z.object({ body: z.string().min(1).max(LETTER_MAX + 200) });

/**
 * Letters by bird (letters/service.ts).
 *
 *   GET    /letters                      your bird, whether it is out, your pen pals
 *   POST   /letters/bird                 choose your bird: free the first time, Zêr after
 *   POST   /letters/out                  send a bird out to somebody new
 *   DELETE /letters/out                  call your bird back
 *   GET    /letters/threads/:threadId    a correspondence, its letters marked read
 *   POST   /letters/threads/:threadId    write back
 *   POST   /letters/threads/:threadId/end  say goodbye
 *
 * A letter is reported through POST /reports (target type 'letter'), and its
 * writer is blocked or reported as anybody is, by the id the letters give.
 * Writing needs a birth month (the band comes from it) and no chat mute; the
 * page itself only needs an account, so it can say why somebody cannot write.
 */
export function registerLetterRoutes(app: FastifyInstance, letters: LetterService): void {
  app.get('/letters', { preHandler: requireAccount }, async (req) => letters.home(req.user!.id));

  // the service says which birds there are, and takes the payment for a new one
  app.post(
    '/letters/bird',
    { schema: { body: birdBody }, config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req) => letters.chooseBird(req.user!.id, (req.body as { bird: number }).bird),
  );

  app.post(
    '/letters/out',
    {
      schema: { body: letterBody },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('chat')],
    },
    async (req) => letters.sendOut(req.user!.id, (req.body as { body: string }).body),
  );

  app.delete('/letters/out', { preHandler: requireAccount }, async (req, reply) => {
    const recalled = await letters.recall(req.user!.id);
    return reply.code(recalled ? 204 : 404).send();
  });

  app.get('/letters/threads/:threadId', { schema: { params: threadParam }, preHandler: requireAccount }, async (req) =>
    letters.thread(req.user!.id, (req.params as { threadId: string }).threadId),
  );

  app.post(
    '/letters/threads/:threadId',
    {
      schema: { params: threadParam, body: letterBody },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('chat')],
    },
    async (req) => ({ letter: await letters.reply(req.user!.id, (req.params as { threadId: string }).threadId, (req.body as { body: string }).body) }),
  );

  // nothing is sent with a goodbye
  app.post('/letters/threads/:threadId/end', { schema: { params: threadParam }, config: { skipValidation: true }, preHandler: requireAccount }, async (req, reply) => {
    await letters.end(req.user!.id, (req.params as { threadId: string }).threadId);
    return reply.code(204).send();
  });
}
