/**
 * The `stories:import` command (api/scripts/import-stories.ts), apart from
 * the process it runs in so its rules can be tested: the flags it takes, who
 * it publishes as, and what it prints.
 *
 *   npm run stories:import --workspace api -- <file.json> [--dry-run] [--force] [--starter]
 *                                                         [--publish --by <editor email>]
 *
 * It reads a file in the import format (`{ stories: [...] }`, as in
 * api/content/stories), checks every story with the same `validateStory`
 * the admin panel uses, and imports them all or none (see `importStories`):
 * a new slug becomes a draft, a draft whose content changed is updated, and
 * a story in review, published or archived is left alone, as is a draft
 * someone changed in the admin panel unless --force says to replace it.
 * --dry-run reports what would happen and writes nothing. --starter marks new
 * stories as starter content (written by Claude, waiting for a native
 * speaker), as the API's own seeding does.
 *
 * --publish also publishes every story it created or that is a draft, after
 * the full check, as the editor --by names: that person is recorded as the
 * publisher and in the audit, as in the admin panel, and must be able to
 * publish there. A real publish empties the hub's cached list when Redis is
 * configured, so the story appears in the app at once.
 *
 * The options go after `--`. Before it, npm takes them as its own and hides
 * them from the command: `npm run stories:import file.json --dry-run` hands
 * it only `file.json` and sets npm_config_dry_run=true instead, so a run
 * meant as a dry run would write. The command therefore also looks for its
 * options where npm puts them: a dry run is honoured (it can only write
 * less), and an option that would write more or differently is refused with
 * the right command line rather than guessed at.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { Cache } from '../cache/cache.js';
import { createRedis } from '../cache/redis.js';
import { loadConfig, type AppConfig } from '../config/env.js';
import { STORY_EDITOR_ROLES } from './admin-service.js';
import { importStories } from './import.js';

export const STORY_IMPORT_USAGE =
  'usage: npm run stories:import --workspace api -- <file.json> [--dry-run] [--force] [--starter] [--publish --by <editor email>]';

export interface StoryImportArgs {
  file: string;
  dryRun: boolean;
  publish: boolean;
  /** the email of the editor who publishes (with --publish) */
  by: string | null;
  starter: boolean;
  force: boolean;
}

const SWITCHES = { '--dry-run': 'dryRun', '--publish': 'publish', '--starter': 'starter', '--force': 'force' } as const;

/** Whether npm took `option` for itself: it then sets npm_config_<option, with underscores> and hides it from argv. */
function keptByNpm(env: Record<string, string | undefined>, option: string): boolean {
  const value = env[`npm_config_${option.slice(2).replace(/-/g, '_')}`];
  return value !== undefined && value !== '' && value !== 'false';
}

/**
 * The command line, or why it cannot be run. Anything it does not know is
 * refused rather than ignored: a misspelt --dry-run must not become a write.
 * `env` is where npm leaves the options it kept (see the top of the file);
 * `notes` say what was read from there.
 */
export function parseStoryImportArgs(
  argv: readonly string[],
  env: Record<string, string | undefined> = {},
): { ok: true; args: StoryImportArgs; notes: string[] } | { ok: false; message: string } {
  const args: StoryImportArgs = { file: '', dryRun: false, publish: false, by: null, starter: false, force: false };
  const notes: string[] = [];
  const given = new Set(argv.map((arg) => arg.split('=')[0]));
  // first: with --by kept by npm, its address is left behind looking like a second file
  const kept = ['--publish', '--by', '--starter', '--force'].filter((option) => !given.has(option) && keptByNpm(env, option));
  if (kept.length > 0) {
    return {
      ok: false,
      message:
        `npm kept ${kept.join(' ')} for itself (options before "--" are npm's), so nothing was done. ` +
        `Put them after "--": npm run stories:import --workspace api -- <file.json> ${kept.join(' ')} …`,
    };
  }
  if (!given.has('--dry-run') && keptByNpm(env, '--dry-run')) {
    args.dryRun = true;
    notes.push('! npm kept --dry-run for itself (options before "--" are npm\'s); this is a dry run all the same');
  }
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (Object.hasOwn(SWITCHES, arg)) {
      args[SWITCHES[arg as keyof typeof SWITCHES]] = true;
    } else if (arg === '--by' || arg.startsWith('--by=')) {
      const value = arg === '--by' ? argv[++i] : arg.slice('--by='.length);
      if (!value || value.startsWith('--')) return { ok: false, message: '--by needs the email of the editor who publishes' };
      args.by = value;
    } else if (arg.startsWith('--')) {
      return { ok: false, message: `unknown option ${arg}` };
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) {
    return { ok: false, message: files.length === 0 ? 'which file?' : `one file at a time (got ${files.join(', ')})` };
  }
  args.file = files[0]!;
  if (args.publish && !args.by) return { ok: false, message: '--publish needs --by <email>: the editor who publishes' };
  if (args.by && !args.publish) return { ok: false, message: '--by names who publishes, so it goes with --publish' };
  return { ok: true, args, notes };
}

