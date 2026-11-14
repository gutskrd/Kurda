/**
 * Writing a story: the checks a story passes before it is saved, submitted or
 * published, and the slug it gets from its title.
 *
 * One copy for every place a story is written — the admin API, the import
 * command and the starter seeding all run `validateStory`, and the admin
 * editor can run the same function as the editor types — so a story the
 * importer accepted is one the publish button accepts, and the editor never
 * shows a problem the server does not have (or misses one it does).
 *
 * A draft is allowed to be unfinished: a text still between lengths, too few
 * questions, a saga not yet cut into sections, even no text yet. Those are
 * warnings while it is a draft and errors when it is submitted or published.
 * Everything else — a broken question, a gloss for a word the text does not
 * have, a sentence too long to record, a translation in a language the app is
 * not offered in — is wrong at any stage, and is an error from the first save.
 */
import { LESSON_AUDIO_TEXT_MAX } from './lesson-audio.js';
import { normalizeKurdish } from './kurdish-text.js';
import { isAppLocale } from './locales.js';
import {
  CEFR_LEVELS,
  GLOSSARY_MAX,
  GLOSS_MEANING_MAX,
  GLOSS_TERM_MAX,
  MAX_OPTIONS,
  MAX_QUESTION_BANK,
  MIN_OPTIONS,
  MIN_QUESTION_BANK,
  QUESTION_EXPLANATION_MAX,
  QUESTION_OPTION_MAX,
  QUESTION_PROMPT_MAX,
  STORY_ATTRIBUTION_NOTE_MAX,
  STORY_AUTHOR_MAX,
  STORY_BODY_MAX,
  STORY_CATEGORY_SLUG_PATTERN,
  STORY_COVER_MAX,
  STORY_HEADING_MAX,
  STORY_LENGTHS,
  STORY_LEVELS,
  STORY_NOTES_MAX,
  STORY_NOTE_BODY_MAX,
  STORY_NOTE_TITLE_MAX,
  STORY_READING_MINUTES_MAX,
  STORY_REFLECTIONS_MAX,
  STORY_REFLECTION_MAX,
  STORY_REVIEW_NOTE_MAX,
  STORY_SENTENCE_SOFT_MAX,
  STORY_SOURCES_MAX,
  STORY_SOURCE_MAX,
  STORY_SOURCE_NOTE_MAX,
  STORY_SOURCE_URL_MAX,
  STORY_SUMMARY_MAX,
  STORY_TITLE_MAX,
  STORY_TRANSLATION_MAX,
  STORY_WORD_BANDS,
  countStoryWords,
  glossSpans,
  isQuestionKind,
  isStoryDialect,
  isStoryHeading,
  isStoryLanguage,
  isStoryLevel,
  isStoryNoteKind,
  isStorySourceType,
  isStoryTradition,
  isStoryTranslationReviewStatus,
  storyHeadingTitle,
  storyLengthFor,
  storyParagraphs,
  storySections,
  storySentences,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryLanguage,
  type StoryLength,
  type StoryMetaTranslation,
  type StoryNoteTranslation,
  type StoryQuestionTranslation,
  type StoryTradition,
  type StoryTranslationReviewEntry,
} from './stories.js';

/** A slug: lower-case Latin letters, digits and dashes, as the stories table checks it. */
export const STORY_SLUG_PATTERN = /^[a-z0-9-]{3,80}$/;

/**
 * The chapter of the Kurmanji Road a story ends, when it is one: the story
 * Hamo tells at a chapter's end has a slug that starts with the chapter's
 * number (`road-01-li-ber-deriye-sor`). It is recorded in Hamo's voice and
 * goes online with its chapter. Null for any other story.
 */
export function roadStoryChapter(slug: string): number | null {
  const m = /^road-(\d{2})-[a-z0-9-]+$/.exec(slug);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 12 ? n : null;
}

export function isStorySlug(v: unknown): v is string {
  return typeof v === 'string' && STORY_SLUG_PATTERN.test(v);
}

// Hawar letters with a mark, written as the plain letter in a web address
const HAWAR_PLAIN: Record<string, string> = { ê: 'e', î: 'i', û: 'u', ç: 'c', ş: 's' };
const SLUG_RANDOM = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomSuffix(random: () => number): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += SLUG_RANDOM[Math.floor(random() * SLUG_RANDOM.length)] ?? 'x';
  return out;
}

/**
 * The slug a new story starts with. A Kurmancî title spells its own: "Qelema
 * Şîn" is qelema-sin. A Soranî title is in Arabic script, which a slug cannot
 * hold and nobody agrees how to transliterate, so it gets `sorani-` and six
 * random characters for the editor to replace with something readable. A
 * Kurmancî title with too few Latin letters to make a slug of falls back the
 * same way. Slugs are addresses, not secrets: Math.random is enough.
 */
export function storySlugFor(title: string, dialect: StoryDialect, random: () => number = Math.random): string {
  if (dialect === 'kurmanci') {
    const slug = title
      .normalize('NFC')
      .toLowerCase()
      .replace(/[êîûçş]/g, (ch) => HAWAR_PLAIN[ch] ?? ch)
      // any other accented Latin letter loses its accent the same way
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '');
    if (STORY_SLUG_PATTERN.test(slug)) return slug;
  }
  return `${dialect}-${randomSuffix(random)}`;
}

