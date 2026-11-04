/**
 * Stories as learners and games see them: the library's front page (GET
 * /stories/library), the filtered list (GET /stories), one story to read
 * (GET /stories/:idOrSlug), a reader's bookmarks and reading position, and —
 * for the story games — a published story with its question bank.
 *
 * Only published, approved stories ever leave here. A draft, a story in
 * review, an unpublished, unapproved or archived one is "not found" to every
 * caller in this file: nothing unreviewed reaches learners, and a story a
 * reviewer pulled stops being playable the moment it is pulled.
 *
 * Questions never leave through the reading API. The games read them through
 * `getPublishedForGame` / `pickRandomPublished` and keep them server-side.
 *
 * A signed-in reader gets their own record beside each story (`me`): the
 * bookmark, where they got to, their best quiz, how often they played it
 * today. Those rows are read per request and never cached; the shared shape
 * of a list or the library is cached for everyone.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  cefrOf,
  countStoryWords,
  lessonAudioKey,
  readingMinutes,
  storyAudioSentences,
  storyLengthFor,
  storyParagraphs,
  storySentences,
  type QuestionKind,
  type RecordingVoice,
  type StoryAudioCoverage,
  type StoryCategory,
  type StoryDetail,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryLanguage,
  type StoryLength,
  type StoryLevel,
  type StoryLibrary,
  type StoryListItem,
  type StoryMe,
  type StoryNarration,
  type StoryNarrationSentence,
  type StoryTradition,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { escapeLike } from '../db/like.js';
import { AppError } from '../plugins/errors.js';
import { voiceColumns, voiceOf, type VoiceRow } from '../speakers/voice.js';
import { localDate, safeTimeZone } from '../streaks/streak-logic.js';

/** The pool (its own transaction) or a client inside the caller's transaction. */
export type Executor = Pick<pg.Pool, 'query'>;

/**
 * The studio's recordings of a story's sentences by recording key, how long
 * each runs, and who says each that has a character, by the same key. One
 * query, for the reader and for a game's copy of a story alike.
 */
