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

/** The answer being built, for any exercise kind, and how each part changes. */
interface ExerciseDraft {
  choice: number | null;
  onChoice: (index: number) => void;
  text: string;
  onText: (text: string) => void;
  match: MatchState;
  onMatch: (state: MatchState) => void;
  selfRating: SelfRating | null;
  onRate: (rating: SelfRating | null) => void;
  onRecorded: (recorded: boolean) => void;
  /** Puts this one off: a clip that will not play, reported by the exercise. */
  onSkip: () => void;
}

const nothing = (): void => undefined;

/**
 * The exercise on screen as one slide of the lesson's `SlideSwap`. Each step being its own slide gives every
 * exercise a fresh start: audio, tiles, microphone and flashing pairs never carry over to the next.
 *
 * A leaving slide stays mounted briefly as it was, but the player's state has already moved on, so it is disabled
 * and its callbacks do nothing; otherwise a late clip failure or recording would apply to the next exercise.
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
  /** The lesson's variety, for the Kurdish keys and the tiles. */
  dialect?: string | null;
  /** Still to be answered: not waiting on or showing a verdict. */
  answering: boolean;
  feedback: Feedback | null;
  /** How the answer on screen was graded, for the exercise to react to. */
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
