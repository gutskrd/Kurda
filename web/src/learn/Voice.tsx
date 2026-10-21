import type { DeliveredExercise, Feedback } from '@kurda/shared';
import { ClipSpeaker } from '../characters/ClipSpeaker';
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
 * clip (its words are the answer, so they are not sent), the model, and the
 * recordings of the options or the Kurdish cards.
 */
export function exerciseClips(exercise: DeliveredExercise): SpokenClip[] {
  const list: MaybeSpoken[] = [
    { src: exercise.audioUrl, voice: exercise.audioVoice },
    { src: exercise.modelAudioUrl, voice: exercise.modelAudioVoice, text: promptWords(exercise.prompt) },
  ];
  for (const [said, src] of Object.entries(exercise.audio ?? {})) list.push({ src, voice: exercise.audioVoices?.[said], text: said });
  return spokenClips(list);
}

/** The model the feedback plays, when it has a character the exercise above does not already show. */
export function feedbackClip(exercise: DeliveredExercise, feedback: Feedback): SpokenClip | null {
  const [clip] = spokenClips([{ src: feedback.modelAudioUrl, voice: feedback.modelAudioVoice, text: feedback.correction ?? promptWords(exercise.prompt) }]);
  if (!clip) return null;
  return exerciseClips(exercise).some((c) => c.src === clip.src) ? null : clip;
}

/**
 * Who says an exercise's recordings, beside what plays them: a bust in a
 * portrait tile that speaks while one of `clips` plays (and waits, mouth at
 * rest, between them), with `children` — the play buttons, or the words
 * being asked about — beside it. With no character among `clips`, the
 * children alone, exactly as before.
 *
 * Decorative: the buttons say what is heard, and the character adds who.
 */
export function ExerciseVoice({ clips, children }: { clips: readonly SpokenClip[]; children?: React.ReactNode }): React.JSX.Element {
  if (clips.length === 0) return <>{children}</>;
  return (
    <div className="lesson-voice">
      <ClipSpeaker clips={clips} decorative className="speaker-tile lesson-voice-face" />
      <div className="lesson-voice-body">{children}</div>
    </div>
  );
}
