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
 * The word sets' sounds, as for the alphabet (alphabet/audio.ts): a synthesised clip from the website where one
 * exists, an admin-panel recording in its place, and its speaker. Recordings come with the alphabet's own GET
 * /alphabet/audio, under the words' keys.
 */
export const WORDS_BASE = assetUrl(SYNTHESISED_WORDS_PATH) ?? SYNTHESISED_WORDS_PATH;

export interface WordsAudio {
  sounds: WordSetSounds;
  /** The speaker of the recording at `src`; null for a synthesised clip or a recording without one. */
  voiceOf: (src: string | null) => Spoken | null;
}

/** The words' sounds from GET /alphabet/audio: only recordings worth playing, and only speakers this app can draw. */
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

/** How long to wait before retrying the recordings when the first request got no answer. */
const ASK_AGAIN_MS = 20_000;

/**
 * The words' sounds for a screen: synthesised clips from the first frame, replaced by recordings once the server
 * names them, retried once if the first request gets no answer.
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
