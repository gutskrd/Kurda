import type pg from 'pg';
import type { QuestionKind, StoryDialect, StoryGlossEntry, StoryLength, StoryLevel } from '@kurda/shared';
import type { BankQuestion } from './plan.js';

type Executor = Pick<pg.Pool, 'query'>;

/** A published story with its question bank, as a game reads it. */
export interface GameStory {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  wordCount: number;
  body: string;
  glossary: StoryGlossEntry[];
  /** in authoring order */
  questions: BankQuestion[];
}

export interface PickStory {
  dialect: StoryDialect;
  length: StoryLength;
  level?: StoryLevel;
  /** the bank has to hold at least this many questions */
  minQuestions: number;
  /** stories none of these people has finished come first ("Surprise me" avoids repeats) */
  preferUnseenBy: readonly string[];
}

/**
 * What story games need from the stories: a published story with its bank,
 * and a random published one for "Surprise me".
 *
 * The API-stories track owns the stories (`StoriesService`, with these two
 * method names in the contract). Until its branch is merged this file reads
 * the same tables itself, behind this interface, so swapping it for the real
 * service is one line where the story games are wired up.
 */
export interface StoryCatalog {
  /** The story if it is published right now, with its whole bank; else null. */
  getPublishedForGame(storyId: string, executor?: Executor): Promise<GameStory | null>;
  /** A random published story's id for these settings, or null if there is none. */
  pickRandomPublished(opts: PickStory, executor?: Executor): Promise<string | null>;
}

interface StoryRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  word_count: number;
  body: string;
  glossary: StoryGlossEntry[];
}

interface QuestionRow {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  prompt_en: string | null;
  options: string[];
  correct_index: number;
  explanation: string | null;
  explanation_en: string | null;
  evidence_paragraph: number | null;
  evidence_sentence: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LocalStoryCatalog implements StoryCatalog {
  constructor(private readonly pool: pg.Pool) {}

  async getPublishedForGame(storyId: string, executor: Executor = this.pool): Promise<GameStory | null> {
    if (!UUID_RE.test(storyId)) return null;
    const story = await executor.query<StoryRow>(
      `SELECT id, slug, title, summary, dialect, level, length, word_count, body, glossary
         FROM stories WHERE id = $1 AND status = 'published'`,
      [storyId],
    );
    const row = story.rows[0];
    if (!row) return null;
    const questions = await executor.query<QuestionRow>(
      `SELECT id, position, kind, prompt, prompt_en, options, correct_index, explanation, explanation_en,
              evidence_paragraph, evidence_sentence
         FROM story_questions WHERE story_id = $1 ORDER BY position`,
      [storyId],
    );
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      dialect: row.dialect,
      level: row.level,
      length: row.length,
      wordCount: row.word_count,
      body: row.body,
      glossary: row.glossary,
      questions: questions.rows.map((q) => ({
        id: q.id,
        position: q.position,
        kind: q.kind,
        prompt: q.prompt,
        promptEn: q.prompt_en,
        options: q.options,
        correctIndex: q.correct_index,
        explanation: q.explanation,
        explanationEn: q.explanation_en,
        evidenceParagraph: q.evidence_paragraph,
        evidenceSentence: q.evidence_sentence,
      })),
    };
  }

  async pickRandomPublished(opts: PickStory, executor: Executor = this.pool): Promise<string | null> {
    const res = await executor.query<{ id: string }>(
      `SELECT s.id FROM stories s
        WHERE s.status = 'published' AND s.dialect = $1 AND s.length = $2
          AND ($3::smallint IS NULL OR s.level = $3)
          AND (SELECT count(*) FROM story_questions q WHERE q.story_id = s.id) >= $4
        ORDER BY EXISTS (SELECT 1 FROM story_completions c WHERE c.story_id = s.id AND c.user_id = ANY($5::uuid[])),
                 random()
        LIMIT 1`,
      [opts.dialect, opts.length, opts.level ?? null, opts.minQuestions, [...opts.preferUnseenBy]],
    );
    return res.rows[0]?.id ?? null;
  }
}
