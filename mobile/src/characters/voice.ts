import { isSpeakerId, type RecordingVoice } from '@kurda/shared';

/**
 * What a speaking character reads from the screen's own player, on every
 * frame while the recording plays. An expo-audio player is one as it is; a
 * browser's audio element is one through three getters (lesson/useAudio.ts).
 */
export interface PlaybackClock {
  /** seconds into the recording */
  readonly currentTime: number;
  /** the recording's length in seconds: 0 (NaN in a browser) until it is known */
  readonly duration: number;
  readonly playing: boolean;
}

/**
 * A recording's voice when it names a character this app can draw, else null:
 * a recording without one keeps the screen as it was, and so does one said by
 * somebody a newer server knows and this version of the app does not.
 */
export function knownVoice(voice: RecordingVoice | null | undefined): RecordingVoice | null {
  return voice && isSpeakerId(voice.speaker) ? voice : null;
}

/**
 * How big a character is drawn where it is not on a stage of its own: as tall
 * as `answer` above a lesson's answer, head to waist; as wide as `row` beside
 * a row's own play button and `letter` beside a letter's, head and shoulders.
 */
export const CHARACTER_SIZE = { answer: 132, row: 72, letter: 88 } as const;

/**
 * How tall a lesson's stage is in a window this tall: the whole figure, as
 * large as the screen can spare once `reserve` points are left for the rest
 * of the exercise — the prompt, the answer, the Check button — and never so
 * small that a child cannot see the face, nor so large on a tablet that it is
 * all there is. With the keyboard up the stage steps back to `compact`, so the
 * field being typed in stays in view.
 */
export const STAGE_HEIGHT = { reserve: 500, min: 190, max: 400, compact: 150 } as const;

export function stageHeight(windowHeight: number, keyboardShown = false, reserve: number = STAGE_HEIGHT.reserve): number {
  if (keyboardShown) return STAGE_HEIGHT.compact;
  return Math.round(Math.min(STAGE_HEIGHT.max, Math.max(STAGE_HEIGHT.min, windowHeight - reserve)));
}
