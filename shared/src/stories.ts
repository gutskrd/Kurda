/**
 * Stories: short Kurdish texts Hevalo writes, to read and then be quizzed on —
 * alone, with a friend, or with a group (it replaced the ranked quiz).
 *
 * Shared because four programs have to agree on every number here. The API
 * refuses a setting the clients offered, or accepts one they never offer; the
 * admin editor and the API disagree about which band a story falls in; the
 * reader and the audio studio split a story into different sentences and the
 * recordings stop lining up. One copy, so none of that can happen.
 *
 * The presets follow the research brief behind the feature: a short text a
 * beginner reads in a couple of minutes, three answer options rather than four,
 * questions in the order of the text with the overall one last, generous or no
 * timers, and accuracy rather than speed deciding the score.
 */
import { foldVariantChar, isInvisibleChar, lessonAudioKey } from './lesson-audio.js';
import type { RecordingVoice } from './lipsync/speakers.js';
import type { RatedState } from './ranks.js';
import { isSoraniDialect } from './lesson-answers.js';

/** The two varieties Hevalo teaches, spelled as the rhyme games store them. */
export const STORY_DIALECTS = ['kurmanci', 'sorani'] as const;
export type StoryDialect = (typeof STORY_DIALECTS)[number];

export function isStoryDialect(v: unknown): v is StoryDialect {
  return v === 'kurmanci' || v === 'sorani';
}

/**
 * Courses spell their variety 'kurmanji' (and the Soranî course one of the
 * spellings `isSoraniDialect` knows); stories spell it as the rhyme games do.
 */
export function storyDialectForCourse(courseDialect: string | null | undefined): StoryDialect {
  return isSoraniDialect(courseDialect) ? 'sorani' : 'kurmanci';
}

/**
 * Soranî is written in Arabic script, right to left; Kurmancî in Latin. Every
 * string that comes from a story — title, summary, paragraph, gloss term,
 * question, option, explanation — carries these, inside any interface language.
 */
export function storyTextDirection(dialect: StoryDialect): { lang: 'ku' | 'ckb'; dir: 'ltr' | 'rtl' } {
  return dialect === 'sorani' ? { lang: 'ckb', dir: 'rtl' } : { lang: 'ku', dir: 'ltr' };
}

/**
 * 1 = first steps (A1), 2 = elementary (A2), 3 = intermediate (B1), 4 = upper
 * intermediate (B2), 5 = advanced (C1). The number is what is stored and
 * filtered by. Readers are shown a plain name for it (`levelNameKey`), since
 * most people learning Kurdish never met the CEFR letters; the letters stay
 * for editors and the API.
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

/** 'A1' → 1 … 'C1' → 5, however it was typed ('b1', ' B1 '); null for anything else. */
export function levelOfCefr(cefr: string): StoryLevel | null {
  const at = (CEFR_LEVELS as readonly string[]).indexOf(cefr.trim().toUpperCase());
  return at < 0 ? null : STORY_LEVELS[at]!;
}

/** The catalogue key of a level's plain name ("Starter" … "Advanced"), the same on the website and the phone. */
export type LevelNameKey = `level.name.${StoryLevel}`;
/** The catalogue key of the line under a level's name that says what reading at it is like. */
export type LevelHintKey = `level.hint.${StoryLevel}`;

/**
 * What a reader is shown for a level: a plain name and a line saying what it
 * means, never the bare CEFR letter, which says nothing to someone who never
 * studied a language in a classroom. Kept here, with the order, so the
 * stories, and later the lessons and the games, all call level 2 by the same
 * name in both apps; the words themselves are in each app's catalogues.
 */
export function levelNameKey(level: StoryLevel): LevelNameKey {
  return `level.name.${level}`;
}

export function levelHintKey(level: StoryLevel): LevelHintKey {
  return `level.hint.${level}`;
}

/** The orders GET /stories offers: easiest first (level, then length, then title — also its order when none is asked), newest first, and by title. */
export const STORY_SORTS = ['level', 'newest', 'title'] as const;
export type StorySort = (typeof STORY_SORTS)[number];
/** The order a list is in when none is asked for. */
export const DEFAULT_STORY_SORT: StorySort = 'level';

export function isStorySort(v: unknown): v is StorySort {
  return (STORY_SORTS as readonly unknown[]).includes(v);
}

/**
 * The languages stories are written in. Only Kurdish for now (its two
 * varieties are the dialects); stored on every story all the same, so another
 * language can arrive later without rewriting what is there.
 */
