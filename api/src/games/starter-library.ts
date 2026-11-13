/**
 * The starter library: each learning game's first set of rows, made once from
 * the course Hevalo ships and put straight in front of learners, so that a
 * game can be played the day it is installed rather than the day somebody has
 * approved several hundred cards one at a time.
 *
 * What it makes, per variety, from the lessons and stories as they stand
 * (`TrustedSources` in its `course` scope: every lesson and story that is not
 * archived, published or not yet):
 *
 *   passage        The Memory Thief          stories' paragraphs, and conversations a few lines at a time
 *   word_card      Impostor          the course's words, sorted into the starter categories
 *   word_category  Impostor          the categories themselves
 *   identity       Who Am I?                 the course's words for the things the starter table knows
 *   sentence       Build a Sentence  the lessons' sentences, for the lessons' practice
 *
 * None of these rows holds Kurdish of its own. The words, lines and
 * paragraphs are copied from the course, as the admin panel's importers copy
 * them (content-drafts.ts makes both); the only Kurdish written for the games
 * is the starter categories' names and the starter questions of Who Am I?,
 * which are listed for a native speaker like any other new Kurdish.
 *
 * The rows go in published (`source = 'starter'`, approved, with no reviewer
 * named: the admin panel shows such a row as not yet read by a person). The
 * same step publishes what was already waiting as an untouched draft: the
 * starter questions and the starter case, and anything an importer made that
 * nobody has opened since (`lock_version = 0`). A row a person has edited,
 * sent back, unpublished or archived is theirs and is left exactly as it is.
 *
 * It runs once per variety: a row in `content_seeds` remembers it, so a row
 * an editor deletes afterwards stays gone, and nothing is published behind an
 * editor's back on a later start. A variety whose course is not in the
 * database yet makes nothing and is tried again on the next start. Nothing
 * here throws: a failure is logged and the API starts without it.
 */
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { GAME_DIALECTS, type GameContentKind, type GameDialect } from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { bustAvailability } from './availability.js';
import {
  conversationPassageDrafts,
  identityDrafts,
  passageDrafts,
  sentenceDrafts,
  wordCardDrafts,
  type ContentDraft,
} from './content-drafts.js';
import { TrustedSources, bustGamePools } from './sources.js';

/** The library's version: a later one, with more in it, is seeded once more under its own name. */
export const STARTER_LIBRARY_VERSION = 1;

const seedName = (dialect: GameDialect): string => `game_content:starter-library:${STARTER_LIBRARY_VERSION}:${dialect}`;

export interface StarterLibraryResult {
  dialect: GameDialect;
  /** rows put in, by kind */
  made: Partial<Record<GameContentKind, number>>;
  /** untouched drafts that were waiting, now published */
  published: number;
}

/** Everything the library makes for a variety, by kind (pure but for its reads). */
export async function starterLibraryRows(sources: TrustedSources, dialect: GameDialect): Promise<Array<{ kind: GameContentKind; rows: ContentDraft[] }>> {
  const [stories, conversations, words, identities, sentences] = await Promise.all([
    passageDrafts(sources, dialect),
    conversationPassageDrafts(sources, dialect),
    wordCardDrafts(sources, dialect, 1500),
    identityDrafts(sources, dialect),
    sentenceDrafts(sources, dialect, 1500),
  ]);
  return [
    { kind: 'passage', rows: [...stories, ...conversations] },
    { kind: 'word_category', rows: words.categories },
    { kind: 'word_card', rows: words.cards },
    { kind: 'identity', rows: identities },
    { kind: 'sentence', rows: sentences },
  ];
}

export async function seedStarterLibrary(
  pool: pg.Pool,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  cache: Cache | null = null,
  dialects: readonly GameDialect[] = GAME_DIALECTS,
): Promise<StarterLibraryResult[]> {
  const results: StarterLibraryResult[] = [];
  try {
    const done = await pool.query<{ name: string }>(`SELECT name FROM content_seeds WHERE name = ANY($1::text[])`, [dialects.map(seedName)]);
    const marked = new Set(done.rows.map((r) => r.name));
    // the course as it stands, read afresh: nothing here is kept, so nothing a game reads is touched
    const sources = new TrustedSources(pool, null, Date.now, 'course');
    for (const dialect of dialects) {
      if (marked.has(seedName(dialect))) continue;
      try {
        const kinds = await starterLibraryRows(sources, dialect);
        // a variety whose course has not been loaded yet has nothing to copy: it waits for a later start
        if (kinds.every((k) => k.rows.length === 0)) continue;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const made: Partial<Record<GameContentKind, number>> = {};
          for (const { kind, rows } of kinds) {
            if (rows.length === 0) continue;
            const res = await client.query(
              `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at)
               SELECT $1::text, $2::text, d.level, d.payload, 'starter', d.origin, 'published', 'approved', now(), now()
                 FROM jsonb_to_recordset($3::jsonb) AS d(level smallint, payload jsonb, origin text)
               ON CONFLICT (kind, dialect, origin) WHERE origin IS NOT NULL DO NOTHING`,
              [kind, dialect, JSON.stringify(rows)],
            );
            if ((res.rowCount ?? 0) > 0) made[kind] = res.rowCount ?? 0;
          }
          // what was already waiting exactly as it was made: the starters seeded as drafts, and an import nobody has opened since
          const madeOf = kinds.flatMap((k) => k.rows.map((r) => ({ kind: k.kind, origin: r.origin })));
          const waiting = await client.query(
            `UPDATE game_content
                SET status = 'published', review_status = 'approved', reviewed_at = now(), published_at = now(), lock_version = lock_version + 1
              WHERE dialect = $1 AND status = 'draft' AND review_status = 'unreviewed' AND lock_version = 0
                AND (source = 'starter' OR (kind, origin) IN (SELECT * FROM unnest($2::text[], $3::text[])))`,
            [dialect, madeOf.map((m) => m.kind), madeOf.map((m) => m.origin)],
          );
          await client.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName(dialect)]);
          await client.query('COMMIT');
          results.push({ dialect, made, published: waiting.rowCount ?? 0 });
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        log.warn({ err, dialect }, 'the games’ starter library could not be seeded');
      }
    }
    if (results.length > 0) {
      // what learners can be shown changed: every pool and every count is read afresh
      await bustGamePools(cache);
      await bustAvailability(cache);
      for (const r of results) log.info({ ...r }, 'the games’ starter library is in: rows made from the course, published');
    }
  } catch (err) {
    log.warn({ err }, 'the games’ starter library could not be seeded');
  }
  return results;
}
