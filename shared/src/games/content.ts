/**
 * What the learning games' own content is made of: one schema per kind of
 * `game_content` row, the shared rules every row keeps, and the shapes the
 * apps are sent when a game is played.
 *
 * A game shows learners only Kurdish a person approved. Most of it is read
 * from what is already approved — published lessons, published stories, human
 * recordings — and the rest is a `game_content` row a reviewer approved and
 * an editor published (api/src/games). The Kurdish a game needs that nothing
 * approved holds yet goes in as a draft for review, never straight to
 * learners. Every row has exactly one variety, and `checkGameContent` refuses
 * a row whose Kurdish is written in the other variety's script.
 *
 * The schemas are built on first use rather than when this module loads: the
 * API and the admin validate with them, and an app that only reads the types
 * and the shapes below never builds them (nor pulls the validator into its
 * page bundle).
 *
 * The view types at the end are the contract between the server and both apps
 * for each game: what one round's item carries, without its answer. A game's
 * own track fills in the behaviour; the shapes are fixed here so the browser
 * and the phone cannot drift apart.
 */
import { z } from 'zod';
import { APP_LOCALE_CODES, type AppLocale } from '../locales.js';
import { SPEAKERS, type SpeakerId } from '../lipsync/speakers.js';
import { fitsDialect, foldForDialect, gameWords, type GameDialect } from './dialect.js';
import type { GamesAvailability } from './solo.js';
// the village's buildings are Kurdish Kingdom's own list; a building name row names one of them
import { KINGDOM_BUILDINGS } from './kingdom/buildings.js';

// ---------- the kinds, and the workflow every row goes through ----------

/**
 * The kinds of row, one per thing a game needs written:
 *   sentence          — Build a Kurdish Sentence: a sentence, its meaning, the word orders it accepts
 *   passage           — The Memory Thief: a passage and the key words that vanish from it
 *   scenario          — What Would You Say?: the situation, the line heard, the real reply, real wrong replies
 *   case_file         — Kurdish Detective: suspects, evidence lines, deduction steps, the solution
 *   word_category     — Kurdish Impostor: a category's Kurdish name and its meaning
 *   word_card         — Kurdish Impostor: a word, its category and the impostor's hint
 *   taboo_card        — Don't Say the Word!: the word to describe and the words that may not be said
 *   bluff_card        — Kurdish Bluff: a word and its real meaning, per language
 *   identity          — Who Am I?: an identity and its yes/no facts
 *   question_template — Who Am I?: a yes/no question and the fact that answers it
 *   building_name     — Kurdish Kingdom: a building's Kurdish name
 */
export const GAME_CONTENT_KINDS = [
  'sentence',
  'passage',
  'scenario',
  'case_file',
  'word_category',
  'word_card',
  'taboo_card',
  'bluff_card',
  'identity',
  'question_template',
  'building_name',
] as const;
export type GameContentKind = (typeof GAME_CONTENT_KINDS)[number];

export function isGameContentKind(v: unknown): v is GameContentKind {
  return (GAME_CONTENT_KINDS as readonly unknown[]).includes(v);
}

/**
 * The stories' workflow, for game content:
 *
 *   draft ──submit──▶ in_review ──publish──▶ published ──unpublish──▶ draft
 *     └──────────────publish──────────────────▲      any ──archive──▶ archived
 *
 * Publishing needs a reviewer's approval first (the table checks it too), and
 * a change to an approved row's content takes the approval away.
 */
export const GAME_CONTENT_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type GameContentStatus = (typeof GAME_CONTENT_STATUSES)[number];

export const GAME_CONTENT_REVIEW = ['unreviewed', 'approved'] as const;
export type GameContentReview = (typeof GAME_CONTENT_REVIEW)[number];

/** Which door a row came in by: written or imported in the panel, or seeded as a starter for review. */
export const GAME_CONTENT_SOURCES = ['admin', 'starter'] as const;
export type GameContentSource = (typeof GAME_CONTENT_SOURCES)[number];

