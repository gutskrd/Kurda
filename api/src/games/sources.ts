/**
 * The approved Kurdish the learning games are made of, read where it already
 * is — and nowhere else.
 *
 * A game may show a learner only Kurdish a person approved:
 *   - published lessons (the newest published version at each place in a
 *     skill, as practice reads them): their translations and conversation
 *     lines with the English beside them, and the word pairs they teach;
 *   - published stories (published means approved: the table checks it), by
 *     paragraph, with the glossary terms each paragraph holds;
 *   - people's recordings (`lesson_audio`, `alphabet_audio`, `dict_audio`),
 *     never the synthesised clips the apps ship;
 *   - `game_content` rows that are published, and so approved.
 * Drafts, lessons in review, unpublished stories and unapproved rows are never
 * read here, so no game can reach them.
 *
 * Every item is in exactly one variety. The variety comes from where the item
 * lives (a course's, a story's or a row's dialect, read through `toDialect`),
 * and the item's Kurdish must also be written in that variety's script
 * (`fitsDialect`): a Latin word in a Soranî lesson, or a recording whose text
 * is in the other script, is left out of both.
 *
 * Every item carries a key that stays the same while its Kurdish does: a
 * sentence is keyed by its text, not by the exercise it came from, so a
 * lesson published again, or the same sentence taught in two lessons, is the
 * same item to a learner's `game_seen`.
 *
 * Each reader is cached in Redis per variety for a few minutes: a round is
 * made from the cached pool, and the pool is read from Postgres at most once
 * per variety in that time, however many rounds are played. A change in the
 * admin panel shows within those minutes (game content also bumps the cache
 * itself: `bustGamePools`).
 */
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  SENTENCE_WORDS,
  alphabetClipText,
  checkGameContent,
  fitsDialect,
  foldForDialect,
  gameWords,
  storyParagraphs,
  storySpelling,
  toDialect,
  type GameContentByKind,
  type GameContentKind,
  type GameDialect,
  type Meanings,
  type SpeakerId,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { conversationPayloadSchema, gradingKey, translatePayloadSchema } from '../content/exercises.js';
import { itemWords } from '../content/item-words.js';

type Executor = Pick<pg.Pool, 'query'>;

/** How long a pool is kept, in seconds. */
export const POOL_TTL_SECONDS = 300;
const CACHE_DOMAIN = 'games-pool';
/** The pools' generation: bumping it retires every cached pool at once. */
const GENERATION_ID = 'generation';

/** An alphabet recording of a letter's sound rather than of a word (`kmr:sound:c`, `ckb:sound:…`). */
export function isAlphabetSoundKey(key: string): boolean {
  return /^[a-z]+:sound:/.test(key);
}

/** A stable key for an item, from what it is: the same Kurdish is the same item, wherever it was taught. */
export function itemKey(prefix: string, dialect: GameDialect, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);
  return `${prefix}:${dialect}:${hash}`;
}

/** A sentence's key, by its Kurdish as grading reads it. */
export function sentenceKey(dialect: GameDialect, ku: string): string {
  return itemKey('s', dialect, gradingKey(ku));
}

// ---------- what each reader gives ----------

/** A sentence a published lesson teaches, with what it means and every order it is right in. */
export interface LessonSentence {
  key: string;
  ku: string;
  meaning: Meanings;
  /** the accepted answers with the same words as `ku`, `ku` first */
  orders: string[];
  /** every accepted answer, other wordings included: what grading accepts */
  accepted: string[];
  /** 'lesson:<exerciseId>' or 'conversation:<exerciseId>:<line>' */
  origin: string;
}

/** A word a published lesson pairs with its meaning, or a published story's glossary term. */
export interface VocabularyWord {
  key: string;
  ku: string;
  meanings: Partial<Meanings>;
}

/** One line of a published conversation and the line that answers it. */
export interface ConversationPair {
  key: string;
  conversation: string;
  line: { ku: string; en: string | null; speaker: SpeakerId | null };
  reply: { ku: string; en: string | null; speaker: SpeakerId | null };
  origin: string;
}

/** One published conversation whole: its lines in order, who says each, and what each means where the lesson says. */
export interface ConversationText {
  key: string;
  conversation: string;
  title: string | null;
  lines: Array<{ ku: string; en: string | null; speaker: SpeakerId | null }>;
  origin: string;
}