export async function sentenceRecordings(
  db: Executor,
  keys: readonly string[],
): Promise<{ audio: Record<string, string>; durations: Record<string, number>; voices: Record<string, RecordingVoice> }> {
  const audio: Record<string, string> = {};
  const durations: Record<string, number> = {};
  const voices: Record<string, RecordingVoice> = {};
  if (keys.length === 0) return { audio, durations, voices };
  const res = await db.query<{ key: string; url: string; text: string; duration_ms: number } & VoiceRow>(
    `SELECT key, url, text, duration_ms, ${voiceColumns()} FROM lesson_audio WHERE key = ANY($1::text[])`,
    [keys],
  );
  for (const r of res.rows) {
    audio[r.key] = r.url;
    durations[r.key] = r.duration_ms;
    const voice = voiceOf(r, { text: r.text, durationMs: r.duration_ms });
    if (voice) voices[r.key] = voice;
  }
  return { audio, durations, voices };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A story learners may read: published, and approved by a reviewer (publishing requires it; the check in the table keeps it). */
export const PUBLISHED_SQL = `s.status = 'published' AND s.review_status = 'approved'`;

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

/** How many of a story's recordable sentences are recorded, beside how many there are: none, some or all. */
export const AUDIO_COUNT_SQL = `cardinality(s.sentence_keys) AS recordable_count,
  (SELECT count(*)::int FROM unnest(s.sentence_keys) AS k(key) WHERE EXISTS (SELECT 1 FROM lesson_audio a WHERE a.key = k.key)) AS recorded_count`;

/** The columns a list item is made from (`listItem`), from the stories table as `s`. */
export const LIST_COLUMNS = `s.id, s.slug, s.title, s.summary, s.dialect, s.language, s.level, s.length, s.word_count, s.reading_minutes,
  s.category, s.tradition, s.author, s.featured, s.cover, s.published_at, ${AUDIO_COUNT_SQL}`;

/**
 * How the dictionary spells a story's variety. Its entries were imported
 * under the course spelling ('kurmanji'); the language codes are accepted
 * beside it so an entry filed under either is found.
 */
export function dictionaryDialectsOf(dialect: StoryDialect): string[] {
  return dialect === 'sorani' ? ['sorani', 'ckb'] : ['kurmanji', 'kurmanci', 'ku'];
}

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

export type StorySort = 'newest' | 'level' | 'title';

export interface StoryListFilter {
  dialect?: StoryDialect;
  length?: StoryLength;
  level?: StoryLevel;
  /** matched against the title and the summary */
  q?: string;
  category?: string;
  language?: string;
  /** only fully narrated stories */
  audio?: boolean;
  /** hub order (easiest and shortest first) when left out */
  sort?: StorySort;
  limit?: number;
  offset?: number;
}

export interface StoryPage {
  stories: StoryListItem[];
  /** how many match the filter in all, for the pager */
  total: number;
}

/** Page sizes: what a client gets without asking, and the most it may ask for. */
export const LIST_DEFAULT_LIMIT = 24;
export const LIST_MAX_LIMIT = 50;
/** The library's rows (featured, recent, continue, bookmarks) each show this many at most. */
const LIBRARY_ROW = 8;
/** GET /me/stories lists this many per shelf. */
const MY_STORIES_MAX = 50;

/**
 * The published list and the library's shared shape are cached for a few
 * minutes, one entry per filter — the hub asks the same few questions over
 * and over, and the answer only changes when a story is published,
 * unpublished, archived, featured or deleted, a category changes, or a
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
 *
 * A search (`q`) is never cached: every typed prefix would be its own entry.
 */
const LIST_CACHE_DOMAIN = 'stories';
const LIST_CACHE_TTL_SECONDS = 300;
const GENERATION_ID = 'list-generation';
/** Outlives every entry; should it expire, a new generation starts and the old entries go unread. */
const GENERATION_TTL_SECONDS = 7 * 24 * 3600;

function listCacheId(generation: string, f: StoryListFilter): string {
  const parts = [f.dialect, f.length, f.level, f.category, f.language, f.audio ? 1 : 0, f.sort, f.limit, f.offset];
  return `list:${generation}:${parts.map((p) => p ?? '*').join(':')}`;
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

/** A row of LIST_COLUMNS. */
export interface ListRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: StoryLevel;
  length: StoryLength;
  word_count: number;
  reading_minutes: number | null;
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  featured: boolean;
  cover: string | null;
  published_at: Date | null;
  recordable_count: number;
  recorded_count: number;
}

interface DetailRow extends ListRow {
  body: string;
  glossary: StoryGlossEntry[];
  translations: Record<string, string>;
  story_source: string | null;
  source_url: string | null;
  attribution_note: string | null;
  translation_group: string | null;
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

/** None, some or all of the recordable sentences recorded (a story with nothing to record has no audio). */
export function audioCoverage(recorded: number, recordable: number): StoryAudioCoverage {
  if (recordable <= 0 || recorded <= 0) return 'none';
  return recorded >= recordable ? 'full' : 'partial';
}

export function listItem(r: ListRow): StoryListItem {
  const coverage = audioCoverage(r.recorded_count, r.recordable_count);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    dialect: r.dialect,
    language: r.language,
    level: r.level,
    cefr: cefrOf(r.level),
    length: r.length,
    wordCount: r.word_count,
    readingMinutes: r.reading_minutes ?? readingMinutes(r.dialect, r.word_count),
    fullyNarrated: coverage === 'full',
    audioCoverage: coverage,
    category: r.category,
    tradition: r.tradition,
    author: r.author,
    featured: r.featured,
    cover: r.cover,
    publishedAt: r.published_at?.toISOString() ?? null,
  };
}

/**
 * The glossary as the reader gets it: each term's dictionary link checked
 * (an entry deleted since the save is no link), with the entry's part of
 * speech and a pronunciation in the story's variety when one is recorded.
 * Looked up when the story is read rather than stored, so a clip recorded
 * after the save is heard the next time the story is opened.
 */
export async function glossaryForReader(db: Executor, dialect: StoryDialect, glossary: readonly StoryGlossEntry[]): Promise<StoryGlossEntry[]> {
  const ids = [...new Set(glossary.map((g) => g.entryId).filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)))];
  const found = new Map<string, { pos: string | null; audio_url: string | null }>();
  if (ids.length > 0) {
    const res = await db.query<{ id: string; pos: string | null; audio_url: string | null }>(
      `SELECT e.id,
              (SELECT s.pos FROM dict_senses s WHERE s.entry_id = e.id ORDER BY s.position LIMIT 1) AS pos,
              (SELECT a.audio_url FROM dict_audio a WHERE a.entry_id = e.id AND a.dialect = ANY($2::text[]) ORDER BY a.id LIMIT 1) AS audio_url
         FROM dict_entries e WHERE e.id = ANY($1::uuid[])`,
      [ids, dictionaryDialectsOf(dialect)],
    );
    for (const r of res.rows) found.set(r.id, { pos: r.pos, audio_url: r.audio_url });
  }
  return glossary.map((g) => {
    const entry = typeof g.entryId === 'string' ? found.get(g.entryId) : undefined;
    return { term: g.term, meanings: g.meanings, entryId: entry ? g.entryId! : null, pos: entry?.pos ?? null, audioUrl: entry?.audio_url ?? null };
  });
}

