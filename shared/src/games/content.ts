/**
 * The learning games' own content: one schema per kind of `game_content` row, the rules every row keeps, and the shapes
 * the apps are sent in play. Games show only Kurdish a person approved: mostly from published lessons, stories and human
 * recordings, otherwise a `game_content` row a reviewer approved and an editor published (api/src/games); anything new goes
 * in as a draft for review. Every row has one variety, and `checkGameContent` refuses Kurdish in the other variety's
 * script.
 *
 * Schemas are built on first use, so an app that only reads the types never builds them or bundles the validator. The view
 * types at the end fix each game's server-to-app contract: one item, without its answer. `riddle` and `proverb` belong to
 * no game; they are the Stories collections (lore.ts), kept here to share the review workflow.
 */
import { z } from 'zod';
import { APP_LOCALE_CODES, type AppLocale } from '../locales.js';
import { SPEAKERS, type RecordingVoice, type SpeakerId } from '../lipsync/speakers.js';
import { isHttpsUrl } from '../sanitize.js';
import { GAME_DIALECTS, fitsDialect, foldForDialect, gameWords, type GameDialect } from './dialect.js';
import type { GamesAvailability } from './solo.js';
import { WHO_AM_I_MAX_SOMETIMES } from './who-am-i/game.js';
import {
  LORE_COUNTS,
  LORE_LIMITS,
  LORE_TRADITIONS,
  PROVERB_THEMES,
  RIDDLE_CATEGORIES,
  RIDDLE_DIFFICULTIES,
  type AdminContentTranslation,
} from '../lore.js';

// ---------- the kinds, and the workflow every row goes through ----------

/**
 * The kinds of row, one per thing a game needs written:
 *   sentence          Build a Sentence: a sentence, its meaning, the word orders it accepts
 *   passage           The Memory Thief: a passage and the key words that vanish from it
 *   case_file         Detective: suspects, evidence lines, deduction steps, the solution
 *   word_category     Impostor: a category's Kurdish name and meaning
 *   word_card         Impostor: a word, its category, the impostor's hint and the twin an odd-word round deals
 *   identity          Who Am I?: an identity and its facts (yes, no or sometimes)
 *   question_template Who Am I?: a question and the fact that answers it
 *   riddle            the Stories' riddles: a question, hints, the answer and the forms it accepts
 *   proverb           the Stories' proverbs: a saying, its themes, variants and a scene it is said in
 *
 * The database also holds `taboo_card`, `bluff_card`, `building_name` and `scenario` rows from retired games; nothing reads
 * them, since every query names the kinds it wants from this list.
 */
export const GAME_CONTENT_KINDS = [
  'sentence',
  'passage',
  'case_file',
  'word_category',
  'word_card',
  'identity',
  'question_template',
  'riddle',
  'proverb',
] as const;
export type GameContentKind = (typeof GAME_CONTENT_KINDS)[number];

/**
 * The stories' workflow, for game content:
 *
 *   draft ──submit──▶ in_review ──publish──▶ published ──unpublish──▶ draft
 *     └──────────────publish──────────────────▲      any ──archive──▶ archived
 *
 * Publishing needs a reviewer's approval first (the table checks it too), and changing an approved row's content removes
 * the approval.
 */
export const GAME_CONTENT_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type GameContentStatus = (typeof GAME_CONTENT_STATUSES)[number];

export const GAME_CONTENT_REVIEW = ['unreviewed', 'approved'] as const;
export type GameContentReview = (typeof GAME_CONTENT_REVIEW)[number];

/** How a row came in: written or imported in the panel, or seeded as a starter for review. */
export const GAME_CONTENT_SOURCES = ['admin', 'starter'] as const;
export type GameContentSource = (typeof GAME_CONTENT_SOURCES)[number];

export const GAME_CONTENT_REVIEW_NOTE_MAX = 600;

/** A content level, 1 to 5, in the shared plain-name order. */
export const GAME_LEVELS = [1, 2, 3, 4, 5] as const;
export type GameLevel = (typeof GAME_LEVELS)[number];

