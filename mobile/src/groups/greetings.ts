import type { CourseScript } from '../learn/courseDialect';

/**
 * Three ways to say hello in an empty group chat, in the learner's own Kurdish. Content rather than interface copy (the
 * same in every app language), so it lives here rather than in the translation files.
 */
export const GREETINGS: Record<CourseScript, readonly string[]> = {
  kmr: ['Silav! 👋', 'Rojbaş!', 'Çawa yî?'],
  ckb: ['سڵاو! 👋', 'بەیانیت باش!', 'چۆنی؟'],
};
