import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LANDINGS_MAX, LETTER_MAX } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import type { LetterService } from './service.js';
import { registerLetterWidgetRoutes } from './widget-routes.js';
import { LetterWidgetService } from './widget.js';

const threadParam = z.object({ threadId: z.uuid() });
const birdBody = z.object({ bird: z.number().int().min(0).max(99) });
// a little room over the letter's own limit: the service counts it after trimming and says which rule it broke;
// its paper, drawing and notes are checked by the service as the apps check them (shared checkLetterDecor), which
// says exactly what is wrong, so here they only have to be there or not
const letterBody = z.object({ body: z.string().min(1).max(LETTER_MAX + 200), decor: z.unknown().optional() });
type LetterBody = { body: string; decor?: unknown };
// apps that read `landings` and post what they showed land ask with `landings=1`; a request without it is from a build before that
const homeQuery = z.object({ landings: z.string().optional() });
const landedBody = z.object({ letterIds: z.array(z.uuid()).min(1).max(LANDINGS_MAX) });

/**
 * The key an app sent a letter under (the `Idempotency-Key` header both apps
 * put on every request that changes something), or none for a missing or
 * odd one: the same letter sent again under it is the letter already sent.
 */
function idempotencyKey(req: FastifyRequest): string | null {
  const raw = req.headers['idempotency-key'];
  return typeof raw === 'string' && /^[\x21-\x7e]{1,64}$/.test(raw) ? raw : null;
}

/**
 * Letters by bird (letters/service.ts).
 *
 *   GET    /letters                      your bird and where it is, a bird at your window, the birds out there, the letters to land, your pen pals
 *   POST   /letters/landed               the window showed these letters land (or your bird home by itself)
 *   POST   /letters/bird                 choose your bird: free the first time, Zêr after
 *   POST   /letters/out                  send your bird out to somebody new, to wait until somebody calls it
 *   DELETE /letters/out                  call your bird back (404 when it is not out: BIRD_ANSWERED with its correspondence, or NO_BIRD_OUT)
 *   POST   /letters/call                 call a bird out there to your window, with its letter
 *   POST   /letters/visitor              answer the bird at your window: it carries your letter home
 *   DELETE /letters/visitor              send the bird at your window on its way
 *   GET    /letters/threads/:threadId    a correspondence, the letters it shows marked read (they still land at the window once)
 *   POST   /letters/threads/:threadId    write back
 *   POST   /letters/threads/:threadId/end  say goodbye
 *
 * Each of the three that send a letter takes `{ body, decor? }`: the letter,
 * and its paper, drawing and notes (shared/src/letter-paper.ts). A first
 * letter to a stranger carries no drawing. Each also keeps the request's
 * `Idempotency-Key`, so the same letter sent again after its reply was lost
 * is the letter already sent. The widget's routes, under /letters/widget, are
 * in widget-routes.ts.
 *
 * A letter is reported through POST /reports (target type 'letter'), and its
 * writer is blocked or reported as anybody is, by the id the letters give.
 * Writing and calling need a birth month (the band comes from it) and no
 * chat mute; the page itself only needs an account, so it can say why
 * somebody cannot write. A bird at the window can always be sent on.
 */
export function registerLetterRoutes(app: FastifyInstance, letters: LetterService): void {
  app.get('/letters', { schema: { querystring: homeQuery }, preHandler: requireAccount }, async (req) =>
    letters.home(req.user!.id, { legacyWindow: (req.query as { landings?: string }).landings !== '1' }),
  );

  // asking twice changes nothing, and an id that is not one of yours is passed over: always 204
  app.post(
    '/letters/landed',
    { schema: { body: landedBody }, config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req, reply) => {
      await letters.landed(req.user!.id, (req.body as { letterIds: string[] }).letterIds);
      return reply.code(204).send();
    },
  );

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
    async (req) => letters.sendOut(req.user!.id, (req.body as LetterBody).body, (req.body as LetterBody).decor, { key: idempotencyKey(req) }),
  );

  app.delete('/letters/out', { preHandler: requireAccount }, async (req, reply) => {
    const done = await letters.recall(req.user!.id);
    if (done.recalled) return reply.code(204).send();
    // not out: the window reads the page again, and lands the answer if one came meanwhile
    if (done.answeredIn) throw new AppError('BIRD_ANSWERED', 404, 'your bird was answered before it could be called back', { threadId: done.answeredIn });
    throw new AppError('NO_BIRD_OUT', 404, 'your bird is not out');
  });

  // nothing is sent with a call: the server chooses the bird, the one that has waited longest
  app.post(
    '/letters/call',
    {
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('chat')],
    },
    async (req) => ({ visitor: await letters.call(req.user!.id) }),
  );

  app.post(
    '/letters/visitor',
    {
      schema: { body: letterBody },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('chat')],
    },
    async (req) => letters.answer(req.user!.id, (req.body as LetterBody).body, (req.body as LetterBody).decor, { key: idempotencyKey(req) }),
  );

  app.delete('/letters/visitor', { preHandler: requireAccount }, async (req, reply) => {
    const sent = await letters.sendOn(req.user!.id);
    return reply.code(sent ? 204 : 404).send();
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
    async (req) => {
      const { body, decor } = req.body as LetterBody;
      return { letter: await letters.reply(req.user!.id, (req.params as { threadId: string }).threadId, body, decor, { key: idempotencyKey(req) }) };
    },
  );

  // nothing is sent with a goodbye
  app.post('/letters/threads/:threadId/end', { schema: { params: threadParam }, config: { skipValidation: true }, preHandler: requireAccount }, async (req, reply) => {
    await letters.end(req.user!.id, (req.params as { threadId: string }).threadId);
    return reply.code(204).send();
  });

  registerLetterWidgetRoutes(app, new LetterWidgetService(app.db));
}
