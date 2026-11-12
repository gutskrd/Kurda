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
 *   - people's recordings, never the synthesised clips the apps ship: of
 *     `lesson_audio` only those filed under a text published content says
 *     now (a published lesson's, a published conversation's line, an approved
 *     story's sentence) — the studio records drafts too, and a text corrected
 *     since keeps its old recording — shown with the text as it is published;
 *     the alphabet's words; and the pronunciations of dictionary entries an
 *     admin curated for the games (`in_games`);
 *   - `game_content` rows that are published, and so approved.
 * Drafts, lessons in review, unpublished stories and unapproved rows are never
 * read here, so no game can reach them.
 *
 * One reader looks further, and no game holds it: the starter library
 * (games/starter-library.ts) reads the course as it stands (`scope: 'course'`)
 * — the lessons and stories Hevalo ships, published or not yet — to make each
 * game's first set of rows from them. What it makes are `game_content` rows,
 * published, which the games then read like any other row. `game_content` and
 * the recordings are read the same way in both scopes.
 *
 * Every item is in exactly one variety. The variety comes from where the item
 * lives (a course's, a story's or a row's dialect, read through `toDialect`),
 * and the item's Kurdish must also be written in that variety's script
 * (`fitsDialect`): a Latin word in a Soranî lesson, or a recording whose text
 * is in the other script, is left out of both.
 *
 * What a word means is shown only where the item itself attests it: a
 * sentence's words by the meanings its own lesson teaches for exactly those
 * words (`lessonWordMeanings`: the same letters, marks and capitals, never a
 * folded look-alike from somewhere else — tê is not te, xwe is not xwê, Baran
 * the name is not baran the rain, and ne in "xemlandî ne" is not the ne a
 * lesson elsewhere teaches as "not"), a recording's text by the meaning its
 * own lesson item gives it (`publishedRecordingTexts`), a dictionary entry's
 * by its own first sense. Where nothing attests a meaning, none is shown.
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
 * itself: `bustGamePools`). What a game works out from the pools — its maps
 * of words and meanings, its decoy buckets — is kept in this process too
 * (`derived`), under the same generation, so a round is made from them
 * without building them again.
 */
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';
import {
  SENTENCE_WORDS,
  alphabetClipText,
  checkGameContent,
  conversationClips,
  conversationLineKey,
  fitsDialect,
  foldForDialect,
  gameWords,
  lessonAudioKey,
  lessonAudioTargets,
  storyAudioSentences,
  storyParagraphs,
  storySpelling,
  toDialect,
  type GameContentByKind,
  type GameContentKind,
  type GameDialect,
  type GameLevel,
  type Meanings,
  type SpeakerId,
} from '@kurda/shared';
import type { Cache } from '../cache/cache.js';
import { conversationPayloadSchema, gradingKey, translatePayloadSchema } from '../content/exercises.js';
import { itemWords } from '../content/item-words.js';

type Executor = Pick<pg.Pool, 'query'>;

/** How long a pool is kept, in seconds. */
export const POOL_TTL_SECONDS = 300;
/** A dictionary sense longer than this explains rather than translates: it is no meaning to show beside a word. */
const DICTIONARY_GLOSS_MAX = 40;
/** How long what a game works out from the pools is kept in this process: a fraction of a pool's life, so it follows the pools closely. */
export const DERIVED_TTL_MS = 60_000;
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
  /** what its own lesson teaches its words to mean, each word exactly as written there (`taughtIn`); absent or empty when nothing is attested */
  glosses?: AttestedWord[];
}

/** A word exactly as written, with the meaning the item it is part of attests for it. */
export interface AttestedWord {
  word: string;
  meanings: Partial<Meanings>;
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
  /** what its own lesson teaches the words of its lines to mean, exactly as written (`taughtIn`) */
  taught?: AttestedWord[];
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
  /** what its own item says it means (a lesson's English for it, a dictionary entry's first sense); null when nothing does */
  meanings?: Partial<Meanings> | null;
}