/** A question as an editor writes it (the stored `story_questions` row, in API spelling). */
export interface StoryQuestionInput {
  /** a QuestionKind; checked, since stored or imported data may carry anything */
  kind: string;
  prompt: string;
  promptEn: string | null;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  explanationEn: string | null;
  /** index into storyParagraphs(body) */
  evidenceParagraph: number | null;
  /** index into storySentences(paragraph), within the evidence paragraph */
  evidenceSentence: number | null;
  /**
   * The question in interface languages, by locale: the options in the same
   * order as `options`, so the same index is right in each. Left out, none.
   */
  translations?: Record<string, StoryQuestionTranslation>;
}

/** An open question to think about after reading, as an editor writes it (`StoryReflection`). */
export interface StoryReflectionInput {
  text: string;
  translations?: Record<string, string>;
}

/** A note beside the story, as an editor writes it (`StoryNote`); the kind is checked, since stored or imported data may carry anything. */
export interface StoryNoteInput {
  kind: string;
  title: string;
  body: string;
  translations?: Record<string, StoryNoteTranslation>;
}

/** A source, as an editor writes it (`StorySourceEntry`); an empty optional field may be null. */
export interface StorySourceInput {
  title: string;
  author?: string | null;
  url?: string | null;
  /** a StorySourceType; checked */
  type: string;
  note?: string | null;
}

/**
 * What places a story in the library and says where it comes from, apart
 * from its text and questions: the fields this wave added to StoryInput, as
 * one piece so an editor that does not show them yet can carry them through
 * a save unchanged (`emptyStoryLibraryInput` is a new story's).
 */
export interface StoryLibraryInput {
  /** a StoryLanguage; 'ku' when left out */
  language?: string;
  /** a StoryCategory slug; required to publish */
  category: string | null;
  /** a StoryTradition; checked, since stored or imported data may carry anything */
  tradition: string;
  author: string | null;
  /** the collection, teller, region or publication it comes from */
  source: string | null;
  /** https only */
  sourceUrl: string | null;
  attributionNote: string | null;
  /** full translations by interface language, each with the body's paragraphs, blank-line separated */
  translations: Record<string, string>;
  /** the key of a shared background picture, drawn as the cover */
  cover: string | null;
  /** the editor's reading time, standing in for the estimate */
  readingMinutes: number | null;
  /**
   * What a legend carries besides its text, all optional so a story written
   * before them reads as having none: the title and summary per interface
   * language, open questions to think about, notes, and its sources.
   */
  metaTranslations?: Record<string, StoryMetaTranslation>;
  reflections?: StoryReflectionInput[];
  notes?: StoryNoteInput[];
  sources?: StorySourceInput[];
  /**
   * Which translations a native speaker has read, per interface language. A
   * file may set it; the admin routes never take it from an editor's save
   * (the per-language review route records it, with who and when).
   */
  translationReview?: Record<string, StoryTranslationReviewEntry>;
}

export function emptyStoryLibraryInput(): StoryLibraryInput {
  return {
    language: 'ku',
    category: null,
    tradition: 'original',
    author: null,
    source: null,
    sourceUrl: null,
    attributionNote: null,
    translations: {},
    cover: null,
    readingMinutes: null,
    metaTranslations: {},
    reflections: [],
    notes: [],
    sources: [],
  };
}

/** A story as an editor writes it: everything `validateStory` looks at. */
export interface StoryInput extends StoryLibraryInput {
  dialect: StoryDialect;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  questions: StoryQuestionInput[];
}

// ── tidying what a legend carries ─────────────────────────────────────────
// One copy for the API's save and the admin editor's draft, so what the editor
// checks as it is typed is what the API stores: each part trimmed, a line
// ending of one kind, a part left wholly empty dropped. A part only half
// written stays, for `validateStory` to point at.

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
}

/** Each entry of a map tidied, those that tidy to nothing dropped. */
function tidyEach<T, U>(map: Record<string, T> | null | undefined, tidy: (v: T) => U | null): Record<string, U> {
  const out: Record<string, U> = {};
  if (!map || typeof map !== 'object') return out;
  for (const [locale, value] of Object.entries(map)) {
    const t = tidy(value);
    if (t !== null) out[locale] = t;
  }
  return out;
}

/** One language's title and summary; null when neither is written. */
export function tidyMetaTranslation(m: StoryMetaTranslation | null | undefined): StoryMetaTranslation | null {
  const title = trimmed(m?.title);
  const summary = trimmed(m?.summary);
  return title || summary ? { ...(title ? { title } : {}), ...(summary ? { summary } : {}) } : null;
}

/** One language's question; null when nothing of it is written. */
export function tidyQuestionTranslation(t: StoryQuestionTranslation | null | undefined): StoryQuestionTranslation | null {
  if (!t || typeof t !== 'object') return null;
  const prompt = trimmed(t.prompt);
  const options = (Array.isArray(t.options) ? t.options : []).map(trimmed);
  const explanation = trimmed(t.explanation);
  if (!prompt && !explanation && options.every((o) => !o)) return null;
  return { prompt, options, ...(explanation ? { explanation } : {}) };
}

/** One language's note; null when neither its title nor its text is written. */
export function tidyNoteTranslation(t: StoryNoteTranslation | null | undefined): StoryNoteTranslation | null {
  const title = trimmed(t?.title);
  const body = trimmed(t?.body);
  return title || body ? { title, body } : null;
}

/** A question's translations, tidied. */
export function tidyQuestionTranslations(map: Record<string, StoryQuestionTranslation> | null | undefined): Record<string, StoryQuestionTranslation> {
  return tidyEach(map, tidyQuestionTranslation);
}

