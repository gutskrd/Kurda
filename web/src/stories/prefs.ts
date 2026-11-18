/**
 * What this device remembers about Stories: the variety, text size, English under questions, extra time and the "Quiz
 * yourself" settings. Storage may throw or be empty, so every read falls back to a default.
 */
import {
  DEFAULT_QUESTION_COUNT,
  QUESTION_COUNTS,
  isAllowedQuestionCount,
  isStoryDialect,
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
    // A device that will not remember can still read.
  }
}

// ---- The course a learner is on ----

/** Records the variety of the last lesson opened on this device, which is what "the learner's course" means here. */
export function rememberCourseDialect(dialect: string | null | undefined): void {
  if (dialect) write(KEY.course, storyDialectForCourse(dialect));
}

/** The learner's course as this device knows it, or null before their first lesson here. */
export function courseDialect(): StoryDialect | null {
  const course = read(KEY.course);
  return isStoryDialect(course) ? course : null;
}

/** This tab's own choice, so visiting a story and coming back keeps the variety. */
let sessionVariety: StoryDialect | null = null;

/**
 * The variety the hub opens on: the learner's course, else Soranî for a Soranî interface, else the last choice, else
 * Kurmancî. A choice made in this tab wins while it is open.
 */
export function defaultVariety(locale: string): StoryDialect {
  if (sessionVariety) return sessionVariety;
  const course = courseDialect();
  if (course) return course;
  if (locale === 'ckb') return 'sorani';
  const last = read(KEY.variety);
  if (isStoryDialect(last)) return last;
  return 'kurmanci';
}

/**
 * The variety stories are shown in: the last choice on this device (by a story switch or the riddles' and proverbs'
 * shelves, which share it), else Soranî for a Soranî interface, else Kurmancî. Unlike `defaultVariety` the course does
 * not count. Only a switch records a choice (`rememberVariety`); opening a story from a link does not.
 */
export function shownVariety(locale: string): StoryDialect {
  if (sessionVariety) return sessionVariety;
  const last = read(KEY.variety);
  if (isStoryDialect(last)) return last;
  return locale === 'ckb' ? 'sorani' : 'kurmanci';
}

export function rememberVariety(dialect: StoryDialect): void {
  sessionVariety = dialect;
  write(KEY.variety, dialect);
}

/** Forgets this tab's choice, for tests. */
export function resetSessionVariety(): void {
  sessionVariety = null;
}

// ---- Reading ----

/** Text sizes, as a step in rem; the second is where everyone starts. */
export const TEXT_SIZES = [1, 1.15, 1.32, 1.52] as const;
const DEFAULT_TEXT_SIZE = 1;

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
 * "English under questions": null until the reader chooses. Unchosen, English shows under level-1 questions only,
 * since a beginner may not read the Kurdish yet.
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

// ---- "Quiz yourself" ----

export interface SoloSettings {
  /** Null: the length's default. */
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

/** The count a remembered setting gives on a story of this length, or the length's default when not offered there. */
export function soloCountFor(length: StoryLength, remembered: QuestionCount | null): QuestionCount {
  return remembered !== null && isAllowedQuestionCount(length, remembered) ? remembered : DEFAULT_QUESTION_COUNT[length];
}
