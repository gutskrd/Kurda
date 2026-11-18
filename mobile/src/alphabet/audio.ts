import {
  SYNTHESISED_ALPHABET_PATH,
  alphabetClipText,
  alphabetRecordings,
  alphabetSounds,
  type AlphabetAudioResponse,
  type AlphabetSounds,
  type RecordingVoice,
} from '@kurda/shared';
import { assetUrl } from '../api/env';
import { knownVoice } from '../characters/voice';

/**
 * The alphabet's sounds. Every sound has a synthesised MP3 served by the website and played from there
 * (`assetUrl`), by the same file names. An admin-panel recording replaces it; GET /alphabet/audio lists
 * recordings and their speakers. Which file or recording a key plays is worked out in @kurda/shared, as on the
 * web.
 */
export const SYNTHESISED_BASE = assetUrl(SYNTHESISED_ALPHABET_PATH) ?? SYNTHESISED_ALPHABET_PATH;

/** A recording's speaker and its words, for the mouth to follow when no timeline came with it. */
export interface Spoken {
  voice: RecordingVoice;
  text: string | null;
}

export interface AlphabetAudio {
  sounds: AlphabetSounds;
  /** The speaker of the recording at `src`; null for a synthesised clip or a recording without one. */
  voiceOf: (src: string | null) => Spoken | null;
}

/** The screen's sounds from GET /alphabet/audio: only recordings worth playing, and only speakers this app can draw. */
export function alphabetAudio(answer: Partial<AlphabetAudioResponse> | null | undefined): AlphabetAudio {
  const recorded = alphabetRecordings(answer?.clips);
  const voices = new Map<string, Spoken>();
  for (const [key, url] of Object.entries(recorded)) {
    const voice = knownVoice(answer?.voices?.[key]);
    if (voice) voices.set(url, { voice, text: alphabetClipText(key) });
  }
  return {
    sounds: alphabetSounds(recorded, SYNTHESISED_BASE),
    voiceOf: (src) => (src ? (voices.get(src) ?? null) : null),
  };
}