/** One paragraph of a published story, with the glossary terms it holds. */
export interface StoryPassage {
  key: string;
  storyId: string;
  title: string;
  level: number;
  paragraph: number;
  text: string;
  glossary: Array<{ term: string; meanings: Partial<Meanings> }>;
}

/** A person's recording, with the Kurdish it says. Its address never leaves the server in a round (games hand out opaque ids). */
export interface HumanRecording {
  key: string;
  source: 'lesson' | 'alphabet' | 'dictionary';
  text: string;
  url: string;
  /** the character it is shown with, when one was chosen */
  speaker: SpeakerId | null;
  /** who recorded it, so a game can offer another person's take of the same text */
  recordedBy: string | null;
}

/** A published `game_content` row, as a game reads it. */
export interface PublishedContent<K extends GameContentKind> {
  id: string;
  key: string;
  level: number;
  payload: GameContentByKind[K];
}

// ---------- reading a published lesson's exercises ----------

interface ExerciseRow {
  id: string;
  type: string;
  payload: unknown;
  dialect: string;
}

const QUOTED = /[“"«‘]([^”"»’]+)[”"»’]/gu;

/**
 * The English a translation into Kurdish asks for. Lesson prompts set the
 * scene around it ("Your turn to be the guide. Say: “This is a wall.”"), so
 * the meaning is the last quoted text; else the text after a label ("In
 * Kurdish: Good morning"); else the prompt itself when it is short enough to
 * be nothing but the meaning. Anything else gives no meaning, and the item is
 * left out rather than shown with a scene as its meaning.
 */
export function meaningOfPrompt(prompt: string): string | null {
  const quoted = [...prompt.matchAll(QUOTED)].map((m) => m[1]!.trim()).filter((q) => q !== '');
  if (quoted.length > 0) return quoted.at(-1)!;
  const colon = prompt.lastIndexOf(':');
  if (colon >= 0) {
    const after = prompt.slice(colon + 1).trim();
    return after !== '' ? after : null;
  }
  const words = prompt.trim().split(/\s+/);
  return words.length <= 8 && words[0] !== '' ? prompt.trim() : null;
}

function wordCountFits(ku: string): boolean {
  const n = gameWords(ku).length;
  return n >= SENTENCE_WORDS.min && n <= SENTENCE_WORDS.max;
}

function sameWordSet(a: string, b: string, dialect: GameDialect): boolean {
  const key = (s: string) =>
    gameWords(s)
      .map((w) => foldForDialect(w, dialect))
      .sort()
      .join(' ');
  return key(a) === key(b);
}

/** The sentences one exercise teaches, with meanings and orders (pure, for the tests). */
export function sentencesOf(row: Pick<ExerciseRow, 'id' | 'type' | 'payload'>, dialect: GameDialect): LessonSentence[] {
  const out: LessonSentence[] = [];
  const keep = (ku: string, en: string, accepted: string[], origin: string): void => {
    const text = ku.trim();
    if (!fitsDialect(text, dialect) || !wordCountFits(text) || en.trim() === '' || fitsDialect(en, 'ckb')) return;
    const orders = [text, ...accepted.filter((a) => sameWordSet(a, text, dialect) && gradingKey(a) !== gradingKey(text))];
    const unique = orders.filter((o, i) => orders.findIndex((x) => gradingKey(x) === gradingKey(o)) === i);
    out.push({ key: sentenceKey(dialect, text), ku: text, meaning: { en: en.trim() }, orders: unique, accepted: [...new Set([text, ...accepted])], origin });
  };
  if (row.type === 'translate') {
    const p = translatePayloadSchema.safeParse(row.payload);
    if (!p.success) return out;
    const words = itemWords('translate', p.data, dialect === 'ckb' ? 'sorani' : 'kurmanji');
    if (words.answer?.lang === 'ku') {
      const en = meaningOfPrompt(p.data.prompt);
      if (en) keep(p.data.accepted[0]!, en, p.data.accepted, `lesson:${row.id}`);
    } else if (words.answer?.lang === 'meaning' && p.data.say) {
      keep(p.data.say, p.data.accepted[0]!, [p.data.say], `lesson:${row.id}`);
    }
  } else if (row.type === 'conversation') {
    const p = conversationPayloadSchema.safeParse(row.payload);
    if (!p.success) return out;
    p.data.lines.forEach((line, i) => {
      if (line.en) keep(line.text, line.en, [line.text], `conversation:${row.id}:${i}`);
    });
  }
  return out;
}

/** The consecutive line pairs of one conversation exercise (pure, for the tests). */
export function pairsOf(row: Pick<ExerciseRow, 'id' | 'type' | 'payload'>, dialect: GameDialect): ConversationPair[] {
  if (row.type !== 'conversation') return [];
  const p = conversationPayloadSchema.safeParse(row.payload);
  if (!p.success) return [];
  const { speakers, lines, id } = p.data;
  const out: ConversationPair[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i]!;
    const b = lines[i + 1]!;
    // a reply is someone else answering, and both lines are in the variety's own script
    if (a.speaker === b.speaker || !fitsDialect(a.text, dialect) || !fitsDialect(b.text, dialect)) continue;
    out.push({
      key: itemKey('pair', dialect, gradingKey(a.text), gradingKey(b.text)),
      conversation: id,
      line: { ku: a.text, en: a.en ?? null, speaker: speakers[a.speaker]?.character ?? null },
      reply: { ku: b.text, en: b.en ?? null, speaker: speakers[b.speaker]?.character ?? null },
      origin: `conversation:${row.id}:${i}`,
    });
  }
  return out;
}

