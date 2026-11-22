import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COPYRIGHT_NOTICES_PER_HOUR, COUNTER_NOTICES_PER_HOUR } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { verifyCaptcha } from '../auth/captcha.js';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';
import type { CopyrightService } from './service.js';

/*
 * The body is only shaped here: the shared check (copyrightNoticeProblems) decides what each field must hold, so
 * the form and the API report the same problems in one 422.
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
  /** the form's challenge, checked as sign-up checks its own (auth/captcha.ts) */
  captchaToken: z.string().max(3_000).nullish(),
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
 * Copyright notice routes. `POST /copyright/notices` needs no sign-in, since rights holders are rarely members; the
 * CAPTCHA, when configured, and a few notices an hour per network are the brake, in the limiter and again in the
 * database. Each notice emails a receipt, so the limiter counts an IPv6 network by its /56 and keeps counting while
 * Redis is down. The `/me` routes are the uploader's side: which notices took something down, and the counter-notice.
 */
export function registerCopyrightRoutes(app: FastifyInstance, copyright: CopyrightService, config: AppConfig): void {
  app.post(
    '/copyright/notices',
    {
      schema: { body: noticeBody },
      config: { rateLimit: { max: COPYRIGHT_NOTICES_PER_HOUR, windowMs: 3_600_000, per: 'ip' as const, wideNetwork: true, onStoreDown: 'local' as const } },
    },
    async (req, reply) => {
      const { captchaToken, ...notice } = req.body as z.infer<typeof noticeBody>;
      if (!(await verifyCaptcha(config, captchaToken ?? undefined, req.ip))) {
        throw new AppError('CAPTCHA_REQUIRED', 403, 'complete the challenge to send the notice', { captchaRequired: true });
      }
      const receipt = await copyright.fileNotice(notice, req.ip);
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
      config: { rateLimit: { max: COUNTER_NOTICES_PER_HOUR, windowMs: 3_600_000, per: 'user-or-ip' as const, onStoreDown: 'local' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof idParams>;
      const receipt = await copyright.counter(req.user!.id, id, req.body as z.infer<typeof counterBody>);
      return reply.code(201).send(receipt);
    },
  );
}
