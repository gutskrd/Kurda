/**
 * Stories: Kurdish texts to read and then be quizzed on, alone, with a friend or with a group. Most are short; a legend
 * runs to over a thousand words in sections, each opened by a `## Title` paragraph.
 *
 * Shared because the API, the admin editor, the readers and the audio studio must agree on every number here: settings,
 * length bands and where sentences split, or recordings stop lining up. The presets favour beginners: short texts, three
 * options, questions in text order with the overall one last, generous or no timers, and accuracy over speed.
 */
import { foldVariantChar, isInvisibleChar, lessonAudioKey } from './lesson-audio.js';
import type { RecordingVoice } from './lipsync/speakers.js';
import type { RatedState } from './ranks.js';
import { isSoraniDialect } from './lesson-answers.js';
import type { AppLocale } from './locales.js';

/** The two varieties Hevalo teaches, spelled as the rhyme games store them. */
export const STORY_DIALECTS = ['kurmanci', 'sorani'] as const;
export type StoryDialect = (typeof STORY_DIALECTS)[number];

export function isStoryDialect(v: unknown): v is StoryDialect {
  return v === 'kurmanci' || v === 'sorani';
}

/** Courses spell their variety 'kurmanji' (or a Soranî spelling `isSoraniDialect` knows); stories spell it as the rhyme games do. */
export function storyDialectForCourse(courseDialect: string | null | undefined): StoryDialect {
  return isSoraniDialect(courseDialect) ? 'sorani' : 'kurmanci';
}

/** Soranî is Arabic script, right to left; Kurmancî Latin. Every string from a story carries these, whatever the interface language. */
export function storyTextDirection(dialect: StoryDialect): { lang: 'ku' | 'ckb'; dir: 'ltr' | 'rtl' } {
  return dialect === 'sorani' ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}

/**
 * 1 first steps (A1) to 5 advanced (C1); the number is stored and filtered by. Readers see a plain name (`levelNameKey`)
 * rather than CEFR letters, which most learners of Kurdish never met; editors and the API keep the letters.
 */
export const STORY_LEVELS = [1, 2, 3, 4, 5] as const;
export type StoryLevel = (typeof STORY_LEVELS)[number];

export function isStoryLevel(v: unknown): v is StoryLevel {
  return (STORY_LEVELS as readonly unknown[]).includes(v);
}

/** The CEFR name of each level, in level order. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** 1 → 'A1' … 5 → 'C1'. */
export function cefrOf(level: StoryLevel): CefrLevel {
  return CEFR_LEVELS[level - 1]!;
}

/** 'A1' → 1 … 'C1' → 5, however typed ('b1', ' B1 '); null for anything else. */
export function levelOfCefr(cefr: string): StoryLevel | null {
  const at = (CEFR_LEVELS as readonly string[]).indexOf(cefr.trim().toUpperCase());
  return at < 0 ? null : STORY_LEVELS[at]!;
}

/** The catalogue key of a level's plain name ("Starter" … "Advanced"), the same on the website and the phone. */
export type LevelNameKey = `level.name.${StoryLevel}`;
/** The catalogue key of the line under a level's name saying what reading at it is like. */
export type LevelHintKey = `level.hint.${StoryLevel}`;

/**
 * The catalogue keys for a level's plain name, so every screen in both apps names a level the same way; the words live in
 * each app's catalogues.
 */
export function levelNameKey(level: StoryLevel): LevelNameKey {
  return LEVEL_NAME_KEYS[level];
}

export function levelHintKey(level: StoryLevel): LevelHintKey {
  return LEVEL_HINT_KEYS[level];
}

// Spelled out rather than built, so a search for a key finds where it is read (scripts/check-i18n.mjs relies on it).
const LEVEL_NAME_KEYS: Readonly<Record<StoryLevel, LevelNameKey>> = {
  1: 'level.name.1',
  2: 'level.name.2',
  3: 'level.name.3',
  4: 'level.name.4',
  5: 'level.name.5',
};
const LEVEL_HINT_KEYS: Readonly<Record<StoryLevel, LevelHintKey>> = {
  1: 'level.hint.1',
  2: 'level.hint.2',
  3: 'level.hint.3',
  4: 'level.hint.4',
  5: 'level.hint.5',
};

/** The orders GET /stories offers: easiest first (level, then length, then title; the default), newest first, and by title. */
export const STORY_SORTS = ['level', 'newest', 'title'] as const;
export type StorySort = (typeof STORY_SORTS)[number];
/** The order a list is in when none is asked for. */
export const DEFAULT_STORY_SORT: StorySort = 'level';

export function isStorySort(v: unknown): v is StorySort {
  return (STORY_SORTS as readonly unknown[]).includes(v);
}

/** The languages stories are written in: only Kurdish, whose varieties are the dialects. Stored on every story so another can be added. */
export const STORY_LANGUAGES = ['ku'] as const;
export type StoryLanguage = (typeof STORY_LANGUAGES)[number];

export function isStoryLanguage(v: unknown): v is StoryLanguage {
  return (STORY_LANGUAGES as readonly unknown[]).includes(v);
}