/**
 * The recorded sentences of a text played back to back, in reading order,
 * each knowing where it starts on that one timeline. The sentence index is
 * into `storySentences(paragraph)` — what the reader highlights — while only
 * the sentences the reader can play (`storyAudioSentences`: with a letter
 * and a key) are counted as recordable. Null when nothing is recorded.
 */
export function narrationOf(
  paragraphs: readonly string[],
  audio: Record<string, string>,
  durations: Record<string, number>,
): StoryNarration | null {
  const sentences: StoryNarrationSentence[] = [];
  let recordable = 0;
  let startMs = 0;
  paragraphs.forEach((paragraph, p) => {
    storySentences(paragraph).forEach((sentence, i) => {
      const key = lessonAudioKey(sentence);
      if (key === '' || !/\p{L}/u.test(sentence)) return;
      recordable += 1;
      const url = audio[key];
      if (!url) return;
      const durationMs = durations[key] ?? 0;
      sentences.push({ paragraph: p, sentence: i, key, url, durationMs, startMs });
      startMs += durationMs;
    });
  });
  if (sentences.length === 0) return null;
  return { sentences, totalMs: startMs, complete: sentences.length === recordable };
}

interface MeRow {
  story_id: string;
  bookmarked: boolean;
  paragraph: number | null;
  share: number | null;
  finished_at: Date | null;
  best_correct: number | null;
  total: number | null;
  attempts_today: number;
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

  /** The current list generation, starting one when there is none; null without a cache. */
  private async generation(): Promise<string | null> {
    if (!this.cache) return null;
    const generation = await this.cache.get<string>(LIST_CACHE_DOMAIN, GENERATION_ID);
    if (generation) return generation;
    // none yet (or it expired, or Redis cannot be reached): start one for the next request, answer from the database
    await bustStoryLists(this.cache);
    return null;
  }