export interface CommandOutput {
  log(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

/** The hub's cache, when Redis is configured and answers within a few seconds; else null (and a warning). */
async function connectCache(config: AppConfig, out: CommandOutput): Promise<{ cache: Cache; close: () => void } | null> {
  if (!config.REDIS_URL) return null;
  const redis = createRedis(config);
  // the outcome is reported below; an unanswered 'error' event would only add noise
  redis.on('error', () => undefined);
  const ready = await Promise.race([
    new Promise<boolean>((done) => redis.once('ready', () => done(true))),
    new Promise<boolean>((done) => setTimeout(() => done(false), 5_000).unref()),
  ]);
  if (!ready) {
    redis.disconnect();
    out.warn('! Redis could not be reached: the app may show the old list of stories for up to five minutes');
    return null;
  }
  return { cache: new Cache(redis), close: () => redis.disconnect() };
}

/** Run the command; answers the process's exit code (0 done, 1 refused or failed, 2 not understood). */
export async function runStoryImportCommand(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  out: CommandOutput,
): Promise<number> {
  const parsed = parseStoryImportArgs(argv, env);
  if (!parsed.ok) {
    out.error(parsed.message);
    out.error(STORY_IMPORT_USAGE);
    return 2;
  }
  const { args } = parsed;
  for (const note of parsed.notes) out.warn(note);

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolve(args.file), 'utf8'));
  } catch (err) {
    out.error(`${args.file} could not be read: ${(err as Error).message}`);
    return 1;
  }

  const config = loadConfig(env);
  if (!config.DATABASE_URL) {
    out.error('DATABASE_URL is not set.');
    return 1;
  }

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  let connected: { cache: Cache; close: () => void } | null = null;
  try {
    let publishedBy: string | undefined;
    if (args.publish) {
      const editor = await pool.query<{ id: string }>(
        `SELECT id FROM users
         WHERE email = $1 AND deleted_at IS NULL AND banned_at IS NULL AND roles && $2::text[]`,
        [args.by, [...STORY_EDITOR_ROLES]],
      );
      if (!editor.rows[0]) {
        out.error(`✗ no editor who may publish stories has the address ${args.by}; nothing imported`);
        return 1;
      }
      publishedBy = editor.rows[0].id;
      if (!args.dryRun) connected = await connectCache(config, out);
    }

    const result = await importStories(pool, raw, {
      dryRun: args.dryRun,
      publish: args.publish,
      publishedBy,
      source: args.starter ? 'starter' : 'admin',
      force: args.force,
      cache: connected?.cache ?? null,
    });

    if (!result.ok) {
      out.error(`✗ ${result.issues.length} problem(s), nothing imported:`);
      for (const issue of result.issues) out.error(`  ${issue.path}: ${issue.message}`);
      return 1;
    }

    for (const warning of result.warnings) out.warn(`! ${warning.path}: ${warning.message}`);
    for (const s of result.stories) {
      out.log(`  ${s.slug}: ${s.outcome}${s.note ? ` (${s.note})` : ''}${s.published ? `, published by ${args.by}` : ''}`);
    }
    const count = (o: string) => result.stories.filter((s) => s.outcome === o).length;
    out.log(
      `✓ ${result.dryRun ? 'would import' : 'imported'}: ${count('created')} new, ${count('updated')} updated, ` +
        `${count('unchanged')} unchanged, ${count('kept')} left as they are` +
        (result.dryRun ? ' (dry run — nothing written)' : ''),
    );
    return 0;
  } finally {
    connected?.close();
    await pool.end();
  }
}
