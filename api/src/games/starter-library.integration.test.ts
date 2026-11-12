/**
 * The games' starter library against a real database: it reads the course as
 * it stands (a draft story here), puts each game's first rows in published,
 * publishes what was waiting untouched and leaves alone what a person has
 * touched, and does all of it once. Needs DATABASE_URL.
 *
 * Whatever the test changes it puts back: the rows it made are deleted and
 * the rows it published are drafts again, so the suites that count a
 * variety's content find it as they left it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { TrustedSources } from './sources.js';
import { STARTER_LIBRARY_VERSION, seedStarterLibrary } from './starter-library.js';

const DATABASE_URL = process.env.DATABASE_URL;
const tag = `lib${Date.now().toString(36)}`;
const quiet = { info: () => undefined, warn: () => undefined };
const seedName = `game_content:starter-library:${STARTER_LIBRARY_VERSION}:kmr`;

/** Two paragraphs, each holding two of the glossary's words: two passages for The Memory Thief. */
const BODY = `Îro Rojîn diçe dibistana nû. Mamoste dibêje: “Rojbaş, zarokno!”\n\nRojîn li qelema xwe digere. Hevala wê dibêje: “Fermo, ev qelema min e.”`;
const GLOSSARY = [
  { term: 'dibistana', meanings: { en: 'school' } },
  { term: 'Mamoste', meanings: { en: 'teacher' } },
  { term: 'qelema', meanings: { en: 'pen' } },
  { term: 'Hevala', meanings: { en: 'friend' } },
];

interface Kept {
  id: string;
  status: string;
  review_status: string;
  reviewed_at: Date | null;
  published_at: Date | null;
  lock_version: number;
}

describe.skipIf(!DATABASE_URL)('the games’ starter library (integration)', () => {
  let pool: pg.Pool;
  let storyId: string;
  let before: Map<string, Kept>;
  let wasSeeded: boolean;
  const category = (origin: string, lockVersion: number) =>
    pool.query(
      `INSERT INTO game_content (kind, dialect, level, payload, source, origin, lock_version)
       VALUES ('word_category', 'kmr', 1, $1::jsonb, 'starter', $2, $3) RETURNING id`,
      [JSON.stringify({ slug: `${tag}-${lockVersion}`, ku: 'heywan', meanings: { en: 'animal' } }), origin, lockVersion],
    );

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const kept = await pool.query<Kept>(`SELECT id, status, review_status, reviewed_at, published_at, lock_version FROM game_content WHERE dialect = 'kmr'`);
    before = new Map(kept.rows.map((r) => [r.id, r]));
    wasSeeded = ((await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName])).rowCount ?? 0) > 0;
    const story = await pool.query<{ id: string }>(
      `INSERT INTO stories (slug, dialect, level, title, body, glossary) VALUES ($1, 'kurmanci', 1, 'Qelema Rojînê', $2, $3::jsonb) RETURNING id`,
      [`${tag}-story`, BODY, JSON.stringify(GLOSSARY)],
    );
    storyId = story.rows[0]!.id;
  });

  afterAll(async () => {
    // the rows the library made go, and the rows it published are as they were
    await pool.query(`DELETE FROM game_content WHERE dialect = 'kmr' AND NOT (id = ANY($1::uuid[]))`, [[...before.keys()]]);
    for (const row of before.values()) {
      await pool.query(`UPDATE game_content SET status = $2, review_status = $3, reviewed_at = $4, published_at = $5, lock_version = $6 WHERE id = $1`, [
        row.id,
        row.status,
        row.review_status,
        row.reviewed_at,
        row.published_at,
        row.lock_version,
      ]);
    }
    await pool.query(`DELETE FROM stories WHERE id = $1`, [storyId]);
    if (!wasSeeded) await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName]);
    else await pool.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [seedName]);
    await pool.end();
  });

  it('reads a draft story for the library, and for no game', async () => {
    const mine = (p: { storyId: string }) => p.storyId === storyId;
    expect((await new TrustedSources(pool).storyPassages('kmr')).filter(mine)).toHaveLength(0);
    const course = (await new TrustedSources(pool, null, Date.now, 'course').storyPassages('kmr')).filter(mine);
    expect(course).toHaveLength(2);
    expect(course[0]!.glossary.map((g) => g.term)).toEqual(['dibistana', 'Mamoste']);
  });

  it('puts the first rows in published, publishes what waited untouched, leaves what a person touched, and does it once', async () => {
    const untouched = (await category(`${tag}:untouched`, 0)).rows[0]!.id as string;
    const touched = (await category(`${tag}:touched`, 3)).rows[0]!.id as string;

    const first = await seedStarterLibrary(pool, quiet, null, ['kmr']);
    expect(first.map((r) => r.dialect)).toEqual(['kmr']);
    expect(first[0]!.published).toBeGreaterThanOrEqual(1);

    // the story's two paragraphs are passages now, published as starters with no reviewer named
    const passages = await pool.query<{ status: string; review_status: string; source: string; reviewed_by: string | null; payload: { text: string; hidden: Array<{ term: string }> } }>(
      `SELECT status, review_status, source, reviewed_by, payload FROM game_content WHERE kind = 'passage' AND dialect = 'kmr' AND origin LIKE $1 ORDER BY origin`,
      [`story:${storyId}:%`],
    );
    expect(passages.rows).toHaveLength(2);
    for (const row of passages.rows) expect(row).toMatchObject({ status: 'published', review_status: 'approved', source: 'starter', reviewed_by: null });
    expect(passages.rows[0]!.payload.hidden.map((h) => h.term)).toEqual(['dibistana', 'Mamoste']);
    // and a game reads them like any other row
    const read = await new TrustedSources(pool).content('passage', 'kmr');
    expect(read.filter((r) => r.payload.origin?.ref?.startsWith(`${storyId}:`))).toHaveLength(2);

    const rows = await pool.query<{ id: string; status: string; review_status: string; lock_version: number }>(
      `SELECT id, status, review_status, lock_version FROM game_content WHERE id = ANY($1::uuid[])`,
      [[untouched, touched]],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    expect(byId.get(untouched)).toMatchObject({ status: 'published', review_status: 'approved', lock_version: 1 });
    expect(byId.get(touched)).toMatchObject({ status: 'draft', review_status: 'unreviewed', lock_version: 3 });

    // once: a second start makes nothing and publishes nothing, whatever is a draft by then
    await pool.query(`UPDATE game_content SET status = 'draft', review_status = 'unreviewed', lock_version = 0 WHERE id = $1`, [untouched]);
    expect(await seedStarterLibrary(pool, quiet, null, ['kmr'])).toEqual([]);
    expect((await pool.query(`SELECT status FROM game_content WHERE id = $1`, [untouched])).rows[0]).toMatchObject({ status: 'draft' });
  });
});
