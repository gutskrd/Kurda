/**
 * Stories as learners and games see them: the published list (GET /stories),
 * one story to read (GET /stories/:idOrSlug), and — for the story games — a
 * published story with its question bank.
 *
 * Only published stories ever leave here. A draft, a story in review, an
 * unpublished or archived one is "not found" to every caller in this file:
 * nothing unreviewed reaches learners, and a story a reviewer pulled stops
 * being playable the moment it is pulled.
 *
 * Questions never leave through the reading API. The games read them through
 * `getPublishedForGame` / `pickRandomPublished` and keep them server-side.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  countStoryWords,
  lessonAudioKey,
  readingMinutes,
  storyAudioSentences,
  storyLengthFor,
  storyParagraphs,
  type QuestionKind,
  type RecordingVoice,
  type StoryDetail,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryLength,
  type StoryLevel,
  type StoryListItem,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { voiceColumns, voiceOf, type VoiceRow } from '../speakers/voice.js';

/** The pool (its own transaction) or a client inside the caller's transaction. */
export type Executor = Pick<pg.Pool, 'query'>;

/**
 * The studio's recordings of a story's sentences by recording key, and who
 * says each that has a character, by the same key. One query, for the reader
 * and for a game's copy of a story alike.
 */
export async function sentenceRecordings(
  db: Executor,
  keys: readonly string[],
): Promise<{ audio: Record<string, string>; voices: Record<string, RecordingVoice> }> {
  const audio: Record<string, string> = {};
  const voices: Record<string, RecordingVoice> = {};
  if (keys.length === 0) return { audio, voices };
  const res = await db.query<{ key: string; url: string; text: string; duration_ms: number } & VoiceRow>(
    `SELECT key, url, text, duration_ms, ${voiceColumns()} FROM lesson_audio WHERE key = ANY($1::text[])`,
    [keys],
  );
  for (const r of res.rows) {
    audio[r.key] = r.url;
    const voice = voiceOf(r, { text: r.text, durationMs: r.duration_ms });
    if (voice) voices[r.key] = voice;
  }
  return { audio, voices };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The order the hub lists stories in: easiest first, then shortest, then by title. */
export const STORY_ORDER_SQL = `s.level, array_position(ARRAY['short','medium','long'], s.length), s.title`;

/**
 * True when every sentence the reader can play has a studio recording — one
 * comparison of the story's stored keys with `lesson_audio`, so a list of a
 * hundred stories costs no text splitting at all. A story with no recordable
 * sentence is not "narrated".
 */
export const FULLY_NARRATED_SQL = `(cardinality(s.sentence_keys) > 0 AND NOT EXISTS (
    SELECT 1 FROM unnest(s.sentence_keys) AS k(key)
    WHERE NOT EXISTS (SELECT 1 FROM lesson_audio a WHERE a.key = k.key)))`;

/** What a story's text says about itself, recomputed on every save. */
export interface StoryTextFacts {
  wordCount: number;
  /** null while a draft is between lengths */
  length: StoryLength | null;
  /** the recording key of each sentence the reader can play, without repeats, in reading order */
  sentenceKeys: string[];
}

export function storyTextFacts(dialect: StoryDialect, body: string): StoryTextFacts {
  const wordCount = countStoryWords(body);
  const keys = new Set<string>();
  for (const paragraph of storyParagraphs(body)) {
    for (const sentence of storyAudioSentences(paragraph)) keys.add(lessonAudioKey(sentence));
  }
  return { wordCount, length: storyLengthFor(dialect, wordCount), sentenceKeys: [...keys] };
}

export interface StoryListFilter {
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
}

/**
 * The published list is cached for a few minutes, one entry per filter —
 * the hub asks the same few questions over and over, and the answer only
 * changes when a story is published, unpublished, archived or deleted, or a
 * sentence is recorded (fully narrated).
 *
 * Each of those starts a new generation of the list rather than deleting the
 * entries, and every entry's key names the generation it was loaded in.
 * Deleting would race: a request that missed just before an unpublish
 * committed reads the old list (its query's snapshot still has the story) and
 * writes it back after the deletes, so a story a reviewer pulled would stay
 * in the hub for the whole five minutes — and every request after the delete
 * would join that load while it is in flight. A load from an older
 * generation now writes under a key nobody reads any more.
 */
const LIST_CACHE_DOMAIN = 'stories';
const LIST_CACHE_TTL_SECONDS = 300;
const GENERATION_ID = 'list-generation';
/** Outlives every entry; should it expire, a new generation starts and the old entries go unread. */
const GENERATION_TTL_SECONDS = 7 * 24 * 3600;
/** More than the hub will show for a long while; a bound, not a page size. */
const LIST_MAX = 200;

function listCacheId(generation: string, f: StoryListFilter): string {
  return `list:${generation}:${f.dialect ?? '*'}:${f.length ?? '*'}:${f.level ?? '*'}`;
}

/**
 * Make every cached list stale at once by starting a new generation. One
 * write, best-effort like every cache write: with Redis down it is lost, and
 * so is everything it would have made stale.
 */
export async function bustStoryLists(cache: Cache | null | undefined): Promise<void> {
  if (!cache) return;
  await cache.set(LIST_CACHE_DOMAIN, GENERATION_ID, randomBytes(9).toString('base64url'), GENERATION_TTL_SECONDS);
}

/** A question as a game uses it: the right answer included, so it never leaves the server. */
export interface PublishedStoryQuestion {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
}

/** A published story with its whole bank, for a game to build its plan and snapshot from. */
export interface PublishedStory {
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
  questions: PublishedStoryQuestion[];
}

export interface PickRandomOptions {
  dialect: StoryDialect;
  length: StoryLength;
  level?: StoryLevel | null;
  /**
   * Who will play it: stories any of them has already finished come last
   * ("Surprise me" offers something new). One id for a solo game, every
   * player's for a duo or group rematch; ids that are not uuids are ignored.
   */
  preferNotCompletedBy?: string | readonly string[] | null;
}

interface ListRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  word_count: number;
  fully_narrated: boolean;
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

export interface QuestionRow {
  id: string;
  story_id: string;
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

export function questionFromRow(r: QuestionRow): PublishedStoryQuestion {
  return {
    id: r.id,
    position: r.position,
    kind: r.kind,
    prompt: r.prompt,
    promptEn: r.prompt_en,
    options: r.options,
    correctIndex: r.correct_index,
    explanation: r.explanation,
    explanationEn: r.explanation_en,
    evidenceParagraph: r.evidence_paragraph,
    evidenceSentence: r.evidence_sentence,
  };
}

function listItem(r: ListRow): StoryListItem {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    dialect: r.dialect,
    level: r.level,
    length: r.length,
    wordCount: r.word_count,
    readingMinutes: readingMinutes(r.dialect, r.word_count),
    fullyNarrated: r.fully_narrated,
  };
}

/**
 * Published stories, for the reading API and for the story games.
 *
 * The story games use two methods, by these names:
 *
 *   getPublishedForGame(storyId, executor?)  the story and its whole bank, or
 *                                            null unless it is published now
 *   pickRandomPublished(options, executor?)  "Surprise me": a random published
 *                                            story of a variety and length
 *                                            (and level), with its bank,
 *                                            preferring ones the players have
 *                                            not finished; null if there is
 *                                            none
 *
 * The games' own reader (story-games/stories-source.ts, `StoryCatalog`) asks
 * for the picked story's id and names its players `preferUnseenBy`; it maps
 * onto this service with `preferNotCompletedBy: opts.preferUnseenBy` and
 * `(await pickRandomPublished(…))?.id ?? null`. Its `minQuestions` needs no
 * filter: every published story carries MIN_QUESTION_BANK questions for its
 * length, more than any count that length offers (publishing checks it).
 *
 * Both take an optional executor so a game can read inside its own
 * transaction; the story row is then share-locked until that transaction
 * ends, so an unpublish waits for a game that is starting on the story
 * rather than slipping in between its check and its plan. Neither caches:
 * a game must see an unpublish at once.
 *
 * And `audioFor(paragraphs)` resolves recordings for any text — a game's
 * snapshot of a story, which may since have changed, reads its audio here.
 */
export class StoriesService {
  /** whether story_completions exists yet (the games' migration adds it); asked once per process */
  private completions: Promise<boolean> | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly cache: Cache | null = null,
  ) {}

  /** Published stories for the hub, filtered, in hub order. */
  async list(filter: StoryListFilter = {}): Promise<StoryListItem[]> {
    const load = async (): Promise<{ stories: StoryListItem[] }> => {
      const res = await this.pool.query<ListRow>(
        `SELECT s.id, s.slug, s.title, s.summary, s.dialect, s.level, s.length, s.word_count,
                ${FULLY_NARRATED_SQL} AS fully_narrated
         FROM stories s
         WHERE s.status = 'published'
           AND ($1::text IS NULL OR s.dialect = $1)
           AND ($2::text IS NULL OR s.length = $2)
           AND ($3::smallint IS NULL OR s.level = $3)
         ORDER BY ${STORY_ORDER_SQL}
         LIMIT ${LIST_MAX}`,
        [filter.dialect ?? null, filter.length ?? null, filter.level ?? null],
      );
      return { stories: res.rows.map(listItem) };
    };
    if (!this.cache) return (await load()).stories;
    const generation = await this.cache.get<string>(LIST_CACHE_DOMAIN, GENERATION_ID);
    if (!generation) {
      // none yet (or it expired, or Redis cannot be reached): start one for the next request, answer from the database
      await bustStoryLists(this.cache);
      return (await load()).stories;
    }
    const { stories } = await this.cache.withCache(LIST_CACHE_DOMAIN, listCacheId(generation, filter), LIST_CACHE_TTL_SECONDS, load);
    return stories;
  }

  /**
   * One published story to read, by id or by slug. The two are told apart
   * before the query: a slug compared with a uuid column would be a cast
   * error, not a miss.
   *
   * Its recordings are looked up from the sentences as the reader cuts them
   * now, not from the keys stored at its last save: the reader matches audio
   * to the sentences it shows, so this is the set that has to be right.
   */
  async detail(idOrSlug: string): Promise<StoryDetail | null> {
    const byId = UUID_RE.test(idOrSlug);
    if (!byId && !/^[a-z0-9-]{3,80}$/.test(idOrSlug)) return null;
    const res = await this.pool.query<Omit<ListRow, 'fully_narrated'> & { body: string; glossary: StoryGlossEntry[] }>(
      `SELECT s.id, s.slug, s.title, s.summary, s.dialect, s.level, s.length, s.word_count, s.body, s.glossary
       FROM stories s
       WHERE ${byId ? 's.id = $1::uuid' : 's.slug = $1'} AND s.status = 'published'`,
      [idOrSlug],
    );
    const row = res.rows[0];
    if (!row) return null;
    const paragraphs = storyParagraphs(row.body);
    const { audio, voices, fullyNarrated } = await this.audioFor(paragraphs);
    return {
      ...listItem({ ...row, fully_narrated: fullyNarrated }),
      paragraphs,
      glossary: row.glossary,
      audio,
      ...(voices ? { voices } : {}),
    };
  }

  /**
   * The studio recordings of a text's sentences, by recording key, and whether
   * every sentence has one — for a story as it was when a game copied it —
   * with who says the ones that have a character, when any has.
   */
  async audioFor(
    paragraphs: readonly string[],
  ): Promise<{ audio: Record<string, string>; voices?: Record<string, RecordingVoice>; fullyNarrated: boolean }> {
    const keys = new Set<string>();
    for (const paragraph of paragraphs) {
      for (const sentence of storyAudioSentences(paragraph)) keys.add(lessonAudioKey(sentence));
    }
    const { audio, voices } = await sentenceRecordings(this.pool, [...keys]);
    return {
      audio,
      ...(Object.keys(voices).length > 0 ? { voices } : {}),
      fullyNarrated: keys.size > 0 && Object.keys(audio).length === keys.size,
    };
  }

  /**
   * A story and its whole question bank, only while it is published (null
   * otherwise, and for an id that is not a uuid). With a client inside a
   * transaction, the story stays share-locked until it ends.
   */
  async getPublishedForGame(storyId: string, executor: Executor = this.pool): Promise<PublishedStory | null> {
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
      `SELECT * FROM story_questions WHERE story_id = $1 ORDER BY position`,
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
      questions: questions.rows.map(questionFromRow),
    };
  }

  /**
   * "Surprise me": a random published story of this variety and length (and
   * level, when given). With `preferNotCompletedBy`, stories any of those
   * players has already finished come last, so the surprise is a new story
   * while there is one. Published stories always carry at least
   * MIN_QUESTION_BANK questions (publishing checks it), so any of them can be
   * played at any count its length offers. Null when there is none — or, rarely, when the one picked
   * was unpublished in the same instant; the caller treats both as no story.
   */
  async pickRandomPublished(options: PickRandomOptions, executor: Executor = this.pool): Promise<PublishedStory | null> {
    const params: unknown[] = [options.dialect, options.length, options.level ?? null];
    let preference = '';
    const given = options.preferNotCompletedBy;
    // a non-uuid would be a cast error in the query, not a player
    const players = (typeof given === 'string' ? [given] : (given ?? [])).filter((id) => UUID_RE.test(id));
    if (players.length > 0 && (await this.hasCompletions())) {
      params.push(players);
      preference = `EXISTS (SELECT 1 FROM story_completions c WHERE c.user_id = ANY($4::uuid[]) AND c.story_id = s.id), `;
    }
    const picked = await executor.query<{ id: string }>(
      `SELECT s.id FROM stories s
       WHERE s.status = 'published' AND s.dialect = $1 AND s.length = $2 AND ($3::smallint IS NULL OR s.level = $3)
       ORDER BY ${preference}random()
       LIMIT 1`,
      params,
    );
    const id = picked.rows[0]?.id;
    return id ? this.getPublishedForGame(id, executor) : null;
  }

  /**
   * The completions table belongs to the story games and arrives with their
   * migration; until it exists there is nothing to prefer by, and the pick
   * is simply random. Asked once per process: migrations run before the
   * server starts, so a running process never sees it appear.
   */
  private hasCompletions(): Promise<boolean> {
    this.completions ??= this.pool
      .query<{ ok: boolean }>(`SELECT to_regclass('public.story_completions') IS NOT NULL AS ok`)
      .then((r) => r.rows[0]?.ok === true)
      .catch(() => {
        this.completions = null;
        return false;
      });
    return this.completions;
  }
}