/** The title and summary per language, the reflections, the notes and the sources, tidied. */
export function tidyStoryCompanions(
  story: Pick<StoryLibraryInput, 'metaTranslations' | 'reflections' | 'notes' | 'sources'>,
): Required<Pick<StoryLibraryInput, 'metaTranslations' | 'reflections' | 'notes' | 'sources'>> {
  return {
    metaTranslations: tidyEach(story.metaTranslations, tidyMetaTranslation),
    reflections: (story.reflections ?? []).map((r) => ({
      text: trimmed(r?.text),
      translations: tidyEach(r?.translations, (t) => trimmed(t) || null),
    })),
    notes: (story.notes ?? []).map((n) => ({
      kind: trimmed(n?.kind),
      title: trimmed(n?.title),
      body: trimmed(n?.body),
      translations: tidyEach(n?.translations, tidyNoteTranslation),
    })),
    sources: (story.sources ?? []).map((src) => {
      const author = trimmed(src?.author);
      const url = trimmed(src?.url);
      const note = trimmed(src?.note);
      return { title: trimmed(src?.title), type: trimmed(src?.type), ...(author ? { author } : {}), ...(url ? { url } : {}), ...(note ? { note } : {}) };
    }),
  };
}

/** The language a story is in, read from its input: 'ku' unless it says otherwise. */
export function storyLanguageOf(story: Pick<StoryLibraryInput, 'language'>): StoryLanguage {
  return isStoryLanguage(story.language) ? story.language : 'ku';
}

/** The tradition a story claims, read from its input: 'original' unless it says a valid other. */
export function storyTraditionOf(story: Pick<StoryLibraryInput, 'tradition'>): StoryTradition {
  return isStoryTradition(story.tradition) ? story.tradition : 'original';
}

export interface StoryProblem {
  /** stable, for a client that wants to react to one kind of problem */
  code: string;
  /** where it is: 'body', 'glossary[2].term', 'questions[3].options[1]', … */
  path: string;
  /** what is wrong and what to do, in English (the admin panel is English) */
  message: string;
}

export interface StoryValidation {
  /** block saving at this stage (and always block publishing) */
  errors: StoryProblem[];
  /** shown, never blocking */
  warnings: StoryProblem[];
}

/**
 * 'draft' while an editor saves work in progress; 'publish' when the story is
 * submitted for review or published — what learners will read must be whole.
 */
export type StoryValidationStage = 'draft' | 'publish';

/** Problems a draft may have and a submitted or published story may not. */
const UNFINISHED_IN_DRAFT = new Set(['BODY_EMPTY', 'WORD_COUNT_OUTSIDE_BANDS', 'BANK_TOO_SMALL', 'CATEGORY_MISSING', 'SAGA_SECTIONS']);

/** A saga is told in sections: fewer headings than this and it is one long text, which the reader cannot navigate. */
export const SAGA_MIN_SECTIONS = 2;

/**
 * Abbreviations that end in a full stop. The reader and the audio studio cut a
 * sentence after one (they cannot tell "Dr." from the end of a sentence), so a
 * story writes them out instead.
 */
const ABBREVIATIONS = ['dr.', 'prof.', 'hwd.', 'b.z.', 'p.z.'];

/** An explanation longer than this no longer reads as one line beside the answer. */
const EXPLANATION_SOFT_MAX = 120;
/** A kind asked more than this share of the time makes every game on the story feel the same. */
const KIND_SHARE_MAX = 0.6;
/** Below this many questions, shares and patterns say nothing yet. */
const PATTERN_MIN_QUESTIONS = 3;

const LENGTH_NAME: Record<StoryLength, string> = { short: 'short', medium: 'medium', long: 'long', saga: 'saga' };
const SHORTEST: StoryLength = STORY_LENGTHS[0];
const LONGEST: StoryLength = STORY_LENGTHS[STORY_LENGTHS.length - 1]!;

function nearestLength(dialect: StoryDialect, words: number): { length: StoryLength; min: number; max: number } {
  let best: { length: StoryLength; min: number; max: number; gap: number } | null = null;
  for (const length of STORY_LENGTHS) {
    const band = STORY_WORD_BANDS[dialect][length];
    const gap = words < band.min ? band.min - words : words > band.max ? words - band.max : 0;
    if (!best || gap < best.gap) best = { length, ...band, gap };
  }
  return best!;
}

function blank(v: string | null | undefined): boolean {
  return v === null || v === undefined || typeof v !== 'string' || v.trim() === '';
}

/** The length of a string as stored (trimmed), or 0 for anything that is not one. */
function size(v: unknown): number {
  return typeof v === 'string' ? v.trim().length : 0;
}

