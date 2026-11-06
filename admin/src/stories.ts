/**
 * Writing stories, as data: what the admin API sends and takes, the form the
 * editor edits, what the text is (words, length, paragraphs, sentences) and
 * what is wrong with it while it is being typed. Kept apart from the page so
 * all of it can be tested without a browser.
 *
 * The checks are not a second copy of the server's. The editor runs the same
 * `validateStory` (@kurda/shared) the admin API runs on every save, submit and
 * publish, on the story exactly as it would be sent — trimmed the way the API
 * trims it — so it never shows a problem the server does not have, or misses
 * one it does. The API stays the judge: what it refuses comes back with its own
 * list of problems, and the editor shows that list too.
 */
import {
  APP_LOCALES,
  GLOSSARY_MAX,
  LESSON_AUDIO_TEXT_MAX,
  MAX_OPTIONS,
  MAX_QUESTION_BANK,
  MIN_OPTIONS,
  MIN_QUESTION_BANK,
  QUESTION_COUNTS_BY_LENGTH,
  STORY_DIALECTS,
  STORY_LENGTHS,
  STORY_LEVELS,
  STORY_SENTENCE_SOFT_MAX,
  STORY_WORD_BANDS,
  cefrOf,
  countStoryWords,
  emptyStoryLibraryInput,
  glossSpans,
  isStoryLevel,
  isStorySlug,
  lengthMinutes,
  normalizeKurdish,
  readingMinutes,
  storyAudioSentences,
  storyLengthFor,
  storyParagraphs,
  storySentences,
  storySlugFor,
  validateStory,
  type QuestionKind,
  type SpeakerId,
  type StoryCategory,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryInput,
  type CefrLevel,
  type StoryLanguage,
  type StoryLength,
  type StoryLevel,
  type StoryLibraryInput,
  type StoryProblem,
  type StoryQuestionInput,
  type StoryTradition,
  type StoryValidation,
} from '@kurda/shared';

// ---------------------------------------------------------------------------
// What the admin API speaks (GET/POST/PUT /admin/stories…)
// ---------------------------------------------------------------------------

export type StoryStatus = 'draft' | 'in_review' | 'published' | 'archived';
/** 'starter': one of the stories the app shipped with, waiting for a native speaker to read and publish it */
export type StoryOrigin = 'admin' | 'starter';
export type StoryReviewStatus = 'unreviewed' | 'approved';
export type StoryAudioCoverage = 'none' | 'partial' | 'full';

/** One sentence of the story with its recording, for the editor's audio section. */
export interface StorySentenceAudio {
  paragraph: number;
  sentence: number;
  text: string;
  key: string;
  recorded: boolean;
  url?: string;
  durationMs?: number;
  speaker?: SpeakerId | null;
  updatedAt?: string;
}

/** Another telling of the same story, in the editor's Versions section. */
export interface AdminStoryVersion {
  id: string;
  slug: string;
  title: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  status: StoryStatus;
}

export interface AdminStoryQuestion extends StoryQuestionInput {
  id: string;
}

/** One story with its questions (GET /admin/stories/:id, and every write's reply). */
export interface AdminStory {
  id: string;
  slug: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: number;
  cefr: CefrLevel | null;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  questions: AdminStoryQuestion[];
  category: string | null;
  tradition: StoryTradition;
  author: string | null;
  /** the collection, teller, region or publication it comes from */
  source: string | null;
  sourceUrl: string | null;
  attributionNote: string | null;
  translations: Record<string, string>;
  cover: string | null;
  /** the editor's reading time, null for the estimate (`readingMinutes` is whichever applies) */
  readingMinutesOverride: number | null;
  status: StoryStatus;
  origin: StoryOrigin;
  wordCount: number;
  length: StoryLength | null;
  readingMinutes: number;
  lockVersion: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  featured: boolean;
  featuredAt: string | null;
  reviewStatus: StoryReviewStatus;
  reviewedBy: { id: string; username: string | null } | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  translationGroup: string | null;
  versions: AdminStoryVersion[];
  /** the glossary terms that are dictionary headwords, with the entry each was linked to */
  glossaryMatches: Array<{ term: string; entryId: string; headword: string }>;
  audio: { sentences: StorySentenceAudio[]; recorded: number; total: number };
  /** what would stop it being published (errors) and what is worth a look (warnings) */
  problems: StoryValidation;
}

/** A row of the list (GET /admin/stories). */
export interface AdminStorySummary {
  id: string;
  slug: string;
  dialect: StoryDialect;
  language: StoryLanguage;
  level: number;
  cefr: CefrLevel | null;
  title: string;
  status: StoryStatus;
  origin: StoryOrigin;
  wordCount: number;
  length: StoryLength | null;
  questionCount: number;
  lockVersion: number;
  publishedAt: string | null;
  updatedAt: string;
  category: string | null;
  tradition: StoryTradition;
  reviewStatus: StoryReviewStatus;
  featured: boolean;
  audio: StoryAudioCoverage;
  translationGroup: string | null;
  /** how many problems `validateStory(…, 'publish')` finds */
  problems: { errors: number; warnings: number };
}

/**
 * What POST and PUT take: the whole story, every time (PUT adds `lockVersion`).
 * `sameStoryAs` only when the editor changed which story this is a version
 * of: another story's id joins its group, null leaves the group, and left out
 * the group stays as it is.
 */
export interface StoryDraft extends StoryInput {
  slug: string;
  sameStoryAs?: string | null;
}

export const DIALECT_NAME: Record<StoryDialect, string> = { kurmanci: 'Kurmancî', sorani: 'Soranî' };
export const LENGTH_NAME: Record<StoryLength, string> = { short: 'Short', medium: 'Medium', long: 'Long' };
export const STATUS_NAME: Record<StoryStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  archived: 'Archived',
};
export const REVIEW_NAME: Record<StoryReviewStatus, string> = { unreviewed: 'Unreviewed', approved: 'Approved' };
export const AUDIO_NAME: Record<StoryAudioCoverage, string> = { none: 'No audio', partial: 'Partly recorded', full: 'Recorded' };