/**
 * One conversation exercise whole (pure, for the tests): only when its title
 * and every line are in the variety's own script, so a passage made of it
 * never mixes the two.
 */
export function conversationOf(row: Pick<ExerciseRow, 'id' | 'type' | 'payload'>, dialect: GameDialect): ConversationText | null {
  if (row.type !== 'conversation') return null;
  const p = conversationPayloadSchema.safeParse(row.payload);
  if (!p.success) return null;
  const { speakers, lines, id, title } = p.data;
  if (!lines.every((l) => fitsDialect(l.text, dialect))) return null;
  return {
    key: itemKey('conv', dialect, ...lines.map((l) => gradingKey(l.text))),
    conversation: id,
    title: title && fitsDialect(title, dialect) ? title : null,
    lines: lines.map((l) => ({ ku: l.text, en: l.en ?? null, speaker: speakers[l.speaker]?.character ?? null })),
    origin: `conversation:${row.id}`,
  };
}

/** The word pairs one exercise teaches (pure, for the tests). */
export function wordsOfExercise(row: Pick<ExerciseRow, 'type' | 'payload'>, dialect: GameDialect): VocabularyWord[] {
  const pairs = itemWords(row.type as never, row.payload, dialect === 'ckb' ? 'sorani' : 'kurmanji').pairs;
  return pairs
    .filter((p) => fitsDialect(p.ku, dialect) && gameWords(p.ku).length === 1)
    .map((p) => ({ key: itemKey('w', dialect, foldForDialect(p.ku, dialect)), ku: gameWords(p.ku)[0]!, meanings: { en: p.meaning.trim() } }));
}

// ---------- the readers ----------

export class TrustedSources {
  constructor(
    private readonly db: Executor,
    private readonly cache: Cache | null = null,
  ) {}

  /** A pool through the cache, under the current generation. */
  private async pooled<T>(name: string, dialect: GameDialect, load: () => Promise<T>): Promise<T> {
    if (!this.cache) return load();
    const generation = (await this.cache.get<string>(CACHE_DOMAIN, GENERATION_ID)) ?? '0';
    return this.cache.withCache(CACHE_DOMAIN, `${generation}:${name}:${dialect}`, POOL_TTL_SECONDS, load);
  }

  /**
   * The exercises of every live published lesson in a course of this variety:
   * the newest published version at each place in a skill. A draft or a
   * lesson in review is never among them, nor a version replaced.
   */
  private async publishedExercises(dialect: GameDialect, types: readonly string[]): Promise<ExerciseRow[]> {
    const res = await this.db.query<ExerciseRow>(
      `WITH live AS (
         SELECT DISTINCT ON (l.skill_id, l.position) l.id, c.dialect
           FROM lessons l
           JOIN skills s ON s.id = l.skill_id
           JOIN units u ON u.id = s.unit_id
           JOIN courses c ON c.id = u.course_id
          WHERE l.status = 'published'
          ORDER BY l.skill_id, l.position, l.version DESC
       )
       SELECT e.id, e.type, e.payload, live.dialect
         FROM live JOIN exercises e ON e.lesson_id = live.id
        WHERE e.type = ANY($1::text[])
        ORDER BY live.id, e.position`,
      [types],
    );
    return res.rows.filter((r) => toDialect(r.dialect) === dialect);
  }