/** The entries of what should be a map, or none when it is not one (stored or imported data may carry anything). */
function entriesOf<T>(v: Record<string, T> | null | undefined): Array<[string, T]> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A web address a browser would open over https: parsed, not pattern-matched, so "https://" alone is refused too. */
function isHttpsUrl(v: string): boolean {
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

function sameOption(v: string): string {
  return v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Everything wrong with a story, as errors and warnings.
 *
 * Errors at any stage: limits (title, summary, body, options, prompts,
 * explanations, glossary), a question that cannot be answered as written
 * (2–4 distinct non-empty options, the right one among them, a valid kind),
 * evidence pointing past the end of the text, a glossary word the reader would
 * never find (it is matched the reader's way, with `glossSpans`), and a
 * sentence too long to ever be recorded (LESSON_AUDIO_TEXT_MAX).
 *
 * Errors only from 'publish' (warnings in a draft): no text yet, a word count
 * between the length bands, fewer questions than MIN_QUESTION_BANK, no
 * category to file it under, a saga with fewer than SAGA_MIN_SECTIONS headings.
 *
 * Sections: a heading (`## Title`, a paragraph of its own) is one short line,
 * never the evidence of a question, and sits at the same place in every
 * translation. A question's translations are in interface languages, with as
 * many options as the question; the reflections, notes, sources and the
 * per-language review are checked for their shape and limits.
 *
 * The library fields: a language, a tradition and a category slug of the
 * known shapes, the attribution within its limits, a source address that is
 * https, a reading time between one minute and two hours, and a translation
 * in an interface language with exactly the body's paragraphs — the reader
 * shows them side by side, so a translation one paragraph short would sit
 * beside the wrong Kurdish.
 *
 * Warnings: a sentence that may not fit one 15-second recording, a sentence
 * ending in an abbreviation, a numbered list (both cut sentences in the wrong
 * place), an explanation past one line, no gist question, one kind asked too
 * often, the right answer always in the same place, an option much longer
 * than the others (a guessable tell), a question with no evidence to show at
 * the reveal or no English for the beginners who see it by default, and a
 * traditional or adapted story that names no source.
 */
export function validateStory(story: StoryInput, stage: StoryValidationStage = 'publish'): StoryValidation {
  const errors: StoryProblem[] = [];
  const warnings: StoryProblem[] = [];
  const error = (code: string, path: string, message: string): void => {
    (stage === 'draft' && UNFINISHED_IN_DRAFT.has(code) ? warnings : errors).push({ code, path, message });
  };
  const warn = (code: string, path: string, message: string): void => {
    warnings.push({ code, path, message });
  };

  const dialectOk = isStoryDialect(story.dialect);
  if (!dialectOk) error('DIALECT', 'dialect', 'choose Kurmancî or Soranî');
  if (!isStoryLevel(story.level)) {
    error('LEVEL', 'level', `choose a level from 1 (${CEFR_LEVELS[0]}) to ${STORY_LEVELS.length} (${CEFR_LEVELS[CEFR_LEVELS.length - 1]})`);
  }
  if (story.language !== undefined && !isStoryLanguage(story.language)) error('LANGUAGE', 'language', 'stories are written in Kurdish (ku)');

  if (blank(story.title)) error('TITLE_EMPTY', 'title', 'give the story a title');
  else if (story.title.trim().length > STORY_TITLE_MAX) {
    error('TITLE_TOO_LONG', 'title', `keep the title to ${STORY_TITLE_MAX} characters`);
  }
  if (story.summary !== null && story.summary.trim().length > STORY_SUMMARY_MAX) {
    error('SUMMARY_TOO_LONG', 'summary', `keep the summary to ${STORY_SUMMARY_MAX} characters`);
  }

  // ── the library fields ────────────────────────────────────────────────────
  if (blank(story.category)) error('CATEGORY_MISSING', 'category', 'file the story under a category');
  else if (!STORY_CATEGORY_SLUG_PATTERN.test(story.category!.trim())) {
    error('CATEGORY', 'category', 'a category is named by its slug: lower-case letters, digits and dashes');
  }
  const traditionOk = isStoryTradition(story.tradition);
  if (!traditionOk) error('TRADITION', 'tradition', 'say whether the story is traditional, adapted or original');
  for (const [field, value, max] of [
    ['author', story.author, STORY_AUTHOR_MAX],
    ['source', story.source, STORY_SOURCE_MAX],
    ['sourceUrl', story.sourceUrl, STORY_SOURCE_URL_MAX],
    ['attributionNote', story.attributionNote, STORY_ATTRIBUTION_NOTE_MAX],
    ['cover', story.cover, STORY_COVER_MAX],
  ] as const) {
    if (value !== null && value !== undefined && value.trim().length > max) {
      error(`${field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_TOO_LONG`, field, `keep it to ${max} characters`);
    }
  }
  if (!blank(story.sourceUrl) && !isHttpsUrl(story.sourceUrl!.trim())) {
    error('SOURCE_URL', 'sourceUrl', 'the source address must start with https://');
  }
  if (traditionOk && story.tradition !== 'original' && blank(story.source) && (story.sources ?? []).length === 0) {
    warn('SOURCE_MISSING', 'source', 'a traditional or adapted story should name where it comes from');
  }
  const minutes = story.readingMinutes;
  if (minutes !== null && minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > STORY_READING_MINUTES_MAX)) {
    error('READING_MINUTES', 'readingMinutes', `a reading time is a whole number of minutes, 1 to ${STORY_READING_MINUTES_MAX}`);
  }

  // ── the text ──────────────────────────────────────────────────────────────
  const paragraphs = storyParagraphs(story.body);
  const words = countStoryWords(story.body);
  let length: StoryLength | null = null;
  if (story.body.length > STORY_BODY_MAX) {
    error('BODY_TOO_LONG', 'body', `keep the text to ${STORY_BODY_MAX} characters`);
  }
  if (paragraphs.length === 0) {
    error('BODY_EMPTY', 'body', 'write the text of the story');
  } else if (dialectOk) {
    length = storyLengthFor(story.dialect, words);
    if (!length) {
      const near = nearestLength(story.dialect, words);
      const band = `${LENGTH_NAME[near.length]} (${near.min}–${near.max} words)`;
      error(
        'WORD_COUNT_OUTSIDE_BANDS',
        'body',
        words < near.min && near.length === SHORTEST
          ? `${words} words is too few: the shortest length is ${band}`
          : words > near.max && near.length === LONGEST
            ? `${words} words is too many: the longest length is ${band}`
            : `${words} words is between the lengths: the nearest is ${band}`,
      );
    }
  }

  // ── the sections ──────────────────────────────────────────────────────────
  const sections = storySections(paragraphs);
  if (length === 'saga' && sections.length < SAGA_MIN_SECTIONS) {
    error(
      'SAGA_SECTIONS',
      'body',
      `a saga is told in sections: give it at least ${SAGA_MIN_SECTIONS} headings, each a paragraph of its own starting with “## ” (it has ${sections.length})`,
    );
  }
  paragraphs.forEach((paragraph, p) => {
    const title = storyHeadingTitle(paragraph);
    if (title === null) return;
    const path = `body.paragraphs[${p}]`;
    if (title.length > STORY_HEADING_MAX) {
      error('HEADING_TOO_LONG', path, `keep a heading to ${STORY_HEADING_MAX} characters, and leave an empty line between it and the text under it`);
    } else if (storySentences(title).length > 1) {
      error('HEADING_SENTENCES', path, 'a heading is one line, not sentences of the story: leave an empty line between it and the text under it');
    }
    const next = paragraphs[p + 1];
    if (next === undefined || isStoryHeading(next)) {
      warn('HEADING_EMPTY_SECTION', path, `the section “${title}” has no text under it`);
    }
  });

  // ── the translations ──────────────────────────────────────────────────────
  for (const [locale, text] of Object.entries(story.translations ?? {})) {
    const path = `translations.${locale}`;
    if (!isAppLocale(locale)) {
      error('TRANSLATION_LOCALE', path, `“${locale}” is not a language the app is offered in`);
      continue;
    }
    if (typeof text !== 'string') {
      error('TRANSLATION_PARAGRAPHS', path, 'a translation is the whole text, with the same paragraphs');
      continue;
    }
    if (text.length > STORY_TRANSLATION_MAX) error('TRANSLATION_TOO_LONG', path, `keep a translation to ${STORY_TRANSLATION_MAX} characters`);
    const translated = storyParagraphs(text);
    const n = translated.length;
    if (n !== paragraphs.length) {
      error(
        'TRANSLATION_PARAGRAPHS',
        path,
        `the translation has ${n} paragraph${n === 1 ? '' : 's'} and the text ${paragraphs.length}: they are shown side by side, so separate them the same way`,
      );
    } else {
      // a heading sits beside a heading: the reader shows a section's title over the section in either language
      const off = paragraphs.findIndex((para, i) => isStoryHeading(para) !== isStoryHeading(translated[i]!));
      if (off >= 0) {
        error(
          'TRANSLATION_HEADINGS',
          path,
          isStoryHeading(paragraphs[off]!)
            ? `paragraph ${off + 1} is a heading in the text: start the translated one with “## ” too`
            : `paragraph ${off + 1} of the translation starts with “## ”, but in the text it is not a heading`,
        );
      }
    }
  }

  paragraphs.forEach((paragraph, p) => {
    // a heading is checked as a heading (above), not as sentences of the story
    if (isStoryHeading(paragraph)) return;
    const path = `body.paragraphs[${p}]`;
    let listed = /^\(?\p{Nd}{1,3}[.)]\s/u.test(paragraph);
    for (const sentence of storySentences(paragraph)) {
      const chars = normalizeKurdish(sentence).length;
      const opening = sentence.length > 40 ? `${sentence.slice(0, 40)}…` : sentence;
      if (chars > LESSON_AUDIO_TEXT_MAX) {
        error(
          'SENTENCE_TOO_LONG',
          path,
          `“${opening}” is ${chars} characters: no recording can hold it (at most ${LESSON_AUDIO_TEXT_MAX}); split it`,
        );
      } else if (chars > STORY_SENTENCE_SOFT_MAX) {
        warn('SENTENCE_LONG', path, `“${opening}” is ${chars} characters and may not fit one 15-second recording`);
      }
      const lower = sentence.toLowerCase();
      const abbreviation = ABBREVIATIONS.find((a) => lower === a || lower.endsWith(` ${a}`));
      if (abbreviation) {
        warn(
          'SENTENCE_ABBREVIATION',
          path,
          `“${opening}” ends in “${abbreviation}”: the reader cuts the sentence there; write the word out`,
        );
      }
      if (/^\(?\p{Nd}{1,3}[.)]$/u.test(sentence)) listed = true;
    }
    if (listed) {
      warn('NUMBERED_LIST', path, 'a numbered list is read as separate sentences; write it as running text');
    }
  });

  // ── the glossary ──────────────────────────────────────────────────────────
  if (story.glossary.length > GLOSSARY_MAX) {
    error('GLOSSARY_TOO_MANY', 'glossary', `keep the glossary to ${GLOSSARY_MAX} words`);
  }
  const found = new Set<StoryGlossEntry>();
  for (const paragraph of paragraphs) {
    for (const span of glossSpans(paragraph, story.glossary)) found.add(span.entry);
  }
  const terms = new Set<string>();
  story.glossary.forEach((entry, g) => {
    const path = `glossary[${g}]`;
    if (blank(entry.term)) {
      error('GLOSS_TERM_EMPTY', `${path}.term`, 'write the word this gloss explains');
      return;
    }
    const term = entry.term.trim();
    if (term.length > GLOSS_TERM_MAX) error('GLOSS_TERM_TOO_LONG', `${path}.term`, `keep a term to ${GLOSS_TERM_MAX} characters`);
    const same = sameOption(term);
    if (terms.has(same)) {
      error('GLOSS_DUPLICATE', `${path}.term`, `“${term}” is in the glossary twice`);
    } else if (!found.has(entry)) {
      error('GLOSS_NOT_IN_TEXT', `${path}.term`, `“${term}” is not in the text as a whole word, so no reader would see it`);
    }
    terms.add(same);
    for (const [locale, meaning] of Object.entries(entry.meanings ?? {})) {
      if (!isAppLocale(locale)) {
        error('GLOSS_LOCALE', `${path}.meanings.${locale}`, `“${locale}” is not a language the app is offered in`);
        continue;
      }
      if (typeof meaning !== 'string' || meaning.trim().length > GLOSS_MEANING_MAX) {
        error('GLOSS_MEANING_TOO_LONG', `${path}.meanings.${locale}`, `keep a meaning to ${GLOSS_MEANING_MAX} characters`);
      }
    }
    if (blank(entry.meanings?.en)) error('GLOSS_MEANING_EMPTY', `${path}.meanings.en`, 'give the English meaning');
  });

  // ── the questions ─────────────────────────────────────────────────────────
  const bank = story.questions.length;
  if (length && bank < MIN_QUESTION_BANK[length]) {
    error(
      'BANK_TOO_SMALL',
      'questions',
      `a ${length} story needs at least ${MIN_QUESTION_BANK[length]} questions, so a game does not ask the same ones every time (it has ${bank})`,
    );
  }
  if (bank > MAX_QUESTION_BANK) error('BANK_TOO_LARGE', 'questions', `keep it to ${MAX_QUESTION_BANK} questions`);

  story.questions.forEach((q, i) => {
    const path = `questions[${i}]`;
    if (!isQuestionKind(q.kind)) error('QUESTION_KIND', `${path}.kind`, 'choose what the question asks about');
    if (blank(q.prompt)) error('PROMPT_EMPTY', `${path}.prompt`, 'write the question');
    else if (q.prompt.trim().length > QUESTION_PROMPT_MAX) {
      error('PROMPT_TOO_LONG', `${path}.prompt`, `keep a question to ${QUESTION_PROMPT_MAX} characters`);
    }
    if (blank(q.promptEn)) {
      warn('PROMPT_EN_MISSING', `${path}.promptEn`, 'no English: beginners are shown it under the question');
    } else if (q.promptEn!.trim().length > QUESTION_PROMPT_MAX) {
      error('PROMPT_EN_TOO_LONG', `${path}.promptEn`, `keep the English to ${QUESTION_PROMPT_MAX} characters`);
    }

    if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
      error('OPTIONS_COUNT', `${path}.options`, `give ${MIN_OPTIONS} to ${MAX_OPTIONS} options`);
    }
    const seen = new Set<string>();
    q.options.forEach((option, o) => {
      if (blank(option)) error('OPTION_EMPTY', `${path}.options[${o}]`, 'an option is empty');
      else if (option.trim().length > QUESTION_OPTION_MAX) {
        error('OPTION_TOO_LONG', `${path}.options[${o}]`, `keep an option to ${QUESTION_OPTION_MAX} characters`);
      }
      const same = sameOption(option);
      if (same && seen.has(same)) error('OPTIONS_REPEAT', `${path}.options[${o}]`, 'two options say the same thing');
      seen.add(same);
    });
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      error('CORRECT_INDEX', `${path}.correctIndex`, 'mark which option is right');
    }
    const lengths = q.options.map((o) => o.trim().length).sort((a, b) => b - a);
    if (lengths.length >= 2 && lengths[0]! >= 2 * lengths[1]! && lengths[0]! - lengths[1]! >= 15) {
      warn('OPTION_MUCH_LONGER', `${path}.options`, 'one option is much longer than the others, which gives it away');
    }

    for (const [field, value] of [
      ['explanation', q.explanation],
      ['explanationEn', q.explanationEn],
    ] as const) {
      const n = value?.trim().length ?? 0;
      if (n > QUESTION_EXPLANATION_MAX) {
        error('EXPLANATION_TOO_LONG', `${path}.${field}`, `keep an explanation to ${QUESTION_EXPLANATION_MAX} characters`);
      } else if (n > EXPLANATION_SOFT_MAX) {
        warn('EXPLANATION_LONG', `${path}.${field}`, `over ${EXPLANATION_SOFT_MAX} characters no longer reads as one line`);
      }
    }

    const ep = q.evidenceParagraph;
    if (ep !== null && (!Number.isInteger(ep) || ep < 0 || ep >= paragraphs.length)) {
      error('EVIDENCE_PARAGRAPH', `${path}.evidenceParagraph`, `the text has ${paragraphs.length} paragraphs`);
    } else if (ep !== null && isStoryHeading(paragraphs[ep]!)) {
      error('EVIDENCE_HEADING', `${path}.evidenceParagraph`, 'that paragraph is a section heading: point at the text that holds the answer');
    } else if (q.evidenceSentence !== null) {
      const sentences = ep === null ? null : storySentences(paragraphs[ep]!);
      const es = q.evidenceSentence;
      if (!sentences) {
        error('EVIDENCE_SENTENCE', `${path}.evidenceSentence`, 'choose the paragraph before the sentence in it');
      } else if (!Number.isInteger(es) || es < 0 || es >= sentences.length) {
        error('EVIDENCE_SENTENCE', `${path}.evidenceSentence`, `that paragraph has ${sentences.length} sentences`);
      }
    }
    if (ep === null && q.kind !== 'gist') {
      warn('EVIDENCE_MISSING', `${path}.evidenceParagraph`, 'say which paragraph holds the answer, so the reveal can show it');
    }

    for (const [locale, t] of entriesOf(q.translations)) {
      const at = `${path}.translations.${locale}`;
      if (!isAppLocale(locale)) {
        error('QUESTION_TRANSLATION_LOCALE', at, `“${locale}” is not a language the app is offered in`);
        continue;
      }
      if (t === null || typeof t !== 'object') {
        error('QUESTION_TRANSLATION_PROMPT_EMPTY', `${at}.prompt`, 'a translated question has its prompt and every option');
        continue;
      }
      if (blank(t.prompt)) error('QUESTION_TRANSLATION_PROMPT_EMPTY', `${at}.prompt`, 'translate the question too, or leave this language out');
      else if (size(t.prompt) > QUESTION_PROMPT_MAX) {
        error('QUESTION_TRANSLATION_PROMPT_TOO_LONG', `${at}.prompt`, `keep a question to ${QUESTION_PROMPT_MAX} characters`);
      }
      const options = Array.isArray(t.options) ? t.options : [];
      if (options.length !== q.options.length) {
        error(
          'QUESTION_TRANSLATION_OPTIONS',
          `${at}.options`,
          `the question has ${q.options.length} options and this translation ${options.length}: translate each, in the same order`,
        );
      }
      options.forEach((option, o) => {
        if (blank(option)) error('QUESTION_TRANSLATION_OPTION_EMPTY', `${at}.options[${o}]`, 'an option is empty');
        else if (size(option) > QUESTION_OPTION_MAX) {
          error('QUESTION_TRANSLATION_OPTION_TOO_LONG', `${at}.options[${o}]`, `keep an option to ${QUESTION_OPTION_MAX} characters`);
        }
      });
      if (size(t.explanation) > QUESTION_EXPLANATION_MAX) {
        error('QUESTION_TRANSLATION_EXPLANATION_TOO_LONG', `${at}.explanation`, `keep an explanation to ${QUESTION_EXPLANATION_MAX} characters`);
      }
    }
  });

  if (bank > 0 && !story.questions.some((q) => q.kind === 'gist')) {
    warn('NO_GIST', 'questions', 'no question asks what the story is about as a whole (gist); a game ends on one');
  }
  if (bank >= PATTERN_MIN_QUESTIONS) {
    const counts = new Map<string, number>();
    for (const q of story.questions) counts.set(q.kind, (counts.get(q.kind) ?? 0) + 1);
    for (const [kind, n] of counts) {
      if (kind !== 'gist' && n / bank > KIND_SHARE_MAX) {
        warn('KIND_DOMINANT', 'questions', `${n} of ${bank} questions are ${kind} questions; mix the kinds`);
      }
    }
    const first = story.questions[0]!.correctIndex;
    if (story.questions.every((q) => q.correctIndex === first)) {
      warn('ANSWER_SAME_POSITION', 'questions', `every right answer is option ${first + 1}; vary where it is written`);
    }
  }

  validateCompanions(story, error);
  return { errors, warnings };
}

