/**
 * A record of a dictionary import, so one can be started from the admin panel
 * rather than from a shell.
 *
 * The import is ~105 files and about ninety minutes. Three things follow, and
 * they are why this is a table rather than a variable:
 *
 *   - **It outlives the request.** Nobody holds an HTTP connection open for an
 *     hand a half, so the request starts the work and returns; progress has to
 *     live somewhere the next request can read it.
 *   - **It outlives the process.** A deploy restarts the API mid-import.
 *     `files_done` is where to pick up, and re-reading a file costs nothing
 *     because the importer skips what it has already seen.
 *   - **Only one may run.** Two concurrent imports of the same source would
 *     race on every headword and report nonsense. The partial unique index
 *     below makes that the database's rule rather than a check that two
 *     requests can slip past together.
 */

export const up = (pgm) => {
  pgm.createTable('dict_import_runs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    /** which published set — only 'ferheng' so far */
    source: { type: 'text', notNull: true },
    /** the source's own language directory: ku, sor, zza */
    lang: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true },
    files_total: { type: 'integer', notNull: true, default: 0 },
    /** how many of them are finished — and therefore where a resume starts */
    files_done: { type: 'integer', notNull: true, default: 0 },
    entries: { type: 'integer', notNull: true, default: 0 },
    senses: { type: 'integer', notNull: true, default: 0 },
    definitions_filled: { type: 'integer', notNull: true, default: 0 },
    duplicates: { type: 'integer', notNull: true, default: 0 },
    conflicts: { type: 'integer', notNull: true, default: 0 },
    invalid: { type: 'integer', notNull: true, default: 0 },
    /** who pressed the button; kept if they are later deleted */
    started_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at: { type: 'timestamptz' },
    /** why it stopped, when it stopped badly */
    error: { type: 'text' },
  });

  pgm.addConstraint('dict_import_runs', 'dict_import_runs_status', {
    check: `status IN ('running', 'done', 'failed', 'cancelled')`,
  });

  /*
   * At most one running row, ever. Unique on `source` among running rows: two
   * imports of the same set would race on every headword, and there is only one
   * set today, so this reads as "one import at a time" while leaving room for a
   * second source later.
   */
  pgm.createIndex('dict_import_runs', 'source', {
    name: 'dict_import_runs_one_running_idx',
    unique: true,
    where: `status = 'running'`,
  });

  /** the panel asks for the latest run, whatever its state */
  pgm.createIndex('dict_import_runs', [{ name: 'started_at', sort: 'DESC' }], {
    name: 'dict_import_runs_started_at_idx',
  });
};

export const down = (pgm) => {
  pgm.dropTable('dict_import_runs');
};