  /** Published stories for the hub and the library's search, filtered and paged; with `me` for a signed-in viewer. */
  async list(filter: StoryListFilter = {}, viewer: string | null = null): Promise<StoryPage> {
    const limit = Math.min(LIST_MAX_LIMIT, Math.max(1, filter.limit ?? LIST_DEFAULT_LIMIT));
    const offset = Math.max(0, filter.offset ?? 0);
    const q = filter.q?.trim() || null;
    const load = async (): Promise<StoryPage> => {
      const order =
        filter.sort === 'newest' ? 's.published_at DESC NULLS LAST, s.title' : filter.sort === 'title' ? 's.title, s.level' : STORY_ORDER_SQL;
      const res = await this.pool.query<ListRow & { total: number }>(
        `SELECT ${LIST_COLUMNS}, (count(*) OVER ())::int AS total
         FROM stories s
         WHERE ${PUBLISHED_SQL}
           AND ($1::text IS NULL OR s.dialect = $1)
           AND ($2::text IS NULL OR s.length = $2)
           AND ($3::smallint IS NULL OR s.level = $3)
           AND ($4::text IS NULL OR s.category = $4)
           AND ($5::text IS NULL OR s.language = $5)
           AND ($6::text IS NULL OR s.title ILIKE $6 OR s.summary ILIKE $6)
           AND (NOT $7::boolean OR ${FULLY_NARRATED_SQL})
         ORDER BY ${order}
         LIMIT $8 OFFSET $9`,
        [
          filter.dialect ?? null,
          filter.length ?? null,
          filter.level ?? null,
          filter.category ?? null,
          filter.language ?? null,
          q ? `%${escapeLike(q)}%` : null,
          filter.audio === true,
          limit,
          offset,
        ],
      );
      return { stories: res.rows.map(listItem), total: res.rows[0]?.total ?? 0 };
    };
    let page: StoryPage;
    const generation = q ? null : await this.generation();
    if (!generation || !this.cache) {
      page = await load();
    } else {
      page = await this.cache.withCache(LIST_CACHE_DOMAIN, listCacheId(generation, { ...filter, limit, offset }), LIST_CACHE_TTL_SECONDS, load);
    }
    return { stories: await this.withMe(page.stories, viewer), total: page.total };
  }

  /**
   * The library's front page. The rows everyone sees (featured, recent, the
   * categories with their counts, the total) are cached by the list
   * generation; a signed-in reader's own rows (continue, bookmarks, their
   * tally) are read for them each time, and their record is added to every
   * story on the page.
   */
  async library(viewer: string | null = null): Promise<StoryLibrary> {
    const load = async (): Promise<Pick<StoryLibrary, 'featured' | 'recent' | 'categories' | 'total'>> => {
      const [featured, recent, categories, total] = await Promise.all([
        this.pool.query<ListRow>(
          `SELECT ${LIST_COLUMNS} FROM stories s WHERE ${PUBLISHED_SQL} AND s.featured
           ORDER BY s.featured_at DESC NULLS LAST, s.published_at DESC LIMIT ${LIBRARY_ROW}`,
        ),
        this.pool.query<ListRow>(
          `SELECT ${LIST_COLUMNS} FROM stories s WHERE ${PUBLISHED_SQL} ORDER BY s.published_at DESC NULLS LAST, s.title LIMIT ${LIBRARY_ROW}`,
        ),
        this.pool.query<StoryCategory & { count: number }>(
          `SELECT c.slug, c.name, c.position,
                  (SELECT count(*)::int FROM stories s WHERE s.category = c.slug AND ${PUBLISHED_SQL}) AS count
             FROM story_categories c ORDER BY c.position, c.slug`,
        ),
        this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM stories s WHERE ${PUBLISHED_SQL}`),
      ]);
      return {
        featured: featured.rows.map(listItem),
        recent: recent.rows.map(listItem),
        categories: categories.rows,
        total: total.rows[0]?.n ?? 0,
      };
    };
    const generation = await this.generation();
    const shared =
      generation && this.cache ? await this.cache.withCache(LIST_CACHE_DOMAIN, `library:${generation}`, LIST_CACHE_TTL_SECONDS, load) : await load();
    if (!viewer) return { ...shared, continue: [], bookmarks: [] };

    const [reading, bookmarks, tally, score] = await Promise.all([
      this.pool.query<ListRow>(
        `SELECT ${LIST_COLUMNS} FROM story_reading r JOIN stories s ON s.id = r.story_id
          WHERE r.user_id = $1 AND r.finished_at IS NULL AND ${PUBLISHED_SQL}
          ORDER BY r.updated_at DESC LIMIT ${LIBRARY_ROW}`,
        [viewer],
      ),
      this.pool.query<ListRow>(
        `SELECT ${LIST_COLUMNS} FROM story_bookmarks b JOIN stories s ON s.id = b.story_id
          WHERE b.user_id = $1 AND ${PUBLISHED_SQL}
          ORDER BY b.created_at DESC LIMIT ${LIBRARY_ROW}`,
        [viewer],
      ),
      this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM story_reading r JOIN stories s ON s.id = r.story_id
          WHERE r.user_id = $1 AND r.finished_at IS NOT NULL AND ${PUBLISHED_SQL}`,
        [viewer],
      ),
      // their best share of right answers on each story they finished a game on, averaged over the stories
      this.pool.query<{ avg: number | null }>(
        `SELECT avg(best)::float AS avg FROM (
           SELECT max(p.correct::float / g.question_count) AS best
             FROM story_game_players p JOIN story_games g ON g.id = p.game_id
            WHERE p.user_id = $1 AND NOT p.removed AND g.finished_at IS NOT NULL AND (p.left_at IS NULL OR p.left_at >= g.finished_at)
            GROUP BY g.story_id) t`,
        [viewer],
      ),
    ]);
    const rows = [...shared.featured, ...shared.recent, ...reading.rows.map(listItem), ...bookmarks.rows.map(listItem)];
    const me = await this.meFor(viewer, rows.map((s) => s.id));
    const attach = (items: StoryListItem[]): StoryListItem[] => items.map((s) => ({ ...s, me: me.get(s.id) ?? emptyMe() }));
    return {
      featured: attach(shared.featured),
      recent: attach(shared.recent),
      continue: attach(reading.rows.map(listItem)),
      bookmarks: attach(bookmarks.rows.map(listItem)),
      categories: shared.categories,
      total: shared.total,
      me: { finished: tally.rows[0]?.n ?? 0, total: shared.total, averageScore: score.rows[0]?.avg ?? null },
    };
  }

