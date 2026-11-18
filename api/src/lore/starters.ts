/**
 * The starter riddles and proverbs (api/content/games/riddles.json and proverbs.json), seeded once and published.
 * Each entry becomes a `starter` row in its variety (shared/src/lore.ts), published and approved with every
 * translation unreviewed, since publishing does not claim a native speaker checked it; the reviewer note goes in
 * `notes`, which learner routes never send. A riddle's level is its difficulty's; a proverb's is the file's `level`,
 * else the middle one.
 *
 * Until someone changes a starter in the admin (which sets `updated_by`), the file is its source: each start brings
 * the row and its untouched translations up to the file. An entry is checked whole first (`checkGameContent`,
 * `checkLoreTranslation`); a bad one is logged and left for a later start. Seeds are remembered in `content_seeds`,
 * so a deleted starter stays gone. `"status": "held"` seeds a draft that is never published (a live untouched row
 * returns to draft); `"retired"` is never seeded and archives an untouched row. Nothing here throws, so a broken file
 * never stops the API.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  RIDDLE_LEVELS,
  checkGameContent,
  checkLoreTranslation,
  isAppLocale,
  type AppLocale,
  type GameContentIssue,
  type GameDialect,
  type LoreKind,
  type LoreTranslation,
  type RiddleContent,
} from '@kurda/shared';

export const STARTER_LORE_FILES: Readonly<Record<LoreKind, URL>> = {
  riddle: new URL('../../content/games/riddles.json', import.meta.url),
  proverb: new URL('../../content/games/proverbs.json', import.meta.url),
};

/** The middle level, for a proverb whose file gives none. */
const PROVERB_LEVEL = 3;

const seedName = (kind: LoreKind, slug: string): string => `game_content:starter:${kind}:${slug}`;

/** What the file says of an entry beside its text: live (no status), held back, or taken out. */
export const STARTER_LORE_STATUSES = ['held', 'retired'] as const;
export type StarterLoreStatus = 'live' | (typeof STARTER_LORE_STATUSES)[number];

const entry = z.looseObject({
  slug: z.string(),
  dialect: z.enum(GAME_DIALECTS),
  translations: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().nullish(),
  level: z.number().int().min(1).max(5).optional(),
  status: z.enum(STARTER_LORE_STATUSES).optional(),
});
const fileSchemas = {
  riddle: z.object({ riddles: z.array(entry) }),
  proverb: z.object({ proverbs: z.array(entry) }),
} as const;

/** A value without the keys a file leaves null or empty, so optional fields are absent rather than blank. */
function tidy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(tidy);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''))
        .map(([k, v]) => [k, tidy(v)]),
    );
  }
  return value;
}

/** One entry as it will be written: its row and its translations, or every problem with it. */
export type StarterLore =
  | {
      ok: true;
      slug: string;
      dialect: GameDialect;
      level: number;
      status: StarterLoreStatus;
      payload: unknown;
      translations: Array<{ locale: AppLocale; payload: LoreTranslation }>;
    }
  | { ok: false; slug: string; issues: GameContentIssue[] };