/** The word beside each CEFR letter, as the reader is shown it ("A2 · Elementary"). */
export const CEFR_WORD: Record<CefrLevel, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper intermediate',
  C1: 'Advanced',
};

/** "A2 — Elementary" for the select; a level outside the scale (an old row) is named by its number. */
export function cefrLabel(level: number, separator = ' — '): string {
  if (!isStoryLevel(level)) return `Level ${level}`;
  const cefr = cefrOf(level);
  return `${cefr}${separator}${CEFR_WORD[cefr]}`;
}

/** The levels the select offers: the five of the scale, plus a stored one outside it so it is not quietly changed. */
export function levelOptions(current: number): Array<{ level: number; label: string }> {
  const levels: number[] = [...STORY_LEVELS];
  if (!levels.includes(current)) levels.push(current);
  return levels.map((level) => ({ level, label: cefrLabel(level) }));
}

export const TRADITION_NAME: Record<StoryTradition, string> = { traditional: 'Traditional', adapted: 'Adapted', original: 'Original' };

/** What each tradition means, in one line beside its radio. */
export const TRADITION_HINT: Record<StoryTradition, string> = {
  traditional: 'Documented folklore, retold close to a source.',
  adapted: 'Traditional material, retold freely for learners.',
  original: 'Written for learners. Never presented as folklore.',
};

/** How the reader is told where a story comes from: "Traditional tale, retold for learners". */
export function traditionLine(tradition: string): string {
  switch (tradition) {
    case 'traditional':
      return 'Traditional tale';
    case 'adapted':
      return 'Traditional tale, retold for learners';
    default:
      return 'Written for learners';
  }
}

/** A category's name for the admin (English, as the console is), or its slug while the list is not loaded. */
export function categoryLabel(categories: readonly StoryCategory[] | undefined, slug: string | null): string | null {
  if (!slug) return null;
  return categories?.find((c) => c.slug === slug)?.name.en ?? slug;
}

/** The interface languages a translation can be in, English first since it is the fallback the reader gets. */
export const TRANSLATION_LOCALES: readonly string[] = ['en', ...APP_LOCALES.map((l) => l.code).filter((c) => c !== 'en')];

/** What each kind of question asks, for the select in the editor. */
export const KIND_HINT: Record<QuestionKind, string> = {
  gist: 'what the story is about as a whole (a game asks it last)',
  detail: 'a fact the text states',
  vocabulary: 'what a word means here',
  sequence: 'the order things happen in',
  inference: 'what the text implies without saying it',
};

/**
 * A story taken from the app's starter set that nobody has published yet. The
 * starters were written for the app, not by a native speaker, and the owner's
 * rule is that nothing unreviewed reaches learners — so they are marked until
 * someone publishes them, which is the review. One unpublished later (to fix a
 * typo, say) has been read once already and is not marked again.
 */