// ---------- the parts the schemas share ----------

/** What something means by interface language: English always, the others where written. */
export type Meanings = { en: string } & Partial<Record<AppLocale, string>>;

/** A short slug: lower-case letters, digits and dashes. */
export const GAME_SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

/** A detective evidence card's kind: a written message, a statement, overheard talk (with its recording), a note. */
export const EVIDENCE_KINDS = ['message', 'statement', 'overheard', 'note'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Where an importer took a row from: the lesson exercise or story it reuses. */
export interface ContentOrigin {
  type: 'lesson' | 'conversation' | 'story';
  /** the exercise or story id, and for a story its paragraph (`<storyId>:<paragraph>`) */
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
  // English is required, since every other language falls back to it.
  const meanings = z.strictObject({ ...locales, en: plain(400) }) as unknown as z.ZodType<Meanings>;
  // A translation that may be missing altogether, but is never empty when present.
  const someMeanings = z.strictObject(locales).refine((m) => Object.values(m).some((v) => typeof v === 'string' && v !== ''), {
    message: 'give at least one language',
  }) as unknown as z.ZodType<Partial<Record<AppLocale, string>>>;
  const origin = z.strictObject({ type: z.enum(['lesson', 'conversation', 'story']), ref: plain(160) });

  const sentence = z.strictObject({
    ku: kurdish(240),
    meanings,
    /** every other word order the sentence is right in, each with the same words as `ku` */
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
    /** the words that dissolve, each as written in the text */
    hidden: z.array(z.strictObject({ term: kurdish(60), meanings })).min(PASSAGE_HIDDEN.min).max(PASSAGE_HIDDEN.max),
    origin: origin.optional(),
  });

  const caseFile = z
    .strictObject({
      title: meanings,
      intro: meanings,
      /** each with the character drawn as their portrait, when one of the app's characters plays them */
      suspects: z.array(z.strictObject({ id: slug, name: plain(60), about: meanings, portrait: z.enum(SPEAKERS).optional() })).min(2).max(6),
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
            /** the evidence that proves the answer, shown when the solution is walked back */
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
    /** other forms of the word a clue may not say either (plurals, the ezafe); common endings are caught anyway */
    forms: z.array(kurdish(60)).max(12).default([]),
    /** a word close to this one but not it (a cat for a dog), dealt to the odd one out in a round where they get their own word */
    twin: kurdish(60).optional(),
  });
  const identity = z.strictObject({
    word: kurdish(60),
    meanings,
    category: slug,
    /**
     * Facts by key ("four-legs": true) for the question templates: yes, no, or "sometimes" where either is honest; a
     * missing fact is never asked of this card.
     */
    facts: z
      .record(slug, z.union([z.boolean(), z.literal('sometimes')]))
      .refine((f) => Object.keys(f).length >= 4, { message: 'give at least four facts' })
      .refine((f) => Object.values(f).filter((v) => v === 'sometimes').length <= WHO_AM_I_MAX_SOMETIMES, {
        message: `mark at most ${WHO_AM_I_MAX_SOMETIMES} facts as sometimes`,
      }),
  });
  const questionTemplate = z.strictObject({ ku: kurdish(160), meanings, fact: slug });

  // The collections' rows (lore.ts): where each was found, and what a reviewer should know.
  const source = z.strictObject({
    title: plain(LORE_LIMITS.sourceTitle),
    author: plain(LORE_LIMITS.sourceAuthor).optional(),
    url: plain(LORE_LIMITS.sourceUrl).refine(isHttpsUrl, { message: 'use an https:// address' }).optional(),
    note: plain(LORE_LIMITS.note).optional(),
  });
  const sources = z.array(source).max(LORE_COUNTS.sources.max).default([]);
  /** for the row's reviewers; never sent to a learner */
  const notes = plain(LORE_LIMITS.notes).optional();
  const region = plain(LORE_LIMITS.region).optional();
  const riddle = z.strictObject({
    slug,
    difficulty: z.enum(RIDDLE_DIFFICULTIES),
    category: z.enum(RIDDLE_CATEGORIES),
    tradition: z.enum(LORE_TRADITIONS),
    region,
    question: kurdish(LORE_LIMITS.question),
    /** one or two, the second nearer the answer than the first */
    hints: z.array(kurdish(LORE_LIMITS.hint)).min(LORE_COUNTS.hints.min).max(LORE_COUNTS.hints.max),
    answer: kurdish(LORE_LIMITS.answer),
    /** what else a learner may type and be right: with and without an ending, synonyms, both spellings */
    accepted: z.array(kurdish(LORE_LIMITS.answer)).min(LORE_COUNTS.accepted.min).max(LORE_COUNTS.accepted.max),
    /** related words a reasoning player might give, called close rather than wrong (never a spelling of the answer) */
    near: z.array(kurdish(LORE_LIMITS.answer)).max(LORE_COUNTS.accepted.max).optional(),
    explanation: kurdish(LORE_LIMITS.explanation),
    sources,
    notes,
  });
  const proverb = z.strictObject({
    slug,
    text: kurdish(LORE_LIMITS.proverb),
    themes: z
      .array(z.enum(PROVERB_THEMES))
      .min(LORE_COUNTS.themes.min)
      .max(LORE_COUNTS.themes.max)
      .refine((t) => new Set(t).size === t.length, { message: 'name each theme once' }),
    tradition: z.enum(LORE_TRADITIONS),
    region,
    /** other wordings: another region's, or the other variety's counterpart, each in its own variety's script */
    variants: z
      .array(z.strictObject({ text: plain(LORE_LIMITS.proverb), dialect: z.enum(GAME_DIALECTS), region, note: plain(LORE_LIMITS.note).optional() }))
      .max(LORE_COUNTS.variants.max)
      .default([]),
    /** a short scene in the row's variety with the proverb said in it */
    exampleKu: kurdish(LORE_LIMITS.example),
    sources,
    notes,
  });

  return {
    sentence,
    passage,
    case_file: caseFile,
    word_category: wordCategory,
    word_card: wordCard,
    identity,
    question_template: questionTemplate,
    riddle,
    proverb,
  } satisfies Record<GameContentKind, z.ZodType>;
}

type Schemas = ReturnType<typeof build>;
let schemas: Schemas | null = null;

/** One kind's payload schema (zod), built on first use. */
export function gameContentSchema<K extends GameContentKind>(kind: K): Schemas[K] {
  schemas ??= build();
  return schemas[kind];
}

export type SentenceContent = z.infer<Schemas['sentence']>;
export type PassageContent = z.infer<Schemas['passage']>;
export type CaseFileContent = z.infer<Schemas['case_file']>;
export type WordCategoryContent = z.infer<Schemas['word_category']>;
export type WordCardContent = z.infer<Schemas['word_card']>;
export type IdentityContent = z.infer<Schemas['identity']>;
export type QuestionTemplateContent = z.infer<Schemas['question_template']>;
export type RiddleContent = z.infer<Schemas['riddle']>;
export type ProverbContent = z.infer<Schemas['proverb']>;

/** A payload of a kind, by its kind. */
export interface GameContentByKind {
  sentence: SentenceContent;
  passage: PassageContent;
  case_file: CaseFileContent;
  word_category: WordCategoryContent;
  word_card: WordCardContent;
  identity: IdentityContent;
  question_template: QuestionTemplateContent;
  riddle: RiddleContent;
  proverb: ProverbContent;
}
export type GameContentPayload = GameContentByKind[GameContentKind];

// ---------- checking a row ----------

/** One thing wrong with a row, by the path of the field it is about. */
export interface GameContentIssue {
  path: string;
  message: string;
}

/**
 * Every Kurdish text in a payload with its path: what must be in the row's script, or for a proverb's other-variety
 * variant, in that variety's script (`dialect`).
 */
export function kurdishTexts(kind: GameContentKind, payload: GameContentPayload): Array<{ path: string; text: string; dialect?: GameDialect }> {
  const out: Array<{ path: string; text: string; dialect?: GameDialect }> = [];
  const add = (path: string, text: string | undefined, dialect?: GameDialect): void => {
    if (typeof text === 'string') out.push(dialect ? { path, text, dialect } : { path, text });
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
      (p.forms ?? []).forEach((f, i) => add(`forms.${i}`, f));
      add('twin', p.twin);
      break;
    }
    case 'identity':
      add('word', (payload as IdentityContent).word);
      break;
    case 'question_template':
      add('ku', (payload as QuestionTemplateContent).ku);
      break;
    case 'riddle': {
      const p = payload as RiddleContent;
      add('question', p.question);
      p.hints.forEach((h, i) => add(`hints.${i}`, h));
      add('answer', p.answer);
      p.accepted.forEach((a, i) => add(`accepted.${i}`, a));
      (p.near ?? []).forEach((n, i) => add(`near.${i}`, n));
      add('explanation', p.explanation);
      break;
    }
    case 'proverb': {
      const p = payload as ProverbContent;
      add('text', p.text);
      (p.variants ?? []).forEach((v, i) => add(`variants.${i}.text`, v.text, v.dialect));
      add('exampleKu', p.exampleKu);
      break;
    }
  }
  return out;
}