/** A file's entries, each checked whole (pure, for the tests and for the seeding). */
export function starterLore(kind: LoreKind, file: unknown): { entries: StarterLore[] } | { unreadable: string } {
  const parsed = fileSchemas[kind].safeParse(file);
  if (!parsed.success) return { unreadable: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const list = 'riddles' in parsed.data ? parsed.data.riddles : parsed.data.proverbs;
  const entries = list.map((raw): StarterLore => {
    const { translations, dialect, level, notes, status, ...rest } = tidy(raw) as z.infer<typeof entry> & Record<string, unknown>;
    const checked = checkGameContent(kind, dialect, { ...rest, ...(notes ? { notes } : {}) });
    if (!checked.ok) return { ok: false, slug: String(raw.slug), issues: checked.issues };
    const hints = kind === 'riddle' ? (checked.payload as RiddleContent).hints.length : undefined;
    const issues: GameContentIssue[] = [];
    const out: Array<{ locale: AppLocale; payload: LoreTranslation }> = [];
    for (const [locale, t] of Object.entries(translations ?? {})) {
      if (!isAppLocale(locale)) {
        issues.push({ path: `translations.${locale}`, message: 'not one of the app’s languages' });
        continue;
      }
      const tr = checkLoreTranslation(kind, { dialect, hints }, locale, t);
      if (tr.ok) out.push({ locale, payload: tr.payload });
      else issues.push(...tr.issues.map((i) => ({ path: `translations.${locale}${i.path ? `.${i.path}` : ''}`, message: i.message })));
    }
    if (issues.length > 0) return { ok: false, slug: String(raw.slug), issues };
    const stored = kind === 'riddle' ? RIDDLE_LEVELS[(checked.payload as RiddleContent).difficulty] : (level ?? PROVERB_LEVEL);
    return { ok: true, slug: String(raw.slug), dialect, level: stored, status: status ?? 'live', payload: checked.payload, translations: out };
  });
  return { entries };
}

export async function seedStarterLore(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  files: Readonly<Record<LoreKind, URL>> = STARTER_LORE_FILES,
): Promise<{ seeded: string[]; refreshed: string[]; published: string[]; held: string[]; retired: string[] }> {
  const seeded: string[] = [];
  const refreshed: string[] = [];
  const published: string[] = [];
  const held: string[] = [];
  const retired: string[] = [];
  for (const kind of Object.keys(files) as LoreKind[]) {
    try {
      let read: ReturnType<typeof starterLore>;
      try {
        read = starterLore(kind, JSON.parse(await readFile(files[kind], 'utf8')));
      } catch (err) {
        log.warn({ err, file: files[kind].pathname }, 'starter riddles or proverbs could not be read; skipped');
        continue;
      }
      if ('unreadable' in read) {
        log.warn({ file: files[kind].pathname, issues: read.unreadable.slice(0, 600) }, 'starter riddles or proverbs file is not readable; skipped');
        continue;
      }
      if (read.entries.length === 0) continue;
      const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [read.entries.map((e) => seedName(kind, e.slug))]);
      const marked = new Set(done.rows.map((r) => r.name));
      for (const e of read.entries) {
        if (marked.has(seedName(kind, e.slug))) continue;
        if (!e.ok) {
          log.warn({ kind, slug: e.slug, issues: e.issues.slice(0, 10) }, 'starter riddle or proverb has errors; not seeded until they are fixed');
          continue;
        }
        // a starter taken out of the collection is never put in
        if (e.status === 'retired') continue;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const row = await client.query<{ id: string }>(
            `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status)
             VALUES ($1, $2, $3, $4::jsonb, 'starter', $5, 'draft', 'unreviewed')
             ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING
             RETURNING id`,
            [kind, e.dialect, e.level, JSON.stringify(e.payload), `starter:${e.slug}`],
          );
          const id = row.rows[0]?.id;
          if (id && e.translations.length > 0) {
            await client.query(
              `INSERT INTO game_content_translations (content_id, locale, payload)
               SELECT $1::uuid, t.locale, t.payload FROM jsonb_to_recordset($2::jsonb) AS t(locale text, payload jsonb)`,
              [id, JSON.stringify(e.translations)],
            );
          }
          await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(kind, e.slug)]);
          await client.query('COMMIT');
          if (id) seeded.push(`${kind}:${e.slug}`);
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          log.warn({ err, kind, slug: e.slug }, 'starter riddle or proverb could not be seeded');
        } finally {
          client.release();
        }
      }
      // Every starter nobody has changed is brought up to its file, and published, held or archived as it says.
      for (const e of read.entries) {
        if (!e.ok) continue;
        const outcome = await keepCurrent(pool, kind, e);
        if (outcome === 'failed') {
          log.warn({ kind, slug: e.slug }, 'starter riddle or proverb could not be brought up to its file');
          continue;
        }
        if (outcome.refreshed) refreshed.push(`${kind}:${e.slug}`);
        if (outcome.published) published.push(`${kind}:${e.slug}`);
        if (outcome.held) held.push(`${kind}:${e.slug}`);
        if (outcome.retired) retired.push(`${kind}:${e.slug}`);
      }
    } catch (err) {
      log.warn({ err, kind }, 'starter riddles or proverbs could not be seeded');
    }
  }
  if (seeded.length > 0) log.info({ seeded }, 'starter riddles and proverbs seeded');
  if (refreshed.length > 0) log.info({ refreshed }, 'starter riddles and proverbs brought up to their files');
  if (published.length > 0) log.info({ published }, 'starter riddles and proverbs published');
  if (held.length > 0) log.info({ held }, 'starter riddles and proverbs held back as drafts');
  if (retired.length > 0) log.info({ retired }, 'starter riddles and proverbs retired');
  return { seeded, refreshed, published, held, retired };
}

