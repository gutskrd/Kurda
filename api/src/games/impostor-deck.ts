/**
 * Impostor's curated deck (api/content/games/impostor.json): every word card per variety, chosen and checked by hand,
 * with its category, difficulty, meaning in every interface language and, for the odd-word round, its paired word of
 * the same category.
 *
 * A file rather than the starter library's matcher (starter-library.ts), which sorted course words by English meaning
 * and so misfiled words, kept inflected forms, and put every card at the first level. Each card's hint is built from
 * its category's name (word-categories.ts), so renaming a category renames its hints.
 *
 * Seeding, once per variety (remembered in `content_seeds`):
 *   1. archive what the deck supersedes: Impostor starter rows untouched since creation (`lock_version` 0, no reviewer,
 * no editor)
 *      that did not come from the deck; person-touched rows stay;
 *   2. insert the deck's categories and cards, published like the starters (`source = 'starter'`, approved with no
 * named reviewer,
 *      shown in the admin as unread). A word a person's row still holds is left to that row, so no word is dealt twice;
 *   3. reread every pool and count afresh.
 * Step 1 runs on every start once the deck is in, so starter rows made later are superseded too; it never touches
 * anything a person has.
 *
 * An unreadable file, or a variety whose deck fails its checks, is logged and skipped: nothing here throws.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  GAME_SLUG_PATTERN,
  checkGameContent,
  foldForDialect,
  type GameDialect,
  type WordCardContent,
  type WordCategoryContent,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';
import { STARTER_CATEGORIES } from './word-categories.js';

export const IMPOSTOR_DECK_FILE = new URL('../../content/games/impostor.json', import.meta.url);
/** The deck's version: a later one is seeded once more under its own name. */
export const IMPOSTOR_DECK_VERSION = 2;

const seedName = (dialect: GameDialect): string => `game_content:impostor-deck:${IMPOSTOR_DECK_VERSION}:${dialect}`;
const KINDS = ['word_card', 'word_category'] as const;

const card = z.strictObject({
  word: z.string().trim().min(1).max(60),
  category: z.string().regex(GAME_SLUG_PATTERN),
  level: z.number().int().min(1).max(5),
  meanings: z.record(z.string(), z.string()),
  forms: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  twin: z.string().trim().min(1).max(60).optional(),
  /** false for an everyday word the course does not teach: a marker for the review list, never stored */
  taught: z.boolean().optional(),
});
const fileSchema = z.strictObject({ version: z.literal(IMPOSTOR_DECK_VERSION), kmr: z.array(card), ckb: z.array(card) });
export type ImpostorDeckFile = z.infer<typeof fileSchema>;
export type ImpostorDeckCard = z.infer<typeof card>;

/** A row the deck puts in: a card or a category, at its level, under an origin of its own. */
export interface ImpostorDeckRow {
  kind: (typeof KINDS)[number];
  level: number;
  payload: WordCardContent | WordCategoryContent;
  origin: string;
}