  /** Published lessons' sentences of 3–10 words with their English, one per Kurdish text. */
  lessonSentences(dialect: GameDialect): Promise<LessonSentence[]> {
    return this.pooled('lesson-sentences', dialect, async () => {
      const byKey = new Map<string, LessonSentence>();
      for (const row of await this.publishedExercises(dialect, ['translate', 'conversation'])) {
        for (const s of sentencesOf(row, dialect)) {
          const had = byKey.get(s.key);
          if (!had) byKey.set(s.key, s);
          else {
            // the same sentence taught twice: every order and every answer either lesson accepts
            for (const o of s.orders) if (!had.orders.some((x) => gradingKey(x) === gradingKey(o))) had.orders.push(o);
            had.accepted = [...new Set([...had.accepted, ...s.accepted])];
          }
        }
      }
      return [...byKey.values()];
    });
  }

  /** Published lessons' conversations, as one line and the line that answers it. */
  conversations(dialect: GameDialect): Promise<ConversationPair[]> {
    return this.pooled('conversations', dialect, async () => {
      const byKey = new Map<string, ConversationPair>();
      for (const row of await this.publishedExercises(dialect, ['conversation'])) {
        for (const pair of pairsOf(row, dialect)) if (!byKey.has(pair.key)) byKey.set(pair.key, pair);
      }
      return [...byKey.values()];
    });
  }

  /** Published lessons' conversations whole, one per set of lines (the same conversation in two lessons is one). */
  conversationTexts(dialect: GameDialect): Promise<ConversationText[]> {
    return this.pooled('conversation-texts', dialect, async () => {
      const byKey = new Map<string, ConversationText>();
      for (const row of await this.publishedExercises(dialect, ['conversation'])) {
        const text = conversationOf(row, dialect);
        if (text && !byKey.has(text.key)) byKey.set(text.key, text);
      }
      return [...byKey.values()];
    });
  }

  /**
   * Single words with their meanings: the pairs published lessons teach, then
   * published stories' one-word glossary terms (with meanings in more
   * languages, which win when the two disagree on nothing but coverage).
   */
  vocabulary(dialect: GameDialect): Promise<VocabularyWord[]> {
    return this.pooled('vocabulary', dialect, async () => {
      const byKey = new Map<string, VocabularyWord>();
      for (const row of await this.publishedExercises(dialect, ['match_pairs', 'translate', 'multiple_choice'])) {
        for (const w of wordsOfExercise(row, dialect)) if (!byKey.has(w.key)) byKey.set(w.key, w);
      }
      for (const passage of await this.storyPassages(dialect)) {
        for (const g of passage.glossary) {
          const words = gameWords(g.term);
          if (words.length !== 1) continue;
          const key = itemKey('w', dialect, foldForDialect(words[0]!, dialect));
          const had = byKey.get(key);
          byKey.set(key, { key, ku: words[0]!, meanings: { ...g.meanings, ...(had?.meanings ?? {}) } });
        }
      }
      return [...byKey.values()];
    });
  }

  /** Published stories, a paragraph at a time, each with the glossary terms found in it. */
  storyPassages(dialect: GameDialect): Promise<StoryPassage[]> {
    return this.pooled('story-passages', dialect, async () => {
      const res = await this.db.query<{ id: string; title: string; level: number; body: string; glossary: Array<{ term: string; meanings: Partial<Meanings> }> }>(
        `SELECT id, title, level, body, glossary FROM stories
          WHERE status = 'published' AND review_status = 'approved' AND dialect = $1
          ORDER BY level, id`,
        [storySpelling(dialect)],
      );
      const out: StoryPassage[] = [];
      for (const story of res.rows) {
        storyParagraphs(story.body).forEach((text, paragraph) => {
          if (!fitsDialect(text, dialect)) return;
          const words = ` ${gameWords(text).map((w) => foldForDialect(w, dialect)).join(' ')} `;
          const glossary = (story.glossary ?? [])
            .filter((g) => typeof g.term === 'string' && fitsDialect(g.term, dialect))
            .filter((g) => words.includes(` ${gameWords(g.term).map((w) => foldForDialect(w, dialect)).join(' ')} `))
            .map((g) => ({ term: g.term, meanings: g.meanings ?? {} }));
          out.push({ key: itemKey('p', dialect, story.id, String(paragraph)), storyId: story.id, title: story.title, level: story.level, paragraph, text, glossary });
        });
      }
      return out;
    });
  }

