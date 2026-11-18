/**
 * Runs a dictionary import from the admin panel, inside the API where the database credentials already are, and
 * reports progress through a table a page can watch. Start returns at once, the loop writes progress after every
 * file, and nothing is held in memory between files, so the work outlives the request, a restart resumes from
 * `files_done`, and a second run is refused by a unique index. Imported words stay out of the games (`in_games`
 * defaults false).
 */
import type pg from 'pg';
import { DictionaryRepository } from './repository.js';
import { importLexicon, type LexiconEntry } from './import.js';
import { FERHENG_LANGS, publishedFerheng, toLexicon, type FerhengSource } from '@kurda/shared';

export type ImportStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface ImportRun {
  id: string;
  source: string;
  lang: string;
  status: ImportStatus;
  filesTotal: number;
  filesDone: number;
  entries: number;
  senses: number;
  definitionsFilled: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
}

interface RunRow {
  id: string;
  source: string;
  lang: string;
  status: ImportStatus;
  files_total: number;
  files_done: number;
  entries: number;
  senses: number;
  definitions_filled: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  started_at: Date;
  updated_at: Date;
  finished_at: Date | null;
  error: string | null;
}

const toRun = (r: RunRow): ImportRun => ({
  id: r.id,
  source: r.source,
  lang: r.lang,
  status: r.status,
  filesTotal: r.files_total,
  filesDone: r.files_done,
  entries: r.entries,
  senses: r.senses,
  definitionsFilled: r.definitions_filled,
  duplicates: r.duplicates,
  conflicts: r.conflicts,
  invalid: r.invalid,
  startedAt: r.started_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
  error: r.error,
});

const COLUMNS = `id, source, lang, status, files_total, files_done, entries, senses,
                 definitions_filled, duplicates, conflicts, invalid,
                 started_at, updated_at, finished_at, error`;

/** A run already in flight, which is the one thing that stops another starting. */
export class ImportAlreadyRunning extends Error {
  constructor(readonly run: ImportRun) {
    super('an import is already running');
  }
}

export class UnknownLanguage extends Error {
  constructor(lang: string) {
    super(`unknown language ${lang}; expected one of ${Object.keys(FERHENG_LANGS).join(', ')}`);
  }
}

export class DictionaryImportRunner {
  constructor(
    private readonly pool: pg.Pool,
    private readonly source: FerhengSource = publishedFerheng,
  ) {}

  /** The most recent run, whatever became of it. */
  async latest(): Promise<ImportRun | null> {
    const res = await this.pool.query<RunRow>(
      `SELECT ${COLUMNS} FROM dict_import_runs ORDER BY started_at DESC LIMIT 1`,
    );
    return res.rows[0] ? toRun(res.rows[0]) : null;
  }

  private async running(): Promise<ImportRun | null> {
    const res = await this.pool.query<RunRow>(
      `SELECT ${COLUMNS} FROM dict_import_runs WHERE status = 'running' LIMIT 1`,
    );
    return res.rows[0] ? toRun(res.rows[0]) : null;
  }

  /**
   * Begins an import, or resumes one a restart interrupted. Returns once the run is recorded; the work continues in
   * the background and `latest()` reports it.
   */
  async start(opts: { lang: string; startedBy?: string }): Promise<ImportRun> {
    if (!FERHENG_LANGS[opts.lang]) throw new UnknownLanguage(opts.lang);

    const inFlight = await this.running();
    if (inFlight) throw new ImportAlreadyRunning(inFlight);

    /*
     * A restart leaves a row marked running that nothing works on, and the unique index would refuse a new one, so
     * the run is taken over and continues from `files_done`.
     */
    const resumable = await this.pool.query<RunRow>(
      `SELECT ${COLUMNS} FROM dict_import_runs
        WHERE source = 'ferheng' AND lang = $1 AND status = 'failed' AND files_done < files_total
        ORDER BY started_at DESC LIMIT 1`,
      [opts.lang],
    );

    const row = resumable.rows[0]
      ? await this.pool.query<RunRow>(
          `UPDATE dict_import_runs
              SET status = 'running', error = NULL, updated_at = now(), finished_at = NULL
            WHERE id = $1 RETURNING ${COLUMNS}`,
          [resumable.rows[0].id],
        )
      : await this.pool.query<RunRow>(
          `INSERT INTO dict_import_runs (source, lang, status, started_by)
           VALUES ('ferheng', $1, 'running', $2) RETURNING ${COLUMNS}`,
          [opts.lang, opts.startedBy ?? null],
        );

    const run = toRun(row.rows[0]!);
    // Not awaited: the caller is an HTTP request and the work takes over an hour; errors are handled in `work`.
    void this.work(run).catch(() => undefined);
    return run;
  }

  /** Stop watching a run that is not coming back, so the button works again. */
  async cancel(): Promise<ImportRun | null> {
    const res = await this.pool.query<RunRow>(
      `UPDATE dict_import_runs SET status = 'cancelled', finished_at = now(), updated_at = now()
        WHERE status = 'running' RETURNING ${COLUMNS}`,
    );
    return res.rows[0] ? toRun(res.rows[0]) : null;
  }

  /**
   * The import loop: one file at a time, with progress written after each. Holding the whole 65 MB set in memory is
   * how a long import dies with nothing written; a file is also the unit a resume restarts on, and re-reading one is
   * cheap because the importer skips what it has seen.
   */
  private async work(run: ImportRun): Promise<void> {
    const repo = new DictionaryRepository(this.pool);
    const dialect = FERHENG_LANGS[run.lang]!;
    try {
      const manifest = await this.source.manifest(run.lang);
      await this.pool.query(`UPDATE dict_import_runs SET files_total = $2, updated_at = now() WHERE id = $1`, [
        run.id,
        manifest.files.length,
      ]);

      for (const chunk of manifest.files.slice(run.filesDone)) {
        // A cancel, or another process taking over, ends this loop; checked between files, where stopping costs nothing.
        const still = await this.pool.query<{ status: ImportStatus }>(
          `SELECT status FROM dict_import_runs WHERE id = $1`,
          [run.id],
        );
        if (still.rows[0]?.status !== 'running') return;

        const rows = await this.source.chunk(run.lang, chunk.file);
        const res = await importLexicon(repo, toLexicon(rows, dialect) as LexiconEntry[], {});

        await this.pool.query(
          `UPDATE dict_import_runs
              SET files_done = files_done + 1,
                  entries = entries + $2,
                  senses = senses + $3,
                  definitions_filled = definitions_filled + $4,
                  duplicates = duplicates + $5,
                  conflicts = conflicts + $6,
                  invalid = invalid + $7,
                  updated_at = now()
            WHERE id = $1`,
          [
            run.id,
            res.entriesCreated,
            res.sensesAdded,
            res.definitionsFilled,
            res.duplicatesSkipped,
            res.conflicts.length,
            res.issues.length,
          ],
        );
      }

      await this.pool.query(
        `UPDATE dict_import_runs SET status = 'done', finished_at = now(), updated_at = now() WHERE id = $1`,
        [run.id],
      );
    } catch (err) {
      // What was written stays, and `files_done` says where it stopped, so the next start continues from there.
      await this.pool
        .query(
          `UPDATE dict_import_runs SET status = 'failed', error = $2, finished_at = now(), updated_at = now()
            WHERE id = $1 AND status = 'running'`,
          [run.id, err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)],
        )
        .catch(() => undefined);
    }
  }
}