export function needsNativeReview(story: { origin: StoryOrigin; publishedAt: string | null }): boolean {
  return story.origin === 'starter' && story.publishedAt === null;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export interface GlossRow {
  /** stable across reorders, for React; never sent */
  key: string;
  term: string;
  en: string;
  /** meanings in other interface languages, in the order the editor added them */
  extra: Array<{ locale: string; text: string }>;
}

export interface QuestionForm {
  key: string;
  kind: QuestionKind;
  prompt: string;
  promptEn: string;
  options: string[];
  /** -1 until the editor marks one: removing the right option never quietly makes another one right */
  correctIndex: number;
  explanation: string;
  explanationEn: string;
  evidenceParagraph: number | null;
  evidenceSentence: number | null;
  /**
   * The words the evidence pointed at when the story was loaded, or when the
   * editor last chose it (never sent). The evidence follows its words when the
   * text around it changes; when the words themselves change, this is how the
   * editor knows to ask for a look.
   */
  evidenceQuote: string | null;
}

export interface StoryForm {
  dialect: StoryDialect;
  level: number;
  title: string;
  slug: string;
  /**
   * Until the editor types in the slug field, the slug follows the title
   * (a new story only: an existing one keeps its address, links point at it).
   */
  slugEdited: boolean;
  /**
   * Six fixed numbers in [0, 1) for the random part of a fallback slug
   * ("sorani-k3m9xq"), so it does not change on every keystroke of the title.
   */
  slugSeed: number[];
  summary: string;
  body: string;
  glossary: GlossRow[];
  questions: QuestionForm[];
  /**
   * How the story is filed and attributed (category, tradition, source,
   * translations, cover, reading time): loaded with the story and sent back
   * with it, so a save never drops what another editor set. Text fields hold
   * what was typed, blanks and all; the draft trims them as the API does.
   */
  library: StoryLibraryInput;
  /**
   * Which story this is another telling of, when the editor changed it here:
   * another story's id to join its group, null to leave the group it is in,
   * and left out when nothing changed. Sent with the next save (the API joins
   * or leaves the group in the same transaction), then cleared.
   */
  sameStoryAs?: string | null;
}

let nextKey = 0;
function key(prefix: string): string {
  nextKey += 1;
  return `${prefix}${nextKey}`;
}

function seeded(seed: readonly number[]): () => number {
  let i = 0;
  return () => seed[i++ % seed.length] ?? 0;
}

/**
 * The address a new story gets from its title, as the API would make it: a
 * Kurmancî title spells its own (Qelema Şîn → qelema-sin); a Soranî one, in a
 * script a slug cannot hold, gets `sorani-` and six random characters for the
 * editor to replace with something readable.
 */
export function autoSlug(form: Pick<StoryForm, 'title' | 'dialect' | 'slugSeed'>): string {
  return storySlugFor(form.title, form.dialect, seeded(form.slugSeed));
}

// what storySlugFor falls back to: the variety, then six characters from its alphabet (no l, o, 0 or 1)
const RANDOM_SLUG = new RegExp(`^(?:${STORY_DIALECTS.join('|')})-[a-km-np-z2-9]{6}$`);

/**
 * Whether an address is the random one a story starts with ("sorani-k3m9xq").
 * Told by its shape, not by where it came from, so it is still noticed after
 * the story is saved and opened again. (A real six-letter word after the
 * variety looks the same; it is only ever a reason to take a look.)
 */
export function looksRandomSlug(slug: string): boolean {
  return RANDOM_SLUG.test(slug);
}

export function blankQuestion(): QuestionForm {
  return {
    key: key('q'),
    kind: 'detail',
    prompt: '',
    promptEn: '',
    options: ['', '', ''],
    correctIndex: -1,
    explanation: '',
    explanationEn: '',
    evidenceParagraph: null,
    evidenceSentence: null,
    evidenceQuote: null,
  };
}

export function blankGloss(): GlossRow {
  return { key: key('g'), term: '', en: '', extra: [] };
}

export function blankForm(dialect: StoryDialect = 'kurmanci', random: () => number = Math.random): StoryForm {
  const slugSeed = Array.from({ length: 6 }, () => random());
  const form: StoryForm = {
    dialect,
    level: 1,
    title: '',
    slug: '',
    slugEdited: false,
    slugSeed,
    summary: '',
    body: '',
    glossary: [],
    questions: [],
    library: emptyStoryLibraryInput(),
  };
  return { ...form, slug: autoSlug(form) };
}

/**
 * The form for a stored story. `previous` is the form it replaces (after a
 * save): its rows' keys are kept, row for row, so what the editor had open
 * stays open.
 */
export function formFromStory(
  story: AdminStory,
  opts: { random?: () => number; previous?: StoryForm } = {},
): StoryForm {
  const random = opts.random ?? Math.random;
  const glossKeys = opts.previous?.glossary.map((g) => g.key) ?? [];
  const questionKeys = opts.previous?.questions.map((q) => q.key) ?? [];
  const paragraphs = storyParagraphs(story.body);
  return {
    dialect: story.dialect,
    level: story.level,
    title: story.title,
    slug: story.slug,
    // the story has an address already, and links may point at it
    slugEdited: true,
    slugSeed: Array.from({ length: 6 }, () => random()),
    summary: story.summary ?? '',
    body: story.body,
    glossary: story.glossary.map((entry, i) => ({
      key: glossKeys[i] ?? key('g'),
      term: entry.term,
      en: entry.meanings.en ?? '',
      extra: Object.entries(entry.meanings)
        .filter(([locale, text]) => locale !== 'en' && typeof text === 'string')
        .map(([locale, text]) => ({ locale, text: text as string })),
    })),
    questions: story.questions.map((q, i) => ({
      key: questionKeys[i] ?? key('q'),
      kind: q.kind as QuestionKind,
      prompt: q.prompt,
      promptEn: q.promptEn ?? '',
      options: [...q.options],
      correctIndex: q.correctIndex,
      explanation: q.explanation ?? '',
      explanationEn: q.explanationEn ?? '',
      evidenceParagraph: q.evidenceParagraph,
      evidenceSentence: q.evidenceSentence,
      evidenceQuote: evidenceText(paragraphs, q.evidenceParagraph, q.evidenceSentence),
    })),
    library: {
      language: story.language,
      category: story.category,
      tradition: story.tradition,
      author: story.author,
      source: story.source,
      sourceUrl: story.sourceUrl,
      attributionNote: story.attributionNote,
      translations: { ...story.translations },
      cover: story.cover,
      readingMinutes: story.readingMinutesOverride,
    },
  };
}

/** The words evidence points at — a sentence, or a whole paragraph — or null when it points at none. */
export function evidenceText(paragraphs: readonly string[], paragraph: number | null, sentence: number | null): string | null {
  const text = paragraph === null ? undefined : paragraphs[paragraph];
  if (text === undefined) return null;
  return sentence === null ? text : (storySentences(text)[sentence] ?? null);
}

function trimmedOrNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function tidyBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

/** A glossary row as stored: trimmed, and a meaning left empty is no meaning (English always present). */
function glossEntry(row: GlossRow): StoryGlossEntry {
  const meanings: Record<string, string> = {};
  for (const { locale, text } of row.extra) {
    const t = text.trim();
    if (t && locale !== 'en') meanings[locale] = t;
  }
  return { term: row.term.trim(), meanings: { ...meanings, en: row.en.trim() } };
}

/**
 * The story as it would be sent, tidied exactly as the API tidies it before it
 * validates and stores it (titles, options and translations trimmed, an empty
 * optional field as null, one kind of line ending). Validation runs on this, so
 * what the editor checks is what the server will check.
 *
 * Nothing is dropped — an empty glossary row or option stays, to be reported —
 * so a problem's path (`questions[3].options[1]`) is the same row on screen.
 */
export function draftFromForm(form: StoryForm): StoryDraft {
  const lib = form.library;
  const translations: Record<string, string> = {};
  for (const [locale, text] of Object.entries(lib.translations)) {
    const tidy = tidyBody(text);
    // a translation left empty is no translation, not an empty one the reader would be shown
    if (tidy) translations[locale] = tidy;
  }
  return {
    language: lib.language,
    category: lib.category === null ? null : trimmedOrNull(lib.category),
    tradition: lib.tradition,
    author: lib.author === null ? null : trimmedOrNull(lib.author),
    source: lib.source === null ? null : trimmedOrNull(lib.source),
    sourceUrl: lib.sourceUrl === null ? null : trimmedOrNull(lib.sourceUrl),
    attributionNote: lib.attributionNote === null ? null : trimmedOrNull(lib.attributionNote),
    translations,
    cover: lib.cover === null ? null : trimmedOrNull(lib.cover),
    readingMinutes: lib.readingMinutes,
    ...(form.sameStoryAs !== undefined ? { sameStoryAs: form.sameStoryAs } : {}),
    slug: form.slug.trim(),
    dialect: form.dialect,
    level: form.level,
    title: form.title.trim(),
    summary: trimmedOrNull(form.summary),
    body: tidyBody(form.body),
    glossary: form.glossary.map(glossEntry),
    questions: form.questions.map((q) => ({
      kind: q.kind,
      prompt: q.prompt.trim(),
      promptEn: trimmedOrNull(q.promptEn),
      options: q.options.map((o) => o.trim()),
      correctIndex: q.correctIndex,
      explanation: trimmedOrNull(q.explanation),
      explanationEn: trimmedOrNull(q.explanationEn),
      evidenceParagraph: q.evidenceParagraph,
      evidenceSentence: q.evidenceSentence,
    })),
  };
}

/** Whether the form says something different from what was loaded (whitespace the API trims away aside). */
export function isDirty(form: StoryForm, loaded: StoryForm): boolean {
  return JSON.stringify(draftFromForm(form)) !== JSON.stringify(draftFromForm(loaded));
}

/**
 * The content a reviewer read, in the order the API compares it: a change to
 * any of it takes an approved story's approval away when it is saved, while a
 * change to how the story is filed or attributed does not. Kept in step with
 * the API's own comparison, so the editor can say ahead of a save that the
 * story will need approving again.
 */
function contentOf(draft: StoryDraft): string {
  return JSON.stringify([
    draft.dialect,
    draft.level,
    draft.title,
    draft.summary,
    draft.body,
    draft.glossary.map((g) => [g.term, Object.entries(g.meanings).sort(([a], [b]) => a.localeCompare(b))]),
    draft.questions.map((q) => [q.kind, q.prompt, q.promptEn, q.options, q.correctIndex, q.explanation, q.explanationEn, q.evidenceParagraph, q.evidenceSentence]),
    Object.entries(draft.translations).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}

/** Whether the unsaved edits touch what a reviewer read (text, glossary, questions, translations), not only the filing. */
export function contentChanged(form: StoryForm, loaded: StoryForm): boolean {
  return contentOf(draftFromForm(form)) !== contentOf(draftFromForm(loaded));
}

export interface TranslationCheck {
  locale: string;
  text: string;
  /** blank-line-separated paragraphs in the translation */
  paragraphs: number;
  /** paragraphs in the body, which the translation's must match one for one */
  expected: number;
  state: 'empty' | 'ok' | 'mismatch';
}

/** Each interface language's translation against the body's paragraphs, as the editor types, English first. */
export function translationChecks(form: Pick<StoryForm, 'body' | 'library'>): TranslationCheck[] {
  const expected = storyParagraphs(tidyBody(form.body)).length;
  return TRANSLATION_LOCALES.map((locale) => {
    const text = form.library.translations[locale] ?? '';
    const paragraphs = storyParagraphs(tidyBody(text)).length;
    return { locale, text, paragraphs, expected, state: paragraphs === 0 ? 'empty' : paragraphs === expected ? 'ok' : 'mismatch' };
  });
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

type TextField = 'title' | 'summary' | 'body';
type QuestionTextField = 'prompt' | 'promptEn' | 'explanation' | 'explanationEn';
/** The library's text fields, typed as they are (the draft trims them). */
export type LibraryTextField = 'author' | 'source' | 'sourceUrl' | 'attributionNote';

export type EditorAction =
  | { type: 'load'; form: StoryForm }
  | { type: 'text'; field: TextField; value: string }
  | { type: 'slug'; value: string }
  | { type: 'dialect'; value: StoryDialect }
  | { type: 'level'; value: number }
  | { type: 'lib/text'; field: LibraryTextField; value: string }
  | { type: 'lib/category'; value: string | null }
  | { type: 'lib/tradition'; value: StoryTradition }
  | { type: 'lib/cover'; value: string | null }
  | { type: 'lib/minutes'; value: number | null }
  | { type: 'translation'; locale: string; value: string }
  /** join another story's group (its id), leave the group (null), or take the change back (undefined) */
  | { type: 'link'; sameStoryAs: string | null | undefined }
  | { type: 'gloss/add'; row?: GlossRow }
  | { type: 'gloss/remove'; index: number }
  | { type: 'gloss/set'; index: number; field: 'term' | 'en'; value: string }
  | { type: 'gloss/extra-add'; index: number; locale: string }
  | { type: 'gloss/extra-set'; index: number; locale: string; value: string }
  | { type: 'gloss/extra-remove'; index: number; locale: string }
  | { type: 'q/add'; question?: QuestionForm }
  | { type: 'q/remove'; index: number }
  | { type: 'q/move'; index: number; step: -1 | 1 }
  | { type: 'q/kind'; index: number; value: QuestionKind }
  | { type: 'q/text'; index: number; field: QuestionTextField; value: string }
  | { type: 'q/option'; index: number; option: number; value: string }
  | { type: 'q/option-add'; index: number }
  | { type: 'q/option-remove'; index: number; option: number }
  | { type: 'q/correct'; index: number; option: number }
  | { type: 'q/evidence'; index: number; paragraph: number | null }
  | { type: 'q/evidence-sentence'; index: number; sentence: number | null };

function withQuestion(form: StoryForm, index: number, fn: (q: QuestionForm) => QuestionForm): StoryForm {
  return { ...form, questions: form.questions.map((q, i) => (i === index ? fn(q) : q)) };
}

function withGloss(form: StoryForm, index: number, fn: (g: GlossRow) => GlossRow): StoryForm {
  return { ...form, glossary: form.glossary.map((g, i) => (i === index ? fn(g) : g)) };
}

/** A title or variety change carries the slug along while the editor has not chosen one. */
function followTitle(form: StoryForm): StoryForm {
  return form.slugEdited ? form : { ...form, slug: autoSlug(form) };
}

export function editorReducer(form: StoryForm, action: EditorAction): StoryForm {
  switch (action.type) {
    case 'load':
      return action.form;
    case 'text': {
      const next = { ...form, [action.field]: action.value };
      if (action.field === 'title') return followTitle(next);
      if (action.field === 'body') return { ...next, questions: followEvidence(form.questions, form.body, action.value) };
      return next;
    }
    case 'slug':
      // emptied, it goes back to following the title — the way to undo an edit
      return action.value === ''
        ? followTitle({ ...form, slugEdited: false })
        : { ...form, slug: action.value.toLowerCase().replace(/\s+/g, '-'), slugEdited: true };
    case 'dialect':
      return followTitle({ ...form, dialect: action.value });
    case 'level':
      return { ...form, level: action.value };

    case 'lib/text':
      return { ...form, library: { ...form.library, [action.field]: action.value } };
    case 'lib/category':
      return { ...form, library: { ...form.library, category: action.value } };
    case 'lib/tradition':
      return { ...form, library: { ...form.library, tradition: action.value } };
    case 'lib/cover':
      return { ...form, library: { ...form.library, cover: action.value } };
    case 'lib/minutes':
      return { ...form, library: { ...form.library, readingMinutes: action.value } };
    case 'translation':
      return { ...form, library: { ...form.library, translations: { ...form.library.translations, [action.locale]: action.value } } };
    case 'link': {
      const rest = { ...form };
      delete rest.sameStoryAs;
      return action.sameStoryAs === undefined ? rest : { ...rest, sameStoryAs: action.sameStoryAs };
    }

    case 'gloss/add':
      return form.glossary.length >= GLOSSARY_MAX
        ? form
        : { ...form, glossary: [...form.glossary, action.row ?? blankGloss()] };
    case 'gloss/remove':
      return { ...form, glossary: form.glossary.filter((_, i) => i !== action.index) };
    case 'gloss/set':
      return withGloss(form, action.index, (g) => ({ ...g, [action.field]: action.value }));
    case 'gloss/extra-add':
      return withGloss(form, action.index, (g) =>
        action.locale === 'en' || g.extra.some((e) => e.locale === action.locale)
          ? g
          : { ...g, extra: [...g.extra, { locale: action.locale, text: '' }] },
      );
    case 'gloss/extra-set':
      return withGloss(form, action.index, (g) => ({
        ...g,
        extra: g.extra.map((e) => (e.locale === action.locale ? { ...e, text: action.value } : e)),
      }));
    case 'gloss/extra-remove':
      return withGloss(form, action.index, (g) => ({ ...g, extra: g.extra.filter((e) => e.locale !== action.locale) }));

    case 'q/add':
      return form.questions.length >= MAX_QUESTION_BANK
        ? form
        : { ...form, questions: [...form.questions, action.question ?? blankQuestion()] };
    case 'q/remove':
      return { ...form, questions: form.questions.filter((_, i) => i !== action.index) };
    case 'q/move': {
      const to = action.index + action.step;
      if (to < 0 || to >= form.questions.length) return form;
      const questions = [...form.questions];
      [questions[action.index], questions[to]] = [questions[to]!, questions[action.index]!];
      return { ...form, questions };
    }
    case 'q/kind':
      return withQuestion(form, action.index, (q) => ({ ...q, kind: action.value }));
    case 'q/text':
      return withQuestion(form, action.index, (q) => ({ ...q, [action.field]: action.value }));
    case 'q/option':
      return withQuestion(form, action.index, (q) => ({
        ...q,
        options: q.options.map((o, i) => (i === action.option ? action.value : o)),
      }));
    case 'q/option-add':
      return withQuestion(form, action.index, (q) =>
        q.options.length >= MAX_OPTIONS ? q : { ...q, options: [...q.options, ''] },
      );
    case 'q/option-remove':
      return withQuestion(form, action.index, (q) => {
        if (q.options.length <= MIN_OPTIONS) return q;
        const correctIndex =
          q.correctIndex === action.option ? -1 : q.correctIndex > action.option ? q.correctIndex - 1 : q.correctIndex;
        return { ...q, options: q.options.filter((_, i) => i !== action.option), correctIndex };
      });
    case 'q/correct':
      return withQuestion(form, action.index, (q) => ({ ...q, correctIndex: action.option }));
    case 'q/evidence':
      // a sentence index means nothing in another paragraph
      return withQuestion(form, action.index, (q) =>
        q.evidenceParagraph === action.paragraph
          ? q
          : {
              ...q,
              evidenceParagraph: action.paragraph,
              evidenceSentence: null,
              evidenceQuote: evidenceText(storyParagraphs(form.body), action.paragraph, null),
            },
      );
    case 'q/evidence-sentence':
      return withQuestion(form, action.index, (q) => ({
        ...q,
        evidenceSentence: action.sentence,
        evidenceQuote: evidenceText(storyParagraphs(form.body), q.evidenceParagraph, action.sentence),
      }));
  }
}

interface Place {
  p: number;
  s: number;
}

/** Of `places`, the one nearest `from` — paragraphs away first, then sentences — or null. */
function nearest<T extends Place>(places: readonly T[], from: Place): T | null {
  const away = (c: Place): number => Math.abs(c.p - from.p) * 10_000 + Math.abs(c.s - from.s);
  return places.reduce<T | null>((best, c) => (best === null || away(c) < away(best) ? c : best), null);
}

/**
 * Evidence is stored as places in the text (paragraph 3, sentence 2), so a
 * change above it — a paragraph split, joined, added or taken out, a sentence
 * cut in two — would leave the question quoting another sentence, still in
 * range, with nothing to say so. After each change of the text, each
 * question's evidence follows its words to where they are now: the paragraph
 * whole, if it only moved; else the sentence, as it read a keystroke ago or
 * else as it read when it was chosen (a new sentence typed in front of it
 * runs into it for a keystroke or two). Where the words themselves were
 * changed it stays put, and `liveChecks` asks for a look.
 */
function followEvidence(questions: QuestionForm[], before: string, after: string): QuestionForm[] {
  const was = storyParagraphs(before);
  const now = storyParagraphs(after);
  if (was.length === now.length && was.every((text, i) => text === now[i])) return questions;
  let nowSentences: Array<Place & { text: string }> | null = null;
  const sentences = (): Array<Place & { text: string }> =>
    (nowSentences ??= now.flatMap((text, p) => storySentences(text).map((sentence, s) => ({ p, s, text: sentence }))));

  return questions.map((q) => {
    const p = q.evidenceParagraph;
    const s = q.evidenceSentence;
    const paragraph = p === null ? undefined : was[p];
    if (p === null || paragraph === undefined || now[p] === paragraph) return q;
    const from = { p, s: s ?? 0 };

    // the paragraph, unchanged, somewhere else: others came or went before it
    const words = s === null ? [paragraph, q.evidenceQuote] : [paragraph];
    for (const w of words) {
      const moved = w ? nearest(now.flatMap((text, i) => (text === w ? [{ p: i, s: 0 }] : [])), from) : null;
      if (moved) return { ...q, evidenceParagraph: moved.p };
    }
    if (s === null) return q;

    // the paragraph itself changed: find the sentence — in another paragraph
    // only when paragraphs were split, joined, added or taken out, so editing
    // a sentence said twice does not send its question to the other one
    const sentence = storySentences(paragraph)[s];
    if (sentence === undefined) return q;
    if (sentences().some((c) => c.p === p && c.s === s && c.text === sentence)) return q;
    const anywhere = was.length !== now.length;
    for (const w of [sentence, q.evidenceQuote]) {
      const found = w ? nearest(sentences().filter((c) => c.text === w && (anywhere || c.p === p)), from) : null;
      if (found) return { ...q, evidenceParagraph: found.p, evidenceSentence: found.s };
    }
    return q;
  });
}

// ---------------------------------------------------------------------------
// The text
// ---------------------------------------------------------------------------

export interface SentenceFacts {
  text: string;
  /** counted the way the audio studio counts a text it will record */
  chars: number;
  /** said aloud in the reader and listed in the audio studio (not a lone "* * *") */
  recordable: boolean;
  /** past STORY_SENTENCE_SOFT_MAX: may not fit one 15-second recording */
  long: boolean;
  /** past LESSON_AUDIO_TEXT_MAX: no recording can hold it */
  tooLong: boolean;
}

export interface ParagraphFacts {
  text: string;
  words: number;
  sentences: SentenceFacts[];
}

export interface TextFacts {
  words: number;
  /** null when the count is in no band (or there is no text) */
  length: StoryLength | null;
  /** estimated, as learners are shown it ("~2 min") */
  minutes: number;
  paragraphs: ParagraphFacts[];
}

/** Words, length, minutes and every paragraph's sentences, as the reader will cut them. */
export function textFacts(dialect: StoryDialect, body: string): TextFacts {
  const words = countStoryWords(body);
  const paragraphs = storyParagraphs(body).map((text) => {
    const recordable = new Set(storyAudioSentences(text));
    return {
      text,
      words: countStoryWords(text),
      sentences: storySentences(text).map((s) => {
        const chars = normalizeKurdish(s).length;
        return {
          text: s,
          chars,
          recordable: recordable.has(s),
          long: chars > STORY_SENTENCE_SOFT_MAX,
          tooLong: chars > LESSON_AUDIO_TEXT_MAX,
        };
      }),
    };
  });
  return {
    words,
    length: paragraphs.length > 0 ? storyLengthFor(dialect, words) : null,
    minutes: readingMinutes(dialect, words),
    paragraphs,
  };
}

/** "Short · 60–120 words · 1–2 min", for a variety's bands. */
export function bandLabel(dialect: StoryDialect, length: StoryLength): string {
  const band = STORY_WORD_BANDS[dialect][length];
  const minutes = lengthMinutes(dialect, length);
  const time = minutes.min === minutes.max ? `${minutes.min} min` : `${minutes.min}–${minutes.max} min`;
  return `${LENGTH_NAME[length]} · ${band.min}–${band.max} words · ${time}`;
}

/** The first words of a text, for a picker that cannot show all of it. */
export function opening(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** In which paragraphs (0-based) the reader will mark each glossary row — empty when it will not. */
export function glossPlaces(form: Pick<StoryForm, 'body' | 'glossary'>): number[][] {
  const entries = form.glossary.map(glossEntry);
  const places: number[][] = entries.map(() => []);
  storyParagraphs(tidyBody(form.body)).forEach((paragraph, p) => {
    for (const span of glossSpans(paragraph, entries)) {
      const g = entries.indexOf(span.entry);
      if (g >= 0) places[g]!.push(p);
    }
  });
  return places;
}

/** Interface languages a gloss row can still add a meaning in (English is its own field). */
export function glossLocalesLeft(row: GlossRow): Array<{ code: string; name: string }> {
  return APP_LOCALES.filter((l) => l.code !== 'en' && !row.extra.some((e) => e.locale === l.code)).map((l) => ({
    code: l.code,
    name: l.englishName,
  }));
}

export function localeName(code: string): string {
  return APP_LOCALES.find((l) => l.code === code)?.englishName ?? code;
}

/** "gist 1 · detail 7 · vocabulary 2", in the order kinds are listed. */
export function kindTally(questions: ReadonlyArray<{ kind: string }>): Array<{ kind: string; count: number }> {
  const counts = new Map<string, number>();
  for (const q of questions) counts.set(q.kind, (counts.get(q.kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => ({ kind, count }));
}

/** What a story of this length must carry, and what a game on it may ask. */
export function bankNeeds(length: StoryLength | null): { min: number; counts: readonly number[] } | null {
  return length ? { min: MIN_QUESTION_BANK[length], counts: QUESTION_COUNTS_BY_LENGTH[length] } : null;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface LiveChecks {
  /** the API would refuse to save the draft: these must go first */
  blocking: StoryProblem[];
  /** fine in a draft, but stop it being submitted or published */
  beforePublish: StoryProblem[];
  /** worth a second look; never stop anything */
  warnings: StoryProblem[];
}

const problemKey = (p: StoryProblem): string => `${p.code}|${p.path}|${p.message}`;

/**
 * The checks the editor shows as it is typed: `validateStory` at the draft
 * stage (what a save would be refused for) and at the publish stage (what
 * submit and publish would be refused for), plus the slug, which the API
 * checks with its request schema rather than in `validateStory`. Two more
 * warnings are the editor's own: an address in random letters, or changed
 * after publishing, and evidence whose words were edited since it was chosen.
 */
export function liveChecks(form: StoryForm, opts: { publishedBefore?: boolean; savedSlug?: string } = {}): LiveChecks {
  const draft = draftFromForm(form);
  const atDraft = validateStory(draft, 'draft');
  const atPublish = validateStory(draft, 'publish');
  const blocking = [...atDraft.errors];
  const warnings = [...atPublish.warnings];
  if (!isStorySlug(draft.slug)) {
    blocking.unshift({
      code: 'SLUG',
      path: 'slug',
      message: 'use 3 to 80 lower-case Latin letters, digits and dashes',
    });
  } else if (looksRandomSlug(draft.slug)) {
    warnings.unshift({
      code: 'SLUG_RANDOM',
      path: 'slug',
      message: 'the address ends in random letters: replace them with a word or two in Latin letters',
    });
  } else if (opts.publishedBefore && opts.savedSlug && draft.slug !== opts.savedSlug) {
    warnings.unshift({
      code: 'SLUG_CHANGED',
      path: 'slug',
      message: `links to the old address (${opts.savedSlug}) will stop working`,
    });
  }
  // evidence that kept its place while the words there changed may no longer hold the answer
  const paragraphs = storyParagraphs(draft.body);
  form.questions.forEach((q, i) => {
    const now = evidenceText(paragraphs, q.evidenceParagraph, q.evidenceSentence);
    if (q.evidenceQuote === null || now === null || now === q.evidenceQuote) return;
    const sentence = q.evidenceSentence !== null;
    warnings.push({
      code: 'EVIDENCE_CHANGED',
      path: `questions[${i}].${sentence ? 'evidenceSentence' : 'evidenceParagraph'}`,
      message: `the ${sentence ? 'sentence' : 'paragraph'} it points at was changed: check it still holds the answer`,
    });
  });
  const blocked = new Set(blocking.map(problemKey));
  return {
    blocking,
    beforePublish: atPublish.errors.filter((p) => !blocked.has(problemKey(p))),
    warnings,
  };
}

/**
 * The problems at `path` or inside it: 'questions[3]' takes
 * 'questions[3].options[1]' but not 'questions[30]'. With `exact`, only those
 * at the path itself.
 */
export function problemsAt(problems: readonly StoryProblem[], path: string, exact = false): StoryProblem[] {
  return problems.filter(
    (p) => p.path === path || (!exact && (p.path.startsWith(`${path}.`) || p.path.startsWith(`${path}[`))),
  );
}

const FIELD_NAME: Record<string, string> = {
  dialect: 'Variety',
  level: 'Level',
  language: 'Language',
  title: 'Title',
  slug: 'Address',
  summary: 'Summary',
  body: 'Text',
  category: 'Category',
  tradition: 'Tradition',
  author: 'Author',
  source: 'Source',
  sourceUrl: 'Source address',
  attributionNote: 'Attribution note',
  cover: 'Cover',
  readingMinutes: 'Reading time',
  translations: 'Translation',
  glossary: 'Glossary',
  questions: 'Questions',
  meanings: 'meaning',
  prompt: 'prompt',
  promptEn: 'prompt in English',
  options: 'options',
  correctIndex: 'right answer',
  explanation: 'explanation',
  explanationEn: 'English explanation',
  evidenceParagraph: 'evidence',
  evidenceSentence: 'evidence sentence',
  kind: 'kind',
};

/** Where a problem is, for a person: 'questions[2].options[0]' → "Question 3 · option 1". */
export function describePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split('.')) {
    const m = /^(\w+)\[(\d+)\]$/.exec(segment);
    if (m) {
      const n = Number(m[2]) + 1;
      parts.push(
        m[1] === 'questions'
          ? `Question ${n}`
          : m[1] === 'glossary'
            ? `Glossary word ${n}`
            : m[1] === 'paragraphs'
              ? `Paragraph ${n}`
              : m[1] === 'options'
                ? `option ${n}`
                : `${m[1]} ${n}`,
      );
    } else if (parts.length > 0 && parts[parts.length - 1] === 'meaning') {
      parts[parts.length - 1] = `meaning (${localeName(segment)})`;
    } else if (parts.length > 0 && parts[parts.length - 1] === 'Translation') {
      // 'translations.de' reads as "Translation (German)"
      parts[parts.length - 1] = `Translation (${localeName(segment)})`;
    } else if ((segment === 'body' && path !== 'body') || segment === 'term') {
      // 'body.paragraphs[1]' reads as "Paragraph 2", 'glossary[0].term' as "Glossary word 1"
      continue;
    } else {
      parts.push(FIELD_NAME[segment] ?? segment);
    }
  }
  return parts.join(' · ');
}

/** The element id of the field a path names, so a problem can take the editor to it. */
export function fieldId(path: string): string {
  return `story-${path.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}`;
}

/** The ids to try for a path, nearest first: a field, then what holds it ('questions[2].options' → 'questions[2]'). */
export function fieldIdsFor(path: string): string[] {
  const ids: string[] = [];
  let p = path;
  for (;;) {
    ids.push(fieldId(p));
    const cut = Math.max(p.lastIndexOf('.'), p.lastIndexOf('['));
    if (cut <= 0) break;
    p = p.slice(0, cut);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StoryAction = 'save' | 'submit' | 'publish' | 'unpublish' | 'archive' | 'delete';

/**
 * What can be done to a story in each status, as the API allows it: a draft
 * or a story in review is edited, submitted or published (one editor may also
 * be the reviewer); a published one is unpublished before it is edited; an
 * archived one stays as it is. Any story may be deleted — the API refuses
 * (IN_USE) when a game has used it, and archiving is the way out then.
 */
export function availableActions(status: StoryStatus | null): StoryAction[] {
  switch (status) {
    case null:
      return ['save'];
    case 'draft':
      return ['save', 'submit', 'publish', 'archive', 'delete'];
    case 'in_review':
      return ['save', 'publish', 'archive', 'delete'];
    case 'published':
      return ['unpublish', 'archive', 'delete'];
    case 'archived':
      return ['delete'];
  }
}

export function isEditable(status: StoryStatus | null): boolean {
  return status === null || status === 'draft' || status === 'in_review';
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * What the list asks the server for. The server filters and pages
 * (GET /admin/stories?…&limit&offset), so every choice here is a query
 * parameter; `query` is matched against the title and the address.
 */
export interface ListFilter {
  status: StoryStatus | 'all';
  dialect: StoryDialect | 'all';
  level: StoryLevel | 'all';
  /** a category slug */
  category: string | 'all';
  review: StoryReviewStatus | 'all';
  /** only the library's featured stories */
  featured: boolean;
  query: string;
}

export const STATUS_TABS: ReadonlyArray<StoryStatus | 'all'> = ['all', 'draft', 'in_review', 'published', 'archived'];

export const DEFAULT_FILTER: ListFilter = { status: 'all', dialect: 'all', level: 'all', category: 'all', review: 'all', featured: false, query: '' };

/** How many rows a page of the list holds (the server allows up to 100). */
export const PAGE_SIZE = 50;

/** A saved filter read back, each part checked, so a stale or hand-edited one cannot ask for what the server refuses. */
export function readListFilter(raw: unknown): ListFilter {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_FILTER;
  const r = raw as Partial<Record<keyof ListFilter, unknown>>;
  return {
    status: STATUS_TABS.some((s) => s === r.status) ? (r.status as ListFilter['status']) : 'all',
    dialect: r.dialect === 'kurmanci' || r.dialect === 'sorani' ? r.dialect : 'all',
    level: isStoryLevel(r.level) ? r.level : 'all',
    category: typeof r.category === 'string' && r.category !== '' ? r.category : 'all',
    review: r.review === 'unreviewed' || r.review === 'approved' ? r.review : 'all',
    featured: r.featured === true,
    query: typeof r.query === 'string' ? r.query : '',
  };
}

/** Whether anything narrows the list beyond the status tab. */
export function isFiltered(filter: ListFilter): boolean {
  return (
    filter.status !== 'all' ||
    filter.dialect !== 'all' ||
    filter.level !== 'all' ||
    filter.category !== 'all' ||
    filter.review !== 'all' ||
    filter.featured ||
    filter.query.trim() !== ''
  );
}

/** The query string for one page of the list, with only the parts that narrow it. */
export function listParams(filter: ListFilter, page = 0, pageSize = PAGE_SIZE): string {
  const p = new URLSearchParams();
  const q = filter.query.trim();
  if (q) p.set('q', q.slice(0, 80));
  if (filter.status !== 'all') p.set('status', filter.status);
  if (filter.dialect !== 'all') p.set('dialect', filter.dialect);
  if (filter.level !== 'all') p.set('level', String(filter.level));
  if (filter.category !== 'all') p.set('category', filter.category);
  if (filter.review !== 'all') p.set('review', filter.review);
  if (filter.featured) p.set('featured', '1');
  p.set('limit', String(pageSize));
  if (page > 0) p.set('offset', String(page * pageSize));
  return p.toString();
}

/**
 * Published stories per variety and length. A length with none cannot be
 * chosen in a game's setup, and a variety with none shows learners an empty
 * shelf, so a zero here is worth seeing.
 */
export function publishedCoverage(list: readonly AdminStorySummary[]): Record<StoryDialect, Record<StoryLength, number>> {
  const out = Object.fromEntries(
    STORY_DIALECTS.map((d) => [d, Object.fromEntries(STORY_LENGTHS.map((l) => [l, 0]))]),
  ) as Record<StoryDialect, Record<StoryLength, number>>;
  for (const s of list) if (s.status === 'published' && s.length) out[s.dialect][s.length] += 1;
  return out;
}

/** The problems column: what stands between a story and publishing, at a glance. */
export function problemLabel(story: Pick<AdminStorySummary, 'problems' | 'status'>): {
  text: string;
  tone: 'ok' | 'mid' | 'danger' | '';
} {
  const { errors, warnings } = story.problems;
  if (errors > 0) {
    return { text: `${errors} to fix${warnings > 0 ? ` · ${warnings} to check` : ''}`, tone: 'danger' };
  }
  if (warnings > 0) return { text: `${warnings} to check`, tone: 'mid' };
  return story.status === 'published' || story.status === 'archived' ? { text: 'None', tone: '' } : { text: 'Ready', tone: 'ok' };
}

/** "8 / 12" when a story has fewer questions than its length needs, else just the count. */
export function bankLabel(story: Pick<AdminStorySummary, 'length' | 'questionCount'>): { text: string; short: boolean } {
  const need = story.length ? MIN_QUESTION_BANK[story.length] : null;
  return need !== null && story.questionCount < need
    ? { text: `${story.questionCount} / ${need}`, short: true }
    : { text: String(story.questionCount), short: false };
}
