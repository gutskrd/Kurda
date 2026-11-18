/**
 * Riddles (Kurmancî *mamik* or *metelok*, Soranî *metel* مەتەڵ) and proverbs (*gotinên pêşiyan*): the Stories section's
 * two collections that are not stories.
 *
 * Both are `game_content` rows of their own kinds (schemas in games/content.ts), so they share every game row's workflow:
 * draft, review, approval, publish, the lock version and starter drafts. The Kurdish is the row; each other language is
 * a translation with its own review, so one language can be corrected without unpublishing the row.
 *
 * Here is what the API, both apps and the admin agree on: the lists rows are filed by, translations, what solves a
 * riddle, the day's riddle and proverb, what a solve pays, and the learner routes' shapes. A riddle never spoils itself:
 * lists and pages carry the question and the hint count, never an untaken hint, the answer, the accepted forms or the
 * explanation, which come one call at a time when asked for.
 */
import { z } from 'zod';
import { APP_LOCALE_CODES, type AppLocale } from './locales.js';
import { fitsDialect, foldForDialect, gameWords, type GameDialect } from './games/dialect.js';

// ---------- what every row is filed by ----------

/** The two `game_content` kinds that make up the collections and belong to no game. */
export const LORE_KINDS = ['riddle', 'proverb'] as const;
export type LoreKind = (typeof LORE_KINDS)[number];

export function isLoreKind(v: unknown): v is LoreKind {
  return v === 'riddle' || v === 'proverb';
}

export const RIDDLE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type RiddleDifficulty = (typeof RIDDLE_DIFFICULTIES)[number];

/** The content level a riddle is stored at, derived from its difficulty so the two can never disagree. */
export const RIDDLE_LEVELS: Readonly<Record<RiddleDifficulty, 1 | 3 | 5>> = { easy: 1, medium: 3, hard: 5 };

export const RIDDLE_CATEGORIES = ['nature', 'everyday', 'wordplay', 'logic', 'funny', 'culture', 'children'] as const;
export type RiddleCategory = (typeof RIDDLE_CATEGORIES)[number];

/**
 * Where a riddle or proverb comes from: attested in the tradition, a regional form (naming its region), or newly written
 * in its spirit. A new one is never presented as old, and a traditional or regional one names a source
 * (`checkGameContent`).
 */
export const LORE_TRADITIONS = ['traditional', 'regional', 'new'] as const;
export type LoreTradition = (typeof LORE_TRADITIONS)[number];

export const PROVERB_THEMES = [
  'wisdom',
  'patience',
  'friendship',
  'family',
  'respect',
  'courage',
  'knowledge',
  'life-experience',
  'trust',
  'hard-work',
  'human-nature',
  'mistakes',
] as const;
export type ProverbTheme = (typeof PROVERB_THEMES)[number];

export function isProverbTheme(v: unknown): v is ProverbTheme {
  return (PROVERB_THEMES as readonly unknown[]).includes(v);
}

/** How many of each a row may hold. */
export const LORE_COUNTS = {
  hints: { min: 1, max: 2 },
  accepted: { min: 1, max: 12 },
  themes: { min: 1, max: 3 },
  variants: { max: 8 },
  sources: { max: 8 },
} as const;

/** The longest each text may be, in characters. */
export const LORE_LIMITS = {
  question: 400,
  hint: 240,
  answer: 120,
  explanation: 800,
  proverb: 300,
  example: 1200,
  region: 80,
  note: 600,
  notes: 2000,
  sourceTitle: 200,
  sourceAuthor: 120,
  sourceUrl: 500,
  translationShort: 400,
  translationLong: 1200,
} as const;

/** Where a riddle or proverb was found: a book, an article or a collection online. */
export interface LoreSource {
  title: string;
  author?: string;
  /** https only */
  url?: string;
  /** what it gives: the riddle as told there, the page, the form */
  note?: string;
}

// ---------- translations, each language reviewed on its own ----------

/** A riddle in another language: the question, its hints in the same order, the answer and why it is right. */
export interface RiddleTranslation {
  question: string;
  hints: string[];
  answer: string;
  explanation: string;
}

/** A proverb in another language: a natural rendering, its meaning and use, and a short scene. */
export interface ProverbTranslation {
  translation: string;
  /** the word-for-word sense, where it differs from the translation and helps */
  literal?: string;
  meaning: string;
  explanation: string;
  /** a short everyday scene where someone would say it */
  example: string;
  /** a real proverb of that language with the same sense, only where one exists */
  equivalent?: string;
  /** cultural or historical background, where there is some */
  context?: string;
}