export const GAME_CONTENT_REVIEW_NOTE_MAX = 600;

/** A content level, 1 to 5, in the shared plain-name order (1 is the first). */
export const GAME_LEVELS = [1, 2, 3, 4, 5] as const;
export type GameLevel = (typeof GAME_LEVELS)[number];

export function isGameLevel(v: unknown): v is GameLevel {
  return (GAME_LEVELS as readonly unknown[]).includes(v);
}

// ---------- the parts the schemas share ----------

/** What something means, by interface language: English always, the others when someone wrote them. */
export type Meanings = { en: string } & Partial<Record<AppLocale, string>>;

/** A short slug: lower-case letters, digits and dashes. */
export const GAME_SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

/** The rooms a scene can be set in, for its card's picture; the words are the apps'. */
export const SCENE_PLACES = ['home', 'street', 'market', 'shop', 'school', 'cafe', 'bus', 'doctor', 'phone', 'village', 'party', 'work'] as const;
export type ScenePlace = (typeof SCENE_PLACES)[number];

/** What a detective's evidence card is: a written message, a statement, talk overheard (with its recording), a note. */
export const EVIDENCE_KINDS = ['message', 'statement', 'overheard', 'note'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Where a row was taken from, when an importer made it: the lesson exercise or story it reuses. */
export interface ContentOrigin {
  type: 'lesson' | 'conversation' | 'story';
  /** the exercise or story id, and for a story the paragraph (`<storyId>:<paragraph>`) */
  ref: string;
}

/** Words per sentence a game lays out as tiles: fewer is no puzzle, more is a wall. */
export const SENTENCE_WORDS = { min: 3, max: 10 } as const;
/** Words that vanish from a memory passage. */
export const PASSAGE_HIDDEN = { min: 2, max: 6 } as const;

function build() {
  const kurdish = (max: number) => z.string().trim().min(1, 'write the Kurdish here').max(max, `keep it to ${max} characters`);
  const plain = (max: number) => z.string().trim().min(1, 'fill this in').max(max, `keep it to ${max} characters`);
  const slug = z.string().regex(GAME_SLUG_PATTERN, 'use 2–40 lower-case letters, digits and dashes');
  const locales = Object.fromEntries(APP_LOCALE_CODES.map((code) => [code, plain(400).optional()])) as Record<AppLocale, z.ZodOptional<z.ZodString>>;
  // English required: it is what every other language falls back to
  const meanings = z.strictObject({ ...locales, en: plain(400) }) as unknown as z.ZodType<Meanings>;
  // a translation that may be missing altogether, but never empty when there
  const someMeanings = z.strictObject(locales).refine((m) => Object.values(m).some((v) => typeof v === 'string' && v !== ''), {
    message: 'give at least one language',
  }) as unknown as z.ZodType<Partial<Record<AppLocale, string>>>;
  const origin = z.strictObject({ type: z.enum(['lesson', 'conversation', 'story']), ref: plain(160) });

  const sentence = z.strictObject({
    ku: kurdish(240),
    meanings,
    /** every other word order the sentence is right in, each the same words as `ku` */
    orders: z.array(kurdish(240)).max(11).default([]),
    /** what single words of it mean, for the correction after a round */
    glosses: z.array(z.strictObject({ word: kurdish(60), meanings })).max(SENTENCE_WORDS.max).default([]),
    origin: origin.optional(),
  });

  const passage = z.strictObject({
    title: kurdish(160).optional(),
    text: kurdish(2400),
    /** the whole passage in other languages, for after the round */
    translation: someMeanings.optional(),
    /** the words that dissolve, each as it is written in the text */
    hidden: z.array(z.strictObject({ term: kurdish(60), meanings })).min(PASSAGE_HIDDEN.min).max(PASSAGE_HIDDEN.max),
    origin: origin.optional(),
  });

  const line = z.strictObject({ ku: kurdish(300), meanings });
  const option = z.strictObject({ ku: kurdish(300), meanings, why: meanings.optional() });
  const scenario = z.strictObject({
    /** where and with whom, in the interface languages: not Kurdish, so it needs no native review */
    situation: meanings,
    place: z.enum(SCENE_PLACES).optional(),
    speaker: z.enum(SPEAKERS).optional(),
    /** what the other person says */
    line,
    /** the real next line */
    reply: option,
    /** real lines from other conversations, which do not fit here */
    others: z.array(option).min(2).max(4),
    origin: origin.optional(),
  });

  const caseFile = z
    .strictObject({
      title: meanings,
      intro: meanings,
      suspects: z.array(z.strictObject({ id: slug, name: plain(60), about: meanings })).min(2).max(6),
      evidence: z
        .array(
          z.strictObject({
            id: slug,
            kind: z.enum(EVIDENCE_KINDS),
            ku: kurdish(400),
            meanings,
            speaker: z.enum(SPEAKERS).optional(),
            /** the suspect it comes from, when it is theirs */
            from: slug.optional(),
            /** the lesson-audio key of its recording, when it has one */
            recording: plain(200).optional(),
            origin: origin.optional(),
          }),
        )
        .min(3)
        .max(16),
      steps: z
        .array(
          z.strictObject({
            prompt: meanings,
            options: z.array(meanings).min(2).max(4),
            correctIndex: z.number().int().min(0),
            /** the evidence that proves the answer, shown when the solution walks back */
            evidence: z.array(slug).min(1).max(6),
          }),
        )
        .min(1)
        .max(6),
      culprit: slug,
      solution: meanings,
      hints: z.array(meanings).max(3).default([]),
    })
    .superRefine((c, ctx) => {
      const suspects = new Set(c.suspects.map((s) => s.id));
      const evidence = new Set(c.evidence.map((e) => e.id));
      if (suspects.size !== c.suspects.length) ctx.addIssue({ code: 'custom', path: ['suspects'], message: 'two suspects share an id' });
      if (evidence.size !== c.evidence.length) ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'two pieces of evidence share an id' });
      if (!suspects.has(c.culprit)) ctx.addIssue({ code: 'custom', path: ['culprit'], message: 'the culprit must be one of the suspects' });
      c.evidence.forEach((e, i) => {
        if (e.from !== undefined && !suspects.has(e.from)) ctx.addIssue({ code: 'custom', path: ['evidence', i, 'from'], message: 'not one of the suspects' });
      });
      c.steps.forEach((s, i) => {
        if (s.correctIndex >= s.options.length) ctx.addIssue({ code: 'custom', path: ['steps', i, 'correctIndex'], message: 'must point at an option' });
        s.evidence.forEach((id, j) => {
          if (!evidence.has(id)) ctx.addIssue({ code: 'custom', path: ['steps', i, 'evidence', j], message: 'no evidence has this id' });
        });
      });
    });

  const wordCategory = z.strictObject({ slug, ku: kurdish(60), meanings });
  const wordCard = z.strictObject({
    word: kurdish(60),
    meanings,
    category: slug,
    /** what the impostor is told instead of the word: the category in Kurdish, with its meaning */
    hint: z.strictObject({ ku: kurdish(80), meanings }),
  });
  const tabooCard = z
    .strictObject({
      target: kurdish(60),
      meanings,
      forbidden: z.array(kurdish(60)).min(3).max(5),
      /** other forms of the target and the forbidden words that are refused too (plurals, the ezafe) */
      forms: z.array(kurdish(60)).max(16).default([]),
    })
    .refine((c) => !c.forbidden.some((f) => f.toLowerCase() === c.target.toLowerCase()), {
      path: ['forbidden'],
      message: 'the word to describe is forbidden already',
    });
  const bluffCard = z.strictObject({ word: kurdish(60), definitions: someMeanings });
  const identity = z.strictObject({
    word: kurdish(60),
    meanings,
    category: slug,
    /** yes/no facts by key ("has-legs": true), which the question templates ask */
    facts: z.record(slug, z.boolean()).refine((f) => Object.keys(f).length >= 4, { message: 'give at least four facts' }),
  });
  const questionTemplate = z.strictObject({ ku: kurdish(160), meanings, fact: slug });
  const buildingName = z.strictObject({ building: z.enum(KINGDOM_BUILDINGS), ku: kurdish(60), meanings });

  return {
    sentence,
    passage,
    scenario,
    case_file: caseFile,
    word_category: wordCategory,
    word_card: wordCard,
    taboo_card: tabooCard,
    bluff_card: bluffCard,
    identity,
    question_template: questionTemplate,
    building_name: buildingName,
  } satisfies Record<GameContentKind, z.ZodType>;
}

