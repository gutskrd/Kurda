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
 * How wide a character is drawn: beside a lesson's play button (larger from a
 * tablet's width up), and beside a row's own play button.
 */
export const CHARACTER_SIZE = { stage: 104, wideStage: 120, row: 56 } as const;

/** From this window width up the lesson's character is drawn at `wideStage`. */
const WIDE_STAGE_FROM = 768;

/** How wide a lesson's character is in a window this wide: a little larger on a tablet. */
export function stageSize(windowWidth: number): number {
  return windowWidth >= WIDE_STAGE_FROM ? CHARACTER_SIZE.wideStage : CHARACTER_SIZE.stage;
}
