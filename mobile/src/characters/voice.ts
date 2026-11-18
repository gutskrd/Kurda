import { isSpeakerId, type RecordingVoice } from '@kurda/shared';

/**
 * What a speaking character reads from the screen's player every frame while it plays. An expo-audio player is
 * one as is; a browser audio element through three getters (lesson/useAudio.ts).
 */
export interface PlaybackClock {
  /** Seconds into the recording. */
  readonly currentTime: number;
  /** The recording's length in seconds: 0 (NaN in a browser) until it is known. */
  readonly duration: number;
  readonly playing: boolean;
}

/**
 * A recording's voice when it names a character this app can draw, else null (no speaker, or one only a newer
 * server knows), leaving the screen as it was.
 */
export function knownVoice(voice: RecordingVoice | null | undefined): RecordingVoice | null {
  return voice && isSpeakerId(voice.speaker) ? voice : null;
}

/**
 * A character's size where it has no stage of its own: `answer` tall above a lesson answer, head to waist; `row`
 * wide beside a row's play button, head and shoulders.
 */
export const CHARACTER_SIZE = { answer: 132, row: 72 } as const;

/**
 * A lesson stage's height in a window of this height: the character head to waist, as large as fits once
 * `reserve` points are left for the prompt, answer and Check button, never below `min` (a small phone scrolls
 * rather than shrinking the character) nor so large on a tablet that nothing else fits. With the keyboard up it
 * drops to `compact` so the field stays visible. A stage in a card with more than an exercise (a letter, a
 * practice question) is `card` tall on every phone.
 */
export const STAGE_HEIGHT = { reserve: 500, min: 300, max: 400, compact: 150, card: 260 } as const;

export function stageHeight(windowHeight: number, keyboardShown = false, reserve: number = STAGE_HEIGHT.reserve): number {
  if (keyboardShown) return STAGE_HEIGHT.compact;
  return Math.round(Math.min(STAGE_HEIGHT.max, Math.max(STAGE_HEIGHT.min, windowHeight - reserve)));
}