export type LoreTranslation = RiddleTranslation | ProverbTranslation;

export const TRANSLATION_REVIEW = ['unreviewed', 'reviewed'] as const;
export type TranslationReview = (typeof TRANSLATION_REVIEW)[number];

/**
 * The interface language a row's Kurdish is in: Kurmancî rows are `ku`'s, Soranî rows `ckb`'s. That language is the
 * original, never a translation of itself; a Soranî riddle's `ku` translation is its Kurmancî rendering, and the reverse.
 */
export function originalLocale(dialect: GameDialect): AppLocale {
  return dialect === 'ckb' ? 'ckb' : 'ku';
}

/** The languages a row of this variety is translated into: every app language but its own. */
export function translationLocales(dialect: GameDialect): AppLocale[] {
  const own = originalLocale(dialect);
  return APP_LOCALE_CODES.filter((c) => c !== own);
}

function buildTranslations() {
  const text = (max: number) => z.string().trim().min(1, 'fill this in').max(max, `keep it to ${max} characters`);
  // An optional field is left out rather than sent empty, so what is there is never blank.
  const optional = (max: number) => text(max).optional();
  const riddle = z.strictObject({
    question: text(LORE_LIMITS.question),
    hints: z.array(text(LORE_LIMITS.hint)).max(LORE_COUNTS.hints.max),
    answer: text(LORE_LIMITS.answer),
    explanation: text(LORE_LIMITS.explanation),
  });
  const proverb = z.strictObject({
    translation: text(LORE_LIMITS.translationShort),
    literal: optional(LORE_LIMITS.translationShort),
    meaning: text(LORE_LIMITS.translationShort),
    explanation: text(LORE_LIMITS.translationLong),
    example: text(LORE_LIMITS.translationLong),
    equivalent: optional(LORE_LIMITS.translationShort),
    context: optional(LORE_LIMITS.translationLong),
  });
  return { riddle, proverb } satisfies Record<LoreKind, z.ZodType>;
}

let translationSchemas: ReturnType<typeof buildTranslations> | null = null;

/** One kind's translation schema (zod), built on first use. */
export function loreTranslationSchema<K extends LoreKind>(kind: K): ReturnType<typeof buildTranslations>[K] {
  translationSchemas ??= buildTranslations();
  return translationSchemas[kind];
}

/** Every text of a translation, by its path. */
function translationTexts(payload: LoreTranslation): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') out.push({ path: key, text: value });
    else if (Array.isArray(value)) value.forEach((v, i) => typeof v === 'string' && out.push({ path: `${key}.${i}`, text: v }));
  }
  return out;
}

/**
 * Whether a translation may be stored: its kind's schema, not the row's own language, the Kurdish interface languages in
 * their own scripts (`ku` in Latin, `ckb` in Arabic), and for a riddle exactly as many hints as the Kurdish, so each
 * stands beside its hint. Returns the trimmed payload or every issue.
 */
export function checkLoreTranslation<K extends LoreKind>(
  kind: K,
  row: { dialect: GameDialect; hints?: number },
  locale: AppLocale,
  payload: unknown,
): { ok: true; payload: K extends 'riddle' ? RiddleTranslation : ProverbTranslation } | { ok: false; issues: Array<{ path: string; message: string }> } {
  if (locale === originalLocale(row.dialect)) {
    return { ok: false, issues: [{ path: '', message: 'this is the language the row is written in: edit the row itself' }] };
  }
  const parsed = loreTranslationSchema(kind).safeParse(payload);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
  const data = JSON.parse(JSON.stringify(parsed.data)) as LoreTranslation;
  const issues: Array<{ path: string; message: string }> = [];
  if (locale === 'ku' || locale === 'ckb') {
    const script: GameDialect = locale === 'ckb' ? 'ckb' : 'kmr';
    for (const { path, text } of translationTexts(data)) {
      if (!fitsDialect(text, script)) issues.push({ path, message: script === 'ckb' ? 'write this in Soranî’s Arabic script only' : 'write this in Kurmancî’s Latin letters only' });
    }
  }
  if (kind === 'riddle' && row.hints !== undefined) {
    const n = (data as RiddleTranslation).hints.length;
    if (n !== row.hints) issues.push({ path: 'hints', message: `the riddle has ${row.hints} hint${row.hints === 1 ? '' : 's'}: translate each of them (this has ${n})` });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, payload: data as K extends 'riddle' ? RiddleTranslation : ProverbTranslation };
}