type Schemas = ReturnType<typeof build>;
let schemas: Schemas | null = null;

/** The schema of one kind's payload (zod), built the first time any is asked for. */
export function gameContentSchema<K extends GameContentKind>(kind: K): Schemas[K] {
  schemas ??= build();
  return schemas[kind];
}

export type SentenceContent = z.infer<Schemas['sentence']>;
export type PassageContent = z.infer<Schemas['passage']>;
export type ScenarioContent = z.infer<Schemas['scenario']>;
export type CaseFileContent = z.infer<Schemas['case_file']>;
export type WordCategoryContent = z.infer<Schemas['word_category']>;
export type WordCardContent = z.infer<Schemas['word_card']>;
export type TabooCardContent = z.infer<Schemas['taboo_card']>;
export type BluffCardContent = z.infer<Schemas['bluff_card']>;
export type IdentityContent = z.infer<Schemas['identity']>;
export type QuestionTemplateContent = z.infer<Schemas['question_template']>;
export type BuildingNameContent = z.infer<Schemas['building_name']>;

/** A payload of a kind, by its kind. */
export interface GameContentByKind {
  sentence: SentenceContent;
  passage: PassageContent;
  scenario: ScenarioContent;
  case_file: CaseFileContent;
  word_category: WordCategoryContent;
  word_card: WordCardContent;
  taboo_card: TabooCardContent;
  bluff_card: BluffCardContent;
  identity: IdentityContent;
  question_template: QuestionTemplateContent;
  building_name: BuildingNameContent;
}
export type GameContentPayload = GameContentByKind[GameContentKind];

