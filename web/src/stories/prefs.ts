/**
 * What a reader's device remembers about Stories: the variety and length they
 * last looked at, the text size, whether English sits under the questions,
 * extra time, and the quiz settings "Quiz yourself" starts with.
 *
 * All of it is a convenience, so all of it is allowed to be missing: storage
 * can throw (a private window, blocked site data) or come back empty, and
 * every read here falls back to the default rather than failing the page.
 */
import {
  DEFAULT_QUESTION_COUNT,
  QUESTION_COUNTS,
  isAllowedQuestionCount,
  isStoryDialect,
  isStoryLength,
  isTextDuring,
  isTimerPreset,
  storyDialectForCourse,
  type QuestionCount,
  type StoryDialect,
  type StoryLength,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';

const KEY = {
  variety: 'hevalo.stories.variety',
  length: 'hevalo.stories.length',
  textSize: 'hevalo.stories.textSize',
  english: 'hevalo.stories.english',
  extraTime: 'hevalo.stories.extraTime',
  quiz: 'hevalo.stories.quiz',
  course: 'hevalo.learn.courseDialect',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // a device that will not remember is still a device that can read
  }
}

// ---- the course a learner is on -------------------------------------------------

/**
 * The variety of the last lesson this device opened, which is what "the
 * learner's course" means here: the lesson player knows it, nothing else has
 * to be asked for it, and it follows a learner who switches course.
 */
export function rememberCourseDialect(dialect: string | null | undefined): void {
  if (dialect) write(KEY.course, storyDialectForCourse(dialect));
}

/** this tab's own choice, so going to a story and back keeps the variety you were looking at */
let sessionVariety: StoryDialect | null = null;

/**
 * The variety the hub opens on (contract §A1): the learner's course; else
 * Soranî when the interface is Soranî; else the one chosen last time; else
 * Kurmancî. A choice made in this tab wins for as long as the tab is open.
 */
export function defaultVariety(locale: string): StoryDialect {
  if (sessionVariety) return sessionVariety;
  const course = read(KEY.course);
  if (isStoryDialect(course)) return course;
  if (locale === 'ckb') return 'sorani';
  const last = read(KEY.variety);
  if (isStoryDialect(last)) return last;
  return 'kurmanci';
}

export function rememberVariety(dialect: StoryDialect): void {
  sessionVariety = dialect;
  write(KEY.variety, dialect);
}

/** For tests: forget this tab's choice. */
export function resetSessionVariety(): void {
  sessionVariety = null;
}

// ---- the length filter ------------------------------------------------------------

export type LengthFilter = StoryLength | 'all';

export function rememberedLength(): LengthFilter {
  const v = read(KEY.length);
  return isStoryLength(v) ? v : 'all';
}

export function rememberLength(length: LengthFilter): void {
  write(KEY.length, length);
}

// ---- reading ----------------------------------------------------------------------

/** Text sizes, as a step in rem; the second is where everyone starts. */
export const TEXT_SIZES = [1, 1.15, 1.32, 1.52] as const;
export const DEFAULT_TEXT_SIZE = 1;

export function rememberedTextSize(): number {
  const raw = read(KEY.textSize);
  if (raw === null) return DEFAULT_TEXT_SIZE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < TEXT_SIZES.length ? n : DEFAULT_TEXT_SIZE;
}

export function rememberTextSize(step: number): void {
  write(KEY.textSize, String(step));
}

/**
 * "English under questions": null until the reader chooses, and then their
 * choice. Unchosen, English shows under level-1 questions only (a beginner is
 * asked in Kurdish they may not read yet; past that, the Kurdish is the point).
 */
export function rememberedEnglish(): boolean | null {
  const v = read(KEY.english);
  return v === 'on' ? true : v === 'off' ? false : null;
}

export function rememberEnglish(on: boolean): void {
  write(KEY.english, on ? 'on' : 'off');
}

export function showEnglishFor(level: number, choice: boolean | null): boolean {
  return choice ?? level === 1;
}

/** Double time on timed questions, asked for once and kept. */
export function rememberedExtraTime(): boolean {
  return read(KEY.extraTime) === 'on';
}

export function rememberExtraTime(on: boolean): void {
  write(KEY.extraTime, on ? 'on' : 'off');
}

// ---- "Quiz yourself" ------------------------------------------------------------------

export interface SoloSettings {
  /** null: the length's default */
  questionCount: QuestionCount | null;
  timerSeconds: TimerSeconds;
  textDuring: TextDuring;
}

const SOLO_DEFAULT: SoloSettings = { questionCount: null, timerSeconds: 0, textDuring: 'visible' };

export function rememberedSolo(): SoloSettings {
  try {
    const raw = JSON.parse(read(KEY.quiz) ?? 'null') as Partial<SoloSettings> | null;
    if (!raw || typeof raw !== 'object') return SOLO_DEFAULT;
    return {
      questionCount: (QUESTION_COUNTS as readonly unknown[]).includes(raw.questionCount) ? (raw.questionCount as QuestionCount) : null,
      timerSeconds: isTimerPreset(raw.timerSeconds) ? raw.timerSeconds : 0,
      textDuring: isTextDuring(raw.textDuring) ? raw.textDuring : 'visible',
    };
  } catch {
    return SOLO_DEFAULT;
  }
}

export function rememberSolo(settings: SoloSettings): void {
  write(KEY.quiz, JSON.stringify(settings));
}

/** The count a remembered setting asks for on a story of this length: the length's default when it is not offered there. */
export function soloCountFor(length: StoryLength, remembered: QuestionCount | null): QuestionCount {
  return remembered !== null && isAllowedQuestionCount(length, remembered) ? remembered : DEFAULT_QUESTION_COUNT[length];
}
