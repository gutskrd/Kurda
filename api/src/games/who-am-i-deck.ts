/**
 * Who Am I?'s curated deck (api/content/games/who-am-i.json): every card and question per variety, written and checked
 * by hand, published once per deck version.
 *
 * A file rather than course glosses alone: the starter library matched English meanings against a table and published
 * unread results, mislabelling things. A card is a set of facts only a person can judge, so the deck states them, with
 * "sometimes" where honest people could answer either way, and leaves out questions that make no sense for the card's
 * kind.
 *
 * The file holds, per variety:
 *   questions    one per fact: the question, with its meaning in the app's languages and the other variety;
 *   identities   one per card: the word, its kind, its level (that of the course unit first teaching the word; an
 * untaught word,
 *                `taught: false`, sits beside equally easy words), its meanings and the other variety's word, and its
 * facts.
 * Every row is checked with `checkGameContent` before anything is written, and a file with any problem is not seeded.
 *
 * Seeding (`seedWhoAmIDeck`), once per variety and deck version (`content_seeds`:
 * `game_content:who-am-i-deck:<version>:<variety>`), one transaction per variety:
 *   1. the deck's cards and questions go in published as starters, each with its origin (`deck:who-am-i:<variety>:<word
 * or fact>`);
 *      an untouched row from an earlier deck is updated to the file, so later versions correct earlier ones;
 *   2. every other untouched starter card and question of the variety (the matcher's cards, the migration's first
 * questions, cards a
 *      later deck drops) is archived;
 *   3. a row a person edited or reviewed (`updated_by`, `reviewed_by`) stays exactly as it is.
 * Then every pool and count is reread. Nothing here throws: a failure is logged and the API starts without it.
 */
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import {
  GAME_DIALECTS,
  WHO_AM_I_CATEGORIES,
  checkGameContent,
  isWhoAmIFact,
  type GameContentIssue,
  type GameDialect,
  type IdentityContent,
  type QuestionTemplateContent,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';

export const WHO_AM_I_DECK_FILE = new URL('../../content/games/who-am-i.json', import.meta.url);

const text = z.record(z.string(), z.string());
const question = z.strictObject({ fact: z.string(), ku: z.string(), meanings: text });
const card = z.strictObject({
  word: z.string(),
  category: z.enum(WHO_AM_I_CATEGORIES),
  level: z.number().int().min(1).max(5),
  taught: z.boolean(),
  meanings: text,
  facts: z.record(z.string(), z.union([z.boolean(), z.literal('sometimes')])),
});
const deckFile = z.strictObject({
  version: z.number().int().min(1),
  questions: z.strictObject({ kmr: z.array(question), ckb: z.array(question) }),
  identities: z.strictObject({ kmr: z.array(card), ckb: z.array(card) }),
});

/** One row of the deck, ready to store. */
export interface WhoAmIDeckRow<P> {
  level: number;
  payload: P;
  origin: string;
}

export interface WhoAmIDeck {
  version: number;
  rows: Record<GameDialect, { identities: Array<WhoAmIDeckRow<IdentityContent> & { taught: boolean }>; templates: Array<WhoAmIDeckRow<QuestionTemplateContent>> }>;
}

export const deckOrigin = (dialect: GameDialect, name: string): string => `deck:who-am-i:${dialect}:${name}`;

/** The deck a file holds, every row checked as a game reads it, or every problem with it at once (pure). */
export function whoAmIDeck(file: unknown): { ok: true; deck: WhoAmIDeck } | { ok: false; issues: GameContentIssue[] } {
  const parsed = deckFile.safeParse(file);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  const issues: GameContentIssue[] = [];
  const rows = {} as WhoAmIDeck['rows'];
  for (const dialect of GAME_DIALECTS) {
    const templates: WhoAmIDeck['rows'][GameDialect]['templates'] = [];
    const asked = new Set<string>();
    parsed.data.questions[dialect].forEach((q, i) => {
      const at = `questions.${dialect}.${i}`;
      if (!isWhoAmIFact(q.fact)) issues.push({ path: `${at}.fact`, message: `${q.fact} is not a fact the game knows` });
      if (asked.has(q.fact)) issues.push({ path: `${at}.fact`, message: `a second question for ${q.fact}` });
      asked.add(q.fact);
      const checked = checkGameContent('question_template', dialect, { ku: q.ku, meanings: q.meanings, fact: q.fact });
      if (!checked.ok) issues.push(...checked.issues.map((x) => ({ path: `${at}.${x.path}`, message: x.message })));
      else templates.push({ level: 1, payload: checked.payload, origin: deckOrigin(dialect, q.fact) });
    });
    const identities: WhoAmIDeck['rows'][GameDialect]['identities'] = [];
    const words = new Set<string>();
    parsed.data.identities[dialect].forEach((c, i) => {
      const at = `identities.${dialect}.${i}`;
      for (const fact of Object.keys(c.facts)) if (!isWhoAmIFact(fact)) issues.push({ path: `${at}.facts.${fact}`, message: 'not a fact the game knows' });
      // a fact the deck asks nothing about could never be answered: every fact a card sets has its question
      for (const fact of Object.keys(c.facts)) if (isWhoAmIFact(fact) && !asked.has(fact)) issues.push({ path: `${at}.facts.${fact}`, message: 'no question asks this' });
      if (words.has(c.word)) issues.push({ path: `${at}.word`, message: `${c.word} is in the deck twice` });
      words.add(c.word);
      const checked = checkGameContent('identity', dialect, { word: c.word, meanings: c.meanings, category: c.category, facts: c.facts });
      if (!checked.ok) issues.push(...checked.issues.map((x) => ({ path: `${at}.${x.path}`, message: x.message })));
      else identities.push({ level: c.level, payload: checked.payload, origin: deckOrigin(dialect, c.word), taught: c.taught });
    });
    rows[dialect] = { identities, templates };
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, deck: { version: parsed.data.version, rows } };
}

/** The deck file as it is on disk, read and checked. */
export async function readWhoAmIDeck(file: URL = WHO_AM_I_DECK_FILE): Promise<ReturnType<typeof whoAmIDeck>> {
  return whoAmIDeck(JSON.parse(await readFile(file, 'utf8')));
}

/** The `content_seeds` row that says a variety's deck of a version is in. */
export const whoAmIDeckSeedName = (version: number, dialect: GameDialect): string => `game_content:who-am-i-deck:${version}:${dialect}`;

export interface WhoAmIDeckResult {
  dialect: GameDialect;
  /** rows put in for the first time */
  made: number;
  /** rows of an earlier deck nobody had touched, brought in line with the file */
  refreshed: number;
  /** starter rows the deck replaces, nobody having touched them */
  archived: number;
}

export async function seedWhoAmIDeck(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  cache: Cache | null = null,
  dialects: readonly GameDialect[] = GAME_DIALECTS,
  file: URL = WHO_AM_I_DECK_FILE,
): Promise<WhoAmIDeckResult[]> {
  const results: WhoAmIDeckResult[] = [];
  try {
    let read: Awaited<ReturnType<typeof readWhoAmIDeck>>;
    try {
      read = await readWhoAmIDeck(file);
    } catch (err) {
      log.warn({ err, file: file.pathname }, 'the Who Am I? deck could not be read; skipped');
      return results;
    }
    if (!read.ok) {
      log.warn({ file: file.pathname, issues: read.issues.slice(0, 20) }, 'the Who Am I? deck has problems; nothing of it was seeded');
      return results;
    }
    const { deck } = read;
    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [dialects.map((d) => whoAmIDeckSeedName(deck.version, d))]);
    const marked = new Set(done.rows.map((r) => r.name));
    for (const dialect of dialects) {
      if (marked.has(whoAmIDeckSeedName(deck.version, dialect))) continue;
      const { identities, templates } = deck.rows[dialect];
      // a variety with nothing in the file keeps what it has: an empty deck is no reason to archive a game
      if (identities.length === 0 || templates.length === 0) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let made = 0;
        let refreshed = 0;
        for (const [kind, rows] of [
          ['identity', identities.map(({ level, payload, origin }) => ({ level, payload, origin }))],
          ['question_template', templates],
        ] as const) {
          const res = await client.query<{ made: boolean }>(
            `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
             SELECT $1::text, $2::text, d.level, d.payload, 'starter', d.origin, 'published', 'approved', now(), now()
               FROM jsonb_to_recordset($3::jsonb) AS d(level smallint, payload jsonb, origin text)
             ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO UPDATE
                SET level = EXCLUDED.level, payload = EXCLUDED.payload, status = 'published', review_status = 'approved',
                    reviewed_at = COALESCE(game_content.reviewed_at, now()), published_at = COALESCE(game_content.published_at, now()),
                    lock_version = game_content.lock_version + 1
              WHERE game_content.source = 'starter' AND game_content.updated_by IS NULL AND game_content.reviewed_by IS NULL
                AND (game_content.payload IS DISTINCT FROM EXCLUDED.payload OR game_content.level IS DISTINCT FROM EXCLUDED.level
                     OR game_content.status <> 'published')
             RETURNING (xmax = 0) AS made`,
            [kind, dialect, JSON.stringify(rows)],
          );
          for (const r of res.rows) {
            if (r.made) made++;
            else refreshed++;
          }
        }
        // what the deck replaces: every starter card and question of the variety it does not hold, that nobody has touched
        const kept = [...identities.map((r) => ['identity', r.origin]), ...templates.map((r) => ['question_template', r.origin])];
        const archived = await client.query(
          `UPDATE game_content SET status = 'archived', lock_version = lock_version + 1
            WHERE dialect = $1 AND kind IN ('identity', 'question_template') AND source = 'starter' AND status <> 'archived'
              AND updated_by IS NULL AND reviewed_by IS NULL
              AND (origin IS NULL OR (kind, origin) NOT IN (SELECT * FROM unnest($2::text[], $3::text[])))`,
          [dialect, kept.map((k) => k[0]), kept.map((k) => k[1])],
        );
        await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [whoAmIDeckSeedName(deck.version, dialect)]);
        await client.query('COMMIT');
        results.push({ dialect, made, refreshed, archived: archived.rowCount ?? 0 });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        log.warn({ err, dialect }, 'the Who Am I? deck could not be seeded');
      } finally {
        client.release();
      }
    }
    if (results.length > 0) {
      // what learners can be dealt changed: every pool and every count is read afresh
      await bustGamePools(cache);
      await bustAvailability(cache);
      for (const r of results) log.info({ ...r, version: deck.version }, 'the Who Am I? deck is in: its cards and questions published, the rows it replaces archived');
    }
  } catch (err) {
    log.warn({ err }, 'the Who Am I? deck could not be seeded');
  }
  return results;
}
