import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { DictionaryRepository } from './repository.js';
import { DictionarySearchService } from './search-service.js';

const searchQuery = z.object({
  q: z.string().max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function registerDictionaryRoutes(app: FastifyInstance): void {
  const search = new DictionarySearchService(app.db, app.cache);
  const repo = new DictionaryRepository(app.db);

  /** Bidirectional search with Kurdish normalization + fuzzy fallback. */
  app.get(
    '/dictionary/search',
    { schema: { querystring: searchQuery }, preHandler: requireAuth },
    async (req) => {
      const { q, limit } = req.query as z.infer<typeof searchQuery>;
      return search.search(q, limit);
    },
  );

  /** Full entry: senses, examples, audio, cross-references. */
  app.get(
    '/dictionary/entries/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      const entry = await repo.getEntry(id);
      if (!entry) throw new AppError('ENTRY_NOT_FOUND', 404, 'dictionary entry not found');
      return entry;
    },
  );
}
