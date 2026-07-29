import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { EventService } from './service.js';

const keyParam = z.object({ key: z.string().min(1).max(64) });

const upsertBody = z
  .object({
    key: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, 'key must be lower kebab/snake case'),
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(40),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    priority: z.number().int().min(0).max(1000).optional(),
    theme: z.string().max(64).nullable().optional(),
    quests: z.array(z.unknown()).max(50).optional(),
    rewards: z.record(z.string(), z.unknown()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

/** Config-driven events (KUR-089): public active feed + admin CRUD. */
export function registerEventRoutes(app: FastifyInstance, events: EventService): void {
  /** Events live right now, highest priority first. Cached to the next boundary. */
  app.get('/events/active', { preHandler: requireAuth }, async () => ({
    events: await events.active(),
  }));

  /** Admin: every definition regardless of window/enabled. */
  app.get(
    '/admin/events',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ events: await events.list() }),
  );

  /** Admin: create or replace a definition by key (no deploy needed). */
  app.post(
    '/admin/events',
    { schema: { body: upsertBody }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const event = await events.upsert(req.body as z.infer<typeof upsertBody>);
      return reply.code(201).send({ event });
    },
  );

  /** Admin kill switch: pull or restore an event without editing its window. */
  app.post(
    '/admin/events/:key/enabled',
    { schema: { params: keyParam, body: z.object({ enabled: z.boolean() }) }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const { key } = req.params as z.infer<typeof keyParam>;
      const found = await events.setEnabled(key, (req.body as { enabled: boolean }).enabled);
      if (!found) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'no such event' } });
      return { ok: true };
    },
  );
}
