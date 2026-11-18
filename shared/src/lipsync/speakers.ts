/**
 * Who says a recording: the characters a learner sees speak it. The database, the admin panel and the apps share this
 * list; a recording with no speaker shows no character.
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
 * The character who says a recording, sent beside its URL only when an editor has chosen one. Without `lipsync` no
 * timeline exists yet: animate from the text (`lipsyncFromText`) or hold the mouth at rest. Decode it with
 * `decodeLipsync` before playing. `lipsyncSource` is missing when the timeline came from the sound, and `'text'` when the
 * server spread the words over the recording's length instead.
 */
export interface RecordingVoice {
  speaker: SpeakerId;
  lipsync?: LipsyncData;
  lipsyncSource?: 'audio' | 'text';
}

/** GET /alphabet/audio: the alphabet page's recordings by sound key, and the speakers of those that have one. */
export interface AlphabetAudioResponse {
  clips: Record<string, string>;
  voices?: Record<string, RecordingVoice>;
}

/** One pronunciation of a dictionary entry as GET /dictionary/entries/:id lists it, its speaker and timeline beside its URL. */
export interface DictionaryAudio {
  /** what an editor names it by to choose a speaker (PATCH /admin/audio/dictionary?key=…) */
  id: string;
  url: string;
  dialect: string;
  speaker?: SpeakerId;
  lipsync?: LipsyncData;
}

/** One dictionary pronunciation as GET /admin/dictionary/audio lists it. */
export interface DictionaryAudioAdminItem {
  /** its key for PATCH /admin/audio/dictionary and GET /admin/audio/dictionary/file */
  id: string;
  entryId: string;
  headword: string;
  dialect: string;
  url: string;
  speaker: SpeakerId | null;
  /** a timeline is stored: one made from the recording's sound */
  hasLipsync: boolean;
  lipsync: LipsyncData | null;
}

/** A page of GET /admin/dictionary/audio. */
export interface DictionaryAudioAdminPage {
  items: DictionaryAudioAdminItem[];
  /** sent back as `?cursor=` for the next page; null on the last one */
  nextCursor: string | null;
  /** over every pronunciation, whatever the filters */
  counts: { total: number; noSpeaker: number; speakerNoTimeline: number };
}