  /**
   * People's recordings with the Kurdish they say, in this variety's script:
   * lesson and story sentences, the alphabet's words, the dictionary's
   * pronunciations. The synthesised clips the apps ship are never rows here.
   */
  recordings(dialect: GameDialect): Promise<HumanRecording[]> {
    return this.pooled('recordings', dialect, async () => {
      const [lesson, alphabet, dictionary] = await Promise.all([
        this.db.query<{ key: string; text: string; url: string; speaker: SpeakerId | null; recorded_by: string | null }>(
          `SELECT key, text, url, speaker, recorded_by FROM lesson_audio ORDER BY key`,
        ),
        this.db.query<{ key: string; url: string; speaker: SpeakerId | null; updated_by: string | null }>(
          `SELECT key, url, speaker, updated_by FROM alphabet_audio ORDER BY key`,
        ),
        this.db.query<{ id: string; headword: string; url: string; speaker: SpeakerId | null; dialect: string }>(
          `SELECT a.id, e.headword, a.audio_url AS url, a.speaker, a.dialect
             FROM dict_audio a JOIN dict_entries e ON e.id = a.entry_id
            ORDER BY e.headword, a.id`,
        ),
      ]);
      const out: HumanRecording[] = [];
      for (const r of lesson.rows) {
        if (fitsDialect(r.text, dialect)) out.push({ key: `rec:lesson:${r.key}`, source: 'lesson', text: r.text, url: r.url, speaker: r.speaker, recordedBy: r.recorded_by });
      }
      for (const r of alphabet.rows) {
        // a letter's sound is said as a syllable ("ba" for b), which is no word of either variety: only the example words are
        if (isAlphabetSoundKey(r.key)) continue;
        const text = alphabetClipText(r.key);
        if (text && fitsDialect(text, dialect)) out.push({ key: `rec:alphabet:${r.key}`, source: 'alphabet', text, url: r.url, speaker: r.speaker, recordedBy: r.updated_by });
      }
      for (const r of dictionary.rows) {
        if (toDialect(r.dialect) === dialect && fitsDialect(r.headword, dialect)) {
          out.push({ key: `rec:dict:${r.id}`, source: 'dictionary', text: r.headword, url: r.url, speaker: r.speaker, recordedBy: null });
        }
      }
      return out;
    });
  }

  /**
   * Published rows of one kind and variety, each checked again against its
   * kind's schema and script: a row stored before a rule tightened is left
   * out rather than shown.
   */
  content<K extends GameContentKind>(kind: K, dialect: GameDialect): Promise<Array<PublishedContent<K>>> {
    return this.pooled(`content-${kind}`, dialect, async () => {
      const res = await this.db.query<{ id: string; level: number; payload: unknown }>(
        `SELECT id, level, payload FROM game_content
          WHERE kind = $1 AND dialect = $2 AND status = 'published' AND review_status = 'approved'
          ORDER BY level, id`,
        [kind, dialect],
      );
      const out: Array<PublishedContent<K>> = [];
      for (const row of res.rows) {
        const checked = checkGameContent(kind, dialect, row.payload);
        if (!checked.ok) continue;
        const key = kind === 'sentence' ? sentenceKey(dialect, (checked.payload as GameContentByKind['sentence']).ku) : `gc:${row.id}`;
        out.push({ id: row.id, key, level: row.level, payload: checked.payload as GameContentByKind[K] });
      }
      return out;
    });
  }
}

/** Retire every cached pool at once: a row was published or taken down. */
export async function bustGamePools(cache: Cache | null | undefined): Promise<void> {
  if (!cache) return;
  await cache.set(CACHE_DOMAIN, GENERATION_ID, randomBytes(9).toString('base64url'), 24 * 60 * 60);
}
