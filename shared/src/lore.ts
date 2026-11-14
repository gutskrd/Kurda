/**
 * Riddles and proverbs: the Stories section's two collections that are not
 * stories. A riddle is *mamik* or *metelok* in Kurmancî and *metel* (مەتەڵ) in
 * Soranî; a proverb is one of the *gotinên pêşiyan*, the sayings of those who
 * came before.
 *
 * Both are `game_content` rows of their own kinds (`riddle`, `proverb`; the
 * schemas are in games/content.ts), so they go through the one content
 * workflow every game's rows go through — draft, review, approval, publish,
 * the lock version, starter drafts — rather than a second one. Their Kurdish
 * is the row; what they say in the app's other languages is a translation of
 * its own per language (`game_content_translations`), each with its own
 * review, so one language can be corrected on a published row without taking
 * the row offline or the approval of its Kurdish away.
 *
 * What lives here is what the API, both apps and the admin panel must agree
 * on: the lists every row is filed by, what a translation holds, what counts
 * as solving a riddle, which riddle and proverb a day puts forward, what a
 * solve pays, and the shapes the learner routes send. A riddle never spoils
 * itself: a list or a riddle's page carries its question and how many hints
 * it has, never a hint not yet taken, its answer, the forms accepted or the
 * explanation — those come one call at a time, when the learner asks.
 */
import { z } from 'zod';
import { APP_LOCALE_CODES, type AppLocale } from './locales.js';
import { fitsDialect, foldForDialect, gameWords, type GameDialect } from './games/dialect.js';

// ---------- what every row is filed by ----------

/** The two kinds of `game_content` row that make up the collections, and belong to no game. */
export const LORE_KINDS = ['riddle', 'proverb'] as const;
export type LoreKind = (typeof LORE_KINDS)[number];

export function isLoreKind(v: unknown): v is LoreKind {
  return v === 'riddle' || v === 'proverb';
}

export const RIDDLE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type RiddleDifficulty = (typeof RIDDLE_DIFFICULTIES)[number];

/**
 * The content level a riddle is stored at, by its difficulty: the table keeps
 * one level per row for every kind, and a riddle's is not chosen separately,
 * so the two can never say different things.
 */
export const RIDDLE_LEVELS: Readonly<Record<RiddleDifficulty, 1 | 3 | 5>> = { easy: 1, medium: 3, hard: 5 };

export const RIDDLE_CATEGORIES = ['nature', 'everyday', 'wordplay', 'logic', 'funny', 'culture', 'children'] as const;
export type RiddleCategory = (typeof RIDDLE_CATEGORIES)[number];

/**
 * Where a riddle or a proverb comes from: attested in the tradition, a local
 * form of it (which names its region), or newly written in its spirit. A new
 * one is never presented as old, and a traditional or regional one names at
 * least one source (`checkGameContent`).
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

/** Where a riddle or a proverb was found: a book, an article, a collection online. */
export interface LoreSource {
  title: string;
  author?: string;
  /** https only */
  url?: string;
  /** what it gives: the riddle as told in it, the page, the form */
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

/** A proverb in another language: a natural rendering, what it means and when it is said, and a little scene. */
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
 * The interface language a row's own Kurdish is: Kurmancî rows are the `ku`
 * interface's language, Soranî rows `ckb`'s. That language is the original,
 * never a translation of itself; a Soranî riddle's `ku` translation is its
 * Kurmancî rendering, and the other way round.
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
  // an optional field is left out rather than sent empty: what is there is never blank
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

/** The schema of one kind's translation (zod), built the first time any is asked for. */
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
 * Whether a translation may be stored for a row: its kind's schema, a language
 * that is not the row's own, the two Kurdish interface languages in their own
 * scripts (a `ku` rendering in Latin letters, a `ckb` one in Arabic script),
 * and for a riddle exactly as many hints as the Kurdish has, so each hint's
 * translation stands beside the hint it translates. Returns the payload as it
 * will be stored (trimmed) or every issue.
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
  /** what would stop it being stored as it is now: a riddle whose hints changed after it was translated */
  issues: Array<{ path: string; message: string }>;
}

// ---------- what counts as solving a riddle ----------

/**
 * What a typed guess is matched by, in each variety. Folded as the games fold
 * a typed answer (`foldForDialect`, lenient): case, spacing and punctuation do
 * not count, nor do Kurmancî's marks on ê î û ç ş or Soranî's on ێ ۆ ڵ ڕ.
 * Around the answer a learner may also write:
 *   - a demonstrative before it: "ew sî", "ev dem"; ئەو، ئەم
 *   - the copula after it, as a word of its own: "sî ye", "pirtûk e"
 *   - one ending on its last word: in Kurmancî the indefinite -ek/-yek (and
 *     -ekê, -ekî), the ezafe or oblique -a/-ya, -ê/-yê, -ên/-yên, -î/-yî; in
 *     Soranî the definite -ەکە/-کە, the indefinite -ێک/-یەک, the ezafe -ی and
 *     the copula -ە/-یە (-ەکەیە with both).
 * The rest of the guess must be one of the answers as written — the answer
 * itself or a form it accepts — whole, not a word inside a longer guess: "sî"
 * solves a riddle whose answer is sî, "siya" and "ew sî ye" do too, "sîber"
 * does only when the riddle accepts it. An ending is taken off only where a
 * stem of two letters or more is left, so a short word is never cut down to
 * another.
 */
