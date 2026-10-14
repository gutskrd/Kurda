import { feedbackKind, type Feedback } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/**
 * The lesson player's rules live in @kurda/shared (lesson-player.ts), so the
 * phone and the browser play a lesson the same way: no hearts, a missed item
 * asked again a few exercises later, and a resumed lesson that picks up where
 * it stopped. What is left here is the phone's own words for them.
 */
export {
  REASK_GAP,
  currentExercise,
  currentStep,
  initPlayer,
  isReask,
  progress,
  reduce,
  type Feedback,
  type PlayerAction,
  type PlayerState,
  type PlayerStatus,
} from '@kurda/shared';

/**
 * The feedback banner's headline, which must be true of the answer
 * (`feedbackKind`).
 *
 * A strict spelling item grades the same slip (e for ê) as a typo that is NOT
 * accepted — the letter is what it tests. A spoken answer was never graded by
 * the server: its verdict is the learner's own rating of their recording, so a
 * recording that counted is just that: saved.
 */
export function feedbackTitle(feedback: Feedback): TranslationKey {
  switch (feedbackKind(feedback)) {
    case 'spokenGood':
    case 'spokenClose':
      return 'lesson.speak.saved';
    case 'spokenRetry':
    case 'notYet':
      return 'lesson.notQuite';
    case 'almost':
      return 'lesson.almostTypo';
    case 'almostStrict':
      return 'lesson.almostStrict';
    case 'correct':
      return 'lesson.correct';
  }
}
