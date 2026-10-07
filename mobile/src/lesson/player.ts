import type { TranslationKey } from '../i18n/translations';
import type { AnswerResult, Exercise, ExerciseType, SessionView } from './types';

/** Lives a learner starts a lesson with. */
export const STARTING_HEARTS = 5;

export type PlayerStatus = 'answering' | 'feedback' | 'finished';

export interface Feedback {
  verdict: AnswerResult['verdict'];
  accepted: boolean;
  correction?: string;
  /** what was answered: a recording is not graded the way typed text is */
  exerciseType?: ExerciseType;
}

/**
 * The feedback banner's headline, which must be true of the answer.
 *
 * 'typo' used to read "typo accepted" whatever else came back. But a strict
 * spelling item grades the same slip (e for ê) as a typo that is NOT accepted —
 * the letter is what it tests — and a spoken answer was never typed: the server
 * cannot check a recording, so its verdict is only the learner's own rating, or
 * 'typo' when none was sent (this player sends none). A recording that counted
 * is therefore just that: saved.
 */
export function feedbackTitle(feedback: Feedback): TranslationKey {
  if (feedback.exerciseType === 'speaking') return feedback.accepted ? 'lesson.speak.saved' : 'lesson.notQuite';
  if (feedback.verdict === 'typo') return feedback.accepted ? 'lesson.almostTypo' : 'lesson.almostStrict';
  return feedback.accepted ? 'lesson.correct' : 'lesson.notQuite';
}

export interface PlayerState {
  exercises: Exercise[];
  /** index of the exercise currently on screen */
  index: number;
  hearts: number;
  status: PlayerStatus;
  feedback: Feedback | null;
  /** exercises answered so far (drives the progress bar) */
  answeredCount: number;
}

export type PlayerAction =
  | { type: 'ANSWERED'; result: AnswerResult }
  | { type: 'CONTINUE' }
  | { type: 'SKIP' }
  | { type: 'FINISH' };

/**
 * Build the initial player state from a (possibly resumed) session. Prior
 * answers are respected: the player resumes at the first unanswered
 * exercise, and hearts already lost to earlier wrong answers stay lost.
 */
export function initPlayer(view: SessionView, startingHearts = STARTING_HEARTS): PlayerState {
  const wrong = Object.values(view.answered).filter((a) => !a.accepted).length;
  const hearts = Math.max(0, startingHearts - wrong);
  const answeredCount = Object.keys(view.answered).length;
  const firstUnanswered = view.exercises.findIndex((ex) => !(ex.id in view.answered));
  const done = view.completed || firstUnanswered === -1;
  return {
    exercises: view.exercises,
    index: done ? view.exercises.length : firstUnanswered,
    hearts,
    status: done ? 'finished' : 'answering',
    feedback: null,
    answeredCount,
  };
}

export function currentExercise(state: PlayerState): Exercise | null {
  return state.exercises[state.index] ?? null;
}

/** Fraction of the lesson answered, 0..1. */
export function progress(state: PlayerState): number {
  return state.exercises.length === 0 ? 0 : state.answeredCount / state.exercises.length;
}

/** The run failed if lives are exhausted. */
export function outOfHearts(state: PlayerState): boolean {
  return state.hearts <= 0;
}

export function reduce(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'ANSWERED': {
      if (state.status !== 'answering') return state;
      const { accepted, verdict, correction, duplicate } = action.result;
      // A replayed answer (already recorded) neither re-counts nor re-charges.
      const lostHeart = !accepted && !duplicate;
      return {
        ...state,
        status: 'feedback',
        feedback: { verdict, accepted, correction, exerciseType: currentExercise(state)?.type },
        hearts: lostHeart ? Math.max(0, state.hearts - 1) : state.hearts,
        answeredCount: duplicate ? state.answeredCount : state.answeredCount + 1,
      };
    }
    case 'CONTINUE': {
      if (state.status !== 'feedback') return state;
      // out of hearts → the lesson ends here (fail); otherwise advance
      if (outOfHearts(state)) {
        return { ...state, status: 'finished', feedback: null };
      }
      const nextIndex = state.index + 1;
      if (nextIndex >= state.exercises.length) {
        return { ...state, status: 'finished', feedback: null };
      }
      return { ...state, index: nextIndex, status: 'answering', feedback: null };
    }
    case 'SKIP': {
      // defer the current exercise: advance without answering, no heart lost
      // and it's not counted as a mistake (KUR-035 "can't listen now").
      if (state.status !== 'answering') return state;
      const nextIndex = state.index + 1;
      if (nextIndex >= state.exercises.length) {
        return { ...state, status: 'finished', feedback: null };
      }
      return { ...state, index: nextIndex };
    }
    case 'FINISH':
      return { ...state, status: 'finished', feedback: null };
  }
}
