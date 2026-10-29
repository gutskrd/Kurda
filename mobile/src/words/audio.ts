import { useEffect, useState } from 'react';
import {
  SYNTHESISED_WORDS_PATH,
  alphabetClipText,
  wordSetRecordings,
  wordSetSounds,
  type AlphabetAudioResponse,
  type WordSetSounds,
} from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { assetUrl } from '../api/env';
import type { Spoken } from '../alphabet/audio';
import { knownVoice } from '../characters/voice';

/**
 * The word sets' sounds on the phone, as the alphabet's are (alphabet/audio.ts):
 * a synthesised clip from the website where one could be made, a recording
 * made in the admin panel in its place, and who says it. The recordings come
 * in the alphabet's own answer, GET /alphabet/audio, under the words' keys.
 */
export const WORDS_BASE = assetUrl(SYNTHESISED_WORDS_PATH) ?? SYNTHESISED_WORDS_PATH;

export interface WordsAudio {
  sounds: WordSetSounds;
  /** who says the recording at `src`; null for a synthesised clip and for a recording nobody was chosen for */
  voiceOf: (src: string | null) => Spoken | null;
}

/** The words' sounds from GET /alphabet/audio's answer: only the recordings worth playing, and only speakers this app can draw. */
export function wordsAudio(answer: Partial<AlphabetAudioResponse> | null | undefined): WordsAudio {
  const recorded = wordSetRecordings(answer?.clips);
  const voices = new Map<string, Spoken>();
  for (const [key, url] of Object.entries(recorded)) {
    const voice = knownVoice(answer?.voices?.[key]);
    if (voice) voices.set(url, { voice, text: alphabetClipText(key) });
  }
  return {
    sounds: wordSetSounds(recorded, WORDS_BASE),
    voiceOf: (src) => (src ? (voices.get(src) ?? null) : null),
  };
}

/** The synthesised clips alone: what every word plays until the recordings are known. */
const GENERATED = wordsAudio(null);

/** How long to wait before asking once more for the recordings, when the first answer did not come. */
const ASK_AGAIN_MS = 20_000;

/**
 * The words' sounds for a screen: the synthesised clips from the first frame,
 * and the recordings in their place once the server names them — asked for
 * in the background, and once more a little later if the first answer does
 * not come, as the alphabet does.
 */
export function useWordsAudio(client: ApiClient): WordsAudio {
  const [audio, setAudio] = useState<WordsAudio>(GENERATED);
  useEffect(() => {
    let live = true;
    let again: ReturnType<typeof setTimeout> | null = null;
    const ask = async (tries: number): Promise<void> => {
      const res = await client.get<AlphabetAudioResponse>('/alphabet/audio');
      if (!live) return;
      if (res.ok) setAudio(wordsAudio(res.data));
      else if (tries > 1) again = setTimeout(() => void ask(tries - 1), ASK_AGAIN_MS);
    };
    void ask(2);
    return () => {
      live = false;
      if (again) clearTimeout(again);
    };
  }, [client]);
  return audio;
}
