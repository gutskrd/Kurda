import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { DictionaryRepository } from './repository.js';
import { DictionarySearchService } from './search-service.js';
import { WordOfDayService } from './word-of-day-service.js';
import { SavedWordsService } from './saved-words-service.js';

const searchQuery = z.object({
  q: z.string().max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function registerDictionaryRoutes(app: FastifyInstance): void {
  const search = new DictionarySearchService(app.db, app.cache);
  const repo = new DictionaryRepository(app.db);
  const wotd = new WordOfDayService(app.db);
  const saved = new SavedWordsService(app.db);

  async function timezoneOf(userId: string): Promise<string> {
    const tz = await app.db.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    return tz.rows[0]?.timezone ?? 'UTC';
  }

  /** Deterministic word of the day for the learner's local day (KUR-046). */
  app.get('/dictionary/word-of-day', { preHandler: requireAuth }, async (req) => {
    const word = await wotd.today(await timezoneOf(req.user!.id));
    return { word };
  });

  /** The learner's saved words (KUR-047). */
  app.get('/me/saved-words', { preHandler: requireAuth }, async (req) => {
    return { words: await saved.list(req.user!.id) };
  });

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
      return { ...entry, saved: await saved.isSaved(req.user!.id, id) };
    },
  );

  /** Bookmark an entry → schedule it into SM-2 (capped 10 new/day). */
  app.put(
    '/dictionary/entries/:id/save',
    { schema: { params: z.object({ id: z.uuid() }) }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      return saved.save(req.user!.id, id, await timezoneOf(req.user!.id));
    },
  );

  /** Remove a bookmark (keeps the review history, stops scheduling). */
  app.delete(
    '/dictionary/entries/:id/save',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const { id } = req.params as { id: string };
      await saved.unsave(req.user!.id, id);
      return { saved: false };
    },
  );
}