/** One language's translation of a row, as the admin panel edits it. */
export interface AdminContentTranslation {
  payload: LoreTranslation;
  reviewStatus: TranslationReview;
  reviewedBy: { id: string; username: string | null } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  updatedAt: string;
  /** what would stop it being stored now, such as a riddle whose hints changed after it was translated */
  issues: Array<{ path: string; message: string }>;
}

// ---------- what counts as solving a riddle ----------

/**
 * What a typed guess is matched by, per variety. Folded as the games fold a typed answer (`foldForDialect`, lenient), so
 * case, spacing, punctuation and the marks on ê î û ç ş or ێ ۆ ڵ ڕ do not count. Around the answer a learner may also
 * write a demonstrative before it ("ew sî", ئەو), the copula after it as its own word ("sî ye"), and one ending on its last
 * word: in Kurmancî -ek/-yek (-ekê, -ekî), -a/-ya, -ê/-yê, -ên/-yên, -î/-yî; in Soranî -ەکە/-کە, -ێک/-یەک, -ی and
 * -ە/-یە (-ەکەیە with both).
 *
 * The rest must be one of the answers as written, whole: "sî", "siya" and "ew sî ye" solve a riddle whose answer is sî;
 * "sîber" does only if the riddle accepts it. An ending comes off only where a stem of two letters or more remains.
 */
export const RIDDLE_MATCHING = {
  kmr: {
    before: ['ew', 'ev'],
    after: ['e', 'ye'],
    // As `foldForDialect` leaves them, ê î û without their marks, longest first.
    endings: ['yeke', 'yeki', 'eke', 'eki', 'yek', 'yen', 'ek', 'en', 'ya', 'ye', 'yi', 'a', 'e', 'i'],
  },
  ckb: {
    // ئەوە and ئەمە: "it is …", as it is most often said (ئەوە دەرزییە).
    before: ['ئەو', 'ئەم', 'ئەوە', 'ئەمە'],
    after: ['ە', 'یە'],
    // As the lenient fold leaves them, ێ as ی; یەکەیە and یەکە are the definite form after a vowel (دەرزییەکە).
    endings: ['یەکەیە', 'ەکەیە', 'یەکە', 'ەکە', 'یەک', 'کە', 'یک', 'یە', 'ە', 'ی'],
  },
} as const satisfies Record<GameDialect, { before: readonly string[]; after: readonly string[]; endings: readonly string[] }>;

/** The shortest stem an ending may leave. */
const RIDDLE_STEM_MIN = 2;

/** A text as a guess and an answer are compared: folded leniently, letters and single spaces. */
export function riddleKey(text: string, dialect: GameDialect): string {
  return foldForDialect(text, dialect, true);
}

/** Every reading of a typed guess the rule allows: as typed, without the words around it, and without an ending on its last word. */
export function riddleGuessForms(guess: string, dialect: GameDialect): string[] {
  const rule = RIDDLE_MATCHING[dialect];
  const words = riddleKey(guess, dialect).split(' ').filter((w) => w !== '');
  if (words.length === 0) return [];
  const cores: string[][] = [words];
  if (words.length > 1 && (rule.before as readonly string[]).includes(words[0]!)) cores.push(words.slice(1));
  for (const core of [...cores]) {
    if (core.length > 1 && (rule.after as readonly string[]).includes(core[core.length - 1]!)) cores.push(core.slice(0, -1));
  }
  const out = new Set<string>();
  for (const core of cores) {
    if (core.length === 0) continue;
    out.add(core.join(' '));
    const last = core[core.length - 1]!;
    for (const ending of rule.endings) {
      if (last.endsWith(ending) && [...last].length - [...ending].length >= RIDDLE_STEM_MIN) {
        out.add([...core.slice(0, -1), last.slice(0, last.length - ending.length)].join(' '));
      }
    }
  }
  return [...out];
}

/** Whether a typed guess solves a riddle, against its answer and the forms it accepts (`RIDDLE_MATCHING`). */
export function riddleGuessMatches(guess: string, answers: readonly string[], dialect: GameDialect): boolean {
  const targets = new Set(answers.map((a) => riddleKey(a, dialect)).filter((k) => k !== ''));
  if (targets.size === 0 || gameWords(guess).length === 0) return false;
  return riddleGuessForms(guess, dialect).some((form) => targets.has(form));
}