/** The same words in any order: what makes another order of a sentence an order rather than another sentence. */
export function sameWords(a: string, b: string, dialect: GameDialect): boolean {
  const key = (s: string) =>
    gameWords(s)
      .map((w) => foldForDialect(w, dialect))
      .sort()
      .join(' ');
  return key(a) === key(b);
}

/**
 * Whether a payload may be stored for a kind and variety: the kind's schema, then the rules a schema cannot see (every
 * Kurdish text in the row's script, a sentence's other orders made of its own words, a passage's hidden words in its text).
 * Returns the payload as stored (trimmed, defaults filled) or every issue at once.
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
  for (const { path, text, dialect: own } of kurdishTexts(kind, data)) {
    const script = own ?? dialect;
    if (!fitsDialect(text, script)) {
      issues.push({ path, message: script === 'ckb' ? 'write this in Soranî’s Arabic script only' : 'write this in Kurmancî’s Latin letters only' });
    }
  }
  if (kind === 'riddle' || kind === 'proverb') {
    const p = data as RiddleContent | ProverbContent;
    // The slug names it in learner routes beside fixed words (/riddles/daily, /proverbs/rounds), so the variety prefix keeps them apart.
    if (!p.slug.startsWith(`${dialect}-`)) issues.push({ path: 'slug', message: `start the slug with its variety: ${dialect}-…` });
    // Nothing is presented as old without saying where it was found, and a regional form says where it is said.
    if (p.tradition !== 'new' && p.sources.length === 0) issues.push({ path: 'sources', message: 'a traditional or regional one names at least one source' });
    if (p.tradition === 'regional' && !p.region) issues.push({ path: 'region', message: 'a regional form names its region' });
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
    case 'case_file':
      return (payload as CaseFileContent).title.en;
    case 'word_category':
      return (payload as WordCategoryContent).ku;
    case 'word_card':
      return (payload as WordCardContent).word;
    case 'identity':
      return (payload as IdentityContent).word;
    case 'question_template':
      return (payload as QuestionTemplateContent).ku;
    case 'riddle':
      return (payload as RiddleContent).question;
    case 'proverb':
      return (payload as ProverbContent).text;
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

/** An opaque handle to a recording for one round; its address never says what it says. */
export type ClipHandle = string;

