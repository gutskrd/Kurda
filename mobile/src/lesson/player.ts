import { feedbackKind, type ExerciseType, type Feedback } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';

/**
 * The lesson player's rules live in @kurda/shared (lesson-player.ts), so phone and website play lessons the same
 * way: no hearts, missed items asked again a few exercises later, and resumable lessons. This adds the phone's words.
 */
export {
  REASK_GAP,
  RUN_SHOWN_FROM,
  VERDICT_TIMING,
  currentExercise,
  currentStep,
  initPlayer,
  isReask,
  nextRun,
  progress,
  reduce,
  runMilestone,
  type Feedback,
  type PlayerAction,
  type PlayerState,
  type PlayerStatus,
  type PutAway,
  type PutAwayType,
} from '@kurda/shared';

/**
 * The feedback banner's headline, which must be true of the answer (`feedbackKind`). A strict spelling item grades
 * a slip (e for ê) as an unaccepted typo, since the letter is what it tests. A spoken answer is never graded by the
 * server; a recording that counted is simply saved.
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

/**
 * The haptic for a verdict: crisp for right, a gentle double for wrong (never the error buzz, since a miss is part
 * of learning). A spoken answer is the learner's own rating, so it gets neither.
 */
export function answerFeel(type: ExerciseType | undefined, accepted: boolean): 'correct' | 'wrong' | null {
  if (type === 'speaking') return null;
  return accepted ? 'correct' : 'wrong';
}