// ---------- the riddle and the proverb of the day ----------

const DAY_MS = 86_400_000;

/** Whole days since 1970-01-01 of a calendar date ('YYYY-MM-DD'). */
export function loreDayNumber(localDate: string): number {
  return Math.floor(Date.parse(`${localDate}T00:00:00Z`) / DAY_MS);
}

/** A small stable hash (FNV-1a), so the day's order is the same on every server and app. */
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The riddle or proverb slug a calendar day puts forward: the day's number taken round the collection, so consecutive
 * days step through all of it before any repeats. The order is shuffled by each slug's hash rather than alphabetical, so
 * neighbouring days are not neighbouring slugs. Null while there is none.
 */
export function dailyLorePick(slugs: readonly string[], localDate: string): string | null {
  if (slugs.length === 0) return null;
  const day = loreDayNumber(localDate);
  if (!Number.isFinite(day)) return null;
  const order = [...new Set(slugs)].sort((a, b) => stableHash(a) - stableHash(b) || (a < b ? -1 : a > b ? 1 : 0));
  return order[((day % order.length) + order.length) % order.length]!;
}

// ---------- what a riddle pays ----------

/** The ledger source a solved riddle pays from: a game source, under the league's daily cap on game XP. */
export const RIDDLE_XP_SOURCE = 'riddle';

/** XP for solving a riddle by a guess, by its difficulty, before any hint. */
export const RIDDLE_XP: Readonly<Record<RiddleDifficulty, number>> = { easy: 3, medium: 5, hard: 8 };

/** Guesses a solve may take and still pay, since a riddle is to be thought about, not typed at; later solves still count but pay nothing. */
export const RIDDLE_PAID_GUESSES = 10;

/**
 * What solving a riddle pays, once per learner and riddle: its difficulty's XP, half (rounded up) after a hint, nothing
 * after a reveal or past RIDDLE_PAID_GUESSES guesses. Opening, hints and reveals pay nothing.
 */
export function riddleXp(difficulty: RiddleDifficulty, outcome: { hintsUsed: number; guesses: number; revealed: boolean }): number {
  if (outcome.revealed || outcome.guesses > RIDDLE_PAID_GUESSES) return 0;
  const base = RIDDLE_XP[difficulty];
  return outcome.hintsUsed > 0 ? Math.ceil(base / 2) : base;
}

// ---------- what the learner routes send ----------

/** Where a learner stands with a riddle: not tried, tried, solved by a guess, or its answer shown. */
export type RiddleState = 'new' | 'trying' | 'solved' | 'revealed';

/** A riddle as a list and its page show it: the question and nothing that answers it. */
export interface RiddleCard {
  slug: string;
  dialect: GameDialect;
  difficulty: RiddleDifficulty;
  category: RiddleCategory;
  tradition: LoreTradition;
  region: string | null;
  question: string;
  translations: Partial<Record<AppLocale, { question: string }>>;
  hintCount: number;
  state: RiddleState;
}

/** One hint, taken: its place, its Kurdish, and what it says in the other languages. */
export interface RiddleHint {
  index: number;
  text: string;
  translations: Partial<Record<AppLocale, string>>;
}

/** A riddle's page: the card and the hints this learner already took (a visitor keeps theirs in the app). */
export type RiddleDetail = RiddleCard & { hintsUsed: RiddleHint[] };

/** The answer, once it is solved or asked for. */
export interface RiddleAnswer {
  answer: string;
  explanation: string;
  translations: Partial<Record<AppLocale, { answer: string; explanation: string }>>;
  tradition: LoreTradition;
  region: string | null;
  sources: LoreSource[];
}

/** GET /riddles: a variety's published riddles, the day's, and how many this learner has solved. */
export interface RiddleList {
  riddles: RiddleCard[];
  daily: string | null;
  solved: number;
  total: number;
}

/**
 * How a wrong guess was near: `close`, a word the riddle lists as near; `spelling`, one letter from the answer or an
 * accepted form; `language`, the answer in the learner's own language. A near guess still counts as a guess and pays and
 * reveals nothing.
 */
export const RIDDLE_NEAR_KINDS = ['close', 'spelling', 'language'] as const;
export type RiddleNear = (typeof RIDDLE_NEAR_KINDS)[number];

export type RiddleGuessResult = { correct: false; near?: RiddleNear } | { correct: true; answer: RiddleAnswer; xp: number };

