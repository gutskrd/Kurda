/**
 * The starter riddles and proverbs (api/content/games/riddles.json and
 * proverbs.json), seeded once each as drafts for a native speaker to read.
 *
 * Each entry in a file is one row in its variety, written the way the
 * collections are (shared/src/lore.ts): the Kurdish fields, its sources, a
 * note for its reviewers, and its translations into the other app languages.
 * Seeding makes it a `starter` draft, unreviewed, with every translation
 * unreviewed beside it; nothing reaches a learner until a reviewer approves
 * it and an editor publishes it. The note for the reviewers is kept in the
 * row (`notes`), which the learner routes never send. A riddle's level is its
 * difficulty's; a proverb's is the file's `level`, else the middle one.
 *
 * An entry is checked whole before anything of it is written — the row by
 * `checkGameContent`, each translation by `checkLoreTranslation` — and one
 * with any problem is logged and left for a later start, once the file is
 * fixed. A seeded one is remembered in `content_seeds`, as the starter
 * stories and the first case are, so a starter an editor deleted stays gone.
 * Nothing here throws: a broken file must not stop the API starting.
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

const entry = z.looseObject({
  slug: z.string(),
  dialect: z.enum(GAME_DIALECTS),
  translations: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().nullish(),
  level: z.number().int().min(1).max(5).optional(),
});
const fileSchemas = {
  riddle: z.object({ riddles: z.array(entry) }),
  proverb: z.object({ proverbs: z.array(entry) }),
} as const;

/** A value without the keys a file leaves null or empty: an optional field absent rather than blank. */
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
  | { ok: true; slug: string; dialect: GameDialect; level: number; payload: unknown; translations: Array<{ locale: AppLocale; payload: LoreTranslation }> }
  | { ok: false; slug: string; issues: GameContentIssue[] };

/** A file's entries, each checked whole (pure, for the tests and for the seeding). */
export function starterLore(kind: LoreKind, file: unknown): { entries: StarterLore[] } | { unreadable: string } {
  const parsed = fileSchemas[kind].safeParse(file);
  if (!parsed.success) return { unreadable: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const list = 'riddles' in parsed.data ? parsed.data.riddles : parsed.data.proverbs;
  const entries = list.map((raw): StarterLore => {
    const { translations, dialect, level, notes, ...rest } = tidy(raw) as z.infer<typeof entry> & Record<string, unknown>;
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
    return { ok: true, slug: String(raw.slug), dialect, level: stored, payload: checked.payload, translations: out };
  });
  return { entries };
}

export async function seedStarterLore(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  files: Readonly<Record<LoreKind, URL>> = STARTER_LORE_FILES,
): Promise<{ seeded: string[] }> {
  const seeded: string[] = [];
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
    } catch (err) {
      log.warn({ err, kind }, 'starter riddles or proverbs could not be seeded');
    }
  }
  if (seeded.length > 0) log.info({ seeded }, 'starter riddles and proverbs seeded as drafts');
  return { seeded };
}
