/**
 * Starting and watching a dictionary import from the admin panel.
 *
 * The alternative was a shell on the host, for ninety minutes, against a
 * database that accepts no connections from outside its network. This is the
 * same work with the credentials where they already are.
 *
 * Gated to admin and superadmin rather than content_editor: this writes several
 * hundred thousand rows and there is no undo button for it. Curating words is
 * editing content; importing a language is not.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import {
  DictionaryImportRunner,
  ImportAlreadyRunning,
  UnknownLanguage,
  type ImportRun,
} from '../dictionary/import-runner.js';
import { FERHENG_LANGS, publishedFerheng, type FerhengSource } from '@kurda/shared';

const startBody = z.object({
  /** the source's own language directory; ku is Kurmancî, the ~447,000-word set */
  lang: z.enum(Object.keys(FERHENG_LANGS) as [string, ...string[]]).default('ku'),
});

/**
 * What the panel needs beyond the row itself: how far along, and roughly how
 * much longer. Computed here rather than stored, because it is a reading of the
 * progress rather than a fact about it.
 */
function withProgress(run: ImportRun): ImportRun & { percent: number; etaMinutes: number | null } {
  const percent = run.filesTotal > 0 ? Math.round((run.filesDone / run.filesTotal) * 100) : 0;
  const elapsedMs = new Date(run.updatedAt).getTime() - new Date(run.startedAt).getTime();
  const remaining = run.filesTotal - run.filesDone;
  const etaMinutes =
    run.status === 'running' && run.filesDone > 0 && remaining > 0
      ? Math.round(((elapsedMs / run.filesDone) * remaining) / 60_000)
      : null;
  return { ...run, percent, etaMinutes };
}

export function registerDictionaryImportRoutes(app: FastifyInstance, source: FerhengSource = publishedFerheng): void {
  const runner = new DictionaryImportRunner(app.db, source);
  const canImport = [requireAuth, requireRoles('admin', 'superadmin')];

  /** The latest run, so a page reloaded mid-import picks the progress back up. */
  app.get('/admin/dictionary/import', { preHandler: canImport }, async () => {
    const run = await runner.latest();
    return { run: run ? withProgress(run) : null, languages: FERHENG_LANGS };
  });

  /**
   * Start an import, or continue one a restart interrupted.
   *
   * Returns as soon as the run is recorded — the work outlives the request by an
   * hour and a half, and `GET` above is how to watch it.
   */
  app.post('/admin/dictionary/import', { schema: { body: startBody }, preHandler: canImport }, async (req, reply) => {
    const { lang } = req.body as z.infer<typeof startBody>;
    try {
      const run = await runner.start({ lang, startedBy: req.user?.id });
      reply.code(202);
      return { run: withProgress(run) };
    } catch (err) {
      if (err instanceof ImportAlreadyRunning) {
        throw new AppError('IMPORT_RUNNING', 409, 'an import is already running');
      }
      if (err instanceof UnknownLanguage) throw new AppError('BAD_LANGUAGE', 400, err.message);
      throw err;
    }
  });

  /**
   * Give up on a run that is not progressing.
   *
   * Nothing already written is undone — an import has no undo, and half a
   * dictionary is still a dictionary. This only stops the panel waiting on a run
   * whose process is gone, so the button works again.
   */
  app.delete('/admin/dictionary/import', { preHandler: canImport }, async () => {
    const run = await runner.cancel();
    if (!run) throw new AppError('NOT_FOUND', 404, 'nothing is running');
    return { run: withProgress(run) };
  });
}
