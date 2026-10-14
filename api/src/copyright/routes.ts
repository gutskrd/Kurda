import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COPYRIGHT_NOTICES_PER_HOUR, COUNTER_NOTICES_PER_HOUR } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import type { CopyrightService } from './service.js';

/*
 * The body is only shaped here, generously: what each field must hold is the
 * shared check's job (copyrightNoticeProblems), so the form and the API answer
 * with the same problems, field by field, in one 422.
 */
const text = (max: number) => z.string().max(max).nullish();
const noticeBody = z.object({
  name: text(1000),
  email: text(1000),
  address: text(2000),
  phone: text(200),
  role: text(40),
  rightsHolder: text(1000),
  work: text(8000),
  workUrl: text(2000),
  contentUrl: text(2000),
  explanation: text(16000),
  goodFaith: z.boolean().nullish(),
  accurate: z.boolean().nullish(),
  signature: text(1000),
  locale: text(10),
});

const counterBody = z.object({
  name: text(1000),
  address: text(2000),
  phone: text(200),
  email: text(1000),
  statement: text(16000),
  goodFaith: z.boolean().nullish(),
  consent: z.boolean().nullish(),
  signature: text(1000),
});

const idParams = z.object({ id: z.uuid() });

/**
 * Copyright notices (contract-3 §C).
 *
 * - `POST /copyright/notices` — no sign-in: rights holders are usually not
 *   members. No captcha either; a few notices an hour per network address is
 *   the brake (in the limiter, and again in the database).
 * - `GET /me/copyright/notices`, `POST /me/copyright/notices/:id/counter` —
 *   the uploader's side: which notices took something of theirs down, and
 *   the counter-notice.
 */
export function registerCopyrightRoutes(app: FastifyInstance, copyright: CopyrightService): void {
  app.post(
    '/copyright/notices',
    {
      schema: { body: noticeBody },
      config: { rateLimit: { max: COPYRIGHT_NOTICES_PER_HOUR, windowMs: 3_600_000, per: 'ip' as const } },
    },
    async (req, reply) => {
      const receipt = await copyright.fileNotice(req.body as z.infer<typeof noticeBody>, req.ip);
      return reply.code(201).send(receipt);
    },
  );

  app.get('/me/copyright/notices', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    notices: await copyright.myNotices(req.user!.id),
  }));

  app.post(
    '/me/copyright/notices/:id/counter',
    {
      schema: { params: idParams, body: counterBody },
      config: { rateLimit: { max: COUNTER_NOTICES_PER_HOUR, windowMs: 3_600_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof idParams>;
      const receipt = await copyright.counter(req.user!.id, id, req.body as z.infer<typeof counterBody>);
      return reply.code(201).send(receipt);
    },
  );
}