/**
 * Where a story comes from, which the reader is told: 'traditional' is documented folklore retold close to a source,
 * 'adapted' traditional material freely retold, 'original' written for learners. A field, so an original is never passed
 * off as folklore.
 */
export const STORY_TRADITIONS = ['traditional', 'adapted', 'original'] as const;
export type StoryTradition = (typeof STORY_TRADITIONS)[number];

export function isStoryTradition(v: unknown): v is StoryTradition {
  return (STORY_TRADITIONS as readonly unknown[]).includes(v);
}

/** A category slug: lower-case letters, digits and dashes, as the table checks it. */
export const STORY_CATEGORY_SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

/** A category as the library shows it: slug, name per interface language (English always) and position. */
export interface StoryCategory {
  slug: string;
  name: { en: string } & Partial<Record<string, string>>;
  position: number;
}

/** The category's name in the reader's language, falling back to English. */
export function categoryName(category: StoryCategory, locale: string): string {
  const own = Object.hasOwn(category.name, locale) ? category.name[locale] : undefined;
  return typeof own === 'string' && own.trim() !== '' ? own : category.name.en;
}

/*
 * The seeded categories, which the apps name from their own catalogues in all nine languages; the library list carries
 * only English, Kurmancî and Soranî names. A category added later has no key and keeps its name from the list.
 */
const CATEGORY_NAME_KEYS = {
  folktale: 'stories.category.folktale',
  fable: 'stories.category.fable',
  legend: 'stories.category.legend',
  family: 'stories.category.family',
  village: 'stories.category.village',
  nature: 'stories.category.nature',
  everyday: 'stories.category.everyday',
  celebrations: 'stories.category.celebrations',
} as const;

export type CategoryNameKey = (typeof CATEGORY_NAME_KEYS)[keyof typeof CATEGORY_NAME_KEYS];

/** The catalogue key a category is named by in the apps, or null for a slug they do not know. */
export function categoryNameKey(slug: string): CategoryNameKey | null {
  return Object.hasOwn(CATEGORY_NAME_KEYS, slug) ? CATEGORY_NAME_KEYS[slug as keyof typeof CATEGORY_NAME_KEYS] : null;
}

/** The text-length presets. A saga is a legend in sections (at least two headings), read over a sitting or two. */
export const STORY_LENGTHS = ['short', 'medium', 'long', 'saga'] as const;
export type StoryLength = (typeof STORY_LENGTHS)[number];

export function isStoryLength(v: unknown): v is StoryLength {
  return (STORY_LENGTHS as readonly unknown[]).includes(v);
}

export interface WordBand {
  min: number;
  max: number;
}

/**
 * Words per length and variety. Soranî attaches clitics to their word, so the same text has fewer words than in
 * Kurmancî and its bands are lower; that ratio is an estimate. Bands never touch, so a count names one length or none.
 */
export const STORY_WORD_BANDS: Readonly<Record<StoryDialect, Readonly<Record<StoryLength, WordBand>>>> = {
  kurmanci: {
    short: { min: 60, max: 120 },
    medium: { min: 150, max: 250 },
    long: { min: 300, max: 450 },
    saga: { min: 600, max: 1600 },
  },
  sorani: {
    short: { min: 50, max: 100 },
    medium: { min: 125, max: 210 },
    long: { min: 250, max: 380 },
    saga: { min: 500, max: 1400 },
  },
};

/** The length a story of this many words is, or null when it falls between bands. */
export function storyLengthFor(dialect: StoryDialect, words: number): StoryLength | null {
  for (const length of STORY_LENGTHS) {
    const band = STORY_WORD_BANDS[dialect][length];
    if (words >= band.min && words <= band.max) return length;
  }
  return null;
}

/**
 * Words a minute for the estimates. Beginners read slowly, most second-language readers below 100, and Soranî packs more
 * into each written word, so its rate is lower. `slow` sizes a group's reading phase for its slowest reader.
 */
export const READING_WPM: Readonly<Record<StoryDialect, { typical: number; slow: number }>> = {
  kurmanci: { typical: 60, slow: 40 },
  sorani: { typical: 50, slow: 34 },
};

/** Estimated minutes to read, shown as "~N min"; never zero. */
export function readingMinutes(dialect: StoryDialect, words: number): number {
  return Math.max(1, Math.ceil(words / READING_WPM[dialect].typical));
}

/** The range of minutes a length takes in a variety, for setup labels and filter chips. */
export function lengthMinutes(dialect: StoryDialect, length: StoryLength): { min: number; max: number } {
  const band = STORY_WORD_BANDS[dialect][length];
  return { min: readingMinutes(dialect, band.min), max: readingMinutes(dialect, band.max) };
}

/** A duo or group reads for at most half an hour before the questions start on their own. */
export const READING_HARD_CAP_MAX_SECONDS = 1800;

/**
 * A duo or group's reading phase. Questions start once every active player has finished; the host may start them earlier
 * only after this soft cap (time for a slow reader, at least a minute), and the hard cap starts them, so one idle reader
 * cannot stall a game. No countdown is shown while reading.
 */
