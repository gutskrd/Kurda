import type pg from 'pg';
import { countStoryWords, type QuestionKind, type StoryDialect, type StoryLength, type StoryLevel } from '@kurda/shared';

/**
 * A published story with a question bank written straight to the tables, for the story games' suites. The text is a
 * short made-up Kurmancî story whose paragraphs the questions cite; published fixtures are approved too, as the table
 * requires. Every question has three options with the right one at a known position, so a suite can answer right or
 * wrong after the shuffle.
 */
export interface StoryFixture {
  id: string;
  slug: string;
  title: string;
  body: string;
}

export interface StoryFixtureOptions {
  slug: string;
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
  /** questions in the bank (default 6); the first is a gist question unless `gist` is false */
  questions?: number;
  gist?: boolean;
  status?: 'draft' | 'in_review' | 'published' | 'archived';
  title?: string;
}

const PARAGRAPHS = [
  'Rojîn û Azad diçin bazarê. Roj germ e. Ew sêv û nan dikirin.',
  'Li bazarê pîrek li ber dikanê rûniştiye. Ew bi stranan nan difiroşe.',
  'Azad dibêje: "Ez birçî me." Rojîn nanekî germ dide wî.',
  'Êvarê ew vedigerin malê. Diya wan şîv amade kiriye.',
];

export async function insertStory(pool: Pick<pg.Pool, 'query'>, opts: StoryFixtureOptions): Promise<StoryFixture> {
  const body = PARAGRAPHS.join('\n\n');
  const title = opts.title ?? `Bazar ${opts.slug}`;
  const story = await pool.query<{ id: string }>(
    `INSERT INTO stories (slug, dialect, level, title, summary, body, word_count, length, glossary, status, source, category, review_status)
     VALUES ($1, $2, $3, $4, 'Rojek li bazarê.', $5, $6, $7, $8, $9, 'admin', 'everyday',
             CASE WHEN $9 = 'published' THEN 'approved' ELSE 'unreviewed' END) RETURNING id`,
    [
      opts.slug,
      opts.dialect ?? 'kurmanci',
      opts.level ?? 1,
      title,
      body,
      countStoryWords(body),
      opts.length ?? 'short',
      JSON.stringify([{ term: 'bazarê', meanings: { en: 'the market' } }]),
      opts.status ?? 'published',
    ],
  );
  const id = story.rows[0]!.id;
  const n = opts.questions ?? 6;
  const kinds: QuestionKind[] = ['detail', 'vocabulary', 'sequence', 'inference', 'detail', 'detail'];
  for (let i = 0; i < n; i++) {
    const kind: QuestionKind = i === 0 && opts.gist !== false ? 'gist' : kinds[i % kinds.length]!;
    await pool.query(
      `INSERT INTO story_questions (story_id, position, kind, prompt, prompt_en, options, correct_index,
                                    explanation, explanation_en, evidence_paragraph, evidence_sentence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        i,
        kind,
        `Pirs ${i}?`,
        `Question ${i}?`,
        JSON.stringify([`rast ${i}`, `şaş ${i} a`, `şaş ${i} b`]),
        0,
        `Ji ber ku ${i}.`,
        `Because ${i}.`,
        kind === 'gist' ? null : i % PARAGRAPHS.length,
        kind === 'gist' ? null : 0,
      ],
    );
  }
  return { id, slug: opts.slug, title, body };
}

/** Remove fixture stories and every game played on them. */
export async function deleteStories(pool: Pick<pg.Pool, 'query'>, storyIds: string[]): Promise<void> {
  if (!storyIds.length) return;
  await pool.query(`DELETE FROM story_games WHERE story_id = ANY($1::uuid[])`, [storyIds]);
  await pool.query(`DELETE FROM stories WHERE id = ANY($1::uuid[])`, [storyIds]);
}