// ---------- checking a row ----------

/** One thing wrong with a row, by the path of the field it is about. */
export interface GameContentIssue {
  path: string;
  message: string;
}

/** Every Kurdish text a payload holds, with its path: what has to be in the row's script. */
export function kurdishTexts(kind: GameContentKind, payload: GameContentPayload): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const add = (path: string, text: string | undefined): void => {
    if (typeof text === 'string') out.push({ path, text });
  };
  switch (kind) {
    case 'sentence': {
      const p = payload as SentenceContent;
      add('ku', p.ku);
      p.orders.forEach((o, i) => add(`orders.${i}`, o));
      p.glosses.forEach((g, i) => add(`glosses.${i}.word`, g.word));
      break;
    }
    case 'passage': {
      const p = payload as PassageContent;
      add('title', p.title);
      add('text', p.text);
      p.hidden.forEach((h, i) => add(`hidden.${i}.term`, h.term));
      break;
    }
    case 'scenario': {
      const p = payload as ScenarioContent;
      add('line.ku', p.line.ku);
      add('reply.ku', p.reply.ku);
      p.others.forEach((o, i) => add(`others.${i}.ku`, o.ku));
      break;
    }
    case 'case_file':
      (payload as CaseFileContent).evidence.forEach((e, i) => add(`evidence.${i}.ku`, e.ku));
      break;
    case 'word_category':
      add('ku', (payload as WordCategoryContent).ku);
      break;
    case 'word_card': {
      const p = payload as WordCardContent;
      add('word', p.word);
      add('hint.ku', p.hint.ku);
      break;
    }
    case 'taboo_card': {
      const p = payload as TabooCardContent;
      add('target', p.target);
      p.forbidden.forEach((f, i) => add(`forbidden.${i}`, f));
      p.forms.forEach((f, i) => add(`forms.${i}`, f));
      break;
    }
    case 'bluff_card':
      add('word', (payload as BluffCardContent).word);
      break;
    case 'identity':
      add('word', (payload as IdentityContent).word);
      break;
    case 'question_template':
      add('ku', (payload as QuestionTemplateContent).ku);
      break;
    case 'building_name':
      add('ku', (payload as BuildingNameContent).ku);
      break;
  }
  return out;
}