/**
 * Hear It, Find It: one clip and what is asked about it (games/hear-it). The text behind the clip is never sent; the clip
 * is a one-round handle played from `hearItClipPath`.
 */
export interface HearItItemView {
  index: number;
  stage: 'word' | 'phrase' | 'sentence' | 'type';
  clip: ClipHandle;
  /** replays left after the first play */
  replays: number;
  /** written forms to pick from (word, sentence); null on the other rungs */
  options: string[] | null;
  /** meanings to pick from (phrase), each by interface language; null on the other rungs */
  meanings: Array<Partial<Meanings>> | null;
  /** the character the recording is shown with, when one was chosen */
  speaker: SpeakerId | null;
  /** this text was heard before in another voice, and this is a different one */
  newVoice: boolean;
  level: GameLevel;
}

/**
 * The Memory Thief: the passage to study, then the same passage with its key words gone (games/memory-thief). It is sent
 * whole while studied and with gaps once the player asks for them (`POST /games/solo/sessions/:id/begin`), for good: a
 * round revisited after that never shows the passage again.
 */
export interface MemoryThiefItemView {
  index: number;
  /** studied (the passage whole), or given back (its gaps) */
  phase: 'study' | 'restore';
  /** a story's paragraph, or lines of a lesson's conversation */
  kind: 'story' | 'conversation';
  title: string | null;
  /** the whole passage while studied (a conversation one line per line); null once its words have vanished */
  text: string | null;
  /** once its words have vanished, the passage in parts: text, a gap numbered from 0, or a conversation line's start; null while studied */
  parts: Array<{ text: string } | { gap: number } | { line: number }> | null;
  /** who says each line (a story's one line: null) */
  speakers: Array<SpeakerId | null>;
  /** how many words vanish */
  gaps: number;
  studySeconds: number;
  /** once its words have vanished, tiles to pick them from (beginner, intermediate); null to type them (advanced), and while studied */
  tiles: string[] | null;
  level: GameLevel;
}

