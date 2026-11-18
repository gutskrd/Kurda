import { conversationLineVoice, type DeliveredExercise, type Feedback } from '@kurda/shared';
import { CharacterStage } from '../characters/CharacterStage';
import { spokenClips, type MaybeSpoken, type SpokenClip } from '../characters/clips';

/** Words in quotation marks: the Kurdish a prompt such as “Roj baş” tê çi wateyê? asks about. */
const QUOTED = /[“"«„]([^”"»“]+)[”"»“]/;

/** What a recording beside the prompt says, as near as the exercise tells (the quoted words, or the prompt), for mouth movement without a timeline. */
export function promptWords(prompt: string | undefined): string | null {
  if (!prompt) return null;
  return QUOTED.exec(prompt)?.[1]?.trim() || prompt;
}

/**
 * Every recording with a character an exercise can play: the listening clip (without its words, which are the answer),
 * the model, the options' or Kurdish cards' recordings, and a conversation's lines, each with its speaker.
 */
export function exerciseClips(exercise: DeliveredExercise): SpokenClip[] {
  const list: MaybeSpoken[] = [
    { src: exercise.audioUrl, voice: exercise.audioVoice },
    { src: exercise.modelAudioUrl, voice: exercise.modelAudioVoice, text: promptWords(exercise.prompt) },
  ];
  for (const [said, src] of Object.entries(exercise.audio ?? {})) list.push({ src, voice: exercise.audioVoices?.[said], text: said });
  // A line is always said by its own part's character, whatever voice its recording was saved under.
  (exercise.lines ?? []).forEach((line, i) =>
    list.push({ src: exercise.lineAudio?.[i], voice: conversationLineVoice(exercise.speakers ?? [], line, exercise.lineVoices?.[i]), text: line.text }),
  );
  return spokenClips(list);
}

/** The model the feedback plays, when it has a character not already shown by the exercise. */
export function feedbackClip(exercise: DeliveredExercise, feedback: Feedback): SpokenClip | null {
  const [clip] = spokenClips([{ src: feedback.modelAudioUrl, voice: feedback.modelAudioVoice, text: feedback.correction ?? promptWords(exercise.prompt) }]);
  if (!clip) return null;
  return exerciseClips(exercise).some((c) => c.src === clip.src) ? null : clip;
}

/**
 * Who says an exercise's recordings: the whole figure on a stage (`CharacterStage`), speaking while one of `clips`
 * plays, with `children` (play buttons, or the words asked about) beside it; it cheers or ponders by `verdict`. Without a
 * character among `clips`, just the children.
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
  /** A fixed stage height, for an exercise with more to show under it (`STAGE.card`). */
  height?: number;
  /** The least share of the stage's width the character takes (`CharacterStage`). */
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
