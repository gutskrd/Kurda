import { lipsyncFromText } from '../lipsync/align.js';
import type { RecordingVoice } from '../lipsync/speakers.js';
import { safeDecodeLipsync, visemeAt, type LipsyncTimeline } from '../lipsync/timeline.js';
import type { Viseme } from '../lipsync/visemes.js';
import { BLINK_STEPS } from './life.js';
import type { EyeState } from './types.js';

/**
 * What a speaking character looks like at one moment, worked out the same way
 * on the website and on the phone: the mouth from the recording's timeline,
 * a blink now and then, and a small nod while the words come.
 *
 * Pure and cheap, so a player can ask on every animation frame and draw the
 * answer with `headGroup` (or the layers of `characterArt`).
 */
export interface SpeakingFrame {
  mouth: Viseme;
  eyes: EyeState;
  /** degrees the head turns about its pivot; 0 when still */
  nod: number;
}

export interface SpeakingInput {
  /** the recording's mouth timeline, or null when there is none */
  timeline: LipsyncTimeline | null;
  /** where the recording is, in milliseconds of media time */
  ms: number;
  /** whether the recording is playing now */
  playing: boolean;
  /** how long the character has been on screen, in milliseconds: drives the blinks */
  sinceMs: number;
  /** the reader asked for less motion: no nod (the mouth still moves, since it carries the sound) */
  reducedMotion?: boolean;
}

/** How long a blink takes, from the lids starting down to the eyes open again: half shut, shut, half shut. */
export const BLINK_MS = 2 * BLINK_STEPS.half + BLINK_STEPS.shut;

/**
 * The gaps between blinks, in turn. Uneven, as a person's are, and the same
 * every time, so two screens showing the same moment agree and a test can
 * hold them to it.
 */
const BLINK_GAPS = [3200, 4700, 3900, 5600, 2800, 4300] as const;
const BLINK_CYCLE = BLINK_GAPS.reduce((a, b) => a + b, 0);

/** How the eyes are `sinceMs` after the character appeared: open, or somewhere in a blink at the end of each gap. */
export function eyesAt(sinceMs: number): 'open' | 'half' | 'closed' {
  if (!(sinceMs >= 0)) return 'open';
  let t = sinceMs % BLINK_CYCLE;
  for (const gap of BLINK_GAPS) {
    if (t < gap) {
      const into = t - (gap - BLINK_MS);
      if (into < 0) return 'open';
      return into < BLINK_STEPS.half || into >= BLINK_STEPS.half + BLINK_STEPS.shut ? 'half' : 'closed';
    }
    t -= gap;
  }
  return 'open';
}

/** The largest turn of the head in a nod, in degrees: enough to read as alive, never as a wobble. */
export const NOD_DEGREES = 1.2;

/** The character at one moment of a recording. */
export function speakingFrame(input: SpeakingInput): SpeakingFrame {
  const mouth = input.playing && input.timeline ? visemeAt(input.timeline, input.ms) : 'rest';
  const nod =
    input.reducedMotion || !input.playing || mouth === 'rest' ? 0 : Math.round(NOD_DEGREES * Math.sin(input.ms / 260) * 100) / 100;
  return { mouth, eyes: eyesAt(input.sinceMs), nod };
}

/**
 * The timeline to play a recording with: the one an editor saved with it, or,
 * when there is none (or it cannot be read), one made from the words being
 * said once the recording's length is known. Null when neither is possible,
 * and the character then listens with its mouth at rest.
 */
export function voiceTimeline(
  voice: RecordingVoice | null | undefined,
  text: string | null | undefined,
  durationMs: number | null | undefined,
): LipsyncTimeline | null {
  if (voice?.lipsync) {
    const decoded = safeDecodeLipsync(voice.lipsync);
    if (decoded.ok) return decoded.timeline;
  }
  const words = text?.trim();
  if (!words || !durationMs || !(durationMs > 0)) return null;
  try {
    return lipsyncFromText(words, durationMs);
  } catch {
    return null;
  }
}