export function readingSoftCapSeconds(dialect: StoryDialect, words: number): number {
  // Never past the hard cap, or for a long saga the host could cut in only after the questions began.
  return Math.min(READING_HARD_CAP_MAX_SECONDS, Math.max(60, Math.ceil((words / READING_WPM[dialect].slow) * 60)));
}

export function readingHardCapSeconds(dialect: StoryDialect, words: number): number {
  return Math.min(READING_HARD_CAP_MAX_SECONDS, readingSoftCapSeconds(dialect, words) * 2 + 60);
}

/** The question-count presets. */
export const QUESTION_COUNTS = [3, 5, 10] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

/** The counts each length offers: ten questions about a short text would cover nearly every sentence. */
export const QUESTION_COUNTS_BY_LENGTH: Readonly<Record<StoryLength, readonly QuestionCount[]>> = {
  short: [3, 5],
  medium: [3, 5, 10],
  long: [5, 10],
  saga: [5, 10],
};

/** The count a setup screen starts on for each length. */
export const DEFAULT_QUESTION_COUNT: Readonly<Record<StoryLength, QuestionCount>> = {
  short: 3,
  medium: 5,
  long: 5,
  saga: 5,
};

export function isAllowedQuestionCount(length: StoryLength, count: unknown): count is QuestionCount {
  return (QUESTION_COUNTS_BY_LENGTH[length] as readonly unknown[]).includes(count);
}

/** The fewest questions a published story carries: more than its largest count, so a replay is not the same quiz. */
export const MIN_QUESTION_BANK: Readonly<Record<StoryLength, number>> = {
  short: 6,
  medium: 12,
  long: 15,
  saga: 15,
};

/** A story never needs more than this many questions. */
export const MAX_QUESTION_BANK = 30;