export const RIDDLE_MATCHING = {
  kmr: {
    before: ['ew', 'ev'],
    after: ['e', 'ye'],
    // as `foldForDialect` leaves them: ê î û without their marks, the longest first
    endings: ['yeke', 'yeki', 'eke', 'eki', 'yek', 'yen', 'ek', 'en', 'ya', 'ye', 'yi', 'a', 'e', 'i'],
  },
  ckb: {
    before: ['ئەو', 'ئەم'],
    after: ['ە', 'یە'],
    // as the lenient fold leaves them: ێ as ی
    endings: ['ەکەیە', 'ەکە', 'یەک', 'کە', 'یک', 'یە', 'ە', 'ی'],
  },
} as const satisfies Record<GameDialect, { before: readonly string[]; after: readonly string[]; endings: readonly string[] }>;

/** The shortest stem an ending may leave. */
const RIDDLE_STEM_MIN = 2;

/** A text as a guess and an answer are compared: folded leniently, letters and single spaces. */
export function riddleKey(text: string, dialect: GameDialect): string {
  return foldForDialect(text, dialect, true);
}

/** Every reading of a typed guess the rule allows: as typed, without the words around it, without an ending on its last word. */
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

/** A small stable hash (FNV-1a), so the day's order is the same on every server and every app. */
function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The one of a variety's published riddles (or proverbs) a calendar day puts
 * forward, by slug, as the word of the day is picked: the day's number taken
 * round the collection, so consecutive days step through all of it before any
 * comes back. The collection is walked in a fixed order shuffled by each
 * slug's hash rather than alphabetically, so a day's neighbours are not the
 * riddles whose slugs sort beside it. Null while there is none.
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

/**
 * Guesses a solve may take and still pay: a riddle is thought about, not
 * typed at until something sticks, and a solve past this many guesses is
 * still a solve but pays nothing.
 */
export const RIDDLE_PAID_GUESSES = 10;

/**
 * What solving a riddle pays, once per learner and riddle: its difficulty's
 * XP, half of it (rounded up) when a hint was taken, nothing when the answer
 * was revealed first or the solve took more than RIDDLE_PAID_GUESSES guesses.
 * Opening a riddle, taking a hint or revealing it pays nothing.
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

/** A riddle's page: the card, and the hints this learner has already taken (a visitor keeps theirs in the app). */
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

export type RiddleGuessResult = { correct: false } | { correct: true; answer: RiddleAnswer; xp: number };

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

/** GET /proverbs: a variety's published proverbs (of a theme, when one is asked for), the themes they cover, and the day's. */
export interface ProverbList {
  proverbs: ProverbView[];
  themes: ProverbTheme[];
  today: string | null;
}

// ---------- the proverbs' round ----------

/**
 * A short round on the proverbs, played on the solo games' machinery (the
 * server makes it and keeps its answers):
 *   meaning   — a proverb, and three meanings to choose its own from
 *   situation — a little scene, and three proverbs to choose the one that fits
 * Its options are in one language, the learner's when enough proverbs are
 * translated into it, else English, so no option stands out by being in
 * another language. It pays no XP, as no game played alone does; a round
 * with at least half its items right on the first try counts for the streak
 * and the daily goal, as those rounds do.
 */
export const PROVERB_ROUND_MODES = ['meaning', 'situation'] as const;
export type ProverbRoundMode = (typeof PROVERB_ROUND_MODES)[number];

/** The round's name among the solo rounds, by mode: what its sessions are filed under. */
export const PROVERB_ROUND_GAMES = { meaning: 'proverb-meaning', situation: 'proverb-situation' } as const satisfies Record<ProverbRoundMode, string>;
export type ProverbRoundGame = (typeof PROVERB_ROUND_GAMES)[ProverbRoundMode];

export const PROVERB_ROUND_ITEMS = 5;
export const PROVERB_ROUND_OPTIONS = 3;

/** One item, without its answer. In a scene the proverb it is about is never written out: it is shown as … */
export type ProverbRoundItemView =
  | { index: number; mode: 'meaning'; dialect: GameDialect; proverb: string; locale: AppLocale; options: string[] }
  | { index: number; mode: 'situation'; dialect: GameDialect; scene: string; locale: AppLocale; options: string[] };

export interface ProverbRoundAnswer {
  choice: number;
}

/** After a wrong first try: the option picked is struck out. */
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
