import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireAdmin } from '../admin/routes.js';
import type { AdminTotpService } from '../admin/totp-service.js';
import type { ContentAdminService, ExerciseInput } from './admin-service.js';

const idParam = z.object({ id: z.uuid() });

const EXERCISE_TYPES = ['multiple_choice', 'translate', 'match_pairs', 'listening', 'speaking', 'writing'] as const;

const createBody = z.object({
  skillId: z.uuid(),
  position: z.number().int().min(1),
  titleKu: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
});

const updateBody = z.object({
  titleKu: z.string().min(1).max(200),
  titleEn: z.string().min(1).max(200),
  lockVersion: z.number().int().min(0),
  exercises: z
    .array(
      z.object({
        position: z.number().int().min(1),
        type: z.enum(EXERCISE_TYPES),
        payload: z.unknown(),
      }),
    )
    .max(50),
});

/** Admin content management: draft→review→publish with optimistic locking (KUR-100). */
export function registerContentAdminRoutes(
  app: FastifyInstance,
  content: ContentAdminService,
  totp: AdminTotpService,
): void {
  // content_editor + superadmin both hold content.edit/content.publish
  const guard = { preHandler: [requireAuth, requireAdmin(totp, 'superadmin', 'content_editor')] };
  const guardNoValidation = { config: { skipValidation: true }, preHandler: guard.preHandler };

  app.post('/admin/content/lessons', { schema: { body: createBody }, preHandler: guard.preHandler }, async (req, reply) => {
    const b = req.body as z.infer<typeof createBody>;
    const res = await content.createDraft(b.skillId, b.position, b.titleKu, b.titleEn);
    return reply.code(201).send(res);
  });

  app.get('/admin/content/lessons/:id', { schema: { params: idParam }, ...guardNoValidation }, async (req, reply) => {
    const lesson = await content.getLesson((req.params as z.infer<typeof idParam>).id);
    if (!lesson) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such lesson' });
    return lesson;
  });

  app.put(
    '/admin/content/lessons/:id',
    { schema: { params: idParam, body: updateBody }, preHandler: guard.preHandler },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const b = req.body as z.infer<typeof updateBody>;
      const res = await content.updateDraft(
        id,
        { titleKu: b.titleKu, titleEn: b.titleEn, exercises: b.exercises as ExerciseInput[] },
        b.lockVersion,
      );
      if (res.ok) return res;
      if (res.code === 'NOT_FOUND') return reply.code(404).send({ code: res.code, message: 'no such lesson' });
      if (res.code === 'INVALID') return reply.code(422).send({ code: res.code, message: 'invalid exercises', issues: res.issues });
      if (res.code === 'CONFLICT')
        return reply.code(409).send({ code: res.code, message: 'lesson changed since you loaded it — reload and retry' });
      return reply.code(409).send({ code: res.code, message: 'only drafts can be edited' });
    },
  );

  for (const [verb, method] of [
    ['submit', content.submit],
    ['approve', content.approve],
    ['reject', content.reject],
  ] as const) {
    app.post(`/admin/content/lessons/:id/${verb}`, { schema: { params: idParam }, ...guardNoValidation }, async (req, reply) => {
      const res = await method.call(content, (req.params as z.infer<typeof idParam>).id);
      if (res.ok) return { ok: true };
      if (res.code === 'NOT_FOUND') return reply.code(404).send({ code: res.code, message: 'no such lesson' });
      return reply.code(409).send({ code: res.code, message: `cannot ${verb} in the current state` });
    });
  }

  app.post('/admin/content/lessons/:id/new-version', { schema: { params: idParam }, ...guardNoValidation }, async (req, reply) => {
    const res = await content.editPublished((req.params as z.infer<typeof idParam>).id);
    if (res.ok) return reply.code(201).send({ lessonId: res.lessonId });
    if (res.code === 'NOT_FOUND') return reply.code(404).send({ code: res.code, message: 'no such lesson' });
    return reply.code(409).send({ code: res.code, message: 'only published lessons can be re-versioned' });
  });
}