  /** Every category, in order, for a filter list. */
  async categories(): Promise<StoryCategory[]> {
    const res = await this.pool.query<StoryCategory>(`SELECT slug, name, position FROM story_categories ORDER BY position, slug`);
    return res.rows;
  }

  /**
   * One published story to read, by id or by slug, with the reader's own
   * record when they are signed in. The two are told apart before the query:
   * a slug compared with a uuid column would be a cast error, not a miss.
   *
   * Its recordings are looked up from the sentences as the reader cuts them
   * now, not from the keys stored at its last save: the reader matches audio
   * to the sentences it shows, so this is the set that has to be right.
   */
  async detail(idOrSlug: string, viewer: string | null = null): Promise<StoryDetail | null> {
    const byId = UUID_RE.test(idOrSlug);
    if (!byId && !/^[a-z0-9-]{3,80}$/.test(idOrSlug)) return null;
    const res = await this.pool.query<DetailRow>(
      `SELECT ${LIST_COLUMNS}, s.body, s.glossary, s.translations, s.story_source, s.source_url, s.attribution_note, s.translation_group
       FROM stories s
       WHERE ${byId ? 's.id = $1::uuid' : 's.slug = $1'} AND ${PUBLISHED_SQL}`,
      [idOrSlug],
    );
    const row = res.rows[0];
    if (!row) return null;
    const paragraphs = storyParagraphs(row.body);
    const keys = new Set<string>();
    for (const paragraph of paragraphs) for (const sentence of storyAudioSentences(paragraph)) keys.add(lessonAudioKey(sentence));
    const [{ audio, durations, voices }, glossary, versions, me] = await Promise.all([
      sentenceRecordings(this.pool, [...keys]),
      glossaryForReader(this.pool, row.dialect, row.glossary),
      row.translation_group
        ? this.pool.query<{ id: string; slug: string; dialect: StoryDialect; language: StoryLanguage }>(
            `SELECT s.id, s.slug, s.dialect, s.language FROM stories s
              WHERE s.translation_group = $1 AND s.id <> $2 AND ${PUBLISHED_SQL} ORDER BY s.dialect, s.language`,
            [row.translation_group, row.id],
          )
        : null,
      viewer ? this.meFor(viewer, [row.id]) : null,
    ]);
    const translations: Record<string, string[]> = {};
    for (const [locale, text] of Object.entries(row.translations ?? {})) {
      if (typeof text === 'string' && text.trim() !== '') translations[locale] = storyParagraphs(text);
    }
    const fullyNarrated = keys.size > 0 && Object.keys(audio).length === keys.size;
    return {
      ...listItem({ ...row, recorded_count: Object.keys(audio).length, recordable_count: keys.size }),
      fullyNarrated,
      paragraphs,
      glossary,
      audio,
      ...(Object.keys(voices).length > 0 ? { voices } : {}),
      translations,
      source: row.story_source,
      sourceUrl: row.source_url,
      attributionNote: row.attribution_note,
      versions: versions?.rows ?? [],
      narration: narrationOf(paragraphs, audio, durations),
      ...(me ? { me: me.get(row.id) ?? emptyMe() } : {}),
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

  /** The id of a story learners may read, or 404: bookmarks and reading positions are kept on those alone. */
  private async readableId(storyId: string): Promise<string> {
    if (!UUID_RE.test(storyId)) throw new AppError('NOT_FOUND', 404, 'no such story');
    const res = await this.pool.query<{ id: string }>(`SELECT s.id FROM stories s WHERE s.id = $1 AND ${PUBLISHED_SQL}`, [storyId]);
    if (!res.rows[0]) throw new AppError('NOT_FOUND', 404, 'no such story');
    return res.rows[0].id;
  }

  /** Put a story on the reader's shelf, or take it off; saying so twice changes nothing. */
  async bookmark(userId: string, storyId: string, on: boolean): Promise<{ bookmarked: boolean }> {
    const id = await this.readableId(storyId);
    if (on) {
      await this.pool.query(`INSERT INTO story_bookmarks (user_id, story_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, id]);
    } else {
      await this.pool.query(`DELETE FROM story_bookmarks WHERE user_id = $1 AND story_id = $2`, [userId, id]);
    }
    return { bookmarked: on };
  }

  /**
   * Where the reader is in a story. The position moves with every write (a
   * reader starting over is at the start again); finishing is remembered once,
   * when the client says so or the reader has passed 95 percent of the text,
   * and never forgotten.
   */
  async saveProgress(userId: string, storyId: string, input: { paragraph: number; share: number; finished?: boolean }): Promise<StoryMe> {
    const id = await this.readableId(storyId);
    const share = Math.min(1, Math.max(0, input.share));
    const finished = input.finished === true || share >= 0.95;
    await this.pool.query(
      `INSERT INTO story_reading (user_id, story_id, paragraph, share, finished_at, updated_at)
       VALUES ($1, $2, $3, $4, CASE WHEN $5::boolean THEN now() END, now())
       ON CONFLICT (user_id, story_id) DO UPDATE
         SET paragraph = EXCLUDED.paragraph, share = EXCLUDED.share,
             finished_at = COALESCE(story_reading.finished_at, EXCLUDED.finished_at), updated_at = now()`,
      [userId, id, Math.max(0, Math.floor(input.paragraph)), share, finished],
    );
    return (await this.meFor(userId, [id])).get(id) ?? emptyMe();
  }

  /** GET /me/stories: the reader's shelves — started, bookmarked, finished — each latest first. */
  async myStories(userId: string): Promise<{ continue: StoryListItem[]; bookmarks: StoryListItem[]; finished: StoryListItem[] }> {
    const [reading, bookmarks, finished] = await Promise.all([
      this.pool.query<ListRow>(
        `SELECT ${LIST_COLUMNS} FROM story_reading r JOIN stories s ON s.id = r.story_id
          WHERE r.user_id = $1 AND r.finished_at IS NULL AND ${PUBLISHED_SQL} ORDER BY r.updated_at DESC LIMIT ${MY_STORIES_MAX}`,
        [userId],
      ),
      this.pool.query<ListRow>(
        `SELECT ${LIST_COLUMNS} FROM story_bookmarks b JOIN stories s ON s.id = b.story_id
          WHERE b.user_id = $1 AND ${PUBLISHED_SQL} ORDER BY b.created_at DESC LIMIT ${MY_STORIES_MAX}`,
        [userId],
      ),
      this.pool.query<ListRow>(
        `SELECT ${LIST_COLUMNS} FROM story_reading r JOIN stories s ON s.id = r.story_id
          WHERE r.user_id = $1 AND r.finished_at IS NOT NULL AND ${PUBLISHED_SQL} ORDER BY r.finished_at DESC LIMIT ${MY_STORIES_MAX}`,
        [userId],
      ),
    ]);
    const shelves = { continue: reading.rows.map(listItem), bookmarks: bookmarks.rows.map(listItem), finished: finished.rows.map(listItem) };
    const me = await this.meFor(userId, [...shelves.continue, ...shelves.bookmarks, ...shelves.finished].map((s) => s.id));
    const attach = (items: StoryListItem[]): StoryListItem[] => items.map((s) => ({ ...s, me: me.get(s.id) ?? emptyMe() }));
    return { continue: attach(shelves.continue), bookmarks: attach(shelves.bookmarks), finished: attach(shelves.finished) };
  }

  /** The items with the viewer's record on each, or as they are for an anonymous viewer. */
  private async withMe(items: StoryListItem[], viewer: string | null): Promise<StoryListItem[]> {
    if (!viewer || items.length === 0) return items;
    const me = await this.meFor(viewer, items.map((s) => s.id));
    return items.map((s) => ({ ...s, me: me.get(s.id) ?? emptyMe() }));
  }

  /**
   * A reader's record on each of these stories, in one query: the bookmark,
   * the reading row, their best finished game (the games' own "best per story"
   * rule), and the games they finished today — their own today, as the
   * rewards count it, so the client can say when a quiz will pay no more.
   */
  async meFor(userId: string, storyIds: readonly string[]): Promise<Map<string, StoryMe>> {
    const out = new Map<string, StoryMe>();
    const ids = [...new Set(storyIds)];
    if (ids.length === 0) return out;
    const user = await this.pool.query<{ timezone: string | null }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    const tz = safeTimeZone(user.rows[0]?.timezone);
    const res = await this.pool.query<MeRow>(
      `WITH ids AS (SELECT unnest($2::uuid[]) AS story_id)
       SELECT i.story_id,
              EXISTS (SELECT 1 FROM story_bookmarks b WHERE b.user_id = $1 AND b.story_id = i.story_id) AS bookmarked,
              r.paragraph, r.share, r.finished_at,
              best.correct AS best_correct, best.total,
              (SELECT count(*)::int FROM story_game_players p JOIN story_games g ON g.id = p.game_id
                WHERE p.user_id = $1 AND g.story_id = i.story_id AND NOT p.removed AND g.finished_at IS NOT NULL
                  AND (g.finished_at AT TIME ZONE $3)::date = $4::date) AS attempts_today
         FROM ids i
         LEFT JOIN story_reading r ON r.user_id = $1 AND r.story_id = i.story_id
         LEFT JOIN LATERAL (
           SELECT p.correct, g.question_count AS total
             FROM story_game_players p JOIN story_games g ON g.id = p.game_id
            WHERE p.user_id = $1 AND g.story_id = i.story_id AND NOT p.removed AND g.finished_at IS NOT NULL
              AND (p.left_at IS NULL OR p.left_at >= g.finished_at)
            ORDER BY p.correct::float / g.question_count DESC, g.finished_at DESC LIMIT 1) best ON true`,
      [userId, ids, tz, localDate(new Date(), tz)],
    );
    for (const r of res.rows) {
      out.set(r.story_id, {
        bookmarked: r.bookmarked,
        paragraph: r.paragraph ?? 0,
        share: r.share ?? 0,
        finishedAt: r.finished_at?.toISOString() ?? null,
        bestCorrect: r.best_correct,
        total: r.total,
        attemptsToday: r.attempts_today,
      });
    }
    return out;
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
      `SELECT s.id, s.slug, s.title, s.summary, s.dialect, s.level, s.length, s.word_count, s.body, s.glossary
       FROM stories s WHERE s.id = $1 AND ${PUBLISHED_SQL} ${lock}`,
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
       WHERE ${PUBLISHED_SQL} AND s.dialect = $1 AND s.length = $2 AND ($3::smallint IS NULL OR s.level = $3)
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

/** A signed-in reader's record on a story they have not touched. */
export function emptyMe(): StoryMe {
  return { bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0 };
}
