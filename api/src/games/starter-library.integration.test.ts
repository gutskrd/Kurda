/**
 * The games' starter library against a real database: it reads the course as it stands (a draft story here), inserts
 * each game's first rows published, publishes untouched waiting rows, leaves person-touched rows alone, and does it
 * once. Then Who Am I?'s curated deck: cards and questions published, untouched starter cards and questions it replaces
 * archived, person-edited cards kept, once. Needs DATABASE_URL.
 *
 * The test restores what it changes: its rows are deleted and the rows it published become drafts again.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { TrustedSources } from './sources.js';
import { STARTER_LIBRARY_VERSION, seedStarterLibrary } from './starter-library.js';
import { readWhoAmIDeck, seedWhoAmIDeck, whoAmIDeckSeedName } from './who-am-i-deck.js';

const DATABASE_URL = process.env.DATABASE_URL;
const tag = `lib${Date.now().toString(36)}`;
const quiet = { info: () => undefined, warn: () => undefined };
const seedName = `game_content:starter-library:${STARTER_LIBRARY_VERSION}:kmr`;

/** Two paragraphs, each holding two of the glossary's words: two passages for Dizê Bîrê. */
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
  let deckSeed = '';
  let deckWasSeeded = false;
  let editorId = '';
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
    const deck = await readWhoAmIDeck();
    if (!deck.ok) throw new Error('the Who Am I? deck does not read');
    deckSeed = whoAmIDeckSeedName(deck.deck.version, 'kmr');
    deckWasSeeded = ((await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [deckSeed])).rowCount ?? 0) > 0;
    editorId = (
      await pool.query<{ id: string }>(`INSERT INTO users (email, username, email_verified_at) VALUES ($1, $2, now()) RETURNING id`, [`${tag}ed@it.kurda.app`, `${tag}ed`])
    ).rows[0]!.id;
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
    for (const [name, was] of [
      [seedName, wasSeeded],
      [deckSeed, deckWasSeeded],
    ] as const) {
      if (!was) await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [name]);
      else await pool.query(`INSERT INTO content_seeds (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
    }
    if (editorId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
        await client.query(`DELETE FROM users WHERE id = $1`, [editorId]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
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

  it('puts Who Am I?’s deck in published, archives the untouched starter cards and questions it replaces, keeps what a person touched, and does it once', async () => {
    const deck = await readWhoAmIDeck();
    if (!deck.ok) throw new Error('the Who Am I? deck does not read');
    const rows = deck.deck.rows.kmr;
    // the deck went in with the library above; this test starts it over, from what a start without it would find
    await pool.query(`DELETE FROM game_content WHERE dialect = 'kmr' AND origin LIKE 'deck:who-am-i:kmr:%' AND NOT (id = ANY($1::uuid[]))`, [[...before.keys()]]);
    await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [deckSeed]);
    const starter = async (word: string, edited: boolean) =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO game_content (kind, dialect, level, payload, source, origin, status, review_status, reviewed_at, published_at, updated_by)
           VALUES ('identity', 'kmr', 2, $1::jsonb, 'starter', $2, 'published', 'approved', now(), now(), $3) RETURNING id`,
          [JSON.stringify({ word, meanings: { en: 'sheep (the flock)' }, category: 'animal', facts: { alive: true, animal: true, person: false, place: false } }), `${tag}:${word}`, edited ? editorId : null],
        )
      ).rows[0]!.id;
    const matched = await starter(`${tag}pez`, false);
    const edited = await starter(`${tag}mih`, true);
    const question = (
      await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, source, status, review_status, lock_version)
         VALUES ('question_template', 'kmr', 1, $1::jsonb, 'starter', 'draft', 'unreviewed', 0) RETURNING id`,
        [JSON.stringify({ ku: 'Ew heywanek e?', meanings: { en: 'Is it an animal?' }, fact: 'animal' })],
      )
    ).rows[0]!.id;

    const [result] = await seedWhoAmIDeck(pool, quiet, null, ['kmr']);
    expect(result).toMatchObject({ dialect: 'kmr', made: rows.identities.length + rows.templates.length });
    const status = async (id: string) => (await pool.query<{ status: string }>(`SELECT status FROM game_content WHERE id = $1`, [id])).rows[0]!.status;
    expect(await status(matched)).toBe('archived');
    expect(await status(question)).toBe('archived');
    // a card a person has edited is theirs
    expect(await status(edited)).toBe('published');

    // the game reads the deck's cards and questions like any other row, with their "sometimes"
    const read = new TrustedSources(pool);
    const cards = (await read.content('identity', 'kmr')).filter((r) => r.payload.word === 'kûçik');
    expect(cards.map((c) => c.payload.facts)).toContainEqual(expect.objectContaining({ 'at-home': 'sometimes' }));
    const asked = (await read.content('question_template', 'kmr')).map((r) => r.payload.ku);
    expect(asked).toContain('Ew ajalek e?');
    expect(asked).not.toContain('Ew heywanek e?');

    // once: a card the deck put in and an editor archived stays archived on the next start
    const kucik = (await pool.query<{ id: string }>(`SELECT id FROM game_content WHERE kind = 'identity' AND dialect = 'kmr' AND origin = 'deck:who-am-i:kmr:kûçik'`)).rows[0]!.id;
    await pool.query(`UPDATE game_content SET status = 'archived', updated_by = $2 WHERE id = $1`, [kucik, editorId]);
    expect(await seedWhoAmIDeck(pool, quiet, null, ['kmr'])).toEqual([]);
    expect(await status(kucik)).toBe('archived');

    // and a later start of the library makes no card of the course's glosses where the deck is in
    await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [seedName]);
    await seedStarterLibrary(pool, quiet, null, ['kmr']);
    const fromCourse = await pool.query(`SELECT 1 FROM game_content WHERE kind = 'identity' AND dialect = 'kmr' AND origin LIKE 'vocabulary:%' AND status = 'published' AND NOT (id = ANY($1::uuid[]))`, [
      [...before.keys()],
    ]);
    expect(fromCourse.rowCount).toBe(0);
    await pool.query(`DELETE FROM game_content WHERE id = ANY($1::uuid[])`, [[matched, edited, question]]);
  });
});
