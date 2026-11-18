/**
 * The lesson exercises that are solo-kit rounds: Build a Kurdish Sentence and Hear It, Find It. They are listed
 * as practice, in the practice hub and Learn's Lessons half, never in Learn's Games (the shared registry's
 * `place: 'lessons'`). This holds which have a phone screen and the words, glyph and colour each uses. One is
 * offered only when available in the learner's Kurdish (GET /games/availability, as the games list reads it), so
 * an exercise without enough approved content is not shown. Pure: the screens fetch availability themselves.
 */
import { lessonExercises, type GamesAvailability, type LearnGameId, type UnitTone } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';

/** The screens the exercises open on (root stack routes). */
export type ExerciseRoute = 'BuildSentence' | 'HearIt';

export interface PhoneExercise {
  /** Its name in a list's keys and test ids. */
  key: 'sentence' | 'hear';
  route: ExerciseRoute;
  icon: IconName;
  /** The name its own screen has, so a row and what it opens say the same. */
  title: TranslationKey;
  /** One short line, what you do in it. */
  detail: TranslationKey;
  /** The colour its badge wears in the hub: its own, so no two rows there look alike. */
  tone: UnitTone;
}

const PHONE_EXERCISES: Partial<Record<LearnGameId, PhoneExercise>> = {
  'build-sentence': { key: 'sentence', route: 'BuildSentence', icon: 'tiles', title: 'games.sentence.name', detail: 'learn.tools.sentenceHint', tone: 'river' },
  // An ear, not headphones: those are the hub's own Listen, which stands beside it.
  'hear-it': { key: 'hear', route: 'HearIt', icon: 'ear', title: 'games.hear.name', detail: 'learn.tools.hearHint', tone: 'dusk' },
};

const PLAYABLE = Object.keys(PHONE_EXERCISES) as LearnGameId[];

/**
 * Leave an exercise: back to the practice hub or Learn's Lessons half. Opened from a link, there is nothing
 * behind it, so it replaces itself with the hub, so Back from the hub does not return to the exercise.
 */
export function leaveExercise(navigation: { canGoBack: () => boolean; goBack: () => void; replace: (screen: 'PracticeHub') => void }): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.replace('PracticeHub');
}

/** The exercises an availability answer offers, in registry order; none before it arrives. */
export function exercisesOf(availability: GamesAvailability | null | undefined): PhoneExercise[] {
  return lessonExercises(availability, PLAYABLE).flatMap((g) => {
    const mine = PHONE_EXERCISES[g.id];
    return mine ? [mine] : [];
  });
}
