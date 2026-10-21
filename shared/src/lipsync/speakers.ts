/**
 * Who says a recording: the characters a learner sees speak it.
 *
 * One list for everyone who needs it: the database checks a recording's
 * speaker against the same three names, the admin panel offers them, and the
 * apps pick the drawing to show from them. A recording with no speaker shows no
 * character at all, which is what every recording made before the characters
 * existed does until an editor chooses one.
 */
import type { LipsyncData } from './timeline.js';

export const SPEAKERS = [
  /** the deer, the app's own mascot */
  'hevalo',
  /** a man */
  'hamo',
  /** a woman */
  'xezo',
] as const;

export type SpeakerId = (typeof SPEAKERS)[number];

export function isSpeakerId(value: unknown): value is SpeakerId {
  return typeof value === 'string' && (SPEAKERS as readonly string[]).includes(value);
}

/**
 * The character who says a recording, sent beside the recording's URL.
 *
 * Only sent when an editor has chosen a speaker, so a recording without one
 * costs a payload nothing. `lipsync` is missing when the speaker was chosen but
 * no timeline has been made for the recording yet: show the character, and
 * move its mouth from the text if the screen has it (`lipsyncFromText`), or
 * hold it at rest. Decode it once with `decodeLipsync` before playing.
 */
export interface RecordingVoice {
  speaker: SpeakerId;
  lipsync?: LipsyncData;
}

/**
 * GET /alphabet/audio: the alphabet page's recordings by sound key, and who
 * says the ones that have a speaker, under the same keys.
 */
export interface AlphabetAudioResponse {
  clips: Record<string, string>;
  voices?: Record<string, RecordingVoice>;
}

/**
 * One pronunciation of a dictionary entry, as GET /dictionary/entries/:id
 * lists them in `audio`. A recording is one object here, so its speaker and
 * timeline sit beside its URL rather than in a map.
 */
export interface DictionaryAudio {
  /** what an editor names it by to choose a speaker (PATCH /admin/audio/dictionary?key=…) */
  id: string;
  url: string;
  dialect: string;
  speaker?: SpeakerId;
  lipsync?: LipsyncData;
}
