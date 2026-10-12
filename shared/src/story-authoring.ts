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
 * questions, even no text yet. Those are warnings while it is a draft and
 * errors when it is submitted or published. Everything else — a broken
 * question, a gloss for a word the text does not have, a sentence too long to
 * record — is wrong at any stage, and is an error from the first save.
 */
import { LESSON_AUDIO_TEXT_MAX } from './lesson-audio.js';
import { normalizeKurdish } from './kurdish-text.js';
import { isAppLocale } from './locales.js';
import {
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
  STORY_BODY_MAX,
  STORY_LENGTHS,
  STORY_SENTENCE_SOFT_MAX,
  STORY_SUMMARY_MAX,
  STORY_TITLE_MAX,
  STORY_WORD_BANDS,
  countStoryWords,
  glossSpans,
  isQuestionKind,
  isStoryDialect,
  isStoryLevel,
  storyLengthFor,
  storyParagraphs,
  storySentences,
  type StoryDialect,
  type StoryGlossEntry,
  type StoryLength,
} from './stories.js';

/** A slug: lower-case Latin letters, digits and dashes, as the stories table checks it. */
export const STORY_SLUG_PATTERN = /^[a-z0-9-]{3,80}$/;

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
}

/** A story as an editor writes it: everything `validateStory` looks at. */
export interface StoryInput {
  dialect: StoryDialect;
  level: number;
  title: string;
  summary: string | null;
  body: string;
  glossary: StoryGlossEntry[];
  questions: StoryQuestionInput[];
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
const UNFINISHED_IN_DRAFT = new Set(['BODY_EMPTY', 'LENGTH_BETWEEN_BANDS', 'BANK_TOO_SMALL']);

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

const LENGTH_NAME: Record<StoryLength, string> = { short: 'short', medium: 'medium', long: 'long' };

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
  return v === null || v === undefined || v.trim() === '';
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
 * between the length bands, fewer questions than MIN_QUESTION_BANK.
 *
 * Warnings: a sentence that may not fit one 15-second recording, a sentence
 * ending in an abbreviation, a numbered list (both cut sentences in the wrong
 * place), an explanation past one line, no gist question, one kind asked too
 * often, the right answer always in the same place, an option much longer
 * than the others (a guessable tell), a question with no evidence to show at
 * the reveal or no English for the beginners who see it by default.
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
  if (!isStoryLevel(story.level)) error('LEVEL', 'level', 'choose level 1, 2 or 3');

  if (blank(story.title)) error('TITLE_EMPTY', 'title', 'give the story a title');
  else if (story.title.trim().length > STORY_TITLE_MAX) {
    error('TITLE_TOO_LONG', 'title', `keep the title to ${STORY_TITLE_MAX} characters`);
  }
  if (story.summary !== null && story.summary.trim().length > STORY_SUMMARY_MAX) {
    error('SUMMARY_TOO_LONG', 'summary', `keep the summary to ${STORY_SUMMARY_MAX} characters`);
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
      error(
        'LENGTH_BETWEEN_BANDS',
        'body',
        `${words} words is between the lengths: the nearest is ${LENGTH_NAME[near.length]} (${near.min}–${near.max} words)`,
      );
    }
  }

  paragraphs.forEach((paragraph, p) => {
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

  return { errors, warnings };
}