export const STORY_LANGUAGES = ['ku'] as const;
export type StoryLanguage = (typeof STORY_LANGUAGES)[number];

export function isStoryLanguage(v: unknown): v is StoryLanguage {
  return (STORY_LANGUAGES as readonly unknown[]).includes(v);
}

/**
 * Where a story comes from, which the reader is told: 'traditional' is
 * documented folklore retold close to a source, 'adapted' is traditional
 * material freely retold for learners, 'original' was written for learners.
 * An original story is never presented as folklore, which is why this is a
 * field and not a line in the summary.
 */
export const STORY_TRADITIONS = ['traditional', 'adapted', 'original'] as const;
export type StoryTradition = (typeof STORY_TRADITIONS)[number];

export function isStoryTradition(v: unknown): v is StoryTradition {
  return (STORY_TRADITIONS as readonly unknown[]).includes(v);
}

/** A category's address: lower-case letters, digits and dashes, as the table checks it. */
export const STORY_CATEGORY_SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

/** A category as the library shows it: its slug, its name per interface language (English always), its place in the list. */
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

/** The text-length presets a host chooses from. */
export const STORY_LENGTHS = ['short', 'medium', 'long'] as const;
export type StoryLength = (typeof STORY_LENGTHS)[number];

export function isStoryLength(v: unknown): v is StoryLength {
  return v === 'short' || v === 'medium' || v === 'long';
}

export interface WordBand {
  min: number;
  max: number;
}

/**
 * How many words a story of each length has, per variety. Soranî attaches its
 * clitics to the word they lean on, so the same text has fewer space-separated
 * words than in Kurmancî; its bands are lower for that reason (an estimate, not
 * a measured ratio — revisit once there are enough stories to measure). The
 * bands do not touch, so a word count names one length or none.
 */