/** The same words, in any order: what makes another order of a sentence an order and not another sentence. */
export function sameWords(a: string, b: string, dialect: GameDialect): boolean {
  const key = (s: string) =>
    gameWords(s)
      .map((w) => foldForDialect(w, dialect))
      .sort()
      .join(' ');
  return key(a) === key(b);
}

/**
 * Whether a payload may be stored for a kind and a variety: the kind's schema,
 * then the rules a schema cannot see — every Kurdish text in the row's own
 * script, a sentence's other orders made of its own words, a passage's hidden
 * words found in its text. Returns the payload as it will be stored (trimmed,
 * defaults filled) or every issue at once.
 */
export function checkGameContent<K extends GameContentKind>(
  kind: K,
  dialect: GameDialect,
  payload: unknown,
): { ok: true; payload: GameContentByKind[K] } | { ok: false; issues: GameContentIssue[] } {
  const parsed = gameContentSchema(kind).safeParse(payload);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  }
  const data = parsed.data as GameContentByKind[K];
  const issues: GameContentIssue[] = [];
  for (const { path, text } of kurdishTexts(kind, data)) {
    if (!fitsDialect(text, dialect)) {
      issues.push({ path, message: dialect === 'ckb' ? 'write this in Soranî’s Arabic script only' : 'write this in Kurmancî’s Latin letters only' });
    }
  }
  if (kind === 'sentence') {
    const s = data as SentenceContent;
    const n = gameWords(s.ku).length;
    if (n < SENTENCE_WORDS.min || n > SENTENCE_WORDS.max) {
      issues.push({ path: 'ku', message: `a sentence for the tiles has ${SENTENCE_WORDS.min} to ${SENTENCE_WORDS.max} words (this has ${n})` });
    }
    s.orders.forEach((o, i) => {
      if (!sameWords(o, s.ku, dialect)) issues.push({ path: `orders.${i}`, message: 'another order uses exactly the same words as the sentence' });
    });
  }
  if (kind === 'passage') {
    const p = data as PassageContent;
    const words = new Set(gameWords(p.text).map((w) => foldForDialect(w, dialect)));
    const text = ` ${gameWords(p.text).map((w) => foldForDialect(w, dialect)).join(' ')} `;
    p.hidden.forEach((h, i) => {
      const term = foldForDialect(h.term, dialect);
      if (!words.has(term) && !text.includes(` ${term} `)) issues.push({ path: `hidden.${i}.term`, message: 'the passage does not contain this word as written' });
    });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, payload: data };
}

/** A row's headline for a list: its main Kurdish, else its English. */
export function contentHeadline(kind: GameContentKind, payload: GameContentPayload): string {
  switch (kind) {
    case 'sentence':
      return (payload as SentenceContent).ku;
    case 'passage': {
      const p = payload as PassageContent;
      return p.title ?? p.text.slice(0, 80);
    }
    case 'scenario':
      return (payload as ScenarioContent).line.ku;
    case 'case_file':
      return (payload as CaseFileContent).title.en;
    case 'word_category':
      return (payload as WordCategoryContent).ku;
    case 'word_card':
      return (payload as WordCardContent).word;
    case 'taboo_card':
      return (payload as TabooCardContent).target;
    case 'bluff_card':
      return (payload as BluffCardContent).word;
    case 'identity':
      return (payload as IdentityContent).word;
    case 'question_template':
      return (payload as QuestionTemplateContent).ku;
    case 'building_name':
      return (payload as BuildingNameContent).ku;
  }
}