/** Reads a deck file's text: the deck, or why it is not one. */
export function parseImpostorDeck(text: string): { ok: true; deck: ImpostorDeckFile } | { ok: false; issues: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, issues: [`not JSON: ${(err as Error).message}`] };
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`) };
  return { ok: true, deck: parsed.data };
}

/**
 * The rows one variety's deck makes, pure, or what is wrong: each card checked as the admin checks one (schema and
 * script), no word twice, every category a starter category, and every twin another card of the same category.
 */
export function impostorDeckRows(deck: ImpostorDeckFile, dialect: GameDialect): { rows: ImpostorDeckRow[]; issues: string[] } {
  const issues: string[] = [];
  const key = (w: string): string => foldForDialect(w, dialect);
  const cards = deck[dialect];
  const byWord = new Map<string, ImpostorDeckCard>();
  for (const c of cards) {
    if (byWord.has(key(c.word))) issues.push(`${c.word}: the deck has this word twice`);
    byWord.set(key(c.word), c);
  }
  const rows: ImpostorDeckRow[] = [];
  const used = new Map<string, number>();
  for (const c of cards) {
    const category = STARTER_CATEGORIES.find((x) => x.slug === c.category);
    if (!category) {
      issues.push(`${c.word}: no category is called ${c.category}`);
      continue;
    }
    if (c.twin !== undefined) {
      const twin = byWord.get(key(c.twin));
      if (!twin || twin.category !== c.category || key(c.twin) === key(c.word)) issues.push(`${c.word}: its twin ${c.twin} is not another card of ${c.category}`);
    }
    const payload = {
      word: c.word.normalize('NFC'),
      meanings: c.meanings,
      category: c.category,
      hint: { ku: category.name[dialect], meanings: category.meanings },
      forms: c.forms ?? [],
      ...(c.twin !== undefined ? { twin: c.twin.normalize('NFC') } : {}),
    };
    const checked = checkGameContent('word_card', dialect, payload);
    if (!checked.ok) {
      issues.push(`${c.word}: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
      continue;
    }
    rows.push({ kind: 'word_card', level: c.level, payload: checked.payload, origin: `deck:impostor:${dialect}:${payload.word}` });
    used.set(c.category, Math.min(used.get(c.category) ?? 5, c.level));
  }
  for (const category of STARTER_CATEGORIES) {
    const level = used.get(category.slug);
    if (level === undefined) continue;
    const checked = checkGameContent('word_category', dialect, { slug: category.slug, ku: category.name[dialect], meanings: category.meanings });
    if (!checked.ok) issues.push(`category ${category.slug}: ${checked.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
    else rows.push({ kind: 'word_category', level, payload: checked.payload, origin: `deck:impostor:${dialect}:category:${category.slug}` });
  }
  return { rows, issues };
}

/** Archive, in one variety, the untouched Impostor starter rows not from the deck. Returns how many. */
async function archiveSuperseded(db: Pick<pg.PoolClient, 'query'>, dialect: GameDialect): Promise<number> {
  const res = await db.query(
    `UPDATE game_content
        SET status = 'archived', lock_version = lock_version + 1
      WHERE dialect = $1 AND kind = ANY($2::text[]) AND source = 'starter' AND status = 'published'
        AND lock_version = 0 AND reviewed_by IS NULL AND updated_by IS NULL
        AND (origin IS NULL OR origin NOT LIKE 'deck:%')`,
    [dialect, [...KINDS]],
  );
  return res.rowCount ?? 0;
}

export interface ImpostorDeckResult {
  /** the varieties whose deck went in on this start */
  seeded: GameDialect[];
  /** rows put in, all varieties together */
  made: number;
  /** starter rows the deck superseded, all varieties together */
  archived: number;
}

export async function seedImpostorDeck(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  cache: Cache | null = null,
  file: URL = IMPOSTOR_DECK_FILE,
  dialects: readonly GameDialect[] = GAME_DIALECTS,
): Promise<ImpostorDeckResult> {
  const result: ImpostorDeckResult = { seeded: [], made: 0, archived: 0 };
  try {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      log.warn({ err, file: file.pathname }, 'the Impostor deck could not be read; skipped');
      return result;
    }
    const parsed = parseImpostorDeck(text);
    if (!parsed.ok) {
      log.warn({ file: file.pathname, issues: parsed.issues }, 'the Impostor deck is not readable; skipped');
      return result;
    }
    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [dialects.map(seedName)]);
    const marked = new Set(done.rows.map((r) => r.name));
    for (const dialect of dialects) {
      if (marked.has(seedName(dialect))) {
        // in already: supersede anything the starter library made since, which touches no row a person has
        try {
          result.archived += await archiveSuperseded(pool, dialect);
        } catch (err) {
          log.warn({ err, dialect }, 'the Impostor deck could not supersede the starter cards');
        }
        continue;
      }
      const { rows, issues } = impostorDeckRows(parsed.deck, dialect);
      if (issues.length > 0) {
        log.warn({ dialect, issues: issues.slice(0, 20) }, 'the Impostor deck has errors; not seeded until they are fixed');
        continue;
      }
      if (rows.length === 0) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const archived = await archiveSuperseded(client, dialect);
        // a word or category a person's own live row still holds is left to that row
        const made = await client.query(
          `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
           SELECT d.kind, $1::text, d.level, d.payload, 'starter', d.origin, 'published', 'approved', now(), now()
             FROM jsonb_to_recordset($2::jsonb) AS d(kind text, level smallint, payload jsonb, origin text)
            WHERE NOT EXISTS (
              SELECT 1 FROM game_content g
               WHERE g.kind = d.kind AND g.dialect = $1 AND g.status <> 'archived'
                 AND (g.origin IS NULL OR g.origin NOT LIKE 'deck:%')
                 AND CASE WHEN d.kind = 'word_card' THEN lower(g.payload->>'word') = lower(d.payload->>'word')
                          ELSE g.payload->>'slug' = d.payload->>'slug' END)
           ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING`,
          [dialect, JSON.stringify(rows)],
        );
        await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(dialect)]);
        await client.query('COMMIT');
        result.seeded.push(dialect);
        result.made += made.rowCount ?? 0;
        result.archived += archived;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, dialect }, 'the Impostor deck could not be seeded');
      } finally {
        client.release();
      }
    }
    if (result.made > 0 || result.archived > 0) {
      // what learners can be dealt changed: every pool and every count is read afresh
      await bustGamePools(cache);
      await bustAvailability(cache);
      log.info({ ...result }, 'the Impostor deck is in: curated cards published, the starter cards it replaces archived');
    }
  } catch (err) {
    log.warn({ err }, 'the Impostor deck could not be seeded');
  }
  return result;
}