export const STORY_WORD_BANDS: Readonly<Record<StoryDialect, Readonly<Record<StoryLength, WordBand>>>> = {
  kurmanci: {
    short: { min: 60, max: 120 },
    medium: { min: 150, max: 250 },
    long: { min: 300, max: 450 },
  },
  sorani: {
    short: { min: 50, max: 100 },
    medium: { min: 125, max: 210 },
    long: { min: 250, max: 380 },
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
 * Words a minute for the estimates. Beginners read slowly — most second-language
 * readers start below 100 — and Soranî packs more into each written word (see
 * the bands), so its rate is lower for the same reading time. `slow` sizes the
 * reading phase for the slowest reader in a group.
 */
export const READING_WPM: Readonly<Record<StoryDialect, { typical: number; slow: number }>> = {
  kurmanci: { typical: 60, slow: 40 },
  sorani: { typical: 50, slow: 34 },
};

/** Estimated minutes to read, shown as "~N min". Never zero. */
export function readingMinutes(dialect: StoryDialect, words: number): number {
  return Math.max(1, Math.ceil(words / READING_WPM[dialect].typical));
}

/** The range of minutes a length takes in a variety, for setup labels and filter chips. */
export function lengthMinutes(dialect: StoryDialect, length: StoryLength): { min: number; max: number } {
  const band = STORY_WORD_BANDS[dialect][length];
  return { min: readingMinutes(dialect, band.min), max: readingMinutes(dialect, band.max) };
}

/**
 * The reading phase of a duo or group. Questions start as soon as every active
 * player says they have finished. The host may start them earlier only after
 * the soft cap (time for a slow reader, at least a minute); after the hard cap
 * they start on their own, so one idle reader cannot stall a game. Nobody is
 * shown a countdown while reading.
 */
export function readingSoftCapSeconds(dialect: StoryDialect, words: number): number {
  return Math.max(60, Math.ceil((words / READING_WPM[dialect].slow) * 60));
}

export function readingHardCapSeconds(dialect: StoryDialect, words: number): number {
  return Math.min(1800, readingSoftCapSeconds(dialect, words) * 2 + 60);
}

/** The question-count presets. */
export const QUESTION_COUNTS = [3, 5, 10] as const;
export type QuestionCount = (typeof QUESTION_COUNTS)[number];

/**
 * Which counts each length offers. Ten questions about a short text would ask
 * about nearly every sentence; three about a long one would skip most of it.
 */
export const QUESTION_COUNTS_BY_LENGTH: Readonly<Record<StoryLength, readonly QuestionCount[]>> = {
  short: [3, 5],
  medium: [3, 5, 10],
  long: [5, 10],
};

/** The count a setup screen starts on for each length. */
export const DEFAULT_QUESTION_COUNT: Readonly<Record<StoryLength, QuestionCount>> = {
  short: 3,
  medium: 5,
  long: 5,
};

export function isAllowedQuestionCount(length: StoryLength, count: unknown): count is QuestionCount {
  return (QUESTION_COUNTS_BY_LENGTH[length] as readonly unknown[]).includes(count);
}

/**
 * The fewest questions a published story must carry. More than the largest
 * count it offers, so playing it twice does not ask the same questions in the
 * same way.
 */
export const MIN_QUESTION_BANK: Readonly<Record<StoryLength, number>> = {
  short: 6,
  medium: 12,
  long: 15,
};

/** A story never needs more than this many questions. */
export const MAX_QUESTION_BANK = 30;

/** What a question asks about — the editor tags each one, and a game mixes them. */
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
export const STORY_BODY_MAX = 6000;
export const QUESTION_PROMPT_MAX = 300;
export const QUESTION_OPTION_MAX = 160;
/** One line: the reveal shows it beside the answer for a few seconds. */
export const QUESTION_EXPLANATION_MAX = 160;
export const GLOSSARY_MAX = 20;
export const GLOSS_TERM_MAX = 60;
export const GLOSS_MEANING_MAX = 120;
/** A sentence longer than this may not fit one 15-second studio recording. */
export const STORY_SENTENCE_SOFT_MAX = 180;
/** The attribution block: who wrote or told it, where it comes from, and what to say about that. */
export const STORY_AUTHOR_MAX = 120;
export const STORY_SOURCE_MAX = 300;
export const STORY_SOURCE_URL_MAX = 500;
export const STORY_ATTRIBUTION_NOTE_MAX = 600;
/** A full translation runs longer than the Kurdish it translates; English about half again. */
export const STORY_TRANSLATION_MAX = 9000;
/** The key of a shared background picture, which the apps draw as the cover. */
export const STORY_COVER_MAX = 80;
/** An editor's reading time stands in for the estimate; two hours is more than any story here. */
export const STORY_READING_MINUTES_MAX = 120;
/** A reviewer's note: why approval was given or withdrawn. */
export const STORY_REVIEW_NOTE_MAX = 600;
export const STORY_CATEGORY_NAME_MAX = 60;

/**
 * Seconds per question. 0 means no timer: the question closes when everyone
 * has answered (or, in a group, when the host moves on).
 */
export const TIMER_PRESETS = [0, 60, 30] as const;
export type TimerSeconds = (typeof TIMER_PRESETS)[number];

export function isTimerPreset(v: unknown): v is TimerSeconds {
  return v === 0 || v === 60 || v === 30;
}

/**
 * Whether the text stays on screen while the questions are asked. Visible is
 * the default and the kinder test; hidden is the host's "from memory" challenge
 * (honour-based: the story itself stays readable elsewhere in the app), and
 * everyone is told so before they start reading.
 */
export const TEXT_DURING_OPTIONS = ['visible', 'hidden'] as const;
export type TextDuring = (typeof TEXT_DURING_OPTIONS)[number];

export function isTextDuring(v: unknown): v is TextDuring {
  return v === 'visible' || v === 'hidden';
}

/**
 * Who may join a duo or group. 'friends' (the default): the host's friends.
 * 'open': any known adult with the code — offered only to a host who is a known
 * adult, and never joinable by a minor or an account of unknown age, so a child
 * is never in a game strangers could walk into (the open-groups rule).
 */
export const GAME_ACCESS = ['friends', 'open'] as const;
export type GameAccess = (typeof GAME_ACCESS)[number];

export function isGameAccess(v: unknown): v is GameAccess {
  return v === 'friends' || v === 'open';
}

/** Alone, with one other person, or with a group. */
export const STORY_GAME_MODES = ['solo', 'duo', 'group'] as const;
export type StoryGameMode = (typeof STORY_GAME_MODES)[number];

export function isStoryGameMode(v: unknown): v is StoryGameMode {
  return v === 'solo' || v === 'duo' || v === 'group';
}

export const MAX_PLAYERS: Readonly<Record<StoryGameMode, number>> = { solo: 1, duo: 2, group: 8 };
export const MIN_PLAYERS_TO_START: Readonly<Record<StoryGameMode, number>> = { solo: 1, duo: 2, group: 2 };

/** A solo reader is not raced against a clock unless they ask to be. */
export const DEFAULT_TIMER: Readonly<Record<StoryGameMode, TimerSeconds>> = { solo: 0, duo: 60, group: 60 };

/** Points for a right answer. Speed never adds points; it only breaks ties. */
export const POINTS_PER_CORRECT = 100;

/**
 * An answer sent just before the deadline still counts if it arrives within
 * this long after it. Scores are accuracy only, so a generous grace costs no
 * fairness and saves a beginner on a slow phone network their point. A timed
 * question closes at its deadline plus this grace — never earlier, or the grace
 * would never apply.
 */
export const ANSWER_GRACE_MS = 1500;

/**
 * After an answer is revealed, a duo or group moves on when every active player
 * has tapped Continue, or after this long at most. The reveal is where the
 * learning happens; nobody skips it for anyone else.
 */
export const REVEAL_MAX_SECONDS = 15;

/**
 * An untimed question in a duo or group still closes after this long, so one
 * player who walked away cannot hold everyone else. Solo has no such cap.
 */
export const UNTIMED_QUESTION_CAP_SECONDS = 180;

/**
 * A member the server has not heard from for this long is away: not waited for
 * (reading, answering, continuing), not counted towards starting, and — when it
 * is the host — the earliest-joined active player holds the host controls until
 * they are back. Longer than a long-poll (20 s) plus the longest client backoff.
 */
export const PRESENCE_TIMEOUT_SECONDS = 45;

/** A lobby nobody starts is closed after this long. */
export const LOBBY_IDLE_MINUTES = 30;

/** Join codes: six characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
export const JOIN_CODE_LENGTH = 6;
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Upper-case what someone typed, drop spaces and dashes, and read the digits
 * Arabic and Soranî keyboards type (٢, ۲) as the digits they are; null if it
 * cannot be a code. (A pasted invite link is the caller's to try first, with
 * `parseInvite`.)
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

/** "ABC234" → "ABC 234", which is easier to read out and type. */
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

// a sentence ends at . ! ? … the Arabic question mark or full stop, with any
// closing quotes or brackets after it, followed by whitespace or the end
const SENTENCE_END = /([.!?…؟۔]+["'”’»“)\]]*)(\s+|$)/g;

/**
 * Split a paragraph into sentences, keeping each sentence's own punctuation.
 * The reader marks sentences up for audio and the studio lists them for
 * recording, so both must cut in exactly the same places — which is why this
 * is here and nowhere else. (Abbreviations such as "Dr." would split; the
 * editor warns about them, and stories are written without them.)
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

// a word is a run of non-space characters with at least one letter in it, so a
// lone dash or a number does not count
const HAS_LETTER = /\p{L}/u;

export function countStoryWords(body: string): number {
  let n = 0;
  for (const token of body.split(/\s+/)) if (token && HAS_LETTER.test(token)) n += 1;
  return n;
}

/**
 * The sentences of a story that can be recorded, in reading order, per
 * paragraph: those with a letter in them and a non-empty recording key (a
 * "* * *" scene break or a lone "?!" is not something anyone says). The reader,
 * the studio listing and "fully narrated" all count from this.
 */
export function storyAudioSentences(paragraph: string): string[] {
  return storySentences(paragraph).filter((s) => HAS_LETTER.test(s) && lessonAudioKey(s) !== '');
}

/** A word in a story with its meaning, for a tap-to-see gloss. */
export interface StoryGlossEntry {
  /** the word or phrase as it appears in the text */
  term: string;
  /** meanings keyed by interface language; `en` is always present */
  meanings: { en: string } & Partial<Record<string, string>>;
  /**
   * The dictionary entry whose headword the term is, so the reader can save
   * the word. The server fills it when the story is saved (the editor never
   * sends it); null or absent when the term is not a headword.
   */
  entryId?: string | null;
  /** that entry's part of speech (its first sense), looked up when the story is read */
  pos?: string | null;
  /** a pronunciation of that entry in the story's variety, when one is recorded; looked up when the story is read */
  audioUrl?: string | null;
}

/**
 * The meaning for the reader's interface language, falling back to English —
 * with the language it is actually in, so a client can mark an English
 * fallback inside an Arabic interface as English (direction, screen-reader
 * voice).
 */
export function glossFor(entry: StoryGlossEntry, locale: string): { text: string; lang: string } {
  const own = Object.hasOwn(entry.meanings, locale) ? entry.meanings[locale] : undefined;
  if (typeof own === 'string' && own.trim() !== '') return { text: own, lang: locale };
  return { text: entry.meanings.en, lang: 'en' };
}

// folded for matching: variants folded, invisible characters blanked, lower
// case — one output character per input UTF-16 unit, so indices carry over
function foldForMatch(text: string): string {
  let out = '';
  for (const ch of text) {
    const units = ch.length;
    if (isInvisibleChar(ch)) {
      out += '\u0000'.repeat(units);
      continue;
    }
    const lower = foldVariantChar(ch).toLowerCase();
    // keep one unit per unit; a lowercase that changes length is left as is
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
 * Where the glossary's words are in a paragraph: the first occurrence of each
 * term, as a whole word (not inside a longer one — دار is not marked inside
 * بەردار), longest terms first, never overlapping, letter variants and case
 * ignored. The editor's validation, the web reader and the phone reader all
 * mark from this, so a term the editor accepted is a term the reader shows.
 */
export function glossSpans(paragraph: string, glossary: readonly StoryGlossEntry[]): GlossSpan[] {
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
// API shapes. The API returns these; the web and phone apps render them.
// No shape below ever carries another player's user id: seats are the only
// handle, so a stranger in a game never gets an id to open a profile with.
// ---------------------------------------------------------------------------

/**
 * How much of a story is narrated: none of its sentences, some, or every one
 * the reader can play. Counted from the sentence recordings, so it is 'full'
 * exactly when `fullyNarrated` is true.
 */
export type StoryAudioCoverage = 'none' | 'partial' | 'full';

/** The signed-in reader's own record on a story, beside the story in lists and the detail. */
export interface StoryMe {
  bookmarked: boolean;
  /** the last paragraph they were reading (0 before they started) */
  paragraph: number;
  /** how far through the text they got, 0–1 */
  share: number;
  /** when they first finished reading it; null until then */
  finishedAt: string | null;
  /** their best right answers out of `total` in a finished game on it; null before any */
  bestCorrect: number | null;
  total: number | null;
  /** games on it they finished today (their own day): from PAID_STORY_REPEATS_PER_DAY on, a game pays no XP */
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
  /** `cefrOf(level)`, sent so a client never keeps its own table */
  cefr: CefrLevel;
  length: StoryLength;
  wordCount: number;
  /** the editor's reading time when set, else the estimate from the word count */
  readingMinutes: number;
  /** true when every recordable sentence has a studio recording */
  fullyNarrated: boolean;
  /** none, some or all of its sentences recorded (the detail's `audio` is the recordings themselves) */
  audioCoverage: StoryAudioCoverage;
  /** a category slug (see StoryCategory), null for a story not filed yet */
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  /** an editor's pick for the library's Featured row */
  featured: boolean;
  /** the key of a shared background picture to draw as the cover, or null for the plain card */
  cover: string | null;
  publishedAt: string | null;
  /** the caller's own record, only when they are signed in */
  me?: StoryMe;
}

/** One recorded sentence on the stitched narration timeline. */
export interface StoryNarrationSentence {
  /** index into `paragraphs` */
  paragraph: number;
  /** index into `storySentences(paragraphs[paragraph])`, which is what the reader highlights */
  sentence: number;
  /** its recording key, which is also its key in `audio` */
  key: string;
  url: string;
  durationMs: number;
  /** where it starts when every recorded sentence is played in reading order */
  startMs: number;
}

/**
 * A story's recorded sentences played back to back, as one track the player
 * can seek along. `complete` is false when a sentence has no recording yet —
 * the track then skips it, and the apps say "n of m sentences recorded".
 */
export interface StoryNarration {
  sentences: StoryNarrationSentence[];
  totalMs: number;
  complete: boolean;
}

/**
 * Which sentence is playing at a position on the stitched timeline, and how
 * far into it. Before the start it is the first sentence from the beginning;
 * at or past the end it is the last sentence at its end, so a seek bar dragged
 * to either edge lands somewhere playable. An empty narration answers -1.
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
 * A story to read: GET /stories/:idOrSlug (published only), or
 * GET /story-games/:id/story (the game's own copy, for its members, whatever
 * has happened to the story since). Never carries its questions.
 */
export interface StoryDetail extends StoryListItem {
  paragraphs: string[];
  glossary: StoryGlossEntry[];
  /** studio recordings by `lessonAudioKey(sentence)`, only for sentences that have one */
  audio: Record<string, string>;
  /** who says each recording and how their mouth moves, by the same key; only those with a character, and absent when none has */
  voices?: Record<string, RecordingVoice>;
  /** full translations by interface language, each cut into paragraphs that line up with `paragraphs` */
  translations: Record<string, string[]>;
  /** the collection, teller, region or publication it comes from */
  source: string | null;
  sourceUrl: string | null;
  /** variations between oral versions, licence remarks, "a legend, not verified history" */
  attributionNote: string | null;
  /** the same story in another variety or language (published ones only), to switch to */
  versions: Array<{ id: string; slug: string; dialect: StoryDialect; language: StoryLanguage }>;
  /** the recorded sentences as one track; null when none is recorded */
  narration: StoryNarration | null;
}

/** The library's front page (GET /stories/library). Personal rows are empty for an anonymous caller. */
export interface StoryLibrary {
  /** editors' picks, latest pick first */
  featured: StoryListItem[];
  /** latest published first */
  recent: StoryListItem[];
  /** started and not finished, latest read first */
  continue: StoryListItem[];
  bookmarks: StoryListItem[];
  /** every category, with how many published stories are filed under it */
  categories: Array<StoryCategory & { count: number }>;
  /** how many published stories there are at each level, only for levels that have one; absent from an older server */
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
 * The query string for a StoryQuery, ready to append to `/stories`: '' when
 * nothing is set, else '?…' with the keys in one fixed order (so two equal
 * queries make one cache entry and one URL). Blank and undefined values are
 * left out; `audio` travels as `audio=1`.
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
 * The quiz a reader takes at the end of a story: the existing solo game,
 * five untimed questions with the text still at hand, straight to the
 * questions since the story has just been read. Clients send this with the
 * story's id to POST /story-games; the game's results carry the XP.
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
  /** the story it is played on, so a reader can offer "Continue" on that story's own quiz */
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
 * Another player as one particular viewer sees them. `name` and `avatarUrl`
 * are filled only for the viewer themselves, for an accepted friend, or — in
 * an 'open' game, where every member is a known adult — for anyone they have
 * no block with. Everyone else is "Player {seat}" with the default picture: in
 * a friends game a missing name means "not my friend" and nothing about age.
 * What a player is doing (reading, answering) is only ever given as counts
 * (see StoryGameView), never per seat.
 */
export interface StoryGamePlayer {
  seat: number;
  name: string | null;
  avatarUrl: string | null;
  isHost: boolean;
  isMe: boolean;
  /** not heard from for PRESENCE_TIMEOUT_SECONDS; not waited for */
  away: boolean;
  /** left the game; stays listed so seats do not shift */
  gone: boolean;
  /** as of the last reveal, never mid-question */
  score: number;
  correct: number;
}

/** The open question. The right option is not in here, by design. */
export interface StoryGameQuestion {
  index: number;
  total: number;
  kind: QuestionKind;
  prompt: string;
  /** English translation of the prompt, shown on request (by default at level 1) */
  promptEn: string | null;
  /** already shuffled for this game; answer with the index into this array */
  options: string[];
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
   * Everyone who played, best first. Clients show a podium only with four or
   * more players; a duo shows both scores without places, and a group of three
   * lists scores in seat order with your own place shown to you.
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
  /** join code; shown to members while new players can join (lobby, reading), otherwise null */
  code: string | null;
  mode: StoryGameMode;
  status: StoryGameStatus;
  /** bumped on every change; send it back as ?v= to wait for the next one */
  version: number;
  /** server clock when this view was made, so clients can correct their own */
  serverNow: string;
  /**
   * When the open question closes on its own for this viewer: a timed question's
   * deadline (later for a player with extra time), shown as a countdown; or an
   * untimed duo/group question's cap (`settings.timerSeconds` is 0), never shown
   * as a clock — only as "This question closes soon" in its last 30 seconds.
   * Null otherwise: while reading, for an untimed solo question, and outside
   * questions — nobody is shown a clock there.
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
  /** active (present, not away) players, and how many of them have finished reading / answered / continued */
  activeCount: number;
  readingDoneCount: number;
  answeredCount: number;
  continuedCount: number;
  /** this viewer: done reading / continued past the current reveal */
  meDoneReading: boolean;
  meContinued: boolean;
  question: StoryGameQuestion | null;
  reveal: StoryGameReveal | null;
  results: StoryGameResults | null;
  /** set when the host started another round from this one; join it like any game */
  nextGameId: string | null;
  /**
   * Rated or Friendly (Game Ranks), shown before anyone joins; a duo or group
   * game is decided when its questions start. Always sent by the API (optional
   * only so views recorded before it still type-check).
   */
  rated?: RatedState;
}