type Report = (code: string, path: string, message: string) => void;

/** A translation map's entries, each in an interface language: anything else is reported and left out. */
function translatedEntries<T>(map: Record<string, T> | null | undefined, path: string, code: string, error: Report): Array<[string, T]> {
  return entriesOf(map).filter(([locale]) => {
    if (isAppLocale(locale)) return true;
    error(code, `${path}.${locale}`, `“${locale}” is not a language the app is offered in`);
    return false;
  });
}

/**
 * What a story carries besides its text and questions: the title and summary
 * per language, the reflections, the notes, the sources and the record of
 * which translations were reviewed. Each within its limits and in an
 * interface language; a source's address on https, like the story's own.
 */
function validateCompanions(story: StoryInput, error: Report): void {
  for (const [locale, meta] of translatedEntries(story.metaTranslations, 'metaTranslations', 'META_TRANSLATION_LOCALE', error)) {
    const path = `metaTranslations.${locale}`;
    if (meta === null || typeof meta !== 'object' || (blank(meta.title) && blank(meta.summary))) {
      error('META_TRANSLATION_EMPTY', path, 'give the title or the summary in this language, or leave the language out');
      continue;
    }
    if (size(meta.title) > STORY_TITLE_MAX) error('META_TITLE_TOO_LONG', `${path}.title`, `keep the title to ${STORY_TITLE_MAX} characters`);
    if (size(meta.summary) > STORY_SUMMARY_MAX) error('META_SUMMARY_TOO_LONG', `${path}.summary`, `keep the summary to ${STORY_SUMMARY_MAX} characters`);
  }

  const reflections = story.reflections ?? [];
  if (reflections.length > STORY_REFLECTIONS_MAX) {
    error('REFLECTIONS_TOO_MANY', 'reflections', `keep it to ${STORY_REFLECTIONS_MAX} questions to think about`);
  }
  reflections.forEach((r, i) => {
    const path = `reflections[${i}]`;
    if (blank(r?.text)) error('REFLECTION_EMPTY', `${path}.text`, 'write the question, or remove it');
    else if (size(r.text) > STORY_REFLECTION_MAX) error('REFLECTION_TOO_LONG', `${path}.text`, `keep it to ${STORY_REFLECTION_MAX} characters`);
    for (const [locale, text] of translatedEntries(r?.translations, `${path}.translations`, 'REFLECTION_TRANSLATION_LOCALE', error)) {
      if (blank(text)) error('REFLECTION_TRANSLATION_EMPTY', `${path}.translations.${locale}`, 'a translation left empty: write it, or leave the language out');
      else if (size(text) > STORY_REFLECTION_MAX) {
        error('REFLECTION_TRANSLATION_TOO_LONG', `${path}.translations.${locale}`, `keep it to ${STORY_REFLECTION_MAX} characters`);
      }
    }
  });

  const notes = story.notes ?? [];
  if (notes.length > STORY_NOTES_MAX) error('NOTES_TOO_MANY', 'notes', `keep it to ${STORY_NOTES_MAX} notes`);
  notes.forEach((n, i) => {
    const path = `notes[${i}]`;
    if (!isStoryNoteKind(n?.kind)) error('NOTE_KIND', `${path}.kind`, 'say whether the note is about history, the legend, the versions or the culture');
    if (blank(n?.title)) error('NOTE_TITLE_EMPTY', `${path}.title`, 'give the note a title');
    else if (size(n.title) > STORY_NOTE_TITLE_MAX) error('NOTE_TITLE_TOO_LONG', `${path}.title`, `keep a title to ${STORY_NOTE_TITLE_MAX} characters`);
    if (blank(n?.body)) error('NOTE_BODY_EMPTY', `${path}.body`, 'write the note');
    else if (size(n.body) > STORY_NOTE_BODY_MAX) error('NOTE_BODY_TOO_LONG', `${path}.body`, `keep a note to ${STORY_NOTE_BODY_MAX} characters`);
    for (const [locale, t] of translatedEntries(n?.translations, `${path}.translations`, 'NOTE_TRANSLATION_LOCALE', error)) {
      const at = `${path}.translations.${locale}`;
      if (t === null || typeof t !== 'object' || blank(t.title) || blank(t.body)) {
        error('NOTE_TRANSLATION_EMPTY', at, 'a translated note has its title and its text');
        continue;
      }
      if (size(t.title) > STORY_NOTE_TITLE_MAX) error('NOTE_TRANSLATION_TOO_LONG', `${at}.title`, `keep a title to ${STORY_NOTE_TITLE_MAX} characters`);
      if (size(t.body) > STORY_NOTE_BODY_MAX) error('NOTE_TRANSLATION_TOO_LONG', `${at}.body`, `keep a note to ${STORY_NOTE_BODY_MAX} characters`);
    }
  });

  const sources = story.sources ?? [];
  if (sources.length > STORY_SOURCES_MAX) error('SOURCES_TOO_MANY', 'sources', `keep it to ${STORY_SOURCES_MAX} sources`);
  sources.forEach((src, i) => {
    const path = `sources[${i}]`;
    if (blank(src?.title)) error('SOURCE_TITLE_EMPTY', `${path}.title`, 'name the source');
    else if (size(src.title) > STORY_SOURCE_MAX) error('SOURCE_TITLE_TOO_LONG', `${path}.title`, `keep it to ${STORY_SOURCE_MAX} characters`);
    if (size(src?.author) > STORY_AUTHOR_MAX) error('SOURCE_AUTHOR_TOO_LONG', `${path}.author`, `keep it to ${STORY_AUTHOR_MAX} characters`);
    if (!blank(src?.url)) {
      if (size(src.url) > STORY_SOURCE_URL_MAX) error('SOURCE_ENTRY_URL_TOO_LONG', `${path}.url`, `keep it to ${STORY_SOURCE_URL_MAX} characters`);
      if (!isHttpsUrl(src.url!.trim())) error('SOURCE_ENTRY_URL', `${path}.url`, 'the address must start with https://');
    }
    if (!isStorySourceType(src?.type)) {
      error('SOURCE_TYPE', `${path}.type`, 'say whether it is historical, a legend as collected, an oral telling, a literary work or an adaptation');
    }
    if (size(src?.note) > STORY_SOURCE_NOTE_MAX) error('SOURCE_NOTE_TOO_LONG', `${path}.note`, `keep it to ${STORY_SOURCE_NOTE_MAX} characters`);
  });

  for (const [locale, entry] of translatedEntries(story.translationReview, 'translationReview', 'TRANSLATION_REVIEW_LOCALE', error)) {
    const path = `translationReview.${locale}`;
    if (entry === null || typeof entry !== 'object' || !isStoryTranslationReviewStatus(entry.status)) {
      error('TRANSLATION_REVIEW_STATUS', `${path}.status`, 'a translation is reviewed or unreviewed');
      continue;
    }
    if (entry.by !== undefined && (typeof entry.by !== 'string' || !UUID.test(entry.by))) {
      error('TRANSLATION_REVIEW_BY', `${path}.by`, 'the reviewer is named by their account id');
    }
    if (entry.at !== undefined && (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at)))) {
      error('TRANSLATION_REVIEW_AT', `${path}.at`, 'when it was reviewed, as a date and time');
    }
    if (size(entry.note) > STORY_REVIEW_NOTE_MAX) error('TRANSLATION_REVIEW_NOTE_TOO_LONG', `${path}.note`, `keep a note to ${STORY_REVIEW_NOTE_MAX} characters`);
  }
}
