import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MAX_APPEAL_LEN, PLAY_GAMES, REPORT_TARGET_TYPES, reportCategoryFrom } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireAccountCaller } from './appeal-token.js';
import type { AppealsService } from './appeals-service.js';
import type { ReportsService } from './reports-service.js';
import type { PictureReviewService } from './pictures-service.js';
import type { SanctionsService } from './sanctions-service.js';

const fileBody = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(200),
  // a string, then mapped: older clients send the old names (selfHarm …)
  category: z.string().min(1).max(40),
  // no minimum: a child should be able to report without finding words
  note: z.string().max(4000).optional(),
  game: z.enum(PLAY_GAMES).optional(),
  seat: z.number().int().min(1).max(64).optional(),
});

const ackBody = z.object({ ids: z.array(z.uuid()).max(200).optional() }).nullish();

const appealBody = z.object({
  sanctionId: z.uuid().optional(),
  caseId: z.uuid().optional(),
  text: z.string().min(1).max(MAX_APPEAL_LEN * 2),
});

/**
 * Who is asking for their standing: a signed-in user, or a suspended one with the appeal token from login. That token
 * reaches only the routes `accountCaller` lists and is refused once anything ends the account's sessions.
 */
async function standingUserId(config: AppConfig, req: FastifyRequest): Promise<string> {
  return (await requireAccountCaller(config, req)).id;
}

/**
 * Reporting and account standing, for everyone (M1).
 * - `POST /reports`: report a person, message, group, post, comment or game player (by seat). Answers with a receipt,
 *   and for "someone may hurt themselves" with where to find help at once.
 * - `GET /me/reports`: your reports and their outcomes.
 * - `GET /me/standing`, `POST /me/standing/ack`: your sanctions with reasons, what is limited and until when; warnings
 *   shown once. A hold while a person checks the account is one of them (moderation/returns.ts).
 * - `POST /me/appeals`: appeal once per decision, within six months.
 */
export function registerReportRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: { reports: ReportsService; sanctions: SanctionsService; appeals: AppealsService; pictures?: PictureReviewService },
): void {

  app.post(
    '/reports',
    {
      schema: { body: fileBody },
      // the daily cap (20) is the real limit; this only stops a burst — and is
      // as high as the cap, so someone reporting a raid message by message is
      // never stopped before the cap would stop them
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof fileBody>;
      const category = reportCategoryFrom(body.category);
      if (!category) throw new AppError('INVALID_CATEGORY', 400, 'pick one of the report categories');
      if (body.targetType === 'game_player' && (!body.game || body.seat === undefined)) {
        throw new AppError('SEAT_REQUIRED', 400, 'say which game and which seat');
      }
      const { receipt, created } = await deps.reports.file(req.user!.id, {
        targetType: body.targetType,
        targetId: body.targetId,
        category,
        note: body.note,
        game: body.game,
        seat: body.seat,
      });
      return reply.code(created ? 201 : 200).send(receipt);
    },
  );

  app.get('/me/reports', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    reports: await deps.reports.myReports(req.user!.id),
  }));

  app.get('/me/standing', { config: { skipValidation: true } }, async (req) => {
    const userId = await standingUserId(config, req);
    const standing = await deps.sanctions.standing(userId);
    // a removed picture's owner sees which picture, through a link only they get
    return deps.pictures ? deps.pictures.withPictures(standing) : standing;
  });

  app.post('/me/standing/ack', { schema: { body: ackBody }, preHandler: requireAuth }, async (req) => {
    const body = (req.body ?? {}) as { ids?: string[] };
    return { acknowledged: await deps.sanctions.acknowledge(req.user!.id, body.ids) };
  });

  app.post(
    '/me/appeals',
    {
      schema: { body: appealBody },
      config: { rateLimit: { max: 5, windowMs: 60_000, per: 'user-or-ip' as const } },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = await standingUserId(config, req);
      const body = req.body as z.infer<typeof appealBody>;
      const appeal = await deps.appeals.file(userId, body);
      return reply.code(201).send(appeal);
    },
  );
}
