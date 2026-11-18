/** Running a dictionary import from the panel, against real Postgres. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  DictionaryImportRunner,
  ImportAlreadyRunning,
  UnknownLanguage,
  type ImportRun,
} from './import-runner.js';
import type { FerhengSource, SourceEntry } from '@kurda/shared';

const DATABASE_URL = process.env.DATABASE_URL;

/** A source of three tiny files; `asked` records each file read, which is how resuming is checked. */
function stubSource(suffix: string): FerhengSource & { asked: string[]; fail?: string } {
  const files = ['a.json', 'b.json', 'c.json'];
  const words: Record<string, SourceEntry[]> = {
    'a.json': [{ word: `impa${suffix}`, pos: 'noun', glosses: ['yek'] }],
    'b.json': [{ word: `impb${suffix}`, pos: 'noun', glosses: ['du'] }],
    'c.json': [{ word: `impc${suffix}`, pos: 'noun', glosses: ['sê'] }],
  };
  return {
    asked: [],
    manifest: () => Promise.resolve({ totalWords: 3, files: files.map((file) => ({ file, count: 1 })) }),
    chunk(_lang, file) {
      this.asked.push(file);
      if (this.fail === file) return Promise.reject(new Error(`boom on ${file}`));
      return Promise.resolve(words[file] ?? []);
    },
  } as FerhengSource & { asked: string[]; fail?: string };
}

describe.skipIf(!DATABASE_URL)('dictionary import runner (integration)', () => {
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  /** Wait for the detached loop to reach a settled state. */
  async function settle(runner: DictionaryImportRunner, tries = 100): Promise<ImportRun> {
    for (let i = 0; i < tries; i++) {
      const run = await runner.latest();
      if (run && run.status !== 'running') return run;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('the run never settled');
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM dict_import_runs`);
    await pool.query(`DELETE FROM dict_entries WHERE headword LIKE 'imp%' || $1`, [suffix]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('imports every file and records what it did', async () => {
    const source = stubSource(suffix);
    const runner = new DictionaryImportRunner(pool, source);

    const started = await runner.start({ lang: 'ku' });
    expect(started.status).toBe('running');

    const run = await settle(runner);
    expect(run.status).toBe('done');
    expect(run.filesDone).toBe(3);
    expect(run.filesTotal).toBe(3);
    expect(run.entries).toBe(3);
    expect(run.finishedAt).not.toBeNull();
    expect(source.asked).toEqual(['a.json', 'b.json', 'c.json']);

    const stored = await pool.query(`SELECT count(*)::int AS n FROM dict_entries WHERE headword LIKE 'imp%' || $1`, [
      suffix,
    ]);
    expect(stored.rows[0]!.n).toBe(3);
  });

  /** Imported words never become game answers: the game pool is curated, and an import is not curation. */
  it('leaves everything it imports out of the games', async () => {
    const runner = new DictionaryImportRunner(pool, stubSource(suffix));
    await runner.start({ lang: 'ku' });
    await settle(runner);

    const inGames = await pool.query(
      `SELECT count(*)::int AS n FROM dict_entries WHERE headword LIKE 'imp%' || $1 AND in_games`,
      [suffix],
    );
    expect(inGames.rows[0]!.n).toBe(0);
  });

  /** A second run is refused by a unique index, because two requests could pass a check at the same moment. */
  it('refuses a second run while one is in flight', async () => {
    const runner = new DictionaryImportRunner(pool, stubSource(suffix));
    await pool.query(`INSERT INTO dict_import_runs (source, lang, status) VALUES ('ferheng', 'ku', 'running')`);

    await expect(runner.start({ lang: 'ku' })).rejects.toBeInstanceOf(ImportAlreadyRunning);
  });

  it('refuses a language the source does not publish', async () => {
    const runner = new DictionaryImportRunner(pool, stubSource(suffix));
    await expect(runner.start({ lang: 'klingon' })).rejects.toBeInstanceOf(UnknownLanguage);
  });

  /** A failure keeps what it wrote, and the next run resumes from where it stopped instead of re-reading everything. */
  it('resumes after a failure without re-reading the files it finished', async () => {
    const failing = stubSource(suffix);
    failing.fail = 'b.json';
    const first = new DictionaryImportRunner(pool, failing);
    await first.start({ lang: 'ku' });

    const failed = await settle(first);
    expect(failed.status).toBe('failed');
    expect(failed.filesDone).toBe(1); // a.json landed, b.json threw
    expect(failed.error).toContain('boom on b.json');

    const second = stubSource(suffix);
    const resumed = new DictionaryImportRunner(pool, second);
    await resumed.start({ lang: 'ku' });

    const done = await settle(resumed);
    expect(done.status).toBe('done');
    expect(done.filesDone).toBe(3);
    // the same run carried on, rather than a second one starting beside it
    expect(done.id).toBe(failed.id);
    expect(second.asked).toEqual(['b.json', 'c.json']);
  });

  it('cancelling frees the button without undoing the rows', async () => {
    const runner = new DictionaryImportRunner(pool, stubSource(suffix));
    await pool.query(`INSERT INTO dict_import_runs (source, lang, status) VALUES ('ferheng', 'ku', 'running')`);

    const cancelled = await runner.cancel();
    expect(cancelled?.status).toBe('cancelled');
    // …and a new run may start now.
    const next = await runner.start({ lang: 'ku' });
    expect(next.status).toBe('running');
    await settle(runner);
  });
});
