import { useSlideLeaving } from '../../theme/SlideSwap';
import type { MatchState } from '../match';
import type { Feedback } from '../player';
import type { Exercise, SelfRating } from '../types';
import { ConversationExercise } from './ConversationExercise';
import { ListeningExercise } from './ListeningExercise';
import { MatchPairsExercise } from './MatchPairsExercise';
import { MultipleChoiceExercise } from './MultipleChoiceExercise';
import { SpeakingExercise } from './SpeakingExercise';
import { TranslateExercise } from './TranslateExercise';
import { WritingExercise } from './WritingExercise';

/** The answer being put together, whichever kind of exercise it is for, and how each part of it is changed. */
export interface ExerciseDraft {
  choice: number | null;
  onChoice: (index: number) => void;
  text: string;
  onText: (text: string) => void;
  match: MatchState;
  onMatch: (state: MatchState) => void;
  selfRating: SelfRating | null;
  onRate: (rating: SelfRating | null) => void;
  onRecorded: (recorded: boolean) => void;
  /** put this one off: a clip that will not play, said by the exercise itself */
  onSkip: () => void;
}

const nothing = (): void => undefined;

/**
 * The exercise on screen, as one slide of the lesson: whichever of the seven
 * kinds it is, drawn from the player's state.
 *
 * It is what the lesson's `SlideSwap` turns, so one question leaves as the
 * next arrives. Each step is a slide of its own, which is also what gives
 * every exercise a fresh start: a conversation still playing stops rather
 * than following into the next one, the tiles laid for one translation are
 * not left on the next one's line, each listening clip plays by itself as it
 * appears, two speaking exercises in a row do not share a microphone, and a
 * pair still flashing does not follow into the next set.
 *
 * A slide on its way out is still mounted for a moment, exactly as it stood,
 * with the answer and the verdict it had. It is the previous exercise, and
 * the player's state has already moved to the next one, so it lets go of the
 * player: it is disabled and its callbacks do nothing. Otherwise a clip that
 * failed a moment too late would put off the exercise after it, and a
 * recording that finished late would count as the next one's.
 */
export function ExerciseSlide({
  exercise,
  dialect,
  answering,
  feedback,
  verdict,
  draft,
}: {
  exercise: Exercise;
  /** the lesson's variety, for the Kurdish keys and the tiles */
  dialect?: string | null;
  /** still to be answered: not waiting on a verdict, and not showing one */
  answering: boolean;
  feedback: Feedback | null;
  /** how the answer on screen was graded, for the exercise to answer back with */
  verdict: 'right' | 'wrong' | null;
  draft: ExerciseDraft;
}): React.JSX.Element | null {
  const leaving = useSlideLeaving();
  const disabled = leaving || !answering;
  const onChoice = leaving ? nothing : draft.onChoice;
  const onText = leaving ? nothing : draft.onText;

  switch (exercise.type) {
    case 'multiple_choice':
      return <MultipleChoiceExercise exercise={exercise} choice={draft.choice} onSelect={onChoice} disabled={disabled} feedback={feedback} />;
    case 'conversation':
      return <ConversationExercise exercise={exercise} choice={draft.choice} onSelect={onChoice} dialect={dialect} disabled={disabled} feedback={feedback} />;
    case 'translate':
      return <TranslateExercise exercise={exercise} text={draft.text} onChangeText={onText} dialect={dialect} verdict={verdict} disabled={disabled} />;
    case 'listening':
      return (
        <ListeningExercise
          exercise={exercise}
          text={draft.text}
          onChangeText={onText}
          dialect={dialect}
          verdict={verdict}
          onSkip={leaving ? nothing : draft.onSkip}
          disabled={disabled}
        />
      );
    case 'writing':
      return <WritingExercise exercise={exercise} text={draft.text} onChangeText={onText} dialect={dialect} verdict={verdict} disabled={disabled} />;
    case 'speaking':
      return (
        <SpeakingExercise
          exercise={exercise}
          onSetRecorded={leaving ? nothing : draft.onRecorded}
          selfRating={draft.selfRating}
          onRate={leaving ? nothing : draft.onRate}
          disabled={disabled}
        />
      );
    case 'match_pairs':
      return <MatchPairsExercise exercise={exercise} state={draft.match} onChange={leaving ? nothing : draft.onMatch} disabled={disabled} verdict={verdict} />;
    default:
      return null;
  }
}