/** What a question asks about; the editor tags each one and a game mixes them. */
export const QUESTION_KINDS = ['gist', 'detail', 'vocabulary', 'sequence', 'inference'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export function isQuestionKind(v: unknown): v is QuestionKind {
  return (QUESTION_KINDS as readonly unknown[]).includes(v);
}

/** Answer options per question: two (true / false) up to four; three is the norm. */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

/** Limits the editor and the API both enforce. */
export const STORY_TITLE_MAX = 120;
export const STORY_SUMMARY_MAX = 300;
/** A saga of 1,600 Kurmancî words, headings included, with room to spare. */
export const STORY_BODY_MAX = 16_000;
export const QUESTION_PROMPT_MAX = 300;
export const QUESTION_OPTION_MAX = 160;
/** One line, shown beside the answer at the reveal. */
export const QUESTION_EXPLANATION_MAX = 160;
export const GLOSSARY_MAX = 20;
export const GLOSS_TERM_MAX = 60;
export const GLOSS_MEANING_MAX = 120;
/** A longer sentence may not fit one 15-second studio recording. */
export const STORY_SENTENCE_SOFT_MAX = 180;
/** The attribution block: who wrote or told it, where it comes from, and what to say about that. */
export const STORY_AUTHOR_MAX = 120;
export const STORY_SOURCE_MAX = 300;
export const STORY_SOURCE_URL_MAX = 500;
export const STORY_ATTRIBUTION_NOTE_MAX = 600;
/** A full translation runs longer than its Kurdish; English by about half again. */
export const STORY_TRANSLATION_MAX = 24_000;
/** The key of a shared background picture the apps draw as the cover. */
export const STORY_COVER_MAX = 80;
/** An editor's reading time replaces the estimate; two hours is more than any story needs. */
export const STORY_READING_MINUTES_MAX = 120;
/** A reviewer's note: why approval was given or withdrawn. */
export const STORY_REVIEW_NOTE_MAX = 600;
export const STORY_CATEGORY_NAME_MAX = 60;
/** A section heading is one short `## Title` line, not a sentence of the story. */
export const STORY_HEADING_MAX = 80;
/** Open questions to think about after reading: a handful, each a sentence or two. */
export const STORY_REFLECTIONS_MAX = 6;
export const STORY_REFLECTION_MAX = 400;
/** Notes beside a legend: what is history, what is legend, how versions differ, what a custom means. */
export const STORY_NOTES_MAX = 4;
export const STORY_NOTE_TITLE_MAX = 120;
export const STORY_NOTE_BODY_MAX = 2400;
/** The sources a telling draws on, each with its kind. */
export const STORY_SOURCES_MAX = 8;
export const STORY_SOURCE_NOTE_MAX = 300;

/** Seconds per question. 0 is no timer: the question closes when everyone has answered, or in a group when the host moves on. */
export const TIMER_PRESETS = [0, 60, 30] as const;
export type TimerSeconds = (typeof TIMER_PRESETS)[number];

export function isTimerPreset(v: unknown): v is TimerSeconds {
  return v === 0 || v === 60 || v === 30;
}

/**
 * Whether the text stays on screen during the questions. Visible is the default; hidden is the host's "from memory"
 * challenge, honour-based since the story stays readable elsewhere, and everyone is told before reading.
 */
export const TEXT_DURING_OPTIONS = ['visible', 'hidden'] as const;
export type TextDuring = (typeof TEXT_DURING_OPTIONS)[number];

export function isTextDuring(v: unknown): v is TextDuring {
  return v === 'visible' || v === 'hidden';
}

/**
 * Who may join a duo or group: 'friends' (the default), the host's friends; 'open', any known adult with the code. Only a
 * known-adult host may open a game, and a minor or an account of unknown age never joins one.
 */
export const GAME_ACCESS = ['friends', 'open'] as const;
export type GameAccess = (typeof GAME_ACCESS)[number];

/** Alone, with one other person, or with a group. */
export const STORY_GAME_MODES = ['solo', 'duo', 'group'] as const;
export type StoryGameMode = (typeof STORY_GAME_MODES)[number];

export const MAX_PLAYERS: Readonly<Record<StoryGameMode, number>> = { solo: 1, duo: 2, group: 8 };
export const MIN_PLAYERS_TO_START: Readonly<Record<StoryGameMode, number>> = { solo: 1, duo: 2, group: 2 };

/** A solo reader is not raced against a clock unless they ask to be. */
export const DEFAULT_TIMER: Readonly<Record<StoryGameMode, TimerSeconds>> = { solo: 0, duo: 60, group: 60 };

/** Points for a right answer; speed never adds points, it only breaks ties. */
export const POINTS_PER_CORRECT = 100;

/**
 * An answer arriving this long after the deadline still counts, which saves a beginner on a slow network their point and
 * costs no fairness, since scores are accuracy only. A timed question closes at its deadline plus this grace.
 */
export const ANSWER_GRACE_MS = 1500;

/** After a reveal, a duo or group moves on once every active player taps Continue, or after this long; nobody skips it for others. */
export const REVEAL_MAX_SECONDS = 15;

/** An untimed duo or group question still closes after this long, so one player who walked away cannot hold the rest; solo has no cap. */
export const UNTIMED_QUESTION_CAP_SECONDS = 180;

/**
 * A member silent this long is away: not waited for, not counted towards starting, and if the host, the earliest-joined
 * active player holds the host controls until they return. Longer than a long-poll (20 s) plus the longest client backoff.
 */
export const PRESENCE_TIMEOUT_SECONDS = 45;

/** A lobby nobody starts is closed after this long. */
export const LOBBY_IDLE_MINUTES = 30;

/** Join codes: six characters from an alphabet without lookalikes (no 0/O, 1/I/L). */
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * What someone typed as a code: upper-cased, spaces and dashes dropped, Arabic and Persian digits read as digits; null if
 * it cannot be one. Try a pasted invite link with `parseInvite` first.
 */
export function normalizeJoinCode(input: string): string | null {
  const code = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toUpperCase()
    .replace(/[\s-]/g, '');
  if (code.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of code) if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** "ABC234" → "ABC 234", easier to read out and type. */
export function formatJoinCode(code: string): string {
  return code.length === JOIN_CODE_LENGTH ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** One paragraph per block of text separated by a blank line. */
export function storyParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/**
 * A section heading paragraph: "## " and a title. Headings are paragraphs of their own, so translations keep the same
 * paragraphs and every paragraph index (evidence, reading position, narration) stays one list. A heading is never
 * recorded, glossed or counted as words.
 */
export function isStoryHeading(paragraph: string): boolean {
  return paragraph.startsWith('## ') && paragraph.slice(3).trim() !== '';
}

/** The title of a heading paragraph ("## Kela Dimdimê" → "Kela Dimdimê"), or null for any other paragraph. */
export function storyHeadingTitle(paragraph: string): string | null {
  return isStoryHeading(paragraph) ? paragraph.slice(3).trim() : null;
}

/** A section: its heading's title and the heading paragraph's index. */
export interface StorySection {
  title: string;
  paragraph: number;
}

/** One section per heading paragraph, in order. Paragraphs before the first heading are the introduction and belong to none. */
export function storySections(body: string | readonly string[]): StorySection[] {
  const paragraphs = typeof body === 'string' ? storyParagraphs(body) : body;
  const out: StorySection[] = [];
  paragraphs.forEach((paragraph, i) => {
    const title = storyHeadingTitle(paragraph);
    if (title !== null) out.push({ title, paragraph: i });
  });
  return out;
}

// A sentence ends at . ! ? … or the Arabic question mark or full stop, with any closing quotes or brackets, then space or the end.
const SENTENCE_END = /([.!?…؟۔]+["'”’»“)\]]*)(\s+|$)/g;

/**
 * A paragraph's sentences, each with its punctuation. The reader and the studio must cut in exactly the same places.
 * Abbreviations such as "Dr." would split; the editor warns about them.
 */
export function storySentences(paragraph: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of paragraph.matchAll(SENTENCE_END)) {
    const end = m.index! + m[1]!.length;
    const sentence = paragraph.slice(start, end).trim();
    if (sentence) out.push(sentence);
    start = end + m[2]!.length;
  }
  const rest = paragraph.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// A word is a run of non-space characters with a letter in it, so a lone dash or a number does not count.
const HAS_LETTER = /\p{L}/u;

/** The words of a text without its headings: the length bands measure the story. */
export function countStoryWords(body: string): number {
  let n = 0;
  for (const paragraph of body.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    if (isStoryHeading(paragraph.trim())) continue;
    for (const token of paragraph.split(/\s+/)) if (token && HAS_LETTER.test(token)) n += 1;
  }
  return n;
}

/**
 * A paragraph's recordable sentences in reading order: with a letter and a non-empty recording key, so a "* * *" break or
 * a lone "?!" is skipped, and none from a heading. The reader, the studio and "fully narrated" all count from this.
 */
export function storyAudioSentences(paragraph: string): string[] {
  if (isStoryHeading(paragraph)) return [];
  return storySentences(paragraph).filter((s) => HAS_LETTER.test(s) && lessonAudioKey(s) !== '');
}

/** A word in a story with its meaning, for a tap-to-see gloss. */
export interface StoryGlossEntry {
  /** the word or phrase as it appears in the text */
  term: string;
  /** meanings keyed by interface language; `en` is always present */
  meanings: { en: string } & Partial<Record<string, string>>;
  /** The dictionary entry the term is a headword of, so the reader can save it; filled by the server on save, never by the editor. */
  entryId?: string | null;
  /** that entry's part of speech (its first sense), looked up when read */
  pos?: string | null;
  /** a pronunciation of that entry in the story's variety, when recorded; looked up when read */
  audioUrl?: string | null;
}

/** The meaning in the reader's language, else English, with its language, so an English fallback is marked as English. */
export function glossFor(entry: StoryGlossEntry, locale: string): { text: string; lang: string } {
  const own = Object.hasOwn(entry.meanings, locale) ? entry.meanings[locale] : undefined;
  if (typeof own === 'string' && own.trim() !== '') return { text: own, lang: locale };
  return { text: entry.meanings.en, lang: 'en' };
}

// Folded for matching: variants folded, invisible characters blanked, lower case, one output unit per input unit so
// indices carry over.
function foldForMatch(text: string): string {
  let out = '';
  for (const ch of text) {
    const units = ch.length;
    if (isInvisibleChar(ch)) {
      out += '\u0000'.repeat(units);
      continue;
    }
    const lower = foldVariantChar(ch).toLowerCase();
    // One unit per unit; a lowercase that changes length is left as it was.
    out += lower.length === units ? lower : ch;
  }
  return out;
}

const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

export interface GlossSpan {
  start: number;
  end: number;
  entry: StoryGlossEntry;
}

/**
 * Where the glossary's terms are in a paragraph: each term's first whole-word occurrence (دار is not marked inside
 * بەردار), longest first, never overlapping, variants and case ignored, never in a heading. The editor, the web reader and
 * the phone reader all mark from this, so an accepted term is always shown.
 */
export function glossSpans(paragraph: string, glossary: readonly StoryGlossEntry[]): GlossSpan[] {
  if (isStoryHeading(paragraph)) return [];
  const hay = foldForMatch(paragraph.normalize('NFC'));
  const taken: Array<[number, number]> = [];
  const spans: GlossSpan[] = [];
  const entries = glossary
    .map((entry) => ({ entry, needle: foldForMatch(entry.term.normalize('NFC').trim()) }))
    .filter((e) => e.needle.length > 0)
    .sort((a, b) => b.needle.length - a.needle.length);
  for (const { entry, needle } of entries) {
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const before = at > 0 ? hay[at - 1]! : '';
      const after = end < hay.length ? hay[end]! : '';
      const whole = !(before && LETTER_OR_MARK.test(before)) && !(after && LETTER_OR_MARK.test(after));
      const overlaps = taken.some(([s, e]) => at < e && end > s);
      if (whole && !overlaps) {
        taken.push([at, end]);
        spans.push({ start: at, end, entry });
        break;
      }
      from = at + 1;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// What a story carries besides its text: translated title and summary, reflections, notes, sources and translation
// reviews. Each Kurdish string is in the story's own variety, with translations per interface language.
// ---------------------------------------------------------------------------

/** A story's title and summary in an interface language; either may be missing, and the reader then shows the Kurdish. */
export interface StoryMetaTranslation {
  title?: string;
  summary?: string;
}

/** An open question to think about after reading: no right answer, nothing scored. */
export interface StoryReflection {
  text: string;
  translations: Partial<Record<AppLocale, string>>;
}

/** What a note beside a story is about: history, legend, how versions differ, or what a custom or object means. */
export const STORY_NOTE_KINDS = ['history', 'legend', 'versions', 'culture'] as const;
export type StoryNoteKind = (typeof STORY_NOTE_KINDS)[number];

export function isStoryNoteKind(v: unknown): v is StoryNoteKind {
  return (STORY_NOTE_KINDS as readonly unknown[]).includes(v);
}

export interface StoryNoteTranslation {
  title: string;
  body: string;
}

export interface StoryNote {
  kind: StoryNoteKind;
  title: string;
  body: string;
  translations: Partial<Record<AppLocale, StoryNoteTranslation>>;
}

/** What a source is: a historical record, a collected legend, an oral telling, a literary work, or an adaptation of one. */
export const STORY_SOURCE_TYPES = ['historical', 'legendary', 'oral', 'literary', 'adapted'] as const;
export type StorySourceType = (typeof STORY_SOURCE_TYPES)[number];

export function isStorySourceType(v: unknown): v is StorySourceType {
  return (STORY_SOURCE_TYPES as readonly unknown[]).includes(v);
}

/** One source a telling draws on. `url` is https only. */
export interface StorySourceEntry {
  title: string;
  author?: string;
  url?: string;
  type: StorySourceType;
  note?: string;
}

/** A question in an interface language: prompt, options in the Kurdish order so the same index is right, and the reveal's explanation. */
export interface StoryQuestionTranslation {
  prompt: string;
  options: string[];
  explanation?: string;
}

/** Whether a native speaker of an interface language has read the story's translation into it. */
export const STORY_TRANSLATION_REVIEW_STATUSES = ['unreviewed', 'reviewed'] as const;
export type StoryTranslationReviewStatus = (typeof STORY_TRANSLATION_REVIEW_STATUSES)[number];

export function isStoryTranslationReviewStatus(v: unknown): v is StoryTranslationReviewStatus {
  return v === 'unreviewed' || v === 'reviewed';
}

/** One language's review: state, who set it, when and why. A language without an entry is unreviewed. */
export interface StoryTranslationReviewEntry {
  status: StoryTranslationReviewStatus;
  /** the reviewer's user id */
  by?: string;
  /** ISO time */
  at?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// API shapes. None carries another player's user id: seats are the only handle, so a stranger never gets an id to open a
// profile with.
// ---------------------------------------------------------------------------

/** How much of a story is narrated, counted from sentence recordings; 'full' exactly when `fullyNarrated`. */
export type StoryAudioCoverage = 'none' | 'partial' | 'full';

/** The signed-in reader's own record on a story. */
export interface StoryMe {
  bookmarked: boolean;
  /** the last paragraph they were reading (0 before they started) */
  paragraph: number;
  /** how far through the text they got, 0–1 */
  share: number;
  /** when they first finished reading it; null until then */
  finishedAt: string | null;
  /** their best right answers out of `total` in a finished game; null before any */
  bestCorrect: number | null;
  total: number | null;
  /** games on it finished today (their own day); from PAID_STORY_REPEATS_PER_DAY on, a game pays no XP */
  attemptsToday: number;
}

/** A published story in a list (GET /stories, the library). Never carries its questions. */
export interface StoryListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: StoryLevel;
  /** `cefrOf(level)`, so a client never keeps its own table */
  cefr: CefrLevel;
  length: StoryLength;
  wordCount: number;
  /** the editor's reading time when set, else the estimate from the word count */
  readingMinutes: number;
  /** true when every recordable sentence has a studio recording */
  fullyNarrated: boolean;
  /** none, some or all sentences recorded; the detail's `audio` holds the recordings */
  audioCoverage: StoryAudioCoverage;
  /** a category slug (see StoryCategory), null for a story not filed yet */
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  /** an editor's pick for the library's Featured row */
  featured: boolean;
  /** the key of a shared background picture for the cover, or null for the plain card */
  cover: string | null;
  publishedAt: string | null;
  /** title and summary in the interface languages translated so far */
  metaTranslations: Partial<Record<AppLocale, StoryMetaTranslation>>;
  /** the caller's own record, only when they are signed in */
  me?: StoryMe;
}

/** One recorded sentence on the stitched narration timeline. */
export interface StoryNarrationSentence {
  /** index into `paragraphs` */
  paragraph: number;
  /** index into `storySentences(paragraphs[paragraph])`, which the reader highlights */
  sentence: number;
  /** its recording key, also its key in `audio` */
  key: string;
  url: string;
  durationMs: number;
  /** where it starts when every recorded sentence plays in reading order */
  startMs: number;
}

/**
 * A story's recorded sentences back to back, as one seekable track. `complete` is false while a sentence has no recording:
 * the track skips it and the apps say "n of m sentences recorded".
 */
export interface StoryNarration {
  sentences: StoryNarrationSentence[];
  totalMs: number;
  complete: boolean;
}

/**
 * The sentence playing at a position on the narration track, and how far into it. Positions before the start or past the
 * end clamp to the first or last sentence, so a dragged seek bar always lands somewhere playable. Empty narration gives -1.
 */
export function narrationAt(narration: StoryNarration, ms: number): { index: number; offsetMs: number } {
  const { sentences } = narration;
  if (sentences.length === 0) return { index: -1, offsetMs: 0 };
  if (ms <= 0) return { index: 0, offsetMs: 0 };
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (ms < s.startMs + s.durationMs) return { index: i, offsetMs: Math.max(0, ms - s.startMs) };
  }
  const last = sentences[sentences.length - 1]!;
  return { index: sentences.length - 1, offsetMs: last.durationMs };
}

/**
 * A story to read: GET /stories/:idOrSlug (published only), or GET /story-games/:id/story (the game's own copy for its
 * members, whatever happened to the story since). Never carries its questions.
 */
export interface StoryDetail extends StoryListItem {
  /** the text's paragraphs; a section heading is a paragraph of its own, starting with "## " */
  paragraphs: string[];
  /** one per heading, in order (`storySections`); [] without headings */
  sections: StorySection[];
  glossary: StoryGlossEntry[];
  /** studio recordings by `lessonAudioKey(sentence)`, only for sentences that have one */
  audio: Record<string, string>;
  /** who says each recording and how their mouth moves, by the same key; absent when no recording has a character */
  voices?: Record<string, RecordingVoice>;
  /** full translations by interface language, cut into paragraphs that line up with `paragraphs` */
  translations: Record<string, string[]>;
  /** the collection, teller, region or publication it comes from */
  source: string | null;
  sourceUrl: string | null;
  /** differences between oral versions, licence remarks, "a legend, not verified history" */
  attributionNote: string | null;
  /** the same story in another variety or language (published only) */
  versions: Array<{ id: string; slug: string; dialect: StoryDialect; language: StoryLanguage }>;
  /** the recorded sentences as one track; null when none is recorded */
  narration: StoryNarration | null;
  /** questions to think about after reading, in the story's variety with their translations */
  reflections: StoryReflection[];
  /** what is history and what is legend, how versions differ, what a custom means */
  notes: StoryNote[];
  /** where the telling comes from, beside the single `source` older stories name */
  sources: StorySourceEntry[];
}

/** The library's front page (GET /stories/library). Personal rows are empty for an anonymous caller. */
export interface StoryLibrary {
  /** editors' picks, latest pick first */
  featured: StoryListItem[];
  /** latest published first */
  recent: StoryListItem[];
  /** the variety's legends, easiest first, on a shelf of their own so newer stories cannot crowd them out; absent from older servers */
  legends?: StoryListItem[];
  /** started and not finished, latest read first */
  continue: StoryListItem[];
  bookmarks: StoryListItem[];
  /** every category, with how many published stories are filed under it */
  categories: Array<StoryCategory & { count: number }>;
  /** published stories per level, for levels that have one; absent from older servers */
  levels?: Array<{ level: StoryLevel; count: number }>;
  /** published stories in all */
  total: number;
  /** the signed-in caller's reading so far; absent when anonymous */
  me?: {
    /** stories they finished reading */
    finished: number;
    /** the same as the library's `total`, beside `finished` for "12 of 40" */
    total: number;
    /** the mean of their best right-answer share per story over finished games, 0–1; null before any */
    averageScore: number | null;
  };
}

/** The filters GET /stories takes. `audio` keeps only fully narrated stories. */
export interface StoryQuery {
  q?: string;
  category?: string;
  level?: StoryLevel;
  dialect?: StoryDialect;
  length?: StoryLength;
  language?: string;
  audio?: boolean;
  sort?: StorySort;
  limit?: number;
  offset?: number;
}

/**
 * The query string for `/stories`: '' when nothing is set, else '?…' with keys in one fixed order, so equal queries share
 * a cache entry. Blank values are left out; `audio` is sent as `audio=1`.
 */
export function storyQueryString(query: StoryQuery): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | undefined): void => {
    if (value === undefined || value === '') return;
    params.set(key, String(value));
  };
  put('q', query.q?.trim());
  put('category', query.category);
  put('level', query.level);
  put('dialect', query.dialect);
  put('length', query.length);
  put('language', query.language);
  if (query.audio) params.set('audio', '1');
  put('sort', query.sort);
  put('limit', query.limit);
  put('offset', query.offset);
  const out = params.toString();
  return out ? `?${out}` : '';
}

/**
 * The quiz at the end of a story: a solo game of five untimed questions with the text at hand, straight to the questions.
 * Clients send this with the story's id to POST /story-games; its results carry the XP.
 */
export const STORY_ASSESSMENT = {
  mode: 'solo',
  questionCount: 5,
  timerSeconds: 0,
  textDuring: 'visible',
  access: 'friends',
  skipReading: true,
} as const;

/** The caller's record on a story (GET /story-games/history). */
export interface StoryProgress {
  storyId: string;
  /** best right answers out of `total` in a finished game */
  bestCorrect: number;
  total: number;
  lastFinishedAt: string;
}

/** An unfinished game the caller can go back to (GET /story-games/active). */
export interface StoryGameSummary {
  id: string;
  mode: StoryGameMode;
  status: StoryGameStatus;
  /** the story it is played on, so a reader can offer "Continue" on its quiz */
  storyId: string;
  storyTitle: string;
  dialect: StoryDialect;
  /** the open question's index, or 0 before the questions */
  currentIndex: number;
  total: number;
}

export interface StoryGameSettings {
  storyId: string;
  storyTitle: string;
  storySlug: string;
  dialect: StoryDialect;
  level: StoryLevel;
  length: StoryLength;
  questionCount: QuestionCount;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
  access: GameAccess;
}

export type StoryGameStatus = 'lobby' | 'reading' | 'question' | 'reveal' | 'finished' | 'cancelled';

/**
 * Another player as one viewer sees them. `name` and `avatarUrl` are filled only for the viewer, an accepted friend, or
 * in an 'open' game (all known adults) anyone without a block; everyone else is "Player {seat}" with the default picture,
 * which says nothing about age. What players are doing is only ever sent as counts (StoryGameView), never per seat.
 */
export interface StoryGamePlayer {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isMe: boolean;
  /** not heard from for PRESENCE_TIMEOUT_SECONDS; not waited for */
  away: boolean;
  /** left the game; stays listed so seats keep their places */
  gone: boolean;
  /** as of the last reveal, never mid-question */
  score: number;
  correct: number;
}

/** The open question. The right option is deliberately not in it. */
export interface StoryGameQuestion {
  index: number;
  total: number;
  kind: QuestionKind;
  prompt: string;
  /** English translation of the prompt, shown on request (by default at level 1) */
  promptEn: string | null;
  /** already shuffled for this game; answer with an index into this array */
  options: string[];
  /** prompt and options in interface languages, options in this game's order; never an explanation before the reveal */
  translations: Partial<Record<AppLocale, StoryQuestionTranslation>>;
  /** the option this viewer chose, once they have */
  myChoice: number | null;
}

export interface StoryGameReveal {
  index: number;
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  /** paragraph index (into StoryDetail.paragraphs) that holds the answer */
  evidenceParagraph: number | null;
  /** sentence index within that paragraph (storySentences), when the editor set one */
  evidenceSentence: number | null;
  /** the question in interface languages, options in this game's order, with any explanation */
  translations: Partial<Record<AppLocale, StoryQuestionTranslation>>;
  answeredCount: number;
  correctCount: number;
  myChoice: number | null;
  myCorrect: boolean | null;
}

export interface StoryGameReviewItem {
  index: number;
  kind: QuestionKind;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  myChoice: number | null;
  explanation: string | null;
  explanationEn: string | null;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
  /** as on the reveal: the question in interface languages, in this game's option order */
  translations: Partial<Record<AppLocale, StoryQuestionTranslation>>;
}

export interface StoryGameStanding {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  score: number;
  correct: number;
  /** 1-based; equal score and time share a place */
  place: number;
}

export interface StoryGameResults {
  /** the story's address, so the results can lead back to the reader */
  storySlug: string;
  /**
   * Everyone who played, best first. Clients show a podium only with four or more; a duo shows both scores without places,
   * and a group of three lists scores in seat order with the viewer's own place.
   */
  standings: StoryGameStanding[];
  me: {
    place: number;
    score: number;
    correct: number;
    answered: number;
    total: number;
    xp: number;
    /** whether this game counted as a day of learning (streak and daily reward) */
    learningCounted: boolean;
  } | null;
  /** every question with its answer, for going over what was missed (empty once a game is old) */
  review: StoryGameReviewItem[];
}

/** One viewer's view of a game (GET /story-games/:id, and every action's reply). */
export interface StoryGameView {
  id: string;
  /** join code, shown to members while new players can join (lobby, reading); otherwise null */
  code: string | null;
  mode: StoryGameMode;
  status: StoryGameStatus;
  /** bumped on every change; send it back as ?v= to wait for the next one */
  version: number;
  /** the server's clock when the view was made, so clients can correct theirs */
  serverNow: string;
  /**
   * When the open question closes by itself for this viewer: a timed question's deadline (later with extra time), shown as
   * a countdown, or an untimed duo or group question's cap, never shown as a clock, only as "This question closes soon" in
   * its last 30 seconds. Null while reading, for an untimed solo question and outside questions.
   */
  phaseEndsAt: string | null;
  /** reading phase: from when the host may start the questions early */
  readingSoftCapAt: string | null;
  /** reading phase: the questions start on their own at this time */
  readingHardCapAt: string | null;
  settings: StoryGameSettings;
  /** whether this viewer holds the host controls right now (the host, or the stand-in while the host is away) */
  isHost: boolean;
  /** whether this viewer asked for double time on timed questions */
  extraTime: boolean;
  players: StoryGamePlayer[];
  /** active (present, not away) players, and how many of them have finished reading, answered or continued */
  activeCount: number;
  readingDoneCount: number;
  answeredCount: number;
  continuedCount: number;
  /** this viewer finished reading, or continued past the current reveal */
  meDoneReading: boolean;
  meContinued: boolean;
  question: StoryGameQuestion | null;
  reveal: StoryGameReveal | null;
  results: StoryGameResults | null;
  /** set when the host started another round from this one; join it like any game */
  nextGameId: string | null;
  /** Rated or Friendly, shown before anyone joins; decided for a duo or group when its questions start. Optional only for older stored views. */
  rated?: RatedState;
}
