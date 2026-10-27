import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SECURITY_CATEGORIES, SECURITY_SEVERITIES } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireAdmin } from '../admin/routes.js';
import type { AdminTotpService } from '../admin/totp-service.js';
import type { SecurityLogReader } from './search.js';

const eventsQuery = z.object({
  severity: z.enum(SECURITY_SEVERITIES).optional(),
  category: z.enum(SECURITY_CATEGORIES).optional(),
  kind: z
    .string()
    .regex(/^[a-z0-9]+\.([a-z0-9_]+)?$/)
    .max(60)
    .optional(),
  userId: z.uuid().optional(),
  network: z
    .string()
    .regex(/^[a-f0-9]{16,128}$/)
    .optional(),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
  beforeId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const reviewBody = z
  .object({
    eventIds: z.array(z.uuid()).min(1).max(200).optional(),
    kind: z
      .string()
      .regex(/^[a-z0-9]+\.[a-z0-9_]+$/)
      .max(60)
      .optional(),
    all: z.literal(true).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => [b.eventIds, b.kind, b.all].filter((v) => v !== undefined).length === 1, {
    message: 'say which alerts: eventIds, kind or all',
  });

const revealBody = z.object({ reason: z.string().trim().min(5).max(300) });
const idParam = z.object({ id: z.uuid() });

/**
 * The security log in the admin console: superadmins only, behind the two-step
 * code like every staff route. Reading it, marking alerts reviewed, and seeing
 * the address one event came from (a reason required, and the reveal itself
 * recorded both here and in the admin audit trail).
 */
export function registerSecurityLogRoutes(app: FastifyInstance, reader: SecurityLogReader, totp: AdminTotpService): void {
  const superadmin = [requireAuth, requireAdmin(totp, 'superadmin')];

  app.get('/admin/security/summary', { config: { skipValidation: true }, preHandler: superadmin }, async () => reader.summary());

  app.get('/admin/security/events', { schema: { querystring: eventsQuery }, preHandler: superadmin }, async (req) => {
    const q = req.query as z.infer<typeof eventsQuery>;
    return { events: await reader.search(q) };
  });

  app.post('/admin/security/alerts/review', { schema: { body: reviewBody }, preHandler: superadmin }, async (req) => {
    const b = req.body as z.infer<typeof reviewBody>;
    return { reviewed: await reader.review(req.user!.id, b, b.note || null) };
  });

  app.post(
    '/admin/security/events/:id/reveal-address',
    { schema: { params: idParam, body: revealBody }, config: { rateLimit: { max: 20, windowMs: 60 * 60_000 } }, preHandler: superadmin },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const address = await reader.revealAddress(id, (req.body as z.infer<typeof revealBody>).reason);
      if (address === undefined) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such event', requestId: req.id });
      return { address };
    },
  );
}
