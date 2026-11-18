import type pg from 'pg';
import type { QuestionKind, StoryDialect, StoryGlossEntry, StoryLength, StoryLevel, StoryQuestionTranslation } from '@kurda/shared';
import type { BankQuestion } from './plan.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * A published story with its question bank, as a game reads it (field for field the stories service's
 * `PublishedStory`).
 */
export interface GameStory {
  id: string;
  slug: string;
  title: string;
  /**
   * Not carried by the stories service's `PublishedStory`. A game's copy keeps it when present; without it the reader
   * shows the title alone.
   */
  summary?: string | null;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  wordCount: number;
  body: string;
  glossary: StoryGlossEntry[];
  /** in authoring order */
  questions: BankQuestion[];
}

/** "Surprise me" options, as the stories service's `PickRandomOptions`. */
export interface PickStory {
  dialect: StoryDialect;
  length: StoryLength;
  level?: StoryLevel | null;
  /** a user id: stories this person has already finished come last */
  preferNotCompletedBy?: string | null;
}

/**
 * What story games need from the stories: a published story with its bank, and a random published one for "Surprise
 * me". The signatures match the stories service (contract §A3); `LocalStoryCatalog` below reads the same tables the
 * same way.
 *
 * Games do not rely on a picked story having enough questions for the count asked (publishing guarantees
 * MIN_QUESTION_BANK, but games check the bank against the count wherever they use one), nor on it carrying a summary.
 */
export interface StoryCatalog {
  /**
   * The story if published right now, with its whole bank, else null. With a client inside a transaction the story row
   * stays share-locked until it ends, so an unpublish waits for a game starting on it.
   */
  getPublishedForGame(storyId: string, executor?: Executor): Promise<GameStory | null>;
  /** A random published story for these settings, or null if there is none. */
  pickRandomPublished(options: PickStory, executor?: Executor): Promise<GameStory | null>;
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
  translations: Record<string, StoryQuestionTranslation> | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The games' own reader of the stories tables, with the same reads and locks as the stories service. */
export class LocalStoryCatalog implements StoryCatalog {
  constructor(private readonly pool: pg.Pool) {}

  async getPublishedForGame(storyId: string, executor: Executor = this.pool): Promise<GameStory | null> {
    if (!UUID_RE.test(storyId)) return null;
    // a lock only means something inside the caller's transaction; on the pool it would end with the query
    const lock = executor === this.pool ? '' : 'FOR SHARE';
    const story = await executor.query<StoryRow>(
      `SELECT id, slug, title, summary, dialect, level, length, word_count, body, glossary
         FROM stories WHERE id = $1 AND status = 'published' ${lock}`,
      [storyId],
    );
    const row = story.rows[0];
    if (!row) return null;
    const questions = await executor.query<QuestionRow>(
      `SELECT id, position, kind, prompt, prompt_en, options, correct_index, explanation, explanation_en,
              evidence_paragraph, evidence_sentence, translations
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
        translations: q.translations ?? {},
      })),
    };
  }

  async pickRandomPublished(options: PickStory, executor: Executor = this.pool): Promise<GameStory | null> {
    const user = options.preferNotCompletedBy;
    const res = await executor.query<{ id: string }>(
      `SELECT s.id FROM stories s
        WHERE s.status = 'published' AND s.dialect = $1 AND s.length = $2 AND ($3::smallint IS NULL OR s.level = $3)
        ORDER BY EXISTS (SELECT 1 FROM story_completions c WHERE c.user_id = $4 AND c.story_id = s.id), random()
        LIMIT 1`,
      [options.dialect, options.length, options.level ?? null, user && UUID_RE.test(user) ? user : null],
    );
    const id = res.rows[0]?.id;
    return id ? this.getPublishedForGame(id, executor) : null;
  }
}
