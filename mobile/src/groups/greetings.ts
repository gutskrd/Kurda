import type { CourseScript } from '../learn/courseDialect';

/**
 * Three ways to say hello in an empty group chat, in the learner's own
 * Kurdish: one tap sends it, so the first word in a new group is already
 * practice. Content, not interface copy — the same whatever language the app
 * is in — so it lives here rather than in the translation files, like the
 * praise a right answer gets.
 */
export const GREETINGS: Record<CourseScript, readonly string[]> = {
  kmr: ['Silav! 👋', 'Rojbaş!', 'Çawa yî?'],
  ckb: ['سڵاو! 👋', 'بەیانیت باش!', 'چۆنی؟'],
};
