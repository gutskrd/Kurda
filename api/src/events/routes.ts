import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { EventService } from './service.js';

/** The same JSON whatever order its keys were written in. */
function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

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

  /**
   * Admin: create or replace a definition by key (no deploy needed).
   *
   * Quests and rewards left out keep what is stored. The panel's form never
   * sent them, and an upsert that wrote the whole row turned every edit of a
   * name or a date into "this event has no quests and gives nothing".
   *
   * Rewards are not changed here at all. An event that grants currency is the
   * one kind of event change that needs a second admin's sign-off
   * (POST /admin/config/changes); accepting rewards on this route as well let one
   * admin skip that by choosing the other door.
   */
  app.post(
    '/admin/events',
    { schema: { body: upsertBody }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const body = req.body as z.infer<typeof upsertBody>;
      const current = await events.byKey(body.key);
      const rewards = body.rewards ?? current?.rewards ?? {};
      if (!sameJson(rewards, current?.rewards ?? {})) {
        throw new AppError(
          'REWARDS_NEED_APPROVAL',
          409,
          'rewards change through Approvals, where a second admin signs off on anything that grants currency',
        );
      }
      const event = await events.upsert({ ...body, rewards, quests: body.quests ?? current?.quests ?? [] });
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
      // the envelope every other route answers with, so the panel can read it
      if (!found) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such event', requestId: req.id });
      return { ok: true };
    },
  );
}