/** A value as text with its keys in order, so a jsonb row compares equal to the file it came from. */
function stable(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)]))
        : v;
  return JSON.stringify(sorted(value));
}

/**
 * Brings one untouched starter up to its file under a row lock: its text, level and each translation no reviewer
 * has touched (new ones are added). A held one stays or returns to draft; a retired one is archived.
 */
async function keepCurrent(
  pool: pg.Pool,
  kind: LoreKind,
  e: Extract<StarterLore, { ok: true }>,
): Promise<{ refreshed: boolean; published: boolean; held: boolean; retired: boolean } | 'failed'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (e.status === 'retired') {
      const gone = await client.query(
        `UPDATE game_content SET status = 'archived', lock_version = lock_version + 1
          WHERE kind = $1 AND dialect = $2 AND origin = $3 AND source = 'starter' AND updated_by IS NULL AND status IN ('draft', 'published')`,
        [kind, e.dialect, `starter:${e.slug}`],
      );
      await client.query('COMMIT');
      return { refreshed: false, published: false, held: false, retired: (gone.rowCount ?? 0) > 0 };
    }
    const found = await client.query<{ id: string; status: string; level: number; payload: unknown }>(
      `SELECT id, status, level, payload FROM game_content
        WHERE kind = $1 AND dialect = $2 AND origin = $3 AND source = 'starter' AND updated_by IS NULL AND status IN ('draft', 'published')
        FOR UPDATE`,
      [kind, e.dialect, `starter:${e.slug}`],
    );
    const row = found.rows[0];
    let refreshed = false;
    let published = false;
    let held = false;
    if (row) {
      if (row.level !== e.level || stable(row.payload) !== stable(e.payload)) {
        // the version moves, so an editor with the row open reloads before saving over it
        await client.query(`UPDATE game_content SET payload = $2::jsonb, level = $3, lock_version = lock_version + 1 WHERE id = $1`, [
          row.id,
          JSON.stringify(e.payload),
          e.level,
        ]);
        refreshed = true;
      }
      const stored = await client.query<{ locale: string; payload: unknown; untouched: boolean }>(
        `SELECT locale, payload, (updated_by IS NULL AND review_status = 'unreviewed') AS untouched
           FROM game_content_translations WHERE content_id = $1`,
        [row.id],
      );
      const byLocale = new Map(stored.rows.map((t) => [t.locale, t]));
      for (const t of e.translations) {
        const have = byLocale.get(t.locale);
        if (!have) {
          await client.query(`INSERT INTO game_content_translations (content_id, locale, payload) VALUES ($1, $2, $3::jsonb)`, [
            row.id,
            t.locale,
            JSON.stringify(t.payload),
          ]);
          refreshed = true;
        } else if (have.untouched && stable(have.payload) !== stable(t.payload)) {
          await client.query(`UPDATE game_content_translations SET payload = $3::jsonb, updated_at = now() WHERE content_id = $1 AND locale = $2`, [
            row.id,
            t.locale,
            JSON.stringify(t.payload),
          ]);
          refreshed = true;
        }
      }
      if (e.status === 'held' && row.status === 'published') {
        // back to a draft until a native speaker has confirmed it: the version moves, as for any change
        await client.query(
          `UPDATE game_content SET status = 'draft', review_status = 'unreviewed', lock_version = lock_version + 1 WHERE id = $1`,
          [row.id],
        );
        held = true;
      } else if (e.status === 'live' && row.status === 'draft') {
        await client.query(
          `UPDATE game_content SET status = 'published', review_status = 'approved', reviewed_at = now(), published_at = now() WHERE id = $1`,
          [row.id],
        );
        published = true;
      }
    }
    await client.query('COMMIT');
    return { refreshed, published, held, retired: false };
  } catch {
    await client.query('ROLLBACK').catch(() => undefined);
    return 'failed';
  } finally {
    client.release();
  }
}