/** A published `game_content` row, as a game reads it. */
export interface PublishedContent<K extends GameContentKind> {
  id: string;
  key: string;
  level: number;
  payload: GameContentByKind[K];
}

/**
 * One line of a published conversation, where it stands and who says it: for
 * a case's evidence and for the admin's line picker, so neither types the
 * Kurdish again.
 */
export interface TaughtLine {
  /** the exercise, the conversation's own id, and its title when it is in the variety's script */
  exerciseId: string;
  conversation: string;
  title: string | null;
  /** the line's place in the conversation, and the part (by place) that says it */
  index: number;
  part: number;
  speaker: SpeakerId | null;
  ku: string;
  en: string | null;
  /** the lesson-audio key a recording of this line is filed under ('' when it cannot be filed) */
  recording: string;
  /** from where its unit stands in its course (`unitLevel`) */
  level: GameLevel;
  /** 'conversation:<exerciseId>:<index>' */
  origin: string;
}

// ---------- reading a published lesson's exercises ----------

interface ExerciseRow {
  id: string;
  type: string;
  payload: unknown;
  dialect: string;
  /** the published lesson it is in */
  lesson_id: string;
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

/** The types of exercise that pair a word with what it means: where a lesson's word meanings are read from. */
const PAIRING_TYPES = ['match_pairs', 'translate', 'multiple_choice'] as const;

/** A meaning as two are told apart: its English, without case or the closing stop. */
const meaningKeyOf = (m: Partial<Meanings>): string => (m.en ?? '').trim().toLowerCase().replace(/[\s.!?…]+$/u, '');

/**
 * What each published lesson teaches its single words to mean (pure, for the
 * tests): a match card and its partner, a one-word translation, a one-word
 * question and its answer — by lesson, each word exactly as the lesson writes
 * it (NFC, marks and capitals kept). A word one lesson gives two different
 * meanings is no word with a meaning there: which it is cannot be told.
 */
export function lessonWordMeanings(rows: ReadonlyArray<Pick<ExerciseRow, 'type' | 'payload' | 'lesson_id'>>, dialect: GameDialect): Map<string, Map<string, Partial<Meanings>>> {
  const found = new Map<string, Map<string, Partial<Meanings> | null>>();
  for (const row of rows) {
    if (!(PAIRING_TYPES as readonly string[]).includes(row.type)) continue;
    const lesson = found.get(row.lesson_id) ?? new Map<string, Partial<Meanings> | null>();
    found.set(row.lesson_id, lesson);
    for (const pair of itemWords(row.type as never, row.payload, dialect === 'ckb' ? 'sorani' : 'kurmanji').pairs) {
      const words = gameWords(pair.ku);
      const en = pair.meaning.trim();
      if (words.length !== 1 || !fitsDialect(pair.ku, dialect) || en === '' || fitsDialect(en, 'ckb')) continue;
      const word = words[0]!.normalize('NFC');
      const meanings = { en };
      const had = lesson.get(word);
      if (had === undefined) lesson.set(word, meanings);
      else if (had !== null && meaningKeyOf(had) !== meaningKeyOf(meanings)) lesson.set(word, null);
    }
  }
  const out = new Map<string, Map<string, Partial<Meanings>>>();
  for (const [lesson, words] of found) {
    const kept = new Map<string, Partial<Meanings>>();
    for (const [word, meanings] of words) if (meanings) kept.set(word, meanings);
    out.set(lesson, kept);
  }
  return out;
}

/** The words of a text a lesson attests a meaning for, exactly as written, each once (pure, for the tests). */
export function taughtIn(text: string, meanings: ReadonlyMap<string, Partial<Meanings>> | undefined): AttestedWord[] {
  if (!meanings || meanings.size === 0) return [];
  const out: AttestedWord[] = [];
  for (const word of new Set(gameWords(text).map((w) => w.normalize('NFC')))) {
    const m = meanings.get(word);
    if (m) out.push({ word, meanings: m });
  }
  return out;
}

/** Two items' attested words together: a word they disagree on means nothing certain, and is left out. */
export function mergeAttested(a: readonly AttestedWord[], b: readonly AttestedWord[]): AttestedWord[] {
  const byWord = new Map<string, AttestedWord | null>();
  for (const w of [...a, ...b]) {
    const had = byWord.get(w.word);
    if (had === undefined) byWord.set(w.word, w);
    else if (had !== null && meaningKeyOf(had.meanings) !== meaningKeyOf(w.meanings)) byWord.set(w.word, null);
  }
  return [...byWord.values()].filter((w): w is AttestedWord => w !== null);
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

/**
 * The level of a conversation from where its unit stands in its course: the
 * first fifth of the units is level 1, the last fifth level 5. A course is
 * written to grow harder unit by unit, so this is the course's own order.
 */
export function unitLevel(unitPosition: number, unitCount: number): GameLevel {
  if (!(unitCount > 0) || !(unitPosition > 0)) return 1;
  const share = Math.min(1, Math.max(0, (unitPosition - 1) / unitCount));
  return Math.min(5, Math.floor(share * 5) + 1) as GameLevel;
}

/**
 * Every line of one conversation exercise in the variety's script (pure, for
 * the tests), each with the key its recording is filed under and the level
 * its unit gives it.
 */
export function conversationLinesOf(row: Pick<ExerciseRow, 'id' | 'type' | 'payload'>, dialect: GameDialect, level: GameLevel): TaughtLine[] {
  if (row.type !== 'conversation') return [];
  const p = conversationPayloadSchema.safeParse(row.payload);
  if (!p.success) return [];
  const { speakers, lines, id, title } = p.data;
  const out: TaughtLine[] = [];
  lines.forEach((line, index) => {
    const ku = line.text.trim();
    if (!fitsDialect(ku, dialect)) return;
    const en = line.en?.trim() || null;
    out.push({
      exerciseId: row.id,
      conversation: id,
      title: title && fitsDialect(title, dialect) ? title : null,
      index,
      part: line.speaker,
      speaker: speakers[line.speaker]?.character ?? null,
      ku,
      // an English that is in the other script is no English
      en: en && !fitsDialect(en, 'ckb') ? en : null,
      recording: conversationLineKey(id, line.speaker, line.text),
      level,
      origin: `conversation:${row.id}:${index}`,
    });
  });
  return out;
}

/**
 * The recordings a game may play, by the `lesson_audio` key each is filed
 * under, with the text as published content writes it now (pure, for the
 * tests): every text a live published lesson asks to be heard
 * (`lessonAudioTargets`), every line of its conversations (by the line's own
 * key, `conversationClips`), and every sentence of an approved published
 * story (`storyAudioSentences`) — the same keys the recording studio files
 * them under. A recording under any other key is of a draft, of a story in
 * review or rejected, or of a text corrected since.
 */
export function publishedRecordingTexts(
  exercises: ReadonlyArray<Pick<ExerciseRow, 'type' | 'payload'>>,
  paragraphs: readonly string[],
  dialect: GameDialect = 'kmr',
): Map<string, { text: string; meanings: Partial<Meanings> | null }> {
  const out = new Map<string, { text: string; meanings: Partial<Meanings> | null }>();
  const add = (key: string, text: string, meanings: Partial<Meanings> | null): void => {
    if (key === '') return;
    const had = out.get(key);
    if (!had) out.set(key, { text, meanings });
    // the same text filed twice: a meaning only where the two agree, or one says none
    else if (meanings && (!had.meanings || meaningKeyOf(had.meanings) === meaningKeyOf(meanings))) had.meanings = had.meanings ?? meanings;
    else if (meanings && had.meanings) had.meanings = null;
  };
  const english = (en: string | null | undefined): Partial<Meanings> | null => (en && en.trim() !== '' && !fitsDialect(en, 'ckb') ? { en: en.trim() } : null);
  for (const row of exercises) {
    if (row.type === 'conversation') {
      const lines = conversationPayloadSchema.safeParse(row.payload);
      for (const clip of conversationClips(row.payload)) add(clip.key, clip.text, english(lines.success ? lines.data.lines[clip.index]?.en : null));
      continue;
    }
    // what this item itself says its Kurdish means: a match card's partner, a translation's English
    const own = new Map<string, Partial<Meanings>>();
    for (const pair of itemWords(row.type as never, row.payload, dialect === 'ckb' ? 'sorani' : 'kurmanji').pairs) {
      const m = english(pair.meaning);
      if (m) own.set(lessonAudioKey(pair.ku), m);
    }
    if (row.type === 'translate') {
      const p = translatePayloadSchema.safeParse(row.payload);
      const answer = p.success ? itemWords('translate', p.data, dialect === 'ckb' ? 'sorani' : 'kurmanji').answer : null;
      // the English a translation into Kurdish asks for; or, for one out of Kurdish, its answer
      const m = !p.success ? null : answer?.lang === 'ku' ? english(meaningOfPrompt(p.data.prompt)) : answer?.lang === 'meaning' && p.data.say ? english(p.data.accepted[0]) : null;
      const ku = !p.success ? null : answer?.lang === 'ku' ? p.data.accepted[0]! : (p.data.say ?? null);
      if (m && ku) own.set(lessonAudioKey(ku), m);
    }
    for (const text of lessonAudioTargets(row.type, row.payload)) add(lessonAudioKey(text), text, own.get(lessonAudioKey(text)) ?? null);
  }
  for (const paragraph of paragraphs) for (const sentence of storyAudioSentences(paragraph)) add(lessonAudioKey(sentence), sentence, null);
  return out;
}

// ---------- the readers ----------

/**
 * What a reader counts as the course: `published` is what learners can meet,
 * and the only scope a game reads; `course` is every lesson and story that
 * has not been archived, drafts among them, for the starter library alone.
 */
export type SourceScope = 'published' | 'course';

export class TrustedSources {
  private readonly memo = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly db: Executor,
    private readonly cache: Cache | null = null,
    private readonly clock: () => number = Date.now,
    private readonly scope: SourceScope = 'published',
  ) {}

  /** Which lessons count: the published ones, or for the starter library every one that is not put away. */
  private get lessonsThatCount(): string {
    return this.scope === 'course' ? `l.status <> 'archived'` : `l.status = 'published'`;
  }

  /** A pool through the cache, under the current generation. */
  private async pooled<T>(name: string, dialect: GameDialect, load: () => Promise<T>): Promise<T> {
    if (!this.cache) return load();
    const generation = (await this.cache.get<string>(CACHE_DOMAIN, GENERATION_ID)) ?? '0';
    // the scope is part of the key: what the starter library reads of the course is never a game's pool
    return this.cache.withCache(CACHE_DOMAIN, `${generation}:${this.scope === 'course' ? 'course:' : ''}${name}:${dialect}`, POOL_TTL_SECONDS, load);
  }

  /**
   * Something a game works out from the pools (`name` says which game and
   * what), kept in this process for DERIVED_TTL_MS under the pools'
   * generation, so a publish retires it on every instance at once. Rounds
   * made together share one build. Without a cache there is no generation to
   * follow, and it is built every time.
   */
  async derived<T>(name: string, dialect: GameDialect, build: () => Promise<T>): Promise<T> {
    if (!this.cache) return build();
    const generation = (await this.cache.get<string>(CACHE_DOMAIN, GENERATION_ID)) ?? '0';
    const key = `${generation}:${this.scope === 'course' ? 'course:' : ''}${name}:${dialect}`;
    const now = this.clock();
    const hit = this.memo.get(key);
    if (hit && now - hit.at < DERIVED_TTL_MS) return hit.value as Promise<T>;
    for (const [k, v] of this.memo) if (now - v.at >= DERIVED_TTL_MS) this.memo.delete(k);
    const value = build();
    this.memo.set(key, { at: now, value });
    // a build that failed is not kept: the next round tries again
    value.catch(() => {
      if (this.memo.get(key)?.value === value) this.memo.delete(key);
    });
    return value;
  }

  /**
   * The exercises of every live published lesson in a course of this variety:
   * the newest published version at each place in a skill, of these types (or
   * of every type, for null). A draft or a lesson in review is never among
   * them, nor a version replaced.
   */
  private async publishedExercises(dialect: GameDialect, types: readonly string[] | null): Promise<ExerciseRow[]> {
    const res = await this.db.query<ExerciseRow>(
      `WITH live AS (
         SELECT DISTINCT ON (l.skill_id, l.position) l.id, c.dialect
           FROM lessons l
           JOIN skills s ON s.id = l.skill_id
           JOIN units u ON u.id = s.unit_id
           JOIN courses c ON c.id = u.course_id
          WHERE ${this.lessonsThatCount}
          ORDER BY l.skill_id, l.position, l.version DESC
       )
       SELECT e.id, e.type, e.payload, live.dialect, live.id AS lesson_id
         FROM live JOIN exercises e ON e.lesson_id = live.id
        WHERE $1::text[] IS NULL OR e.type = ANY($1::text[])
        ORDER BY live.id, e.position`,
      [types],
    );
    return res.rows.filter((r) => toDialect(r.dialect) === dialect);
  }

  /** Published lessons' sentences of 3–10 words with their English, one per Kurdish text. */
  lessonSentences(dialect: GameDialect): Promise<LessonSentence[]> {
    return this.pooled('lesson-sentences-attested', dialect, async () => {
      const byKey = new Map<string, LessonSentence>();
      const rows = await this.publishedExercises(dialect, ['translate', 'conversation', ...PAIRING_TYPES]);
      const taught = lessonWordMeanings(rows, dialect);
      for (const row of rows) {
        if (row.type !== 'translate' && row.type !== 'conversation') continue;
        for (const s of sentencesOf(row, dialect)) {
          s.glosses = taughtIn(s.ku, taught.get(row.lesson_id));
          const had = byKey.get(s.key);
          if (!had) byKey.set(s.key, s);
          else {
            // the same sentence taught twice: every order and every answer either lesson accepts, and the meanings both agree on
            for (const o of s.orders) if (!had.orders.some((x) => gradingKey(x) === gradingKey(o))) had.orders.push(o);
            had.accepted = [...new Set([...had.accepted, ...s.accepted])];
            had.glosses = mergeAttested(had.glosses ?? [], s.glosses);
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
    return this.pooled('conversation-texts-attested', dialect, async () => {
      const byKey = new Map<string, ConversationText>();
      const rows = await this.publishedExercises(dialect, ['conversation', ...PAIRING_TYPES]);
      const taught = lessonWordMeanings(rows, dialect);
      for (const row of rows) {
        if (row.type !== 'conversation') continue;
        const text = conversationOf(row, dialect);
        if (!text) continue;
        text.taught = taughtIn(text.lines.map((l) => l.ku).join(' '), taught.get(row.lesson_id));
        const had = byKey.get(text.key);
        if (!had) byKey.set(text.key, text);
        else had.taught = mergeAttested(had.taught ?? [], text.taught);
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
          WHERE ${this.scope === 'course' ? `status <> 'archived'` : `status = 'published' AND review_status = 'approved'`} AND dialect = $1
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
   * the published lessons' and approved stories' texts (each with the text as
   * published, `publishedRecordingTexts`: a recording of anything else is
   * left out), the alphabet's words, and the pronunciations of the curated
   * dictionary entries of this variety. The synthesised clips the apps ship
   * are never rows here.
   */
  recordings(dialect: GameDialect): Promise<HumanRecording[]> {
    return this.pooled('published-recordings', dialect, async () => {
      const [lesson, alphabet, dictionary, exercises, stories] = await Promise.all([
        this.db.query<{ key: string; text: string; url: string; speaker: SpeakerId | null; recorded_by: string | null }>(
          `SELECT key, text, url, speaker, recorded_by FROM lesson_audio ORDER BY key`,
        ),
        this.db.query<{ key: string; url: string; speaker: SpeakerId | null; updated_by: string | null }>(
          `SELECT key, url, speaker, updated_by FROM alphabet_audio ORDER BY key`,
        ),
        this.db.query<{ id: string; headword: string; url: string; speaker: SpeakerId | null; dialect: string; entry_dialect: string; gloss: string | null }>(
          `SELECT a.id, e.headword, a.audio_url AS url, a.speaker, a.dialect, e.dialect AS entry_dialect,
                  (SELECT s.definition_en FROM dict_senses s WHERE s.entry_id = e.id ORDER BY s.position LIMIT 1) AS gloss
             FROM dict_audio a JOIN dict_entries e ON e.id = a.entry_id
            WHERE e.in_games
            ORDER BY e.headword, a.id`,
        ),
        this.publishedExercises(dialect, null),
        this.storyPassages(dialect),
      ]);
      const published = publishedRecordingTexts(
        exercises,
        stories.map((p) => p.text),
        dialect,
      );
      const out: HumanRecording[] = [];
      for (const r of lesson.rows) {
        // a recording is played only of a text published content says now, shown as it says it, with the meaning it gives it
        const found = published.get(r.key);
        if (found !== undefined && fitsDialect(found.text, dialect)) {
          out.push({ key: `rec:lesson:${r.key}`, source: 'lesson', text: found.text, url: r.url, speaker: r.speaker, recordedBy: r.recorded_by, meanings: found.meanings });
        }
      }
      for (const r of alphabet.rows) {
        // a letter's sound is said as a syllable ("ba" for b), which is no word of either variety: only the example words are
        if (isAlphabetSoundKey(r.key)) continue;
        const text = alphabetClipText(r.key);
        if (text && fitsDialect(text, dialect)) out.push({ key: `rec:alphabet:${r.key}`, source: 'alphabet', text, url: r.url, speaker: r.speaker, recordedBy: r.updated_by });
      }
      for (const r of dictionary.rows) {
        if (toDialect(r.dialect) === dialect && toDialect(r.entry_dialect) === dialect && fitsDialect(r.headword, dialect)) {
          // the entry's own first sense, when it is short enough to be a meaning rather than an explanation
          const gloss = r.gloss?.trim() ?? '';
          const meanings = gloss !== '' && gloss.length <= DICTIONARY_GLOSS_MAX && !fitsDialect(gloss, 'ckb') ? { en: gloss } : null;
          out.push({ key: `rec:dict:${r.id}`, source: 'dictionary', text: r.headword, url: r.url, speaker: r.speaker, recordedBy: null, meanings });
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

  /**
   * Every line of every live published lesson's conversations in this
   * variety, in order, each with its level: where its unit stands in its
   * course, the first units easiest. A draft, a lesson in review or a version
   * replaced is never among them.
   */
  conversationLines(dialect: GameDialect): Promise<TaughtLine[]> {
    return this.pooled('conversation-lines', dialect, async () => {
      const res = await this.db.query<ExerciseRow & { unit_rank: number; unit_count: number }>(
        `WITH live AS (
           SELECT DISTINCT ON (l.skill_id, l.position) l.id, c.dialect,
                  (SELECT count(*)::int FROM units u2 WHERE u2.course_id = u.course_id AND u2.position <= u.position) AS unit_rank,
                  (SELECT count(*)::int FROM units u3 WHERE u3.course_id = u.course_id) AS unit_count
             FROM lessons l
             JOIN skills s ON s.id = l.skill_id
             JOIN units u ON u.id = s.unit_id
             JOIN courses c ON c.id = u.course_id
            WHERE ${this.lessonsThatCount}
            ORDER BY l.skill_id, l.position, l.version DESC
         )
         SELECT e.id, e.type, e.payload, live.dialect, live.unit_rank, live.unit_count
           FROM live JOIN exercises e ON e.lesson_id = live.id
          WHERE e.type = 'conversation'
          ORDER BY live.unit_rank, live.id, e.position`,
      );
      const out: TaughtLine[] = [];
      for (const row of res.rows) {
        if (toDialect(row.dialect) !== dialect) continue;
        out.push(...conversationLinesOf(row, dialect, unitLevel(row.unit_rank, row.unit_count)));
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
