/**
 * The lessons' exercises that are rounds of the solo kit: Build a Kurdish
 * Sentence and Hear It, Find It. They were listed among the games once; they
 * are practice, so the practice hub and the Lessons half of Learn list them
 * now, and Learn's Games never does (the shared registry says which is which,
 * `place: 'lessons'`).
 *
 * This is which of them the phone has a screen for, and the words, glyph and
 * colour each wears where it is listed. One is offered only when it can be
 * done in the learner's Kurdish now (GET /games/availability, the same answer
 * the games list reads): practice is somewhere to do something, so an
 * exercise still short of approved content is not shown at all.
 *
 * Pure: the screens that list them ask the server themselves (the hub with
 * its own load, the Lessons half through `useLessonExercises`).
 */
import { lessonExercises, type GamesAvailability, type LearnGameId, type UnitTone } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';

/** The screens the exercises open on (root stack routes). */
export type ExerciseRoute = 'BuildSentence' | 'HearIt';

export interface PhoneExercise {
  /** its name in a list's keys and test ids */
  key: 'sentence' | 'hear';
  route: ExerciseRoute;
  icon: IconName;
  /** the name its own screen has, so a row and what it opens say the same */
  title: TranslationKey;
  /** one short line, what you do in it */
  detail: TranslationKey;
  /** the colour its badge wears in the hub: its own, so no two rows there look alike */
  tone: UnitTone;
}

const PHONE_EXERCISES: Partial<Record<LearnGameId, PhoneExercise>> = {
  'build-sentence': { key: 'sentence', route: 'BuildSentence', icon: 'tiles', title: 'games.sentence.name', detail: 'learn.tools.sentenceHint', tone: 'river' },
  // an ear, not headphones: those are the hub's own Listen, which stands beside it
  'hear-it': { key: 'hear', route: 'HearIt', icon: 'ear', title: 'games.hear.name', detail: 'learn.tools.hearHint', tone: 'dusk' },
};

const PLAYABLE = Object.keys(PHONE_EXERCISES) as LearnGameId[];

/**
 * Leaving an exercise: back to where it was opened from, the practice hub or
 * the Lessons half of Learn. Opened by a link there is nothing behind it, and
 * it leaves to the hub (in its place, so Back from the hub does not return to
 * the exercise): practice is where the exercise lives.
 */
export function leaveExercise(navigation: { canGoBack: () => boolean; goBack: () => void; replace: (screen: 'PracticeHub') => void }): void {
  if (navigation.canGoBack()) navigation.goBack();
  else navigation.replace('PracticeHub');
}

/** The exercises an availability answer offers, in the registry's order; none before it has arrived. */
export function exercisesOf(availability: GamesAvailability | null | undefined): PhoneExercise[] {
  return lessonExercises(availability, PLAYABLE).flatMap((g) => {
    const mine = PHONE_EXERCISES[g.id];
    return mine ? [mine] : [];
  });
}
