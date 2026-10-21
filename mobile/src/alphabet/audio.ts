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
 * The alphabet's sounds on the phone.
 *
 * Every sound has a synthesised clip: a small MP3 the website serves, played
 * from the website here too (`assetUrl`), by the same file names. A recording
 * made in the admin panel plays in its place, and GET /alphabet/audio says
 * which there are and who says them; which file or recording a key plays is
 * worked out in @kurda/shared, the same as on the website.
 */
export const SYNTHESISED_BASE = assetUrl(SYNTHESISED_ALPHABET_PATH) ?? SYNTHESISED_ALPHABET_PATH;

/** Who says a recording, and the words it says, for the mouth to follow when no timeline came with it. */
export interface Spoken {
  voice: RecordingVoice;
  text: string | null;
}

export interface AlphabetAudio {
  sounds: AlphabetSounds;
  /** who says the recording at `src`; null for a synthesised clip and for a recording nobody was chosen for */
  voiceOf: (src: string | null) => Spoken | null;
}

/** The screen's sounds from GET /alphabet/audio's answer: only the recordings worth playing, and only speakers this app can draw. */
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