/** A meaning in the reader's language, falling back to English. */
export function meaningIn(meanings: Partial<Meanings> | null | undefined, locale: string): string | null {
  if (!meanings) return null;
  const own = (meanings as Record<string, string | undefined>)[locale];
  if (typeof own === 'string' && own.trim() !== '') return own;
  return typeof meanings.en === 'string' && meanings.en.trim() !== '' ? meanings.en : null;
}

// ---------- what the apps are sent, game by game ----------

/** An opaque handle to a recording for one round: the address it plays from never says what it says. */
export type ClipHandle = string;

/** Hear It, Find It: one clip, and what is asked about it. The text behind the clip is never sent. */
export interface HearItItemView {
  index: number;
  stage: 'word' | 'phrase' | 'sentence' | 'type';
  clip: ClipHandle;
  /** replays left after the first play */
  replays: number;
  /** written forms (word, sentence) or meanings (phrase) to pick from; null when it is typed */
  options: string[] | null;
}

/** The Memory Thief: the passage to study, then the same passage with its key words gone. */
export interface MemoryThiefItemView {
  index: number;
  title: string | null;
  /** the passage in parts: text, or a gap numbered from 0 */
  parts: Array<{ text: string } | { gap: number }>;
  /** the passage whole, for the study phase */
  text: string;
  studySeconds: number;
  /** tiles to pick the vanished words from (beginner), or null to type them */
  tiles: string[] | null;
}

/** What Would You Say?: the scene, the line heard, and the replies to choose from or build. */
export interface WhatWouldYouSayItemView {
  index: number;
  situation: Meanings;
  place: ScenePlace | null;
  speaker: SpeakerId | null;
  line: { ku: string; clip: ClipHandle | null };
  /** real lines to choose from, shuffled; null at advanced level, where the reply is built from tiles */
  options: string[] | null;
  tiles: string[] | null;
}

/** Kurdish Detective: the case board as the player opens it; the solution stays on the server. */
export interface DetectiveBoardView {
  title: Meanings;
  intro: Meanings;
  suspects: Array<{ id: string; name: string; about: Meanings }>;
  evidence: Array<{ id: string; kind: EvidenceKind; ku: string; meanings: Meanings; speaker: SpeakerId | null; clip: ClipHandle | null }>;
  steps: number;
  hintsLeft: number;
}

/** One deduction step on the board. */
export interface DetectiveStepView {
  index: number;
  prompt: Meanings;
  options: Meanings[];
}

/** Who Am I?: the questions that can be asked, and the guesses to pick from. */
export interface WhoAmIRoundView {
  questions: Array<{ id: string; ku: string; meanings: Meanings }>;
  guesses: string[];
}

// ---------- what the admin panel is sent ----------

/** One row of game content as the admin panel lists and edits it. */
export interface AdminGameContent {
  id: string;
  kind: GameContentKind;
  /** the game its kind belongs to */
  game: string | null;
  dialect: GameDialect;
  level: number;
  payload: GameContentPayload;
  /** its main Kurdish, for a list */
  headline: string;
  status: GameContentStatus;
  reviewStatus: GameContentReview;
  reviewedBy: { id: string; username: string | null } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  source: GameContentSource;
  /** where an importer took it from: 'lesson:<exerciseId>', 'story:<storyId>:<paragraph>' */
  origin: string | null;
  lockVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** what would stop it being stored as it is now (a row saved before a rule tightened) */
  issues: GameContentIssue[];
}

/** The readiness view: what each game can be played with per variety, and every row's state. */
export interface GameContentReadiness {
  availability: GamesAvailability[];
  counts: Array<{ kind: GameContentKind; dialect: GameDialect; status: GameContentStatus; reviewStatus: GameContentReview; n: number }>;
}