/** The shortest answer a spelling slip is allowed for; a shorter word one letter away is another word. */
export const RIDDLE_SPELLING_MIN = 4;

/** Whether two words are one edit apart (a letter more, less or different). */
export function oneEditApart(a: string, b: string): boolean {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > 1 || a === b) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (x.length > y.length) i++;
    else if (y.length > x.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

/** How near a wrong guess is: listed as near, then one letter from an answer of four letters or more, then the answer in the learner's language; else null. */
export function riddleGuessNear(
  guess: string,
  riddle: { answers: readonly string[]; near?: readonly string[]; translated?: readonly string[] },
  dialect: GameDialect,
): RiddleNear | null {
  if (gameWords(guess).length === 0) return null;
  if (riddle.near && riddle.near.length > 0 && riddleGuessMatches(guess, riddle.near, dialect)) return 'close';
  const forms = riddleGuessForms(guess, dialect);
  const targets = riddle.answers.map((a) => riddleKey(a, dialect)).filter((k) => [...k].length >= RIDDLE_SPELLING_MIN);
  if (forms.some((f) => targets.some((t) => oneEditApart(f, t)))) return 'spelling';
  const translated = (riddle.translated ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim());
  const typed = guess.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  if (typed !== '' && translated.some((t) => t !== '' && (t === typed || t.replace(/^(the|a|an) /, '') === typed.replace(/^(the|a|an) /, '')))) return 'language';
  return null;
}

/** Another wording of a proverb: another region's, or the other variety's counterpart. */
export interface ProverbVariant {
  text: string;
  dialect: GameDialect;
  region?: string;
  note?: string;
}

/** A proverb as the learner reads it. Reading pays nothing. */
export interface ProverbView {
  slug: string;
  dialect: GameDialect;
  text: string;
  themes: ProverbTheme[];
  tradition: LoreTradition;
  region: string | null;
  variants: ProverbVariant[];
  exampleKu: string;
  translations: Partial<Record<AppLocale, ProverbTranslation>>;
  sources: LoreSource[];
}

/** GET /proverbs: a variety's published proverbs (of a theme, if asked), their themes, and the day's. */
export interface ProverbList {
  proverbs: ProverbView[];
  themes: ProverbTheme[];
  today: string | null;
}

// ---------- the proverbs' round ----------

/**
 * A short proverb round on the solo games' machinery, the server holding the answers: `meaning`, pick a proverb's meaning
 * from three; `situation`, pick the proverb that fits a scene; `complete`, finish a proverb with one of three Kurdish
 * words, the all-Kurdish mode. The first two show options in one language, the learner's when enough proverbs are
 * translated into it, else English, so none stands out. It pays no XP, like every solo game; half the items right on
 * first try counts for the streak and the daily goal.
 */
export const PROVERB_ROUND_MODES = ['meaning', 'situation', 'complete'] as const;
export type ProverbRoundMode = (typeof PROVERB_ROUND_MODES)[number];

/** The round's name among the solo rounds, by mode, which its sessions are filed under. */
export const PROVERB_ROUND_GAMES = {
  meaning: 'proverb-meaning',
  situation: 'proverb-situation',
  complete: 'proverb-complete',
} as const satisfies Record<ProverbRoundMode, string>;
export type ProverbRoundGame = (typeof PROVERB_ROUND_GAMES)[ProverbRoundMode];

export const PROVERB_ROUND_ITEMS = 5;
export const PROVERB_ROUND_OPTIONS = 3;

/**
 * One item without its answer. In a scene the proverb is shown as …, and a proverb to finish has its missing word as …
 * with the text around the gap (`before`, `after`) for a screen that draws the gap itself.
 */
export type ProverbRoundItemView =
  | { index: number; mode: 'meaning'; dialect: GameDialect; proverb: string; locale: AppLocale; options: string[] }
  | { index: number; mode: 'situation'; dialect: GameDialect; scene: string; locale: AppLocale; options: string[] }
  | { index: number; mode: 'complete'; dialect: GameDialect; proverb: string; before: string; after: string; locale: AppLocale; options: string[] };

export interface ProverbRoundAnswer {
  choice: number;
}

/** After a wrong first try, the option picked is struck out. */
export interface ProverbRoundHint {
  struck: number;
}

/** Once an item is done: the right option, and the proverb it was about. */
export interface ProverbRoundCorrection {
  choice: number;
  slug: string;
  text: string;
  locale: AppLocale;
  translation: string;
  meaning: string;
}
