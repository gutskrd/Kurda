/**
 * The Hevalo book, for anyone to download: the chapters of the road that are
 * online, and nothing ahead of them.
 *
 *   GET /books/road        which chapters the book holds today ({ chapters: [1, 2] })
 *   GET /books/road.pdf    the book itself (?chapter=N for that chapter alone, when it is online)
 *
 * A book is made once for each set of chapters and kept in memory: the files
 * it is made from change only with a deploy, and a chapter going online makes
 * a new set. A road with nothing online yet has no book.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { roadChapters } from '../content/road-chapters.js';
import { renderRoadBook } from './pdf.js';
import { roadBookCast, roadBookChapters } from './road-book.js';
import { loadRoadBookSources } from './sources.js';

const pdfQuery = z.object({ chapter: z.coerce.number().int().min(1).max(12).optional() });

/** Books made, by the chapters they hold; one per set, and few sets ever exist. */
const MADE_MAX = 16;

export function registerBookRoutes(app: FastifyInstance): void {
  const made = new Map<string, Promise<Buffer>>();

  async function online(): Promise<number[]> {
    return (await roadChapters(app.db)).filter((c) => c.online).map((c) => c.position);
  }

  app.get('/books/road', async () => ({ chapters: await online() }));

  app.get(
    '/books/road.pdf',
    { schema: { querystring: pdfQuery }, config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } } },
    async (req, reply) => {
      const { chapter } = req.query as z.infer<typeof pdfQuery>;
      const open = await online();
      const chapters = chapter === undefined ? open : open.filter((n) => n === chapter);
      if (chapters.length === 0) {
        throw new AppError('NO_BOOK', 404, chapter === undefined ? 'no chapter of the road is online yet' : 'that chapter is not online yet');
      }
      const key = chapters.join(',');
      let pdf = made.get(key);
      if (!pdf) {
        pdf = loadRoadBookSources().then((sources) => {
          const outline = roadBookChapters(sources.plan, sources.docs, sources.stories, chapters);
          return renderRoadBook({ chapters: outline, characters: sources.plan.characters, people: roadBookCast(sources.plan, outline) });
        });
        // a failed book is made again next time, not kept
        pdf.catch(() => made.delete(key));
        if (made.size >= MADE_MAX) made.delete(made.keys().next().value!);
        made.set(key, pdf);
      }
      const name = chapters.length === 1 ? `Reya-Kurmanci-Bes-${chapters[0]}.pdf` : 'Reya-Kurmanci-Pirtuka-Hevalo.pdf';
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${name}"`)
        .header('cache-control', 'public, max-age=3600')
        .send(await pdf);
    },
  );
}
