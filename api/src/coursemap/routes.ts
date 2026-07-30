import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { CourseMapService } from './service.js';

export function registerCourseMapRoutes(app: FastifyInstance): void {
  const maps = new CourseMapService(app.db);

  /** Published courses the learner can start. */
  app.get('/courses', { preHandler: requireAuth }, async () => {
    return { courses: await maps.listCourses() };
  });

  /** The scrollable skill-tree map for a course, with per-skill state. */
  app.get(
    '/courses/:id/map',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const map = await maps.forUser(req.user!.id, id);
      if (!map) throw new AppError('COURSE_NOT_FOUND', 404, 'course not found');
      return map;
    },
  );
}
