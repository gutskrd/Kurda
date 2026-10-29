import { conversationLineVoice, type DeliveredExercise, type Feedback } from '@kurda/shared';
import { CharacterStage } from '../characters/CharacterStage';
import { spokenClips, type MaybeSpoken, type SpokenClip } from '../characters/clips';

/** A run of words in quotation marks: the Kurdish a prompt such as “Roj baş” tê çi wateyê? asks about. */
const QUOTED = /[“"«„]([^”"»“]+)[”"»“]/;

/**
 * The words a recording beside the prompt says, as near as the exercise tells
 * them: what the prompt quotes, or the prompt itself. Only for moving the
 * mouth when no timeline was saved with the recording.
 */
export function promptWords(prompt: string | undefined): string | null {
  if (!prompt) return null;
  return QUOTED.exec(prompt)?.[1]?.trim() || prompt;
}

/**
 * Every recording an exercise can play that has a character: the listening
 * clip (its words are the answer, so they are not sent), the model, the
 * recordings of the options or the Kurdish cards, and a conversation's lines,
 * each with whoever says it.
 */
export function exerciseClips(exercise: DeliveredExercise): SpokenClip[] {
  const list: MaybeSpoken[] = [
    { src: exercise.audioUrl, voice: exercise.audioVoice },
    { src: exercise.modelAudioUrl, voice: exercise.modelAudioVoice, text: promptWords(exercise.prompt) },
  ];
  for (const [said, src] of Object.entries(exercise.audio ?? {})) list.push({ src, voice: exercise.audioVoices?.[said], text: said });
  // a line is always said by its own part's character, whichever voice its recording was saved under
  (exercise.lines ?? []).forEach((line, i) =>
    list.push({ src: exercise.lineAudio?.[i], voice: conversationLineVoice(exercise.speakers ?? [], line, exercise.lineVoices?.[i]), text: line.text }),
  );
  return spokenClips(list);
}

/** The model the feedback plays, when it has a character the exercise above does not already show. */
export function feedbackClip(exercise: DeliveredExercise, feedback: Feedback): SpokenClip | null {
  const [clip] = spokenClips([{ src: feedback.modelAudioUrl, voice: feedback.modelAudioVoice, text: feedback.correction ?? promptWords(exercise.prompt) }]);
  if (!clip) return null;
  return exerciseClips(exercise).some((c) => c.src === clip.src) ? null : clip;
}

/**
 * Who says an exercise's recordings, beside what plays them: the whole figure
 * on a stage (`CharacterStage`), speaking while one of `clips` plays and
 * waiting between them, with `children` — the play buttons, or the words
 * being asked about — standing beside it. It cheers a right answer and
 * thinks a wrong one over (`verdict`). With no character among `clips`, the
 * children alone, exactly as before.
 */
export function ExerciseVoice({
  clips,
  verdict = null,
  height,
  share,
  children,
}: {
  clips: readonly SpokenClip[];
  verdict?: 'right' | 'wrong' | null;
  /** a stage this tall whatever the window, for an exercise with more to show under it (`STAGE.card`) */
  height?: number;
  /** the least share of the stage's width the character takes (`CharacterStage`) */
  share?: number;
  children?: React.ReactNode;
}): React.JSX.Element {
  if (clips.length === 0) return <>{children}</>;
  return (
    <CharacterStage clips={clips} height={height} share={share} reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}>
      {children}
    </CharacterStage>
  );
}