/**
 * A recording played beside the Kurdish it says, and who says it (with the mouth's timeline, as lessons send it).
 * Detective sends the recording's address rather than a handle: the words are on screen beside it, as a lesson sends a
 * conversation's lines, so nothing behind it can give anything away.
 */
export interface SpokenAudio {
  src: string;
  voice: RecordingVoice | null;
}

/**
 * Detective: the case board as opened (games/detective). The solution stays on the server, and so does a card's meaning
 * until found by a deduction or translated with a hint.
 */
export interface DetectiveBoardView {
  title: Meanings;
  intro: Meanings;
  suspects: Array<{ id: string; name: string; about: Meanings; portrait: SpeakerId | null }>;
  evidence: Array<{
    id: string;
    kind: EvidenceKind;
    ku: string;
    /** null until it is found or translated */
    meanings: Meanings | null;
    speaker: SpeakerId | null;
    /** the suspect it comes from, when it is theirs */
    from: string | null;
    audio: SpokenAudio | null;
  }>;
  steps: number;
  hintsLeft: number;
  hintsUsed: number;
  /** the written hints read so far, in order */
  hints: Meanings[];
  /** a written hint is left to read; when none is, a hint can only translate a card */
  moreHints: boolean;
  /** the notebook: each deduction made, with its answer and the evidence proving it */
  notebook: Array<{ step: number; prompt: Meanings; answer: Meanings; evidence: string[] }>;
  level: GameLevel;
}

/** One case item: a deduction step, or at the end the accusation (suspects by id, in board order). */
export type DetectiveItemView =
  | { index: number; kind: 'step'; prompt: Meanings; options: Meanings[] }
  | { index: number; kind: 'accuse'; suspects: string[] };

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
  /** what would stop it being stored now, such as a row saved before a rule tightened */
  issues: GameContentIssue[];
  /** A riddle's or proverb's translations, one per language with its own review (lore.ts); sent when one row is opened, not in lists. */
  translations?: Partial<Record<AppLocale, AdminContentTranslation>>;
}

/** The readiness view: what each game can be played with per variety, and every row's state. */
export interface GameContentReadiness {
  availability: GamesAvailability[];
  counts: Array<{ kind: GameContentKind; dialect: GameDialect; status: GameContentStatus; reviewStatus: GameContentReview; n: number }>;
}
